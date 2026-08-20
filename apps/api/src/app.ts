import Fastify, { type FastifyInstance } from "fastify";
import websocketPlugin from "@fastify/websocket";
import { genRequestId, requestIdPlugin } from "./middleware/requestId.js";
import { registerErrorHandler } from "./middleware/errorHandler.js";
import { healthRoutes } from "./routes/health.js";
import { publicBillRoutes } from "./routes/publicBill.js";
import { ownerAuthRoutes } from "./routes/ownerAuth.js";
import { staffAuthRoutes } from "./routes/staffAuth.js";
import { staffVenuesRoutes } from "./routes/staffVenues.js";
import { staffFloorsRoutes } from "./routes/staffFloors.js";
import { staffTablesRoutes } from "./routes/staffTables.js";
import { staffMenuItemsRoutes } from "./routes/staffMenuItems.js";
import { staffOrdersRoutes } from "./routes/staffOrders.js";
import { staffEmployeesRoutes } from "./routes/staffEmployees.js";
import { publicPaymentIntentsRoutes } from "./routes/publicPaymentIntents.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { staffPaymentConfigRoutes } from "./routes/staffPaymentConfig.js";
import { staffRealtimeRoutes } from "./routes/staffRealtime.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    genReqId: genRequestId,
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
  });

  registerErrorHandler(app);

  app.register(websocketPlugin);
  app.register(requestIdPlugin);
  app.register(healthRoutes);
  app.register(publicBillRoutes);
  app.register(ownerAuthRoutes);
  app.register(staffAuthRoutes);
  app.register(staffVenuesRoutes);
  app.register(staffFloorsRoutes);
  app.register(staffTablesRoutes);
  app.register(staffMenuItemsRoutes);
  app.register(staffOrdersRoutes);
  app.register(staffEmployeesRoutes);
  app.register(publicPaymentIntentsRoutes);
  app.register(webhookRoutes);
  app.register(staffPaymentConfigRoutes);
  app.register(staffRealtimeRoutes);

  return app;
}
