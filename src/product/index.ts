/**
 * BookAgent Product Layer — Public Exports
 *
 * Estrutura de monetização e distribuição do BookAgent Intelligence Engine.
 *
 * Canais:
 * 1. SaaS Direto (plans, landing, sales)
 * 2. MCP Server (mcp-contract)
 * 3. API B2B (api-spec)
 */

export {
  PlanTier,
  BillingCycle,
  PRICING_PLANS,
  VALUE_PROPOSITION,
  DistributionChannel,
  DISTRIBUTION_CHANNELS,
  type PricingPlan,
  type PlanFeature,
  type ChannelConfig,
} from './plans.js';

export { LANDING_SECTIONS, type LandingSection } from './landing-copy.js';
export { SALES_BLOCKS, type SalesBlock } from './sales-copy.js';
export { DEMO_REEL_SCRIPT, CONTENT_PILLARS, WEEKLY_CALENDAR, ACQUISITION_STRATEGY } from './demo-script.js';
export { MCP_TOOLS, MCP_RESOURCES, type MCPToolDefinition, type MCPResource } from './mcp-contract.js';
export { API_ENDPOINTS, API_AUTH, API_EXAMPLES, type APIEndpoint, type APIExample } from './api-spec.js';
