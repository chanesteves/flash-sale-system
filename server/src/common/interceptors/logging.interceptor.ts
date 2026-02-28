import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const response = context.switchToHttp().getResponse();
          const statusCode: number = response.statusCode;
          this.logger.log(`${method} ${url} ${statusCode} - ${duration}ms`);
        },
        error: (error: unknown) => {
          const duration = Date.now() - startTime;
          const status =
            error instanceof Object && 'getStatus' in error
              ? (error as { getStatus(): number }).getStatus()
              : 500;
          this.logger.warn(`${method} ${url} ${status} - ${duration}ms`);
        },
      }),
    );
  }
}
