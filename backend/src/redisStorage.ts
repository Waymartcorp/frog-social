import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

function stripQuotes(value: string): string {
  let v = value.trim();
  while (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    v = v.slice(1, -1).trim();
  }
  while (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function getRedis(): Redis | null {
  if (redis) return redis;
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL;
  const rawToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!rawUrl || !rawToken) return null;
  const url = stripQuotes(rawUrl);
  const token = stripQuotes(rawToken);
  redis = new Redis({ url, token });
  return redis;
}

export function isRedisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export async function redisGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const value = await client.get<T>(key);
    return value ?? null;
  } catch (err) {
    console.error(`[redisStorage] GET ${key} failed:`, err);
    return null;
  }
}

export async function redisSet<T>(key: string, value: T): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    await client.set(key, value);
    return true;
  } catch (err) {
    console.error(`[redisStorage] SET ${key} failed:`, err);
    return false;
  }
}

export async function redisDel(key: string): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    await client.del(key);
    return true;
  } catch (err) {
    console.error(`[redisStorage] DEL ${key} failed:`, err);
    return false;
  }
}
