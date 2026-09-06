export const config = {
    workerConcurrency: Number(process.env.WORKER_CONCURRENCY || 5),
    minDelayMs: Number(process.env.MIN_DELAY_MS || 1000),
    hourlyLimit: Number(process.env.HOURLY_LIMIT || 100),
};
//# sourceMappingURL=config.js.map