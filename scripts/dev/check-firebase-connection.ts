/**
 * scripts/dev/check-firebase-connection.ts
 *
 * Sanity check de conexão Firestore via firebase-admin SDK usando
 * Application Default Credentials (ADC). Read-only.
 *
 * O QUE ELE FAZ:
 *   1. Inicializa firebase-admin com ADC (sem JSON key).
 *   2. Detecta projectId via env (GOOGLE_CLOUD_PROJECT / FIREBASE_PROJECT_ID
 *      / GCLOUD_PROJECT) e injeta no app.
 *   3. Faz uma leitura `db.collection('profiles').limit(1).get()` —
 *      collection 'profiles' já é fonte primária do Firestore na arquitetura
 *      atual; se ela existir, retorna doc; se não, retorna empty (ok também).
 *   4. Imprime sucesso/falha + tempo de resposta em ms.
 *   5. Sai com exit code 0 (sucesso) ou 1 (falha).
 *
 * O QUE ELE NÃO FAZ:
 *   - NÃO escreve no Firestore.
 *   - NÃO lê serviceAccountKey.json.
 *   - NÃO cria nem manipula secrets.
 *
 * COMO RODAR (ver scripts/dev/README.md):
 *   gcloud auth application-default login
 *   gcloud config set project bookreel
 *   npx tsx scripts/dev/check-firebase-connection.ts
 */

import admin from 'firebase-admin';

const COLLECTION_TO_PROBE = 'profiles';

function detectProjectId(): string | undefined {
  return (
    process.env.GOOGLE_CLOUD_PROJECT
    ?? process.env.FIREBASE_PROJECT_ID
    ?? process.env.GCLOUD_PROJECT
    ?? undefined
  );
}

async function main(): Promise<void> {
  const detectedProjectId = detectProjectId();

  console.log('[check-firebase] Initializing firebase-admin with Application Default Credentials...');

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      ...(detectedProjectId ? { projectId: detectedProjectId } : {}),
    });
  }

  const projectId = admin.app().options.projectId ?? detectedProjectId ?? '<unknown>';

  if (projectId === '<unknown>') {
    console.warn(
      '[check-firebase] WARNING: projectId not detected. ' +
      'Run: gcloud config set project bookreel',
    );
  } else {
    console.log(`[check-firebase] projectId=${projectId}`);
  }

  console.log(`[check-firebase] Probing collection "${COLLECTION_TO_PROBE}" with limit(1)...`);

  const db = admin.firestore();
  const start = Date.now();

  try {
    const snapshot = await db.collection(COLLECTION_TO_PROBE).limit(1).get();
    const elapsedMs = Date.now() - start;

    console.log(
      `[check-firebase] SUCCESS — read ${snapshot.size} doc(s) ` +
      `from "${COLLECTION_TO_PROBE}" in ${elapsedMs}ms`,
    );

    if (snapshot.empty) {
      console.log(
        `[check-firebase] (collection "${COLLECTION_TO_PROBE}" is empty — ` +
        `connectivity OK, no data yet)`,
      );
    } else {
      const firstDoc = snapshot.docs[0];
      console.log(`[check-firebase] sample doc id=${firstDoc.id}`);
    }

    process.exit(0);
  } catch (err) {
    const elapsedMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[check-firebase] FAIL after ${elapsedMs}ms — ${msg}`);

    if (msg.toLowerCase().includes('could not load the default credentials')) {
      console.error(
        '[check-firebase] Hint: Run `gcloud auth application-default login` ' +
        'to set up ADC, then retry.',
      );
    } else if (msg.toLowerCase().includes('project') && msg.toLowerCase().includes('not')) {
      console.error(
        '[check-firebase] Hint: Run `gcloud config set project bookreel` ' +
        'to set the active project.',
      );
    }

    process.exit(1);
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[check-firebase] UNEXPECTED ERROR: ${msg}`);
  process.exit(1);
});
