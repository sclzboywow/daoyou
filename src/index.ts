import { websocket } from 'hono/bun';
import app from './server/app';
import { registerInternalCronJobs } from './server/lib/jobs/internalCronScheduler';
import { registerMqWorkers } from './server/lib/mq/workerRegistry';

registerInternalCronJobs({ enabled: import.meta.env.PROD });
registerMqWorkers();

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch(request: Request, server: unknown) {
    return app.fetch(request, { server });
  },
  websocket,
};
