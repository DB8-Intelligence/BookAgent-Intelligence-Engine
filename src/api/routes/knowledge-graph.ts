/**
 * Routes: Knowledge Graph & Relational Intelligence
 *
 * Parte 92: Knowledge Graph & Relational Intelligence
 */

import { Router } from 'express';
import {
  getGraphSnapshot,
  buildGraph,
  listNodes,
  listEdges,
  getRelations,
  getConnected,
  getStrong,
  getIntelligence,
} from '../controllers/knowledgeGraphController.js';

const router = Router();

router.get('/snapshot',                 getGraphSnapshot);
router.post('/build',                   buildGraph);
router.get('/nodes',                    listNodes);
router.get('/edges',                    listEdges);
router.get('/nodes/:nodeId/relations',  getRelations);
router.get('/nodes/:nodeId/connected',  getConnected);
router.get('/strong',                   getStrong);
router.get('/intelligence',             getIntelligence);

export default router;
