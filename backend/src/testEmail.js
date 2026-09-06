import { sendEmail } from "./emailService.js";
async function testEmail() {
    await sendEmail("your-test-email@example.com", "ReachInbox Test Email", "Hello! This is a test email from the ReachInbox scheduler.");
}
testEmail();
//# sourceMappingURL=testEmail.js.map