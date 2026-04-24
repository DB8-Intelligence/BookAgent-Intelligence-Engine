/**
 * Google Persistence — Firebase Auth + Firestore adapter
 *
 * Substitui Supabase Auth + Postgres pra 3 collections do ecossistema
 * principal: profiles, jobs, artifacts. Os outros 56 módulos
 * (billing, analytics, admin, etc.) continuam em Supabase por enquanto.
 *
 * Auth: Firebase Admin SDK valida ID tokens do frontend. Em Cloud Run,
 * credentials vêm automaticamente via Workload Identity — não precisa
 * de service-account.json. Em dev local, `gcloud auth application-default
 * login` funciona igual.
 *
 * Firestore: Cloud Firestore em modo Native. Collections:
 *   - profiles/{uid}       — perfil do usuário + créditos
 *   - jobs/{jobId}          — metadata de cada job (jobId = UUID v4)
 *   - artifacts/{artifactId} — artifacts produzidos (reels, posts, etc.)
 *
 * Segurança: todos os docs têm `tenantId` denormalizado. O backend sempre
 * filtra WHERE tenantId == authUser.uid. Security Rules ficam pra sessão
 * seguinte (por enquanto, é backend-only — nenhum cliente acessa Firestore
 * diretamente).
 */

import admin from 'firebase-admin';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Singleton initialization
// ---------------------------------------------------------------------------

let appInstance: admin.app.App | null = null;

function getApp(): admin.app.App {
  if (appInstance) return appInstance;

  if (admin.apps.length > 0) {
    appInstance = admin.app();
    return appInstance;
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      '[GooglePersistence] GOOGLE_CLOUD_PROJECT env var obrigatório (FIREBASE_PROJECT_ID também aceito).',
    );
  }

  appInstance = admin.initializeApp({
    projectId,
    // Em Cloud Run: Workload Identity (SA atachada ao serviço) fornece
    // credentials automaticamente via ADC. Em dev: `gcloud auth
    // application-default login` resolve o mesmo caminho.
  });

  logger.info(`[GooglePersistence] Firebase Admin initialized for project=${projectId}`);
  return appInstance;
}

// ---------------------------------------------------------------------------
// Auth — verify Firebase ID token
// ---------------------------------------------------------------------------

export interface FirebaseUser {
  uid: string;
  email: string;
  name?: string;
  emailVerified: boolean;
}

/**
 * Valida um ID token vindo do frontend.
 * Retorna o usuário extraído ou lança.
 */
export async function verifyFirebaseToken(idToken: string): Promise<FirebaseUser> {
  const decoded = await getApp().auth().verifyIdToken(idToken, true);
  return {
    uid: decoded.uid,
    email: (decoded.email as string | undefined) ?? '',
    name: decoded.name as string | undefined,
    emailVerified: !!decoded.email_verified,
  };
}

/**
 * Resolve o Firebase UID a partir do email. Usado pelos webhooks de
 * pagamento (Kiwify/Hotmart/Stripe) que identificam o cliente pelo email.
 * Retorna null se o usuário ainda não se cadastrou no Firebase — caller
 * pode ignorar ou armazenar upgrade pendente.
 */
export async function resolveUidByEmail(email: string): Promise<string | null> {
  if (!email) return null;
  try {
    const record = await getApp().auth().getUserByEmail(email);
    return record.uid;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/user-not-found') return null;
    logger.warn(`[GooglePersistence] resolveUidByEmail failed for ${email}: ${(err as Error).message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Firestore — collection wrappers
// ---------------------------------------------------------------------------

export function firestore(): FirebaseFirestore.Firestore {
  return getApp().firestore();
}

// --- profiles + tenants ----------------------------------------------------
//
// Profile = identidade pessoal (uid, email, name).
// Tenant = organização (planTier, credits). Na MVP, cada user tem um solo
// tenant com tenantId = uid. Futuro: invites multi-user → vários uids num
// mesmo tenant compartilhando o saldo.
//
// activeTenantId no profile indica qual tenant o user está operando no
// momento (quando tiver múltiplos).

export interface Profile {
  uid: string;
  email: string;
  name: string | null;
  activeTenantId: string;           // Default = uid (solo tenant)
  createdAt: string;
  updatedAt: string;
}

export interface Tenant {
  tenantId: string;
  ownerUid: string;
  name: string;
  planTier: 'starter' | 'pro' | 'agency';
  credits: {
    jobsUsed: number;
    jobsLimit: number;
    rendersUsed: number;
    rendersLimit: number;
    periodStart: string;
    periodEnd: string;
  };
  createdAt: string;
  updatedAt: string;
}

const PROFILES = 'profiles';
const TENANTS = 'tenants';
const JOBS = 'jobs';
const ARTIFACTS = 'artifacts';

export async function getProfile(uid: string): Promise<Profile | null> {
  const snap = await firestore().collection(PROFILES).doc(uid).get();
  return snap.exists ? (snap.data() as Profile) : null;
}

export async function getTenant(tenantId: string): Promise<Tenant | null> {
  const snap = await firestore().collection(TENANTS).doc(tenantId).get();
  return snap.exists ? (snap.data() as Tenant) : null;
}

/**
 * Upsert "just-in-time" na primeira login. Cria:
 *   - profiles/{uid}        → identidade pessoal + activeTenantId=uid
 *   - tenants/{uid}         → solo tenant, plano starter, credits zerados
 *
 * Atômico via batch write (falha → rollback total). Credits/planTier do
 * tenant derivam de PLAN_TENANT_LIMITS (fonte de verdade).
 */
export async function ensureProfile(user: FirebaseUser): Promise<Profile> {
  const db = firestore();
  const profileRef = db.collection(PROFILES).doc(user.uid);
  const tenantRef = db.collection(TENANTS).doc(user.uid);

  const [profileSnap, tenantSnap] = await Promise.all([
    profileRef.get(),
    tenantRef.get(),
  ]);

  if (profileSnap.exists && tenantSnap.exists) {
    return profileSnap.data() as Profile;
  }

  // Import tardio pra evitar ciclo
  const { planLimitsFor } = await import('../modules/billing/firestore-billing.js');
  const limits = planLimitsFor('starter');

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);

  const profile: Profile = {
    uid: user.uid,
    email: user.email,
    name: user.name ?? null,
    activeTenantId: user.uid,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const tenant: Tenant = {
    tenantId: user.uid,
    ownerUid: user.uid,
    name: user.name ?? user.email ?? 'Meu Workspace',
    planTier: 'starter',
    credits: {
      jobsUsed: 0,
      jobsLimit: limits.jobsLimit,
      rendersUsed: 0,
      rendersLimit: limits.rendersLimit,
      periodStart: now.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const batch = db.batch();
  if (!profileSnap.exists) batch.set(profileRef, profile);
  if (!tenantSnap.exists) batch.set(tenantRef, tenant);
  await batch.commit();

  logger.info(
    `[GooglePersistence] Provisioned uid=${user.uid} + solo tenant plan=starter ` +
    `limits=${limits.jobsLimit}j/${limits.rendersLimit}r`,
  );

  // Aplica upgrade pendente se webhook de pagamento chegou ANTES do signup.
  try {
    const { claimPendingUpgrade } = await import('../modules/billing/webhook-bridge.js');
    const claimed = await claimPendingUpgrade(user.email, user.uid);
    if (claimed) {
      logger.info(`[GooglePersistence] pending upgrade claimed: ${claimed}`);
    }
  } catch (err) {
    logger.warn(`[GooglePersistence] claimPendingUpgrade failed: ${(err as Error).message}`);
  }
  return profile;
}

// --- jobs -------------------------------------------------------------------

export interface JobDoc {
  jobId: string;
  tenantId: string;
  userId: string;
  inputType: 'pdf' | 'video' | 'audio' | 'pptx' | 'document';
  inputFileUrl: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  currentStage: string | null;
  stageIndex: number;
  totalStages: number;
  errorMessage: string | null;
  selectedFormats: string[];
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createJob(doc: Omit<JobDoc, 'createdAt' | 'updatedAt'>): Promise<void> {
  const now = new Date().toISOString();
  await firestore()
    .collection(JOBS)
    .doc(doc.jobId)
    .set({ ...doc, createdAt: now, updatedAt: now });
}

export async function updateJob(jobId: string, patch: Partial<JobDoc>): Promise<void> {
  await firestore()
    .collection(JOBS)
    .doc(jobId)
    .set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function getJob(jobId: string): Promise<JobDoc | null> {
  const snap = await firestore().collection(JOBS).doc(jobId).get();
  return snap.exists ? (snap.data() as JobDoc) : null;
}

export async function listJobsByTenant(
  tenantId: string,
  opts: { limit?: number; status?: JobDoc['status'] } = {},
): Promise<JobDoc[]> {
  let q = firestore()
    .collection(JOBS)
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc');
  if (opts.status) q = q.where('status', '==', opts.status);
  if (opts.limit) q = q.limit(opts.limit);
  const snap = await q.get();
  return snap.docs.map((d) => d.data() as JobDoc);
}

// --- artifacts --------------------------------------------------------------

export interface ArtifactDoc {
  artifactId: string;
  jobId: string;
  tenantId: string;               // denormalizado pra query direto
  artifactType: string;           // VIDEO_RENDER, media-render-spec, blog-article, landing-page, media-metadata
  exportFormat: string | null;    // mp4, json, html, markdown, render-spec
  title: string;
  sizeBytes: number | null;
  publicUrl: string | null;       // GCS signed/public URL
  filePath: string | null;        // GCS path (gs://bucket/path)
  mimeType: string | null;
  status: 'valid' | 'partial' | 'invalid';
  createdAt: string;
}

export async function saveArtifact(doc: Omit<ArtifactDoc, 'createdAt'>): Promise<void> {
  await firestore()
    .collection(ARTIFACTS)
    .doc(doc.artifactId)
    .set({ ...doc, createdAt: new Date().toISOString() });
}

export async function listArtifactsByJob(jobId: string): Promise<ArtifactDoc[]> {
  const snap = await firestore()
    .collection(ARTIFACTS)
    .where('jobId', '==', jobId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => d.data() as ArtifactDoc);
}

export async function listArtifactsByTenant(
  tenantId: string,
  opts: { type?: string; onlyWithDownload?: boolean; limit?: number } = {},
): Promise<ArtifactDoc[]> {
  let q = firestore()
    .collection(ARTIFACTS)
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc');
  if (opts.type) q = q.where('artifactType', '==', opts.type);
  if (opts.limit) q = q.limit(opts.limit);
  const snap = await q.get();
  let items = snap.docs.map((d) => d.data() as ArtifactDoc);
  if (opts.onlyWithDownload) items = items.filter((a) => !!a.publicUrl || !!a.filePath);
  return items;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function googlePersistenceHealth(): Promise<{
  firestore: boolean;
  auth: boolean;
  projectId: string | null;
}> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? null;
  let firestoreOk = false;
  let authOk = false;

  try {
    getApp();
    authOk = true;
    // touch firestore com read barato (root metadata)
    await firestore().listCollections();
    firestoreOk = true;
  } catch (err) {
    logger.warn(`[GooglePersistence] health check failed: ${err}`);
  }

  return { firestore: firestoreOk, auth: authOk, projectId };
}
