/**
 * Tenant Module — SaaS Multi-Tenant Management
 *
 * Parte 101: SaaS Multi-Tenant + Billing Real
 */

export {
  createTenant,
  getTenant,
  getTenantBySlug,
  listTenants,
  updateTenantStatus,
  updateTenantPlan,
  addTenantMember,
  buildTenantContext,
  type CreateTenantInput,
} from './tenant-service.js';
