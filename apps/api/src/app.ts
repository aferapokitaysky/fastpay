import Fastify, { type FastifyInstance } from "fastify";
import { genRequestId, requestIdPlugin } from "./middleware/requestId.js";
import { registerErrorHandler } from "./middleware/errorHandler.js";
import { healthRoutes } from "./routes/health.js";
import { publicBillRoutes } from "./routes/publicBill.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    genReqId: genRequestId,
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
  });

  registerErrorHandler(app);

  app.register(requestIdPlugin);
  app.register(healthRoutes);
  app.register(publicBillRoutes);

  return app;
}
