import axios from "axios";
import { prisma } from "./prisma.js";
export async function sendSlackNotification(message) {
    const connection = await prisma.slackConnection.findFirst();
    if (!connection) {
        console.log("Slack is not connected. Skipping notification.");
        return;
    }
    const channelId = process.env.SLACK_CHANNEL_ID;
    if (!channelId) {
        console.log("SLACK_CHANNEL_ID is not configured. Skipping notification.");
        return;
    }
    try {
        const response = await axios.post("https://slack.com/api/chat.postMessage", {
            channel: channelId,
            text: message,
        }, {
            headers: {
                Authorization: `Bearer ${connection.accessToken}`,
                "Content-Type": "application/json",
            },
        });
        if (!response.data.ok) {
            throw new Error(response.data.error || "Slack notification failed");
        }
        console.log("Slack notification sent successfully.");
    }
    catch (error) {
        console.error("Slack notification error:", error);
    }
}
//# sourceMappingURL=slackService.js.map