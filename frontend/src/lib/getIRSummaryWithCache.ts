// lib/getIRSummaryWithCache.ts
import { readCache, writeCache } from "./irSummaryCache";
import { fetchLatestDocument, fetchIRSummaryText } from "./api";
import type { IRSummaryText } from "../types/ir";
import type { CompanyId, DocumentId } from "../types/branded";

export async function getIRSummaryWithCache(companyId: CompanyId): Promise<{
  data: IRSummaryText | null;
  error: string | null;
  fromCache: boolean;
}> {
  const cached = readCache(companyId);

  let latestDocumentId: DocumentId;
  try {
    latestDocumentId = await fetchLatestDocument(companyId);
  } catch (e) {
    if (cached) {
      return { data: cached.data, error: null, fromCache: true };
    }
    return {
      data: null,
      error: "最新情報の確認に失敗しました",
      fromCache: false,
    };
  }

  if (cached && cached.documentId === latestDocumentId) {
    return { data: cached.data, error: null, fromCache: true };
  }

  const result = await fetchIRSummaryText(companyId);

  if (!result.success) {
    if (cached) {
      return { data: cached.data, error: result.error, fromCache: true };
    }
    return { data: null, error: result.error, fromCache: false };
  }

  writeCache(companyId, latestDocumentId, result.data);
  return { data: result.data, error: null, fromCache: false };
}
