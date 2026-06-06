import { Queue } from "bullmq";
import { redis } from "../lib/redis.js";

const connection = redis;

export const earningsQueue = new Queue("earnings", { connection });
