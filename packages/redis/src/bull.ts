// BullMQ wants a discrete host/port, not a URL. Shared so every queue-using service parses
// REDIS_URL the same way.
export function bullConnection(redisUrl: string): { host: string; port: number } {
  const url = new URL(redisUrl);
  return { host: url.hostname, port: Number(url.port || 6379) };
}
