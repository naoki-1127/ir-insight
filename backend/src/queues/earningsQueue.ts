import { Queue } from "bullmq";
import { redis } from "../lib/redis.js";

const connection = redis;
type CompanyId = { companyId: string };
export type EarningsJobData = {
  companyId: CompanyId;
  cik: string;
  accessionNumber: string;
};

export const earningsQueue = new Queue<EarningsJobData>("earnings", {
  connection,
});
