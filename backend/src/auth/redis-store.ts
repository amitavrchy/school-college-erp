import type { Options, Store, IncrementResponse } from 'express-rate-limit';
/** The subset of ioredis this store needs; lets tests pass an in-memory fake. */
export interface RedisLike {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  decr(key: string): Promise<number>;
}
const INCREMENT =
  "local n=redis.call('INCR',KEYS[1]); local t=redis.call('PTTL',KEYS[1]); " +
  "if t<0 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); t=tonumber(ARGV[1]) end; return {n,t}";
/**
 * Shared hit counter for express-rate-limit so every API instance sees the same totals.
 * Each limiter gets its own prefix, so one key space never collides with another.
 */
export class RedisRateLimitStore implements Store {
  private windowMs = 60_000;
  constructor(
    private redis: RedisLike,
    readonly prefix: string,
  ) {}
  localKeys = false;
  init(options: Options) {
    this.windowMs = options.windowMs;
  }
  private key(key: string) {
    return `rl:${this.prefix}:${key}`;
  }
  async increment(key: string): Promise<IncrementResponse> {
    const [totalHits, ttl] = (await this.redis.eval(
      INCREMENT,
      1,
      this.key(key),
      this.windowMs,
    )) as [number, number];
    return { totalHits: Number(totalHits), resetTime: new Date(Date.now() + Number(ttl)) };
  }
  async decrement(key: string) {
    await this.redis.decr(this.key(key));
  }
  async resetKey(key: string) {
    await this.redis.del(this.key(key));
  }
}
