import IORedis from "ioredis";
import { config } from "./config.js";

const connection = new IORedis({
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: null,
});

const RATE_LIMIT_KEY = "email:hourly-rate";

export async function checkHourlyLimit(): Promise<boolean> {
  const currentCount = await connection.incr(RATE_LIMIT_KEY);

  if (currentCount === 1) {
    await connection.expire(RATE_LIMIT_KEY, 3600);
  }

  if (currentCount > config.hourlyLimit) {
    await connection.decr(RATE_LIMIT_KEY);
    return false;
  }

  return true;
}

export async function getRemainingTime(): Promise<number> {
  const ttl = await connection.ttl(RATE_LIMIT_KEY);

  if (ttl <= 0) {
    return 0;
  }

  return ttl * 1000;
}