/**
 * Auto-Provision Middleware — Sprint 3.7 (Firestore-only)
 *
 * Antes (Supabase): criava tenant em `bookagent_tenants` quando usuário
 * autenticado fazia primeira request sem tenant cadastrado.
 *
 * Agora (Firebase + Firestore): `firebaseAuthMiddleware` já chama
 * `ensureProfile(user)` em `google-persistence.ts`, que cria
 * `profiles/{uid}` no Firestore na primeira request. Tenant inicial
 * (`tenants/{uid}`, solo) é criado por `firestore-billing.ts` quando
 * o primeiro `consumeJobCredit` rodar — modelo lazy.
 *
 * Resultado: este middleware **não tem mais lógica**. Mantido como
 * no-op pra preservar a chain registrada em `services/api/composition.ts`.
 * `setAutoProvisionClient` mantido como shim de retrocompat (chamado
 * pelo composition root, ignorado em runtime).
 */

import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { logDeprecatedSupabaseCall } from '../../utils/deprecated-supabase.js';

export function setAutoProvisionClient(_client: SupabaseClient): void {
  logDeprecatedSupabaseCall({
    module: 'AutoProvisionMiddleware',
    action: 'setAutoProvisionClient',
    reason: 'Auto-provision is Firestore-native via firebaseAuth.ensureProfile since Sprint 3.7.',
  });
}

export async function autoProvisionMiddleware(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // No-op: Firebase Auth middleware já provisionou o profile no Firestore.
  next();
}
