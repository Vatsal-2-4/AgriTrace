import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import loginHandler from './server/handlers/login.js';
import registerHandler from './server/handlers/register.js';
import marketHandler from './api/market.js';
import marketAdvisorHandler from './api/ai/market-advisor.js';
import paymentsHandler from './server/handlers/payments.js';
import marketRecordsHandler from './server/handlers/market-records.js';
import chatHandler from './api/ai/chat.js';
import notificationsHandler from './api/notifications.js';
import biddingHandler from './api/bidding.js';
import qaHandler from './api/qa.js';
import processingHandler from './api/processing.js';
import transportHandler from './api/transport.js';
import warehouseHandler from './api/warehouse.js';
import coreHandler from './api/core.js';
import batchesHandler from './api/batches.js';
import adminHandler from './api/admin.js';
import adminTrackingHandler from './api/admin/tracking.js';

const LOCAL_HANDLERS = [
  ['/api/ai/market-advisor', marketAdvisorHandler],
  ['/api/ai/chat', chatHandler],
  ['/api/login', loginHandler],
  ['/api/register', registerHandler],
  ['/api/payments', paymentsHandler],
  ['/api/market', marketHandler]
  ,['/api/market-records', marketRecordsHandler],
  ['/api/notifications', notificationsHandler],
  ['/api/core', coreHandler],
  ['/api/batches', batchesHandler],
  ['/api/bidding', biddingHandler],
  ['/api/qa', qaHandler],
  ['/api/processing', processingHandler],
  ['/api/transport', transportHandler],
  ['/api/warehouse', warehouseHandler],
  ['/api/admin/tracking', adminTrackingHandler],
  ['/api/admin', adminHandler]
];

const CORE_ROUTE_ALIASES = new Map([
  ['/api/health', 'health'],
  ['/api/crop50', 'crop50'],
  ['/api/khetsetu', 'khetsetu'],
  ['/api/learning-resources', 'learning-resources'],
  ['/api/seed-demo', 'seed-demo']
]);

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function localApiBridge() {
  return {
    name: 'agritrace-local-api-bridge',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        const alias = CORE_ROUTE_ALIASES.get(url.pathname);
        const match = LOCAL_HANDLERS.find(([path]) => url.pathname === path || url.pathname.startsWith(`${path}/`)) || (alias ? ['/api/core', coreHandler] : null);
        if (!match) return next();

        try {
          req.query = Object.fromEntries(url.searchParams.entries());
          if (alias) req.query.handler = alias;
          req.body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '') ? await readBody(req) : {};
          res.status = function status(code) { this.statusCode = code; return this; };
          res.json = function json(data) {
            if (!this.headersSent) this.setHeader('Content-Type', 'application/json');
            this.end(JSON.stringify(data));
            return this;
          };
          res.send = function send(data) {
            if (typeof data === 'object' && data !== null) return this.json(data);
            this.end(data);
            return this;
          };
          await match[1](req, res);
          if (!res.writableEnded) res.json({ success: false, message: 'Local API returned no response.' });
        } catch (error) {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, message: error.message || 'Local API failed.' }));
          } else if (!res.writableEnded) res.end();
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [react(), localApiBridge()],
    server: {
      watch: { usePolling: true, interval: 500, ignored: ['**/dist/**', '**/.git/**', '**/node_modules/**'] }
    },
    optimizeDeps: { include: ['leaflet'] }
  };
});
