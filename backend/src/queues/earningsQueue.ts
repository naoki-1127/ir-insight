import { Queue } from "bullmq";
import { redis } from "../lib/redis.js";
import { CompanyId } from "../types/branded.js";

const connection = redis;
export type EarningsJobData = {
  companyId: CompanyId;
  cik: string;
  accessionNumber: string;
  ticker?: string;
};

export const earningsQueue = new Queue<EarningsJobData>("earnings", {
  connection,
});
