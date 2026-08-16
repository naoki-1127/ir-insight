import { earningsQueue } from "../queues/earningsQueue.js";
import { prisma } from "../lib/prisma.js";
import { getLatest8k, get8k } from "./edgar.service.js";
import { CompanyId } from "../types/branded.js";

export type checkNew8k = {
  checked: number;
  enqueued: number;
};

//企業が登録された時に走る処理
export const enqueue8KJobs = async (companyId: CompanyId, cik: string) => {
  const targets = await get8k(cik);
  if (targets) {
    for (const filing of targets) {
      await earningsQueue.add("process-8k", { companyId, cik, ...filing });
    }
    return { enqueued: targets.length };
  }
};

//batchから呼ばれる関数
export const checkAllCompaniesForNew8K = async (): Promise<checkNew8k> => {
  try {
    const companies = await prisma.company.findMany({
      select: { id: true, ticker: true, cik: true },
    });
    console.log(`[check-all] checking: ${companies.length} companies`);
    let enqueued = 0;
    for (const company of companies) {
      try {
        console.log(`[check-all] start: ${company.ticker}`);
        // item 2.02 の8-Kを直近1件だけ取得
        let latestFiling = await getLatest8k(company.cik);
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
          companyId: company.id,
          cik: company.cik,
          ticker: company.ticker,
          ...latestFiling,
        });

        enqueued++;
        console.log(
          `[check-all] enqueued: ${company.ticker} ${latestFiling.accessionNumber}`,
        );
      } catch (err: any) {
        console.error(`[check-all] error: ${company.ticker} ${e.message}`);
      }
    }
    return { checked: companies.length, enqueued };
  } catch (err: any) {
    console.error(`[check-all] fatal error: ${err.message}`);
    throw err;
  }
};
