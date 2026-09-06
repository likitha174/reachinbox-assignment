import { config } from "./config.js";
let lastSendTime = 0;
export async function waitForMinimumDelay() {
    const now = Date.now();
    const timeSinceLastSend = now - lastSendTime;
    const remainingDelay = config.minDelayMs - timeSinceLastSend;
    if (remainingDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingDelay));
    }
    lastSendTime = Date.now();
}
//# sourceMappingURL=rateLimiter.js.map