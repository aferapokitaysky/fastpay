import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

/**
 * Base class for expected, well-typed application errors. Anything thrown
 * as an AppError (or subclass) is serialized to the standard error envelope
 * from docs/api/FRONTEND_BACKEND_CONTRACT.md:
 *   { "error": { "code", "message", "requestId", "details" } }
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode = 500,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 404, details);
    this.name = "NotFoundError";
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 503, details);
    this.name = "ServiceUnavailableError";
  }
}

function sendErrorEnvelope(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): void {
  reply.status(statusCode).send({
    error: {
      code,
      message,
      requestId,
      ...(details ? { details } : {}),
    },
  });
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      sendErrorEnvelope(
        reply,
        error.statusCode,
        error.code,
        error.message,
        request.id,
        error.details,
      );
      return;
    }

    if (error instanceof ZodError) {
      sendErrorEnvelope(reply, 400, "VALIDATION_ERROR", "Invalid request payload", request.id, {
        issues: error.issues,
      });
      return;
    }

    // Fastify's own validation errors (schema-based route validation).
    if (typeof error.statusCode === "number" && error.statusCode < 500) {
      sendErrorEnvelope(
        reply,
        error.statusCode,
        "BAD_REQUEST",
        error.message || "Bad request",
        request.id,
      );
      return;
    }

    request.log.error({ err: error }, "Unhandled error");
    sendErrorEnvelope(reply, 500, "INTERNAL_ERROR", "Internal server error", request.id);
  });

  app.setNotFoundHandler((request, reply) => {
    sendErrorEnvelope(reply, 404, "ROUTE_NOT_FOUND", "Route not found", request.id);
  });
}
