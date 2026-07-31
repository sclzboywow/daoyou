import type { AppEnv } from '@server/lib/hono/types';
import { Hono } from 'hono';
import conditionRouter from './cultivator/condition.router';
import inventoryRouter from './cultivator/inventory.router';
import mailRouter from './cultivator/mail.router';
import profileRouter from './cultivator/profile.router';
import retreatRouter from './cultivator/retreat.router';
import yieldRouter from './cultivator/yield.router';

const router = new Hono<AppEnv>();

router.route('/', profileRouter);
router.route('/', conditionRouter);
router.route('/inventory', inventoryRouter);
router.route('/mail', mailRouter);
router.route('/retreat', retreatRouter);
router.route('/yield', yieldRouter);

export default router;
