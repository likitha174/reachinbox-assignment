import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import axios from "axios";
import crypto from "crypto";

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

import { prisma } from "./prisma.js";
import { emailQueue } from "./queue.js";
import { parseRecipients } from "./csvParser.js";

// Load backend/.env explicitly
dotenv.config({ path: ".env" });

console.log("Slack environment check:", {
  clientId: !!process.env.SLACK_CLIENT_ID,
  clientSecret: !!process.env.SLACK_CLIENT_SECRET,
  redirectUri: !!process.env.SLACK_REDIRECT_URI,
  channelId: !!process.env.SLACK_CHANNEL_ID,
});

console.log("Google environment check:", {
  clientId: !!process.env.GOOGLE_CLIENT_ID,
  clientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: !!process.env.GOOGLE_REDIRECT_URI,
  sessionSecret: !!process.env.GOOGLE_SESSION_SECRET,
});

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

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

app.use(
  "/admin/queues",
  serverAdapter.getRouter()
);

// -----------------------------
// Health check
// -----------------------------

app.get("/", (_req, res) => {
  res.json({
    message:
      "ReachInbox Email Scheduler API is running!",
  });
});

// -----------------------------
// Schedule a single email
// -----------------------------

app.post(
  "/api/emails/schedule",
  async (req, res) => {
    try {
      const {
        recipient,
        subject,
        body,
        scheduledTime,
        senderId,
      } = req.body;

      if (
        !recipient ||
        !subject ||
        !body ||
        !scheduledTime
      ) {
        return res.status(400).json({
          error:
            "recipient, subject, body and scheduledTime are required",
        });
      }

      const scheduledDate =
        new Date(scheduledTime);

      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({
          error: "Invalid scheduledTime",
        });
      }

      if (scheduledDate <= new Date()) {
        return res.status(400).json({
          error:
            "scheduledTime must be in the future",
        });
      }

      if (senderId) {
        const sender =
          await prisma.sender.findUnique({
            where: {
              id: senderId,
            },
          });

        if (!sender) {
          return res.status(400).json({
            error: "Invalid senderId",
          });
        }
      }

      const email = await prisma.email.create({
        data: {
          recipient,
          subject,
          body,
          scheduledTime: scheduledDate,
          status: "SCHEDULED",
          senderId: senderId || null,
        },
      });

      const delay =
        scheduledDate.getTime() - Date.now();

      await emailQueue.add(
        "send-email",
        {
          emailId: email.id,
          recipient: email.recipient,
          subject: email.subject,
          body: email.body,
          senderId: email.senderId,
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
        message:
          "Email scheduled successfully",
        email,
      });
    } catch (error) {
      console.error(
        "Error scheduling email:",
        error
      );

      res.status(500).json({
        error:
          "Failed to schedule email",
      });
    }
  }
);

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

      const {
        subject,
        body,
        scheduledTime,
        senderId,
      } = req.body;

      if (
        !subject ||
        !body ||
        !scheduledTime
      ) {
        return res.status(400).json({
          error:
            "subject, body and scheduledTime are required",
        });
      }

      const scheduledDate =
        new Date(scheduledTime);

      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({
          error: "Invalid scheduledTime",
        });
      }

      if (scheduledDate <= new Date()) {
        return res.status(400).json({
          error:
            "scheduledTime must be in the future",
        });
      }

      if (senderId) {
        const sender =
          await prisma.sender.findUnique({
            where: {
              id: senderId,
            },
          });

        if (!sender) {
          return res.status(400).json({
            error: "Invalid senderId",
          });
        }
      }

      const csvText =
        req.file.buffer.toString("utf-8");

      const recipients =
        parseRecipients(csvText);

      if (recipients.length === 0) {
        return res.status(400).json({
          error:
            "No recipients found. CSV must contain a recipient or email column.",
        });
      }

      const scheduledEmails: string[] = [];

      const delay =
        scheduledDate.getTime() - Date.now();

      for (const recipient of recipients) {
        const email =
          await prisma.email.create({
            data: {
              recipient:
                recipient.recipient,
              subject,
              body,
              scheduledTime:
                scheduledDate,
              status: "SCHEDULED",
              senderId:
                senderId || null,
            },
          });

        await emailQueue.add(
          "send-email",
          {
            emailId: email.id,
            recipient:
              email.recipient,
            subject: email.subject,
            body: email.body,
            senderId:
              email.senderId,
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

        scheduledEmails.push(
          email.id
        );
      }

      res.status(201).json({
        message:
          "CSV uploaded and emails scheduled successfully",
        count:
          scheduledEmails.length,
        emailIds:
          scheduledEmails,
      });
    } catch (error) {
      console.error(
        "Error uploading CSV:",
        error
      );

      res.status(500).json({
        error:
          "Failed to process CSV",
      });
    }
  }
);

// -----------------------------
// Sender management
// -----------------------------

app.post(
  "/api/senders",
  async (req, res) => {
    try {
      const {
        email,
        name,
      } = req.body;

      if (!email) {
        return res.status(400).json({
          error:
            "Sender email is required",
        });
      }

      const sender =
        await prisma.sender.create({
          data: {
            email,
            name: name || null,
          },
        });

      res.status(201).json({
        message:
          "Sender created successfully",
        sender,
      });
    } catch (error) {
      console.error(
        "Error creating sender:",
        error
      );

      res.status(500).json({
        error:
          "Failed to create sender",
      });
    }
  }
);

app.get(
  "/api/senders",
  async (_req, res) => {
    try {
      const senders =
        await prisma.sender.findMany({
          orderBy: {
            createdAt: "desc",
          },
        });

      res.json({
        senders,
      });
    } catch (error) {
      console.error(
        "Error fetching senders:",
        error
      );

      res.status(500).json({
        error:
          "Failed to fetch senders",
      });
    }
  }
);

// -----------------------------
// Get all emails
// -----------------------------

app.get(
  "/api/emails",
  async (_req, res) => {
    try {
      const emails =
        await prisma.email.findMany({
          include: {
            sender: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

      res.json({
        emails,
      });
    } catch (error) {
      console.error(
        "Error fetching emails:",
        error
      );

      res.status(500).json({
        error:
          "Failed to fetch emails",
      });
    }
  }
);

// -----------------------------
// Slack OAuth
// -----------------------------

app.get(
  "/api/slack/connect",
  (_req, res) => {
    const clientId =
      process.env.SLACK_CLIENT_ID;

    const redirectUri =
      process.env.SLACK_REDIRECT_URI;

    if (
      !clientId ||
      !redirectUri
    ) {
      return res.status(500).json({
        error:
          "Slack OAuth environment variables are missing",
      });
    }

    const params =
      new URLSearchParams({
        client_id: clientId,
        scope: "chat:write",
        redirect_uri:
          redirectUri,
      });

    const slackUrl =
      `https://slack.com/oauth/v2/authorize?${params.toString()}`;

    res.redirect(slackUrl);
  }
);

app.get(
  "/api/slack/callback",
  async (req, res) => {
    try {
      const code =
        req.query.code;

      if (
        !code ||
        typeof code !== "string"
      ) {
        return res
          .status(400)
          .send(
            "Slack authorization code is missing."
          );
      }

      const clientId =
        process.env.SLACK_CLIENT_ID;

      const clientSecret =
        process.env.SLACK_CLIENT_SECRET;

      const redirectUri =
        process.env.SLACK_REDIRECT_URI;

      if (
        !clientId ||
        !clientSecret ||
        !redirectUri
      ) {
        return res
          .status(500)
          .send(
            "Slack OAuth configuration is missing."
          );
      }

      const response =
        await axios.post(
          "https://slack.com/api/oauth.v2.access",
          new URLSearchParams({
            client_id: clientId,
            client_secret:
              clientSecret,
            code,
            redirect_uri:
              redirectUri,
          }).toString(),
          {
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded",
            },
          }
        );

      if (!response.data.ok) {
        console.error(
          "Slack OAuth error:",
          response.data
        );

        return res
          .status(400)
          .send(
            `Slack OAuth failed: ${
              response.data.error ||
              "Unknown error"
            }`
          );
      }

      const accessToken =
        response.data.access_token;

      const teamId =
        response.data.team?.id;

      const teamName =
        response.data.team?.name;

      if (!accessToken) {
        return res
          .status(400)
          .send(
            "Slack access token was not returned."
          );
      }

      await prisma.slackConnection.deleteMany();

      await prisma.slackConnection.create({
        data: {
          workspaceId:
            teamId || null,
          workspaceName:
            teamName || null,
          accessToken,
        },
      });

      console.log(
        `Slack connected to workspace: ${teamName}`
      );

      res.send(`
        <html>
          <head>
            <title>Slack Connected</title>
          </head>
          <body style="
            font-family: Arial, sans-serif;
            padding: 40px;
            text-align: center;
          ">
            <h2>
              Slack connected successfully! ✅
            </h2>

            <p>
              Workspace:
              <strong>
                ${teamName || "Unknown"}
              </strong>
            </p>

            <p>
              You can close this window and return to ReachInbox.
            </p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error(
        "Slack OAuth callback error:",
        error
      );

      res
        .status(500)
        .send(
          "Failed to connect Slack."
        );
    }
  }
);

// -----------------------------
// Slack connection status
// -----------------------------

app.get(
  "/api/slack/status",
  async (_req, res) => {
    try {
      const connection =
        await prisma.slackConnection.findFirst();

      res.json({
        connected:
          !!connection,
        workspaceName:
          connection?.workspaceName ||
          null,
        workspaceId:
          connection?.workspaceId ||
          null,
      });
    } catch (error) {
      console.error(
        "Slack status error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to get Slack status",
      });
    }
  }
);

// -----------------------------
// Slack disconnect
// -----------------------------

app.post(
  "/api/slack/disconnect",
  async (_req, res) => {
    try {
      await prisma.slackConnection.deleteMany();

      res.json({
        message:
          "Slack disconnected successfully",
      });
    } catch (error) {
      console.error(
        "Slack disconnect error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to disconnect Slack",
      });
    }
  }
);

// =====================================================
// Google OAuth
// =====================================================

// -----------------------------
// Session token helpers
// -----------------------------

function createSessionToken(
  userId: string
): string {
  const secret =
    process.env.GOOGLE_SESSION_SECRET ||
    "development-secret";

  const signature =
    crypto
      .createHmac(
        "sha256",
        secret
      )
      .update(userId)
      .digest("hex");

  return `${userId}.${signature}`;
}

function verifySessionToken(
  token: string
): string | null {
  try {
    const secret =
      process.env.GOOGLE_SESSION_SECRET ||
      "development-secret";

    const separatorIndex =
      token.lastIndexOf(".");

    if (separatorIndex === -1) {
      return null;
    }

    const userId =
      token.substring(
        0,
        separatorIndex
      );

    const signature =
      token.substring(
        separatorIndex + 1
      );

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          secret
        )
        .update(userId)
        .digest("hex");

    if (
      signature.length !==
      expectedSignature.length
    ) {
      return null;
    }

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(
          expectedSignature
        )
      )
    ) {
      return null;
    }

    return userId;
  } catch {
    return null;
  }
}

function parseCookies(
  cookieHeader?: string
): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(";")
    .reduce(
      (
        cookies,
        cookie
      ) => {
        const [
          key,
          ...valueParts
        ] =
          cookie
            .trim()
            .split("=");

        if (!key) {
          return cookies;
        }

        cookies[key] =
          decodeURIComponent(
            valueParts.join("=")
          );

        return cookies;
      },
      {} as Record<
        string,
        string
      >
    );
}

// -----------------------------
// Start Google OAuth
// -----------------------------

app.get(
  "/api/auth/google",
  (_req, res) => {
    const clientId =
      process.env.GOOGLE_CLIENT_ID;

    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI;

    if (
      !clientId ||
      !redirectUri
    ) {
      return res.status(500).json({
        error:
          "Google OAuth environment variables are missing",
      });
    }

    const params =
      new URLSearchParams({
        client_id: clientId,
        redirect_uri:
          redirectUri,
        response_type: "code",
        scope:
          "openid email profile",
        access_type: "offline",
        prompt:
          "select_account",
      });

    const googleUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    res.redirect(googleUrl);
  }
);

// -----------------------------
// Google OAuth callback
// -----------------------------

app.get(
  "/api/auth/google/callback",
  async (req, res) => {
    try {
      const code =
        req.query.code;

      if (
        !code ||
        typeof code !== "string"
      ) {
        return res
          .status(400)
          .send(
            "Google authorization code is missing."
          );
      }

      const clientId =
        process.env.GOOGLE_CLIENT_ID;

      const clientSecret =
        process.env.GOOGLE_CLIENT_SECRET;

      const redirectUri =
        process.env.GOOGLE_REDIRECT_URI;

      if (
        !clientId ||
        !clientSecret ||
        !redirectUri
      ) {
        return res
          .status(500)
          .send(
            "Google OAuth configuration is missing."
          );
      }

      // Exchange authorization code
      // for an access token.
      const tokenResponse =
        await axios.post(
          "https://oauth2.googleapis.com/token",
          new URLSearchParams({
            code,
            client_id: clientId,
            client_secret:
              clientSecret,
            redirect_uri:
              redirectUri,
            grant_type:
              "authorization_code",
          }).toString(),
          {
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded",
            },
          }
        );

      const accessToken =
        tokenResponse.data
          .access_token;

      if (!accessToken) {
        return res
          .status(400)
          .send(
            "Google access token was not returned."
          );
      }

      // Get Google profile.
      const userResponse =
        await axios.get(
          "https://www.googleapis.com/oauth2/v2/userinfo",
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
          }
        );

      const googleUser =
        userResponse.data;

      if (
        !googleUser.id ||
        !googleUser.email ||
        !googleUser.name
      ) {
        return res
          .status(400)
          .send(
            "Google user information is incomplete."
          );
      }

      // Create user if new,
      // otherwise update existing user.
      const user =
        await prisma.user.upsert({
          where: {
            googleId:
              googleUser.id,
          },
          update: {
            email:
              googleUser.email,
            name:
              googleUser.name,
            avatarUrl:
              googleUser.picture ||
              null,
          },
          create: {
            googleId:
              googleUser.id,
            email:
              googleUser.email,
            name:
              googleUser.name,
            avatarUrl:
              googleUser.picture ||
              null,
          },
        });

      // Create signed session.
      const sessionToken =
        createSessionToken(
          user.id
        );

      res.setHeader(
        "Set-Cookie",
        `reachinbox_session=${encodeURIComponent(
          sessionToken
        )}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`
      );

      // Send user back to frontend.
      res.redirect(
        "http://localhost:5173"
      );
    } catch (error) {
      console.error(
        "Google OAuth callback error:",
        error
      );

      res
        .status(500)
        .send(
          "Failed to sign in with Google."
        );
    }
  }
);

// -----------------------------
// Get current logged-in user
// -----------------------------

app.get(
  "/api/auth/me",
  async (req, res) => {
    try {
      const cookies =
        parseCookies(
          req.headers.cookie
        );

      const sessionToken =
        cookies.reachinbox_session;

      if (!sessionToken) {
        return res.json({
          authenticated: false,
          user: null,
        });
      }

      const userId =
        verifySessionToken(
          sessionToken
        );

      if (!userId) {
        return res.json({
          authenticated: false,
          user: null,
        });
      }

      const user =
        await prisma.user.findUnique({
          where: {
            id: userId,
          },
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        });

      if (!user) {
        return res.json({
          authenticated: false,
          user: null,
        });
      }

      res.json({
        authenticated: true,
        user,
      });
    } catch (error) {
      console.error(
        "Google auth me error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to get current user",
      });
    }
  }
);

// -----------------------------
// Logout
// -----------------------------

app.post(
  "/api/auth/logout",
  (_req, res) => {
    res.setHeader(
      "Set-Cookie",
      "reachinbox_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
    );

    res.json({
      message:
        "Logged out successfully",
    });
  }
);

// -----------------------------
// Start server
// -----------------------------

const PORT =
  process.env.PORT || 5200;

console.log("Starting server...");

app.listen(
  PORT,
  () => {
    console.log(
      `Server running on http://localhost:${PORT}`
    );

    console.log(
      `BullMQ dashboard: http://localhost:${PORT}/admin/queues`
    );
  }
);