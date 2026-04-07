/**
 * Publishing Module — Publishing Adapter Layer
 *
 * Expõe a API pública do módulo de publicação.
 *
 * Parte 67: Publishing Adapter Layer
 */

// Orchestrator
export {
  publish,
  publishToAll,
  registerAdapter,
  getConfiguredAdapters,
  getAdapter,
  type PublishOptions,
  type PublishSessionResult,
} from './social-publisher.js';

// Adapters
export { InstagramAdapter } from './adapters/instagram-adapter.js';
export { FacebookAdapter } from './adapters/facebook-adapter.js';
export { WhatsAppAdapter } from './adapters/whatsapp-adapter.js';
