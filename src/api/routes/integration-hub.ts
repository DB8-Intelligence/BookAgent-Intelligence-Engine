/**
 * Routes: Integration Hub — Conectores Externos
 * Parte 103: Escala
 */

import { Router } from 'express';
import {
  handleCreateConnection,
  handleListConnections,
  handleGetCatalog,
  handleGetConnection,
  handleDeleteConnection,
  handlePingConnection,
  handleTestDispatch,
  handleGetSyncLogs,
} from '../controllers/integrationHubController.js';

const router = Router();

router.post('/',                  handleCreateConnection);
router.get('/',                   handleListConnections);
router.get('/catalog',            handleGetCatalog);
router.get('/:id',                handleGetConnection);
router.delete('/:id',             handleDeleteConnection);
router.post('/:id/ping',          handlePingConnection);
router.post('/:id/test',          handleTestDispatch);
router.get('/:id/logs',           handleGetSyncLogs);

export default router;
