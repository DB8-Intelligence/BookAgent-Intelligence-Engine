/**
 * Routes: Goal-Driven Optimization
 *
 * Parte 89: Goal-Driven Optimization
 */

import { Router } from 'express';
import {
  getActiveProfile,
  evaluateGoalsDriven,
  listProfiles,
  setPreference,
  getPreference,
  getDerivedParams,
} from '../controllers/goalOptimizationController.js';

const router = Router();

router.get('/profile',        getActiveProfile);
router.get('/evaluate',       evaluateGoalsDriven);
router.get('/profiles',       listProfiles);
router.post('/preference',    setPreference);
router.get('/preference',     getPreference);
router.get('/params',         getDerivedParams);

export default router;
