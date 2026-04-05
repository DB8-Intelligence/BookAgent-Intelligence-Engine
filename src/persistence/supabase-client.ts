/**
 * Supabase Client — BookAgent Persistence Layer
 *
 * Cliente HTTP para a API REST do Supabase (PostgREST).
 * Não usa nenhum SDK externo — apenas fetch nativo do Node.js 20+.
 *
 * Endpoint base: {SUPABASE_URL}/rest/v1
 *
 * Configuração via env vars:
 * - SUPABASE_URL: https://{project-ref}.supabase.co
 * - SUPABASE_SERVICE_ROLE_KEY: eyJ... (para operações de backend)
 *
 * Criação:
 *   const client = SupabaseClient.fromEnv();    // via env vars
 *   const client = SupabaseClient.tryFromEnv(); // null se não configurado
 */

import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueryFilter {
  [column: string]: string | number | boolean | null;
}

export type PostgRESTOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in';

export interface FilterCondition {
  column: string;
  operator: PostgRESTOperator;
  value: string | number | boolean | null;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class SupabaseClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(url: string, serviceRoleKey: string) {
    this.baseUrl = `${url}/rest/v1`;
    this.headers = {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Prefer': 'return=representation',
    };
  }

  // ---------------------------------------------------------------------------
  // Factory methods
  // ---------------------------------------------------------------------------

  /**
   * Cria um cliente a partir das variáveis de ambiente.
   * Lança erro se SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não estiverem configurados.
   */
  static fromEnv(): SupabaseClient {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        '[SupabaseClient] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. ' +
        'Check your .env file.',
      );
    }

    return new SupabaseClient(url, key);
  }

  /**
   * Tenta criar um cliente. Retorna null se as env vars não estiverem configuradas.
   * Ideal para graceful degradation.
   */
  static tryFromEnv(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) return null;

    return new SupabaseClient(url, key);
  }

  /**
   * Indica se o Supabase está configurado no environment atual.
   */
  static isConfigured(): boolean {
    return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  // ---------------------------------------------------------------------------
  // Internal request with retry logic
  // ---------------------------------------------------------------------------

  /**
   * Executa um fetch com retentativas exponenciais em caso de falhas de rede
   * ou erros temporários (502, 503, 504).
   */
  private async request(
    url: string,
    options: RequestInit,
    retries: number = 3,
    backoff: number = 500,
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          // Adiciona timeout para evitar requests presos infinitamente
          signal: AbortSignal.timeout(15_000),
        });

        // Se for sucesso ou erro do cliente (4xx), não tenta novamente
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          return response;
        }

        // Se for erro de servidor (5xx), pode ser temporário
        logger.warn(
          `[SupabaseClient] Attempt ${attempt + 1}/${retries + 1} failed with status ${response.status}.`,
        );
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn(
          `[SupabaseClient] Attempt ${attempt + 1}/${retries + 1} failed: ${lastError.message}`,
        );
      }

      if (attempt < retries) {
        const delay = backoff * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error(`[SupabaseClient] Request failed after ${retries} retries`);
  }

  // ---------------------------------------------------------------------------
  // CRUD operations
  // ---------------------------------------------------------------------------

  /**
   * Insere um ou mais registros numa tabela.
   * Retorna os registros inseridos (com campos gerados pelo DB).
   */
  async insert<T extends object>(table: string, data: T | T[]): Promise<T[]> {
    const url = `${this.baseUrl}/${table}`;
    const body = Array.isArray(data) ? data : [data];

    const response = await this.request(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`[SupabaseClient] INSERT ${table} failed (${response.status}): ${error}`);
    }

    return (await response.json()) as T[];
  }

  /**
   * Atualiza registros que correspondem ao filtro.
   */
  async update<T extends object>(
    table: string,
    filter: FilterCondition,
    data: Partial<T>,
  ): Promise<void> {
    const filterParam = buildFilterParam(filter);
    const url = `${this.baseUrl}/${table}?${filterParam}`;

    const response = await this.request(url, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`[SupabaseClient] UPDATE ${table} failed (${response.status}): ${error}`);
    }
  }

  /**
   * Insere ou atualiza (UPSERT) registros.
   * @param onConflict - coluna de conflito (ex: 'id')
   */
  async upsert<T extends object>(
    table: string,
    data: T | T[],
    onConflict: string = 'id',
  ): Promise<void> {
    const url = `${this.baseUrl}/${table}?on_conflict=${onConflict}`;
    const headers = {
      ...this.headers,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    };
    const body = Array.isArray(data) ? data : [data];

    const response = await this.request(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`[SupabaseClient] UPSERT ${table} failed (${response.status}): ${error}`);
    }
  }

  /**
   * Seleciona registros com filtro opcional.
   * @param filters - array de condições (combinadas com AND)
   * @param select - colunas a retornar (default: *)
   * @param limit - máximo de registros
   */
  async select<T>(
    table: string,
    options: {
      filters?: FilterCondition[];
      select?: string;
      limit?: number;
      orderBy?: string;
      orderDesc?: boolean;
    } = {},
  ): Promise<T[]> {
    const params = new URLSearchParams();

    if (options.select) {
      params.set('select', options.select);
    }

    if (options.filters) {
      for (const f of options.filters) {
        params.append(f.column, `${f.operator}.${f.value}`);
      }
    }

    if (options.limit) {
      params.set('limit', String(options.limit));
    }

    if (options.orderBy) {
      params.set('order', `${options.orderBy}.${options.orderDesc ? 'desc' : 'asc'}`);
    }

    const queryString = params.toString();
    const url = `${this.baseUrl}/${table}${queryString ? `?${queryString}` : ''}`;

    const response = await this.request(url, {
      method: 'GET',
      headers: {
        ...this.headers,
        'Prefer': 'return=representation',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`[SupabaseClient] SELECT ${table} failed (${response.status}): ${error}`);
    }

    return (await response.json()) as T[];
  }

  /**
   * Testa a conexão com o Supabase.
   * Retorna true se conectado, false se falhou.
   */
  async ping(): Promise<boolean> {
    try {
      // Fazer um SELECT simples na tabela de jobs para testar conectividade
      const url = `${this.baseUrl}/bookagent_jobs?select=id&limit=1`;
      const response = await this.request(url, {
        method: 'GET',
        headers: this.headers,
      }, 1, 200); // retry rápido para ping
      return response.ok || response.status === 404; // 404 = tabela não existe ainda, mas conexão OK
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFilterParam(filter: FilterCondition): string {
  const value = filter.value === null ? 'null' : String(filter.value);
  return `${filter.column}=${filter.operator}.${value}`;
}
