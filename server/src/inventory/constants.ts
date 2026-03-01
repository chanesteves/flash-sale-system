/**
 * Injection token for the Redis client instance.
 * Extracted to its own file to avoid circular imports between
 * inventory.module.ts and inventory.service.ts.
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';
