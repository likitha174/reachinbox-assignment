import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis({
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: null,
});

const queue = new Queue("emailQueue", {
  connection,
});

async function clearQueue() {
  await queue.obliterate({ force: true });

  console.log("Queue cleared successfully");

  await queue.close();
  await connection.quit();
}

clearQueue();