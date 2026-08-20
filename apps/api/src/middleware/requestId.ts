import type { FastifyInstance } from "fastify";
import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Reuses an inbound `x-request-id` header as the Fastify request id, or
 * generates a fresh uuid otherwise. Pass as `genReqId` when constructing the
 * Fastify instance so it takes effect before the request logger is created.
 * Fastify calls this with the raw Node request, not the wrapped
 * FastifyRequest (which doesn't exist yet at this point).
 */
export function genRequestId(req: IncomingMessage): string {
  const inbound = req.headers[REQUEST_ID_HEADER];
  const value = Array.isArray(inbound) ? inbound[0] : inbound;
  return value || randomUUID();
}

/**
 * Echoes the (possibly inbound, possibly generated) request id back on the
 * response so callers and error envelopes can be correlated to a single
 * call.
 */
export async function requestIdPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
  });
}
