import { NormaliseError } from "@crowdshield/normalise";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

/** One error shape for everything (contracts ErrorBody). */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly log = new Logger("error");

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (err instanceof NormaliseError) {
      return res.status(400).json({ statusCode: 400, error: "Bad Request", message: err.message });
    }
    if (err instanceof HttpException) {
      const status = err.getStatus();
      const body = err.getResponse();
      const o =
        typeof body === "string"
          ? { message: body }
          : (body as { message?: unknown; issues?: unknown[]; error?: string });
      const message = Array.isArray(o.message)
        ? o.message.join("; ")
        : String(o.message ?? err.message);
      return res.status(status).json({
        statusCode: status,
        error: o.error ?? err.name.replace(/Exception$/, ""),
        message,
        issues: o.issues,
      });
    }
    this.log.error(err instanceof Error ? err.stack : String(err));
    return res
      .status(500)
      .json({ statusCode: 500, error: "Internal Server Error", message: "Something went wrong" });
  }
}
