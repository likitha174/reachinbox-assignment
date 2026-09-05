# ReachInbox Email Scheduler

A full-stack email scheduling application built for the ReachInbox hiring assignment.

## Tech Stack

### Frontend
- React
- TypeScript
- Vite
- Modern CSS

### Backend
- Node.js
- TypeScript
- Express.js
- Prisma ORM
- PostgreSQL
- BullMQ
- Redis
- Nodemailer
- Ethereal Email
- Multer
- CSV Parser
- Bull Board

### Infrastructure
- Docker
- Docker Compose

---

## Features

- Schedule individual emails for a future date and time
- Upload CSV files containing email addresses
- Detect and display the number of email addresses in a CSV
- Schedule multiple emails from CSV
- Configure delay between emails
- Configurable BullMQ worker concurrency
- Redis-based hourly email rate limiting
- PostgreSQL persistence
- Redis/BullMQ delayed job persistence
- Ethereal SMTP email delivery
- Email status tracking:
  - SCHEDULED
  - PROCESSING
  - SENT
  - FAILED
- BullMQ monitoring dashboard
- Restart persistence
- Error handling and failed job tracking

---

## Architecture

```text
React Frontend
      |
      | HTTP API
      v
Express.js Backend
      |
      +-------------------+
      |                   |
      v                   v
 PostgreSQL            BullMQ
      |                   |
      |                   v
      |                 Redis
      |                   |
      |                   v
      |                 Worker
      |                   |
      |                   v
      |              Ethereal SMTP
      |                   |
      +-------------------+
              |
              v
       Email Status Update