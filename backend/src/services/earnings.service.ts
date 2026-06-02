import { earningsQueue } from "../queues/earningsQueue.js";

export const enqueue8KJobs = async (cik: string) => {
  const res = await fetch(`https://data.sec.gov/submissions/${cik}.json`);
  if (!res.ok) throw new Error(`SEC API ${res.status}`);
  const data = await res.json();
  const recent = data.filings.recent;

  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const targets = [];
  for (let i = 0; i < recent.form.length; i++) {
    if (
      recent.form[i] === "8-K" &&
      recent.items[i]?.includes("2.02") &&
      new Date(recent.filingDate[i]) >= twoYearsAgo
    ) {
      targets.push({
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        primaryDocument: recent.primaryDocument[i],
      });
    }
  }

  for (const filing of targets) {
    await earningsQueue.add("process-8k", { cik, ...filing });
  }

  return { enqueued: targets.length };
};
