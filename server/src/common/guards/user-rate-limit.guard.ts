import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../inventory/constants.js';

const USER_ATTEMPT_KEY_PREFIX = 'flash_sale:attempts:';
const MAX_PURCHASE_ATTEMPTS = 3;
const ATTEMPT_WINDOW_SECONDS = 3600; // 1 hour (covers entire sale window)

/**
 * Guards against a single user spamming the purchase endpoint.
 * Allows at most MAX_PURCHASE_ATTEMPTS per user per sale window.
 * Uses Redis INCR with TTL for atomic counting.
 */
@Injectable()
export class UserRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(UserRateLimitGuard.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const body = request.body as Record<string, unknown> | undefined;
    const userId = body?.['userId'] as string | undefined;

    if (!userId) {
      return true; // Let validation pipe handle missing userId
    }

    const key = `${USER_ATTEMPT_KEY_PREFIX}${userId}`;

    try {
      const attempts = await this.redis.incr(key);

      // Set TTL on first attempt
      if (attempts === 1) {
        await this.redis.expire(key, ATTEMPT_WINDOW_SECONDS);
      }

      if (attempts > MAX_PURCHASE_ATTEMPTS) {
        this.logger.warn(
          `User ${userId} exceeded purchase attempt limit (${attempts}/${MAX_PURCHASE_ATTEMPTS})`,
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Too many purchase attempts. Maximum ${MAX_PURCHASE_ATTEMPTS} attempts allowed.`,
            error: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      // If it's our own HttpException, re-throw it
      if (error instanceof HttpException) {
        throw error;
      }
      // If Redis is down, let the request through (fail-open for this guard)
      this.logger.error(
        `User rate limit check failed: ${error instanceof Error ? error.message : error}`,
      );
      return true;
    }
  }
}
