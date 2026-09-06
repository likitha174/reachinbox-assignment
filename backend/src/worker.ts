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
import { sendSlackNotification } from "./slackService.js";

const connection = new IORedis.default({
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  "emailQueue",
  async (job) => {
    console.log("Processing email job:", job.id);

    const allowed = await checkHourlyLimit();

    if (!allowed) {
      const delay = await getRemainingTime();

      console.log(
        `Hourly limit reached. Rescheduling job ${job.id} in ${Math.ceil(
          delay / 1000
        )} seconds.`
      );

      // Send a real Slack notification
      await sendSlackNotification(
        `⚠️ Email hourly limit reached. Job ${job.id} has been rescheduled and will continue after the rate-limit window resets.`
      );

      await job.moveToDelayed(
        Date.now() + Math.max(delay, 1000),
        job.token
      );

      return;
    }

    try {
      const emailId = job.data.emailId;

      if (!emailId) {
        throw new Error("Email ID is missing from job data");
      }

      await prisma.email.update({
        where: {
          id: emailId,
        },
        data: {
          status: "PROCESSING",
          errorMessage: null,
        },
      });

      const {
        recipient,
        subject,
        body,
        senderId,
      } = job.data;

      await waitForMinimumDelay();

      if (senderId) {
        const sender = await prisma.sender.findUnique({
          where: {
            id: senderId,
          },
        });

        if (!sender) {
          throw new Error(`Sender ${senderId} not found`);
        }

        console.log(
          `Sending email using sender: ${sender.email}`
        );
      }

      await sendEmail(
        recipient,
        subject,
        body,
        senderId
          ? (
              await prisma.sender.findUnique({
                where: {
                  id: senderId,
                },
              })
            )?.email
          : undefined
      );

      await prisma.email.update({
        where: {
          id: emailId,
        },
        data: {
          status: "SENT",
          sentAt: new Date(),
        },
      });

      console.log(
        "Email successfully sent for job:",
        job.id
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error";

      const emailId = job.data.emailId;

      if (emailId) {
        await prisma.email.update({
          where: {
            id: emailId,
          },
          data: {
            status: "FAILED",
            errorMessage,
          },
        });
      }

      console.error(
        "Email failed for job:",
        job.id
      );

      console.error(
        "Error:",
        errorMessage
      );

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
  console.error(
    `Job ${job?.id} failed:`,
    error.message
  );
});

console.log("Email worker is running...");
console.log(
  `Worker concurrency: ${config.workerConcurrency}`
);
console.log(
  `Minimum delay: ${config.minDelayMs} ms`
);
console.log(
  `Hourly limit: ${config.hourlyLimit}`
);