/**
 * Bug Reports API — In-app bug reporting (Firestore-only desde Sprint 3.7)
 *
 * Routes:
 *   POST   /bugs          — create a bug report (authenticated user)
 *   GET    /bugs/mine     — list own reports
 *   GET    /bugs          — list all reports (admin only)
 *   PATCH  /bugs/:id      — triage: update status/notes (admin only)
 *   GET    /bugs/is-admin — check if current user is admin
 *
 * Storage: `bug_reports/{id}` no Firestore. O setSupabaseClientForBugs ainda
 * existe como no-op pra retrocompat com o composition root, mas Supabase
 * NÃO é mais usado em nenhuma rota.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';
import { logDeprecatedSupabaseCall } from '../../utils/deprecated-supabase.js';
import {
  createBugReport,
  listBugReportsByUser,
  listBugReports,
  updateBugReport,
  type BugSeverity,
  type BugStatus,
} from '../../persistence/firestore/bug-report-repository.js';
import { randomUUID } from 'node:crypto';

const router = Router();

// ---------------------------------------------------------------------------
// Compat shim — composition root ainda chama setSupabaseClientForBugs().
// Mantemos como no-op pra não quebrar bootstrap; nenhum branch da rota
// consulta `supabase` mais.
// ---------------------------------------------------------------------------

export function setSupabaseClientForBugs(_client: SupabaseClient): void {
  logDeprecatedSupabaseCall({
    module: 'BugsRoute',
    action: 'setSupabaseClientForBugs',
    reason: 'Bugs route is Firestore-only since Sprint 3.7 — Supabase client ignored.',
  });
}

// ---------------------------------------------------------------------------
// Admin check
// ---------------------------------------------------------------------------

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'dmbbonanza@gmail.com')
  .split(',')
  .map((e) => e.trim().toLowerCase());

function isAdmin(email: string | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

// ---------------------------------------------------------------------------
// Auth resolver — Firebase UID-first (Sprint 3.7)
// ---------------------------------------------------------------------------

function resolveUserId(req: Request): string | undefined {
  // Firebase Auth (firebaseAuthMiddleware) — fonte primária
  const authId = req.authUser?.id;
  if (typeof authId === 'string' && authId.trim()) return authId.trim();

  // tenantContext — populado por tenant-guard (já espelha authUser.id quando Firebase)
  const ctxUserId = req.tenantContext?.userId;
  if (typeof ctxUserId === 'string' && ctxUserId.trim() && ctxUserId !== 'anonymous') {
    return ctxUserId.trim();
  }

  // Header explícito — chamadas internas / scripts
  const headerId = req.headers['x-user-id'];
  if (typeof headerId === 'string' && headerId.trim()) return headerId.trim();

  return undefined;
}

function resolveEmail(req: Request): string | undefined {
  return req.authUser?.email;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(res: Response, data: unknown, status = 200): void {
  res.status(status).json({
    success: true,
    data,
    meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
  });
}

function sendError(res: Response, code: string, message: string, status = 400): void {
  res.status(status).json({
    success: false,
    error: { code, message },
    meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
  });
}

const VALID_SEVERITIES: BugSeverity[] = ['blocker', 'bug', 'suggestion'];
const VALID_STATUSES: BugStatus[] = ['new', 'investigating', 'fixed', 'wont_fix'];

// ---------------------------------------------------------------------------
// POST /bugs — create bug report (Firestore)
// ---------------------------------------------------------------------------

router.post('/', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
    return;
  }

  const { title, description, severity, context } = req.body ?? {};

  if (!title || typeof title !== 'string' || title.length < 3) {
    sendError(res, 'VALIDATION_ERROR', 'Title must be at least 3 characters');
    return;
  }
  if (title.length > 200) {
    sendError(res, 'VALIDATION_ERROR', 'Title must be at most 200 characters');
    return;
  }
  if (description && typeof description === 'string' && description.length > 4000) {
    sendError(res, 'VALIDATION_ERROR', 'Description must be at most 4000 characters');
    return;
  }

  const safeSeverity: BugSeverity = (VALID_SEVERITIES as string[]).includes(severity)
    ? (severity as BugSeverity)
    : 'bug';

  const bugId = randomUUID();
  const tenantId = req.tenantContext?.tenantId ?? userId;
  const email = resolveEmail(req) ?? null;

  try {
    const created = await createBugReport({
      id: bugId,
      type: 'bug',
      severity: safeSeverity,
      title: title.slice(0, 200),
      description: description?.slice(0, 4000) ?? null,
      email,
      userId,
      tenantId,
      source: 'in-app',
      metadata: (context as Record<string, unknown>) ?? {},
    });

    logger.info(`[Bugs] Created Firestore bug report by user ${userId}: "${title.slice(0, 50)}" (id=${bugId})`);
    sendJson(res, created, 201);
  } catch (err) {
    logger.error(`[Bugs] Failed to create report in Firestore: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Failed to create bug report', 500);
  }
});

// ---------------------------------------------------------------------------
// GET /bugs/is-admin — check admin status
// ---------------------------------------------------------------------------

router.get('/is-admin', (req: Request, res: Response) => {
  const email = resolveEmail(req);
  sendJson(res, { is_admin: isAdmin(email) });
});

// ---------------------------------------------------------------------------
// GET /bugs/mine — list own reports (Firestore)
// ---------------------------------------------------------------------------

router.get('/mine', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
    return;
  }

  try {
    const rows = await listBugReportsByUser(userId, { limit: 50 });
    sendJson(res, rows);
  } catch (err) {
    logger.error(`[Bugs] Failed to list user reports from Firestore: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Failed to list reports', 500);
  }
});

// ---------------------------------------------------------------------------
// GET /bugs — list all reports (admin only, Firestore)
// ---------------------------------------------------------------------------

router.get('/', async (req: Request, res: Response) => {
  if (!isAdmin(resolveEmail(req))) {
    sendError(res, 'FORBIDDEN', 'Admin access required', 403);
    return;
  }

  const severityQuery = req.query.severity as string | undefined;
  const statusQuery = req.query.status as string | undefined;

  const filters: { severity?: BugSeverity; status?: BugStatus } = {};
  if (severityQuery && (VALID_SEVERITIES as string[]).includes(severityQuery)) {
    filters.severity = severityQuery as BugSeverity;
  }
  if (statusQuery && (VALID_STATUSES as string[]).includes(statusQuery)) {
    filters.status = statusQuery as BugStatus;
  }

  try {
    const rows = await listBugReports(filters, { limit: 200 });
    sendJson(res, rows);
  } catch (err) {
    logger.error(`[Bugs] Failed to list all reports from Firestore: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Failed to list reports', 500);
  }
});

// ---------------------------------------------------------------------------
// PATCH /bugs/:id — triage (admin only, Firestore)
// ---------------------------------------------------------------------------

router.patch('/:id', async (req: Request, res: Response) => {
  if (!isAdmin(resolveEmail(req))) {
    sendError(res, 'FORBIDDEN', 'Admin access required', 403);
    return;
  }

  const { id } = req.params;
  const { status, admin_notes } = req.body ?? {};

  const patch: { status?: BugStatus; adminNotes?: string | null } = {};
  if (status && (VALID_STATUSES as string[]).includes(status)) {
    patch.status = status as BugStatus;
  }
  if (admin_notes !== undefined) {
    patch.adminNotes = admin_notes;
  }

  if (Object.keys(patch).length === 0) {
    sendError(res, 'VALIDATION_ERROR', 'Nothing to update');
    return;
  }

  try {
    await updateBugReport(id, patch);
    logger.info(`[Bugs] Admin triaged bug ${id} (Firestore): ${JSON.stringify(patch)}`);
    sendJson(res, { id, ...patch });
  } catch (err) {
    logger.error(`[Bugs] Failed to update report ${id} in Firestore: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Failed to update report', 500);
  }
});

export default router;
