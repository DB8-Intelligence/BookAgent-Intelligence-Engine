/**
 * BookAgent SDK Client
 *
 * Cliente TypeScript para consumir a API do BookAgent Intelligence Engine.
 * Encapsula HTTP, polling de status e download de artefatos.
 *
 * Uso:
 *   const client = new BookAgentClient('https://api.bookagent.io');
 *   const job = await client.process({ file_url: '...', type: 'pdf' });
 *   const result = await client.waitForCompletion(job.job_id);
 *   const artifacts = await client.listArtifacts(job.job_id);
 *   const html = await client.downloadArtifact(job.job_id, artifacts[0].id);
 */

import type {
  ProcessInput_v1,
  JobStatus_v1,
  ProcessResult_v1,
  SourceItem_v1,
  ArtifactItem_v1,
  ApiEnvelope,
} from './contracts.js';

// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

export interface BookAgentClientOptions {
  /** Base URL of the BookAgent API (e.g., 'https://api.bookagent.io') */
  baseUrl: string;

  /** API key for authentication */
  apiKey?: string;

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Polling interval for waitForCompletion in ms (default: 2000) */
  pollInterval?: number;

  /** Max polling time for waitForCompletion in ms (default: 300000 = 5min) */
  maxWaitTime?: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BookAgentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'BookAgentError';
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class BookAgentClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeout: number;
  private readonly pollInterval: number;
  private readonly maxWaitTime: number;

  constructor(options: BookAgentClientOptions | string) {
    const opts = typeof options === 'string' ? { baseUrl: options } : options;
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.timeout = opts.timeout ?? 30_000;
    this.pollInterval = opts.pollInterval ?? 2_000;
    this.maxWaitTime = opts.maxWaitTime ?? 300_000;
  }

  // -------------------------------------------------------------------------
  // Process
  // -------------------------------------------------------------------------

  /**
   * Submit a file for processing.
   * Returns immediately with a job_id for status polling.
   */
  async process(input: ProcessInput_v1): Promise<{ job_id: string; status: string }> {
    return this.post<{ job_id: string; status: string }>('/api/v1/process', input);
  }

  // -------------------------------------------------------------------------
  // Job Status
  // -------------------------------------------------------------------------

  /** List all jobs */
  async listJobs(): Promise<JobStatus_v1[]> {
    return this.get<JobStatus_v1[]>('/api/v1/jobs');
  }

  /** Get status of a specific job */
  async getJobStatus(jobId: string): Promise<JobStatus_v1> {
    return this.get<JobStatus_v1>(`/api/v1/jobs/${jobId}`);
  }

  /**
   * Poll until the job reaches 'completed' or 'failed' status.
   * Throws BookAgentError if the job fails or timeout is reached.
   */
  async waitForCompletion(jobId: string): Promise<JobStatus_v1> {
    const start = Date.now();

    while (Date.now() - start < this.maxWaitTime) {
      const status = await this.getJobStatus(jobId);

      if (status.status === 'completed') return status;
      if (status.status === 'failed') {
        throw new BookAgentError(
          status.error ?? 'Job failed',
          'JOB_FAILED',
          undefined,
          { job_id: jobId },
        );
      }

      await this.sleep(this.pollInterval);
    }

    throw new BookAgentError(
      `Timeout waiting for job ${jobId} (${this.maxWaitTime}ms)`,
      'TIMEOUT',
    );
  }

  // -------------------------------------------------------------------------
  // Results
  // -------------------------------------------------------------------------

  /** Get the full processing result (sources + artifacts + personalization) */
  async getResult(jobId: string): Promise<ProcessResult_v1> {
    return this.get<ProcessResult_v1>(`/api/v1/jobs/${jobId}/result`);
  }

  /** Get extracted content sources */
  async listSources(jobId: string): Promise<SourceItem_v1[]> {
    return this.get<SourceItem_v1[]>(`/api/v1/jobs/${jobId}/sources`);
  }

  // -------------------------------------------------------------------------
  // Artifacts
  // -------------------------------------------------------------------------

  /** List all artifacts for a job */
  async listArtifacts(
    jobId: string,
    filters?: { type?: string; format?: string },
  ): Promise<ArtifactItem_v1[]> {
    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.format) params.set('format', filters.format);

    const query = params.toString();
    const path = `/api/v1/jobs/${jobId}/artifacts${query ? `?${query}` : ''}`;
    return this.get<ArtifactItem_v1[]>(path);
  }

  /** Get details of a specific artifact */
  async getArtifact(jobId: string, artifactId: string): Promise<ArtifactItem_v1> {
    return this.get<ArtifactItem_v1>(`/api/v1/jobs/${jobId}/artifacts/${artifactId}`);
  }

  /** Download raw artifact content as string */
  async downloadArtifact(jobId: string, artifactId: string): Promise<string> {
    const url = `${this.baseUrl}/api/v1/jobs/${jobId}/artifacts/${artifactId}/download`;
    const response = await this.fetchWithTimeout(url, { method: 'GET' });

    if (!response.ok) {
      throw new BookAgentError(
        `Download failed: ${response.status}`,
        'DOWNLOAD_ERROR',
        response.status,
      );
    }

    return response.text();
  }

  // -------------------------------------------------------------------------
  // Convenience methods
  // -------------------------------------------------------------------------

  /**
   * Process a file and wait for results in one call.
   * Combines process() + waitForCompletion() + getResult().
   */
  async processAndWait(input: ProcessInput_v1): Promise<ProcessResult_v1> {
    const { job_id } = await this.process(input);
    await this.waitForCompletion(job_id);
    return this.getResult(job_id);
  }

  /**
   * Get all blog HTML artifacts for a job.
   * Convenience for filtering blog articles in HTML format.
   */
  async getBlogArticles(jobId: string): Promise<ArtifactItem_v1[]> {
    return this.listArtifacts(jobId, { type: 'blog-article', format: 'html' });
  }

  /**
   * Get all landing page HTML artifacts for a job.
   */
  async getLandingPages(jobId: string): Promise<ArtifactItem_v1[]> {
    return this.listArtifacts(jobId, { type: 'landing-page', format: 'html' });
  }

  /**
   * Get all media render specs for a job.
   */
  async getMediaSpecs(jobId: string): Promise<ArtifactItem_v1[]> {
    return this.listArtifacts(jobId, { type: 'media-render-spec' });
  }

  // -------------------------------------------------------------------------
  // HTTP internals
  // -------------------------------------------------------------------------

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await this.fetchWithTimeout(url, { method: 'GET' });
    return this.handleResponse<T>(response);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const json = await response.json() as ApiEnvelope<T>;

    if (!response.ok || !json.success) {
      throw new BookAgentError(
        json.error?.message ?? `HTTP ${response.status}`,
        json.error?.code ?? 'HTTP_ERROR',
        response.status,
        json.error?.details,
      );
    }

    return json.data as T;
  }

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> ?? {}),
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      return await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new BookAgentError(
          `Request timeout (${this.timeout}ms)`,
          'TIMEOUT',
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
