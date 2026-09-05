import { Worker } from "bullmq";
import IORedis from "ioredis";
import { sendEmail } from "./emailService.js";
import { prisma } from "./prisma.js";
import { config } from "./config.js";
import { waitForMinimumDelay } from "./rateLimiter.js";
import {
  checkHourlyLimit,
  getRemainingTime,
} from "./hourlyRateLimiter.js";

const connection = new IORedis({
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  "emailQueue",
  async (job) => {
    console.log("Processing email job:", job.id);

    // Check hourly limit
    const allowed = await checkHourlyLimit();

    if (!allowed) {
      const delay = await getRemainingTime();

      console.log(
        `Hourly limit reached. Rescheduling job ${job.id} in ${Math.ceil(
          delay / 1000
        )} seconds.`
      );

      // Move the SAME job back to delayed state.
      // This keeps the same job ID and PostgreSQL relationship.
      await job.moveToDelayed(
        Date.now() + Math.max(delay, 1000),
        job.token
      );

      return;
    }

    try {
      // Mark email as PROCESSING
      await prisma.email.update({
        where: {
          jobId: job.id,
        },
        data: {
          status: "PROCESSING",
          errorMessage: null,
        },
      });

      const { recipient, subject, body } = job.data;

      // Respect minimum delay
      await waitForMinimumDelay();

      // Send the email
      await sendEmail(recipient, subject, body);

      // Mark email as SENT
      await prisma.email.update({
        where: {
          jobId: job.id,
        },
        data: {
          status: "SENT",
          sentAt: new Date(),
        },
      });

      console.log("Email successfully sent for job:", job.id);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Mark email as FAILED
      await prisma.email.update({
        where: {
          jobId: job.id,
        },
        data: {
          status: "FAILED",
          errorMessage,
        },
      });

      console.error("Email failed for job:", job.id);
      console.error("Error:", errorMessage);

      // Tell BullMQ that the job failed
      throw error;
    }
  },
  {
    connection,
    concurrency: config.workerConcurrency,
  }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, error) => {
  console.error(`Job ${job?.id} failed:`, error.message);
});

console.log("Email worker is running...");
console.log(`Worker concurrency: ${config.workerConcurrency}`);
console.log(`Minimum delay: ${config.minDelayMs} ms`);
console.log(`Hourly limit: ${config.hourlyLimit}`);