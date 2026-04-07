/**
 * Template Marketplace Module
 *
 * Parte 83: Template Marketplace / Configurable Styles
 */

// Catalog
export {
  TEMPLATES,
  STYLES,
  COLLECTIONS,
  getAllCatalogEntries,
} from './catalog.js';

// Resolver
export {
  resolveVisualConfig,
  checkAvailability,
  getAvailableTemplates,
  getAvailableStyles,
  loadPreferences,
  savePreferences,
} from './style-resolver.js';
