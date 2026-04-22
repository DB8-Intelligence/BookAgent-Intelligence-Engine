/**
 * Admin Bypass — Skip usage limits and plan enforcement for admin users.
 *
 * Admins are identified by:
 *   - User ID in ADMIN_USER_IDS env var (comma-separated UUIDs)
 *   - Email in ADMIN_EMAILS env var (comma-separated, case-insensitive)
 *
 * Use cases:
 *   - Founder / DB8 team testing in production without burning own credits
 *   - Internal demos / QA without triggering quota exhaustion
 *   - Support staff reproducing customer bugs
 *
 * Admin flag short-circuits limit checks but usage is still recorded for
 * transparency (helpful for seeing real cost impact during testing).
 */

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS ?? 'b4627315-3a41-451c-a8e8-e6803cd87c32')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'dmbbonanza@gmail.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Check if a user ID is in the admin list. */
export function isAdminUserId(userId: string | undefined): boolean {
  if (!userId) return false;
  return ADMIN_USER_IDS.includes(userId);
}

/** Check if an email is in the admin list (case-insensitive). */
export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/** Check if the given identity (id or email) belongs to an admin. */
export function isAdmin(params: { userId?: string; email?: string }): boolean {
  return isAdminUserId(params.userId) || isAdminEmail(params.email);
}
