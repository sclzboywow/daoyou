import { adminAuditMiddleware } from '@server/lib/admin/audit';
import { requireAdmin } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import accountsRouter from '@server/routes/api/admin/accounts.router';
import activitiesRouter from '@server/routes/api/admin/activities.router';
import announcementRouter from '@server/routes/api/admin/announcement.router';
import auditRouter from '@server/routes/api/admin/audit.router';
import battleSimulatorRouter from '@server/routes/api/admin/battle-simulator.router';
import broadcastRouter from '@server/routes/api/admin/broadcast.router';
import communityGroupRouter from '@server/routes/api/admin/community-qrcode.router';
import feedbackRouter from '@server/routes/api/admin/feedback.router';
import itemLibraryRouter from '@server/routes/api/admin/item-library.router';
import jobsRouter from '@server/routes/api/admin/jobs.router';
import llmMetricsRouter from '@server/routes/api/admin/llm-metrics.router';
import onlineUsersRouter from '@server/routes/api/admin/online-users.router';
import operationsRouter from '@server/routes/api/admin/operations.router';
import playersRouter from '@server/routes/api/admin/players.router';
import redeemCodesRouter from '@server/routes/api/admin/redeem-codes.router';
import reputationShopRouter from '@server/routes/api/admin/reputation-shop.router';
import sectShopRouter from '@server/routes/api/admin/sect-shop.router';
import templatesRouter from '@server/routes/api/admin/templates.router';
import towerEnemySetsRouter from '@server/routes/api/admin/tower-enemy-sets.router';
import websiteContentRouter from '@server/routes/api/admin/website-content.router';
import { Hono } from 'hono';

const router = new Hono<AppEnv>();

router.use('*', adminAuditMiddleware());

router.get('/session', requireAdmin(), (c) => {
  const user = c.get('user');
  return c.json({
    success: true,
    userId: user?.id ?? '',
    email: user?.email ?? '',
  });
});

router.route('/accounts', accountsRouter);
router.route('/templates', templatesRouter);
router.route('/feedback', feedbackRouter);
router.route('/broadcast', broadcastRouter);
router.route('/announcement', announcementRouter);
router.route('/website-content', websiteContentRouter);
router.route('/activities', activitiesRouter);
router.route('/audit', auditRouter);
router.route('/item-library', itemLibraryRouter);
router.route('/jobs', jobsRouter);
router.route('/redeem-codes', redeemCodesRouter);
router.route('/reputation-shop', reputationShopRouter);
router.route('/sect-shop', sectShopRouter);
router.route('/community-group', communityGroupRouter);
router.route('/llm-metrics', llmMetricsRouter);
router.route('/online-users', onlineUsersRouter);
router.route('/operations', operationsRouter);
router.route('/players', playersRouter);
router.route('/tower-enemy-sets', towerEnemySetsRouter);
router.route('/battle-simulator', battleSimulatorRouter);

export default router;
