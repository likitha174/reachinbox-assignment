import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();
export async function sendEmail(recipient, subject, body, senderEmail) {
    const transporter = nodemailer.createTransport({
        host: process.env.ETHEREAL_HOST,
        port: Number(process.env.ETHEREAL_PORT),
        secure: false,
        auth: {
            user: process.env.ETHEREAL_USER,
            pass: process.env.ETHEREAL_PASS,
        },
    });
    const fromEmail = senderEmail || process.env.ETHEREAL_USER;
    const info = await transporter.sendMail({
        from: `"ReachInbox" <${fromEmail}>`,
        to: recipient,
        subject,
        text: body,
    });
    console.log("Email sent!");
    console.log("Sender:", fromEmail);
    console.log("Message ID:", info.messageId);
    console.log("Preview URL:", nodemailer.getTestMessageUrl(info));
    return info;
}
//# sourceMappingURL=emailService.js.map