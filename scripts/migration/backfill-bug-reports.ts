/**
 * scripts/migration/backfill-bug-reports.ts
 *
 * Backfill Supabase `bookagent_bug_reports` → Firestore `bug_reports/{id}`.
 *
 * Idempotente: usa o `id` (UUID) da row Supabase como id do doc Firestore,
 * então re-execuções sobrescrevem com o estado mais recente sem duplicar.
 *
 * USO:
 *   # Dry-run (default — apenas inspeciona, não escreve no Firestore):
 *   npx tsx scripts/migration/backfill-bug-reports.ts
 *
 *   # Execução real (escreve no Firestore):
 *   npx tsx scripts/migration/backfill-bug-reports.ts --write
 *
 *   # Chunk size customizado (default 200):
 *   npx tsx scripts/migration/backfill-bug-reports.ts --write --chunk=500
 *
 * REQUISITOS DE ENV:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  → leitura origem
 *   GOOGLE_CLOUD_PROJECT (ou FIREBASE_PROJECT_ID) + ADC → escrita destino
 *
 * O QUE FAZ:
 *   - Lê em chunks ordenados por `created_at` ascending (cursor-based).
 *   - Para cada row Supabase, constrói o BugReportDoc e escreve no Firestore
 *     (apenas em --write).
 *   - Logs estruturados por chunk + sumário no fim (read, written, errors).
 *
 * O QUE NÃO FAZ:
 *   - Não escreve no Supabase.
 *   - Não deleta nem altera nada.
 *   - Não muda leitura do POST /bugs (continua Supabase).
 *   - Não usa `serviceAccountKey.json` — só ADC.
 *
 * ATENÇÃO:
 *   Backfill é seguro para rodar múltiplas vezes (idempotente). O Sprint 3.2
 *   prevê dual-write ativo no POST /bugs — então rows novas já chegam ao
 *   Firestore via fluxo normal; este script só completa o histórico anterior.
 */

import { SupabaseClient, type FilterCondition } from '../../src/persistence/supabase-client.js';
import {
  upsertBugReport,
  type BugReportDoc,
  type BugSeverity,
  type BugStatus,
} from '../../src/persistence/firestore/bug-report-repository.js';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const writeMode = args.includes('--write');
const chunkArg = args.find((a) => a.startsWith('--chunk='));
const CHUNK_SIZE = chunkArg ? Math.max(1, parseInt(chunkArg.split('=')[1], 10) || 200) : 200;

// ---------------------------------------------------------------------------
// Source row shape (Supabase schema)
// ---------------------------------------------------------------------------

interface SupabaseBugReportRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  severity: string;
  context: Record<string, unknown> | null;
  status?: string;
  admin_notes?: string | null;
  created_at: string;
  updated_at?: string;
}

const VALID_SEVERITIES: BugSeverity[] = ['blocker', 'bug', 'suggestion'];
const VALID_STATUSES: BugStatus[] = ['new', 'investigating', 'fixed', 'wont_fix'];

function normalizeSeverity(value: string): BugSeverity {
  return (VALID_SEVERITIES as string[]).includes(value) ? (value as BugSeverity) : 'bug';
}

function normalizeStatus(value: string | undefined): BugStatus {
  if (value && (VALID_STATUSES as string[]).includes(value)) return value as BugStatus;
  return 'new';
}

function transformRow(row: SupabaseBugReportRow): BugReportDoc {
  return {
    id: row.id,
    type: 'bug',
    severity: normalizeSeverity(row.severity),
    title: row.title,
    description: row.description,
    // Email não vive em bookagent_bug_reports — fica null no backfill.
    // Rows novas (via dual-write no POST) recebem o email do req.authUser.
    email: null,
    userId: row.user_id,
    // tenantId desconhecido pra rows legadas — modelo solo-tenant assume
    // tenantId === userId. Se houver invites multi-user no futuro, esses
    // bugs migrados ficariam atribuídos ao tenant do criador.
    tenantId: row.user_id,
    source: 'legacy-supabase',
    metadata: row.context ?? {},
    status: normalizeStatus(row.status),
    adminNotes: row.admin_notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const banner = writeMode ? 'WRITE MODE — will modify Firestore' : 'DRY-RUN — no writes';
  console.log(`[backfill-bug-reports] ${banner}`);
  console.log(`[backfill-bug-reports] chunk size: ${CHUNK_SIZE}`);

  const supabase = SupabaseClient.tryFromEnv();
  if (!supabase) {
    console.error(
      '[backfill-bug-reports] FAIL: Supabase not configured. ' +
      'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
    process.exit(1);
  }

  // Cursor-based pagination por created_at ascending. Edge case: se múltiplas
  // rows compartilham exatamente o mesmo timestamp e caem no boundary do
  // chunk, podemos pular. Volume de bug_reports é baixo — risco aceitável.
  // Se virar relevante, trocar pra paginar por (created_at, id) tuple.
  let cursor: string | null = null;
  let totalRead = 0;
  let totalWritten = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  const startMs = Date.now();

  while (true) {
    const filters: FilterCondition[] = cursor
      ? [{ column: 'created_at', operator: 'gt', value: cursor }]
      : [];

    let rows: SupabaseBugReportRow[];
    try {
      rows = await supabase.select<SupabaseBugReportRow>('bookagent_bug_reports', {
        filters,
        orderBy: 'created_at',
        orderDesc: false,
        limit: CHUNK_SIZE,
      });
    } catch (err) {
      console.error(`[backfill-bug-reports] FAIL reading chunk: ${(err as Error).message}`);
      process.exit(1);
    }

    if (rows.length === 0) break;

    totalRead += rows.length;
    console.log(
      `[backfill-bug-reports] chunk: read=${rows.length} ` +
      `cursor=${cursor ?? '<initial>'} → next=${rows[rows.length - 1].created_at}`,
    );

    for (const row of rows) {
      const doc = transformRow(row);

      if (!writeMode) {
        totalSkipped++;
        if (totalSkipped <= 5 || totalSkipped % 50 === 0) {
          console.log(
            `[dry-run] would upsert id=${doc.id} severity=${doc.severity} ` +
            `title="${doc.title.slice(0, 40)}"`,
          );
        }
        continue;
      }

      try {
        await upsertBugReport(doc);
        totalWritten++;
      } catch (err) {
        totalErrors++;
        console.error(
          `[backfill-bug-reports] write failed for ${doc.id}: ${(err as Error).message}`,
        );
      }
    }

    cursor = rows[rows.length - 1].created_at;

    // Se a chunk veio menor que CHUNK_SIZE, é a última.
    if (rows.length < CHUNK_SIZE) break;
  }

  const elapsedMs = Date.now() - startMs;
  console.log('');
  console.log('[backfill-bug-reports] ─── SUMMARY ───');
  console.log(`  mode:          ${writeMode ? 'WRITE' : 'DRY-RUN'}`);
  console.log(`  total read:    ${totalRead}`);
  console.log(`  total written: ${totalWritten}`);
  console.log(`  total skipped: ${totalSkipped} (dry-run)`);
  console.log(`  total errors:  ${totalErrors}`);
  console.log(`  elapsed:       ${elapsedMs}ms`);

  if (totalErrors > 0) {
    console.log(`[backfill-bug-reports] EXIT: ${totalErrors} errors — re-run to retry.`);
    process.exit(2);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(`[backfill-bug-reports] UNEXPECTED ERROR: ${err}`);
  process.exit(1);
});
