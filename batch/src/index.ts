import cron from "node-cron";
import "dotenv/config";

const schedule = process.env.CRON_SCHEDULE ?? "0 6 * * *";
const backendUrl = process.env.BACKEND_URL ?? "http://backend:3000";

console.log(`[batch] starting cron: ${schedule}`);

cron.schedule(schedule, async () => {
  console.log(`[batch] started at ${new Date().toISOString()}`);
  try {
    const res = await fetch(`${backendUrl}/api/companies/check-all`, {
      method: "POST",
      headers: {
        "x-batch-secret": process.env.BATCH_SECRET ?? "",
      },
    });
    const data = await res.json();
    console.log(`[batch] done:`, data);
  } catch (e: any) {
    console.error(`[batch] error: ${e.message}`);
  }
});
