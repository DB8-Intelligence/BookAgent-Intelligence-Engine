/**
 * Routes: Memory & Longitudinal Tenant Intelligence
 *
 * Parte 90: Memory & Longitudinal Tenant Intelligence
 */

import { Router } from 'express';
import {
  getTenantMemoryEndpoint,
  getTenantProfile,
  consolidateEndpoint,
  getPatterns,
  getSnapshotEndpoint,
} from '../controllers/memoryController.js';

const router = Router();

router.get('/',                getTenantMemoryEndpoint);
router.get('/profile',         getTenantProfile);
router.post('/consolidate',    consolidateEndpoint);
router.get('/patterns',        getPatterns);
router.get('/snapshot',        getSnapshotEndpoint);

export default router;
