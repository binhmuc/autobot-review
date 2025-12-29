import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global Exception Filter
 * Catches all exceptions and returns standardized error responses
 * Logs errors with full context for debugging
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine HTTP status code
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Extract error message
    let message: string | object = 'Internal server error';
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      message = typeof exceptionResponse === 'string'
        ? exceptionResponse
        : exceptionResponse;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // Log error with full context
    const errorLog = {
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      status,
      message,
      userAgent: request.headers['user-agent'],
    };

    if (status >= 500) {
      // Log server errors with stack trace
      this.logger.error(
        `Server Error: ${JSON.stringify(errorLog)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (status >= 400) {
      // Log client errors without stack trace
      this.logger.warn(`Client Error: ${JSON.stringify(errorLog)}`);
    }

    // Return standardized error response
    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
