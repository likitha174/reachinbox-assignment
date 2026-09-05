import { emailQueue } from "./queue.js";
import { prisma } from "./prisma.js";

async function testQueue() {
  const email = await prisma.email.create({
    data: {
      recipient: "test@example.com",
      subject: "ReachInbox Test Email",
      body: "Hello! This email was sent through the ReachInbox worker.",
      scheduledTime: new Date(),
      status: "SCHEDULED",
    },
  });

  // Use the database ID as the BullMQ job ID
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
    }
  );

  // Save the BullMQ job ID in PostgreSQL
  await prisma.email.update({
    where: {
      id: email.id,
    },
    data: {
      jobId: email.id,
    },
  });

  console.log("Email created in database:", email.id);
  console.log("Job ID saved:", email.id);
  console.log("Test job added to queue");

  await emailQueue.close();
  await prisma.$disconnect();
}

testQueue();