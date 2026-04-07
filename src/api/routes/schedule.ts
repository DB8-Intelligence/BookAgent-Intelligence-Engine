/**
 * Routes: Scheduling & Calendar
 *
 * Schedule routes are nested under /campaigns/:id/schedule
 * Calendar overview is at /calendar/overview
 *
 * Parte 86: Scheduling & Calendar Orchestration
 */

import { Router } from 'express';
import {
  getCampaignSchedule,
  generateCampaignSchedule,
  replanCampaignSchedule,
  updateScheduleItem,
  getCalendarOverview,
} from '../controllers/scheduleController.js';

const router = Router();

// Campaign schedule endpoints (under /campaigns prefix)
router.get('/:id/schedule',                   getCampaignSchedule);
router.post('/:id/schedule/generate',          generateCampaignSchedule);
router.post('/:id/schedule/replan',            replanCampaignSchedule);
router.patch('/:id/schedule/items/:itemId',    updateScheduleItem);

export default router;

// Calendar overview (separate router, mounted at /calendar)
export const calendarRouter = Router();
calendarRouter.get('/overview', getCalendarOverview);
