import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { RedisStore } from 'rate-limit-redis';
import type { RedisReply } from 'rate-limit-redis';
import { logError } from './logger';

const redisUrl = process.env.REDIS_URL?.trim();
export const sharedRedisEnabled = Boolean(redisUrl);

const rateLimitClient = redisUrl ? createClient({ url: redisUrl }) : undefined;
const socketPubClient = redisUrl ? createClient({ url: redisUrl }) : undefined;
const socketSubClient = socketPubClient?.duplicate();

for (const [event, client] of [
  ['rate_limit_redis_error', rateLimitClient],
  ['socket_redis_pub_error', socketPubClient],
  ['socket_redis_sub_error', socketSubClient],
] as const) {
  client?.on('error', (error) => {
    logError(event, error);
  });
}

const localMessageWindows = new Map<string, { startedAt: number; count: number }>();
const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [userId, window] of localMessageWindows) {
    if (window.startedAt < cutoff) localMessageWindows.delete(userId);
  }
}, 60_000);
cleanupTimer.unref();

export const createRateLimitStore = (prefix: string): RedisStore | undefined => {
  if (!rateLimitClient) return undefined;
  return new RedisStore({
    prefix: `hostelbazar:${prefix}:`,
    sendCommand: (...args) => rateLimitClient.sendCommand(args) as Promise<RedisReply>,
  });
};

export const connectSharedRedis = async (): Promise<void> => {
  if (!rateLimitClient || !socketPubClient || !socketSubClient) return;
  await Promise.all([rateLimitClient.connect(), socketPubClient.connect(), socketSubClient.connect()]);
};

export const socketRedisAdapter = sharedRedisEnabled && socketPubClient && socketSubClient
  ? createAdapter(socketPubClient, socketSubClient)
  : undefined;

export const consumeSocketMessageLimit = async (userId: string, limit: number): Promise<boolean> => {
  if (rateLimitClient) {
    const bucket = `hostelbazar:socket-messages:${userId}`;
    const count = await rateLimitClient.eval(
      "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return count;",
      { keys: [bucket], arguments: ['60000'] }
    );
    return Number(count) <= limit;
  }

  const now = Date.now();
  let window = localMessageWindows.get(userId);
  if (!window || now - window.startedAt >= 60_000) {
    window = { startedAt: now, count: 0 };
    localMessageWindows.set(userId, window);
  }
  window.count += 1;
  return window.count <= limit;
};

export const disconnectSharedRedis = async (): Promise<void> => {
  const clients = [rateLimitClient, socketPubClient, socketSubClient].filter(
    (client): client is ReturnType<typeof createClient> => client !== undefined
  );
  await Promise.all(clients.map(async (client) => {
    if (client.isOpen) await client.quit();
  }));
};
