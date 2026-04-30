/**
 * Bug Report Repository (Firestore) — Sprint 3.2 Cluster C migração
 *
 * Coleção `bug_reports/{id}`. Dual-write paralelo a `bookagent_bug_reports`
 * (Supabase) durante o soak. Leitura ainda vem de Supabase — este repo só
 * é consumido pelo POST /bugs (write-side) e pelo script de backfill.
 *
 * Idempotência: o id do doc é o mesmo da row Supabase (`uuid`). Backfill
 * pode ser re-rodado sem duplicar — `set()` sobrescreve com o estado mais
 * recente do Supabase.
 *
 * Não altera leituras nem schema Firestore além de criar a nova collection.
 */

import { firestore } from '../google-persistence.js';

const COLLECTION = 'bug_reports';

export type BugSeverity = 'blocker' | 'bug' | 'suggestion';
export type BugStatus = 'new' | 'investigating' | 'fixed' | 'wont_fix';

export interface BugReportDoc {
  /** UUID — mesmo id usado na row Supabase pra correlação cross-store. */
  id: string;
  /** Categoria livre (defaults pra 'bug' se omitido pelo POST). */
  type: string;
  severity: BugSeverity;
  title: string;
  description: string | null;
  email: string | null;
  userId: string;
  /** Denormalizado — facilita queries por tenant sem JOIN. */
  tenantId: string;
  /** Origem do report: 'in-app', 'whatsapp', 'admin', etc. */
  source: string;
  /** Payload livre (substitui `context` do schema Supabase). */
  metadata: Record<string, unknown>;
  status: BugStatus;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateBugReportInput = Omit<BugReportDoc, 'createdAt' | 'updatedAt' | 'status' | 'adminNotes'> & {
  status?: BugStatus;
  adminNotes?: string | null;
};

/**
 * Cria (ou sobrescreve) um bug report. Usa `id` como doc path —
 * idempotente quando re-executado pelo backfill.
 */
export async function createBugReport(input: CreateBugReportInput): Promise<BugReportDoc> {
  const now = new Date().toISOString();
  const doc: BugReportDoc = {
    id: input.id,
    type: input.type,
    severity: input.severity,
    title: input.title,
    description: input.description ?? null,
    email: input.email ?? null,
    userId: input.userId,
    tenantId: input.tenantId,
    source: input.source,
    metadata: input.metadata ?? {},
    status: input.status ?? 'new',
    adminNotes: input.adminNotes ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await firestore().collection(COLLECTION).doc(doc.id).set(doc);
  return doc;
}

/**
 * Cria preservando timestamps existentes (usado pelo backfill quando a row
 * Supabase já tem `created_at` original).
 */
export async function upsertBugReport(input: BugReportDoc): Promise<void> {
  await firestore().collection(COLLECTION).doc(input.id).set(input);
}

export async function getBugReport(id: string): Promise<BugReportDoc | null> {
  const snap = await firestore().collection(COLLECTION).doc(id).get();
  return snap.exists ? (snap.data() as BugReportDoc) : null;
}

export async function listBugReportsByUser(
  userId: string,
  opts: { limit?: number } = {},
): Promise<BugReportDoc[]> {
  let q = firestore()
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc');
  if (opts.limit) q = q.limit(opts.limit);
  const snap = await q.get();
  return snap.docs.map((d) => d.data() as BugReportDoc);
}

export interface ListBugReportsFilters {
  severity?: BugSeverity;
  status?: BugStatus;
  tenantId?: string;
}

export async function listBugReports(
  filters: ListBugReportsFilters = {},
  opts: { limit?: number } = {},
): Promise<BugReportDoc[]> {
  let q = firestore()
    .collection(COLLECTION)
    .orderBy('createdAt', 'desc') as FirebaseFirestore.Query;
  if (filters.severity) q = q.where('severity', '==', filters.severity);
  if (filters.status) q = q.where('status', '==', filters.status);
  if (filters.tenantId) q = q.where('tenantId', '==', filters.tenantId);
  if (opts.limit) q = q.limit(opts.limit);
  const snap = await q.get();
  return snap.docs.map((d) => d.data() as BugReportDoc);
}

export async function updateBugReport(
  id: string,
  patch: Partial<Pick<BugReportDoc, 'status' | 'adminNotes' | 'metadata'>>,
): Promise<void> {
  await firestore()
    .collection(COLLECTION)
    .doc(id)
    .set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}
