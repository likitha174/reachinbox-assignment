import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { prisma } from "./prisma.js";
import { emailQueue } from "./queue.js";
import { parseRecipients } from "./csvParser.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
});

// -----------------------------
// BullMQ Dashboard
// -----------------------------

const serverAdapter = new ExpressAdapter();

serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());

// -----------------------------
// Health check
// -----------------------------

app.get("/", (req, res) => {
  res.json({
    message: "ReachInbox Email Scheduler API is running!",
  });
});

// -----------------------------
// Schedule a single email
// -----------------------------

app.post("/api/emails/schedule", async (req, res) => {
  try {
    const { recipient, subject, body, scheduledTime } = req.body;

    if (!recipient || !subject || !body || !scheduledTime) {
      return res.status(400).json({
        error:
          "recipient, subject, body and scheduledTime are required",
      });
    }

    const scheduledDate = new Date(scheduledTime);

    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({
        error: "Invalid scheduledTime",
      });
    }

    if (scheduledDate <= new Date()) {
      return res.status(400).json({
        error: "scheduledTime must be in the future",
      });
    }

    const email = await prisma.email.create({
      data: {
        recipient,
        subject,
        body,
        scheduledTime: scheduledDate,
        status: "SCHEDULED",
      },
    });

    const delay = scheduledDate.getTime() - Date.now();

    await emailQueue.add(
      "send-email",
      {
        emailId: email.id,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
      },
      {
        jobId: email.id,
        delay,
      }
    );

    await prisma.email.update({
      where: {
        id: email.id,
      },
      data: {
        jobId: email.id,
      },
    });

    res.status(201).json({
      message: "Email scheduled successfully",
      email,
    });
  } catch (error) {
    console.error("Error scheduling email:", error);

    res.status(500).json({
      error: "Failed to schedule email",
    });
  }
});

// -----------------------------
// Upload CSV and schedule emails
// -----------------------------

app.post(
  "/api/emails/upload-csv",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "CSV file is required",
        });
      }

      const { subject, body, scheduledTime } = req.body;

      if (!subject || !body || !scheduledTime) {
        return res.status(400).json({
          error:
            "subject, body and scheduledTime are required",
        });
      }

      const scheduledDate = new Date(scheduledTime);

      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({
          error: "Invalid scheduledTime",
        });
      }

      if (scheduledDate <= new Date()) {
        return res.status(400).json({
          error: "scheduledTime must be in the future",
        });
      }

      const csvText = req.file.buffer.toString("utf-8");

      const recipients = parseRecipients(csvText);

      if (recipients.length === 0) {
        return res.status(400).json({
          error:
            "No recipients found. CSV must contain a recipient or email column.",
        });
      }

      const scheduledEmails = [];

      const delay = scheduledDate.getTime() - Date.now();

      for (const recipient of recipients) {
        const email = await prisma.email.create({
          data: {
            recipient: recipient.recipient,
            subject,
            body,
            scheduledTime: scheduledDate,
            status: "SCHEDULED",
          },
        });

        await emailQueue.add(
          "send-email",
          {
            emailId: email.id,
            recipient: email.recipient,
            subject: email.subject,
            body: email.body,
          },
          {
            jobId: email.id,
            delay,
          }
        );

        await prisma.email.update({
          where: {
            id: email.id,
          },
          data: {
            jobId: email.id,
          },
        });

        scheduledEmails.push(email.id);
      }

      res.status(201).json({
        message:
          "CSV uploaded and emails scheduled successfully",
        count: scheduledEmails.length,
        emailIds: scheduledEmails,
      });
    } catch (error) {
      console.error("Error uploading CSV:", error);

      res.status(500).json({
        error: "Failed to process CSV",
      });
    }
  }
);

// -----------------------------
// Get all emails
// -----------------------------

app.get("/api/emails", async (req, res) => {
  try {
    const emails = await prisma.email.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      emails,
    });
  } catch (error) {
    console.error("Error fetching emails:", error);

    res.status(500).json({
      error: "Failed to fetch emails",
    });
  }
});

// -----------------------------
// Start server
// -----------------------------

const PORT = process.env.PORT || 5200;

console.log("Starting server...");

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(
    `BullMQ dashboard: http://localhost:${PORT}/admin/queues`
  );
});