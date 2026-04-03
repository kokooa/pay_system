import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  /** 멱등성 키 설정 (중복 결제 방지) */
  async setIdempotencyKey(
    key: string,
    value: string,
    ttlSeconds = 86400,
  ): Promise<boolean> {
    const result = await this.redis.set(
      `idempotency:${key}`,
      value,
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }

  /** 멱등성 키 조회 */
  async getIdempotencyKey(key: string): Promise<string | null> {
    return this.redis.get(`idempotency:${key}`);
  }

  /** 분산락 획득 */
  async acquireLock(
    key: string,
    ttlMs = 5000,
  ): Promise<{ acquired: boolean; release: () => Promise<void> }> {
    const lockKey = `lock:${key}`;
    const lockValue = `${Date.now()}-${Math.random()}`;

    const acquired = await this.redis.set(
      lockKey,
      lockValue,
      'PX',
      ttlMs,
      'NX',
    );

    return {
      acquired: acquired === 'OK',
      release: async () => {
        // Lua 스크립트로 원자적 삭제 (본인이 설정한 락만 해제)
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await this.redis.eval(script, 1, lockKey, lockValue);
      },
    };
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
