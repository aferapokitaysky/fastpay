import type { FastifyInstance } from "fastify";
import { checkDatabaseConnection } from "../db/client.js";
import { checkRedisConnection } from "../redis/client.js";
import { ServiceUnavailableError } from "../middleware/errorHandler.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness: process is up. No dependency checks.
  app.get("/health", async () => {
    return { status: "ok" };
  });

  // Readiness: Postgres + Redis must both be reachable.
  app.get("/ready", async () => {
    const [dbOk, redisOk] = await Promise.all([
      checkDatabaseConnection(),
      checkRedisConnection(),
    ]);

    if (!dbOk || !redisOk) {
      throw new ServiceUnavailableError("NOT_READY", "Dependency check failed", {
        postgres: dbOk ? "ok" : "unreachable",
        redis: redisOk ? "ok" : "unreachable",
      });
    }

    return { status: "ok", postgres: "ok", redis: "ok" };
  });
}
