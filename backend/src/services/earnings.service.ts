import { earningsQueue } from "../queues/earningsQueue.js";
import { prisma } from "../lib/prisma.js";

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

export const checkAllCompaniesForNew8K = async () => {
  try {
    const companies = await prisma.company.findMany({
      select: { id: true, ticker: true },
    });
    console.log(`[check-all] checking ${companies.length} companies`);

    let enqueued = 0;

    for (const company of companies) {
      try {
        const secRes = await fetch(
          `https://data.sec.gov/submissions/${company.id}.json`,
        );
        if (!secRes.ok) continue;
        const data = await secRes.json();
        const recent = data.filings.recent;

        // item 2.02 の8-Kを直近1件だけ取得
        let latestFiling = null;
        for (let i = 0; i < recent.form.length; i++) {
          if (recent.form[i] === "8-K" && recent.items[i]?.includes("2.02")) {
            latestFiling = {
              accessionNumber: recent.accessionNumber[i],
              filingDate: recent.filingDate[i],
              primaryDocument: recent.primaryDocument[i],
            };
            break; // 最初に見つかったもの（=直近）だけ使う
          }
        }

        if (!latestFiling) continue;

        // DBに既存かチェック
        const exists = await prisma.document.findFirst({
          where: { title: latestFiling.accessionNumber },
        });
        if (exists) {
          console.log(
            `[check-all] skip: ${company.ticker} ${latestFiling.accessionNumber}`,
          );
          continue;
        }

        // 新着をキューに積む
        await earningsQueue.add("process-8k", {
          cik: company.id,
          ticker: company.ticker,
          ...latestFiling,
        });

        enqueued++;
        console.log(
          `[check-all] enqueued: ${company.ticker} ${latestFiling.accessionNumber}`,
        );
      } catch (e: any) {
        console.error(`[check-all] error: ${company.ticker} ${e.message}`);
      }
    }
    return { checked: companies.length, enqueued };
  } catch (err) {}
};
