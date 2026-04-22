/**
 * Bug Reports API — In-app bug reporting
 *
 * Routes:
 *   POST   /bugs          — create a bug report (authenticated user)
 *   GET    /bugs/mine     — list own reports
 *   GET    /bugs          — list all reports (admin only)
 *   PATCH  /bugs/:id      — triage: update status/notes (admin only)
 *   GET    /bugs/is-admin — check if current user is admin
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

const router = Router();

// ---------------------------------------------------------------------------
// Supabase client (lazy, same pattern as other controllers)
// ---------------------------------------------------------------------------

let supabase: SupabaseClient | null = null;

export function setSupabaseClientForBugs(client: SupabaseClient): void {
  supabase = client;
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
// Auth resolver — matches the fallback chain used elsewhere in the app
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function resolveUserId(req: Request): string | undefined {
  // Try JWT first (from supabaseAuthMiddleware) — most trusted source
  if (isValidUuid(req.authUser?.id)) return req.authUser.id;
  // Then tenantContext — but skip 'anonymous' sentinel
  const ctxUserId = req.tenantContext?.userId;
  if (ctxUserId && ctxUserId !== 'anonymous' && isValidUuid(ctxUserId)) {
    return ctxUserId;
  }
  // Fallback to x-user-id header directly
  const headerId = req.headers['x-user-id'];
  if (typeof headerId === 'string' && isValidUuid(headerId)) return headerId;
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

// ---------------------------------------------------------------------------
// POST /bugs — create bug report
// ---------------------------------------------------------------------------

router.post('/', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
    return;
  }
  if (!supabase) {
    sendError(res, 'SERVICE_UNAVAILABLE', 'Supabase not configured', 503);
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

  const validSeverities = ['blocker', 'bug', 'suggestion'];
  const safeSeverity = validSeverities.includes(severity) ? severity : 'bug';

  try {
    const rows = await supabase.insert('bookagent_bug_reports', {
      user_id: userId,
      title: title.slice(0, 200),
      description: description?.slice(0, 4000) ?? null,
      severity: safeSeverity,
      context: context ?? {},
    });

    logger.info(`[Bugs] Created bug report by user ${userId}: "${title.slice(0, 50)}"`);
    sendJson(res, rows[0] ?? { id: 'created' }, 201);
  } catch (err) {
    logger.error(`[Bugs] Failed to create report: ${err}`);
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
// GET /bugs/mine — list own reports
// ---------------------------------------------------------------------------

router.get('/mine', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
    return;
  }
  if (!supabase) {
    sendError(res, 'SERVICE_UNAVAILABLE', 'Supabase not configured', 503);
    return;
  }

  try {
    const rows = await supabase.select('bookagent_bug_reports', {
      filters: [{ column: 'user_id', operator: 'eq', value: userId }],
      orderBy: 'created_at',
      orderDesc: true,
      limit: 50,
    });
    sendJson(res, rows);
  } catch (err) {
    logger.error(`[Bugs] Failed to list user reports: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Failed to list reports', 500);
  }
});

// ---------------------------------------------------------------------------
// GET /bugs — list all reports (admin only)
// ---------------------------------------------------------------------------

router.get('/', async (req: Request, res: Response) => {
  if (!isAdmin(resolveEmail(req))) {
    sendError(res, 'FORBIDDEN', 'Admin access required', 403);
    return;
  }
  if (!supabase) {
    sendError(res, 'SERVICE_UNAVAILABLE', 'Supabase not configured', 503);
    return;
  }

  try {
    const filters: Array<{ column: string; operator: 'eq'; value: string }> = [];

    const severity = req.query.severity as string | undefined;
    if (severity && ['blocker', 'bug', 'suggestion'].includes(severity)) {
      filters.push({ column: 'severity', operator: 'eq', value: severity });
    }

    const status = req.query.status as string | undefined;
    if (status && ['new', 'investigating', 'fixed', 'wont_fix'].includes(status)) {
      filters.push({ column: 'status', operator: 'eq', value: status });
    }

    const rows = await supabase.select('bookagent_bug_reports', {
      filters,
      orderBy: 'created_at',
      orderDesc: true,
      limit: 200,
    });
    sendJson(res, rows);
  } catch (err) {
    logger.error(`[Bugs] Failed to list all reports: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Failed to list reports', 500);
  }
});

// ---------------------------------------------------------------------------
// PATCH /bugs/:id — triage (admin only)
// ---------------------------------------------------------------------------

router.patch('/:id', async (req: Request, res: Response) => {
  if (!isAdmin(resolveEmail(req))) {
    sendError(res, 'FORBIDDEN', 'Admin access required', 403);
    return;
  }
  if (!supabase) {
    sendError(res, 'SERVICE_UNAVAILABLE', 'Supabase not configured', 503);
    return;
  }

  const { id } = req.params;
  const { status, admin_notes } = req.body ?? {};

  const updates: Record<string, unknown> = {};
  if (status && ['new', 'investigating', 'fixed', 'wont_fix'].includes(status)) {
    updates.status = status;
  }
  if (admin_notes !== undefined) {
    updates.admin_notes = admin_notes;
  }

  if (Object.keys(updates).length === 0) {
    sendError(res, 'VALIDATION_ERROR', 'Nothing to update');
    return;
  }

  try {
    await supabase.update(
      'bookagent_bug_reports',
      { column: 'id', operator: 'eq', value: id },
      updates,
    );
    logger.info(`[Bugs] Admin triaged bug ${id}: ${JSON.stringify(updates)}`);
    sendJson(res, { id, ...updates });
  } catch (err) {
    logger.error(`[Bugs] Failed to update report ${id}: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Failed to update report', 500);
  }
});

export default router;
