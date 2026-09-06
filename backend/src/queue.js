import { Queue } from "bullmq";
import IORedis from "ioredis";
const connection = new IORedis.default({
    host: "localhost",
    port: 6379,
    maxRetriesPerRequest: null,
});
export const emailQueue = new Queue("emailQueue", {
    connection,
});
//# sourceMappingURL=queue.js.map