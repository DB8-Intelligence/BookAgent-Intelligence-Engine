/**
 * Firebase Auth Middleware — substitui supabaseAuthMiddleware
 *
 * Valida ID tokens do Firebase via firebase-admin SDK. Aceita token por:
 *   - Authorization: Bearer <token>   (fetch/axios)
 *   - ?access_token=<token>            (EventSource, query param)
 *
 * Em Cloud Run, credentials pra verificação vêm de Workload Identity
 * (nenhum arquivo service-account.json precisa estar no container).
 *
 * No primeiro acesso de um uid, o profile é auto-provisionado no Firestore
 * (plano starter, 1 job/mês). Requests subsequentes só batem auth/cache
 * interno do Firebase Admin.
 *
 * Comportamento em dev (sem Firebase configurado):
 *   Se GOOGLE_CLOUD_PROJECT + FIREBASE_PROJECT_ID forem ausentes, deixa
 *   passar (modo standalone local) — mesmo padrão que o supabaseAuthMiddleware.
 */

import type { Request, Response, NextFunction } from 'express';
import { verifyFirebaseToken, ensureProfile, type FirebaseUser } from '../../persistence/google-persistence.js';
import { logger } from '../../utils/logger.js';

const DEV_BYPASS = !process.env.GOOGLE_CLOUD_PROJECT && !process.env.FIREBASE_PROJECT_ID;

export async function firebaseAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (DEV_BYPASS) {
    return next();
  }

  // Aceita token via Authorization: Bearer ou ?access_token=
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query.access_token === 'string'
    ? req.query.access_token
    : undefined;

  let token: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (queryToken) {
    token = queryToken;
  } else {
    return next();
  }

  let user: FirebaseUser;
  try {
    user = await verifyFirebaseToken(token);
  } catch (err) {
    logger.debug(`[FirebaseAuth] token verification failed: ${(err as Error).message}`);
    return next();
  }

  req.authUser = {
    id: user.uid,
    email: user.email,
    name: user.name,
  };

  // Just-in-time provisioning do profile no Firestore.
  // Não bloqueia a request em caso de erro (best-effort).
  ensureProfile(user).catch((err) =>
    logger.warn(`[FirebaseAuth] ensureProfile failed for uid=${user.uid}: ${err}`),
  );

  next();
}
