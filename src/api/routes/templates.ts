/**
 * Routes: Template Marketplace
 *
 * Parte 83: Template Marketplace / Configurable Styles
 */

import { Router } from 'express';
import {
  getCatalog,
  getCollections,
  getStyles,
  getAvailabilityEndpoint,
  getPreferences,
  updatePreferences,
} from '../controllers/templateMarketplaceController.js';

const router = Router();

router.get('/catalog',        getCatalog);
router.get('/collections',    getCollections);
router.get('/styles',         getStyles);
router.get('/availability',   getAvailabilityEndpoint);
router.get('/preferences',    getPreferences);
router.put('/preferences',    updatePreferences);

export default router;
