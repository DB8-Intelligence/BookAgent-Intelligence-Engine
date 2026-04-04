/**
 * BookAgent Integration — Public API
 *
 * Ponto de entrada para integradores consumirem o BookAgent.
 * Re-exporta contratos, cliente SDK e tipos.
 */

// Contracts (tipos de entrada/saída)
export type {
  ProcessInput_v1,
  UserContextInput,
  OutputFormatPreference,
  JobStatus_v1,
  OutputSummary_v1,
  ProcessResult_v1,
  SourceItem_v1,
  ArtifactItem_v1,
  PersonalizationSummary_v1,
  BrandingSummary_v1,
  WebhookPayload_v1,
  ApiEnvelope,
  EndpointMap,
} from './contracts.js';

// SDK Client
export {
  BookAgentClient,
  BookAgentError,
  type BookAgentClientOptions,
} from './client.js';
