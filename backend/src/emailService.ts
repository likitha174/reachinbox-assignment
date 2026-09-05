import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.ETHEREAL_HOST,
  port: Number(process.env.ETHEREAL_PORT),
  secure: false,
  auth: {
    user: process.env.ETHEREAL_USER,
    pass: process.env.ETHEREAL_PASS,
  },
});

export async function sendEmail(
  recipient: string,
  subject: string,
  body: string
) {
  const info = await transporter.sendMail({
    from: `"ReachInbox" <${process.env.ETHEREAL_USER}>`,
    to: recipient,
    subject,
    text: body,
  });

  console.log("Email sent!");
  console.log("Message ID:", info.messageId);
  console.log("Preview URL:", nodemailer.getTestMessageUrl(info));

  return info;
}