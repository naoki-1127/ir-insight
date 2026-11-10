import { earningsQueue } from "../queues/earningsQueue.js";
import { prisma } from "../lib/prisma.js";
import { get8k } from "./edgar.service.js";
import { checkLatestFilings } from "./edgarChecker.client.js";
import { asCompanyId, CompanyId } from "../types/branded.js";

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
//EDGARへの問い合わせ(IOバウンドな部分)はedgar-checker(Go)側で並行実行させ、
//ここではDB存在チェックとキュー投入だけを行う
export const checkAllCompaniesForNew8K = async (): Promise<checkNew8k> => {
  try {
    // 論理削除済みの銘柄は新着チェックの対象から除外する
    const companies = await prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, ticker: true, cik: true },
    });
    console.log(`[check-all] checking: ${companies.length} companies`);
    if (companies.length === 0) {
      return { checked: 0, enqueued: 0 };
    }

    const results = await checkLatestFilings(
      companies.map((c) => ({
        companyId: c.id,
        cik: c.cik,
        ticker: c.ticker,
      })),
    );

    let enqueued = 0;
    for (const result of results) {
      if (result.error) {
        console.error(
          `[check-all] fetch error: ${result.ticker} ${result.error}`,
        );
        continue;
      }
      const latestFiling = result.latestFiling;
      if (!latestFiling) continue;

      try {
        // DBに既存かチェック
        const exists = await prisma.document.findFirst({
          where: { title: latestFiling.accessionNumber },
        });
        if (exists) {
          console.log(
            `[check-all] skip: ${result.ticker} ${latestFiling.accessionNumber}`,
          );
          continue;
        }

        // 新着をキューに積む
        await earningsQueue.add("process-8k", {
          companyId: asCompanyId(result.companyId),
          cik: result.cik,
          ticker: result.ticker,
          ...latestFiling,
        });

        enqueued++;
        console.log(
          `[check-all] enqueued: ${result.ticker} ${latestFiling.accessionNumber}`,
        );
      } catch (err: any) {
        console.error(`[check-all] error: ${result.ticker} ${err.message}`);
      }
    }
    return { checked: companies.length, enqueued };
  } catch (err: any) {
    console.error(`[check-all] fatal error: ${err.message}`);
    throw err;
  }
};
