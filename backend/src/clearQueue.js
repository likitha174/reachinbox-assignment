import IORedis from "ioredis";
import { Queue } from "bullmq";
const connection = new IORedis.default({
    host: "localhost",
    port: 6379,
    maxRetriesPerRequest: null,
});
const queue = new Queue("emailQueue", {
    connection,
});
async function clearQueue() {
    await queue.obliterate({
        force: true,
    });
    console.log("Email queue cleared successfully.");
    await queue.close();
    await connection.quit();
}
clearQueue().catch((error) => {
    console.error("Failed to clear queue:", error);
    process.exit(1);
});
//# sourceMappingURL=clearQueue.js.map