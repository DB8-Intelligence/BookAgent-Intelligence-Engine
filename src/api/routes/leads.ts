/**
 * Routes: Lead Management
 *
 * Endpoints do funil comercial — registro, tracking e gestão de leads.
 * Chamados principalmente pelo n8n (Fluxo 7 e 8) durante o funil de vendas.
 *
 * POST   /leads/register        → Registrar lead (primeiro contato ou retorno)
 * GET    /leads/:phone          → Dados do lead
 * PATCH  /leads/:phone/stage    → Atualizar estágio no funil
 * POST   /leads/:phone/event    → Registrar evento de interação
 * POST   /leads/:phone/demo     → Incrementar uso de demo (trial)
 *
 * Parte 56: Funil de Vendas e Operação Comercial
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  registerLead,
  getLead,
  updateLeadStage,
  addLeadEvent,
  incrementDemoUsed,
} from '../controllers/leadsController.js';

const router = Router();

// Proteção para todos os endpoints de gestão de leads (n8n/internos)
router.use(authMiddleware);

router.post('/register',          registerLead);
router.get('/:phone',             getLead);
router.patch('/:phone/stage',     updateLeadStage);
router.post('/:phone/event',      addLeadEvent);
router.post('/:phone/demo',       incrementDemoUsed);

export default router;
