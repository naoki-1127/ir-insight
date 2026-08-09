import api from "./axios";
import type { IRSummaryResult } from "../types/ir";
import type { CompanyId, DocumentId } from "../types/branded";

export async function fetchLatestDocument(
  companyId: CompanyId,
): Promise<DocumentId> {
  const res = await fetch(`/api/companies/${companyId}/latest-document-id`);
  if (!res.ok) throw new Error("最新Document IDの取得に失敗しました");
  const json: { documentId: DocumentId } = await res.json();
  return json.documentId;
}

export async function fetchIRSummaryText(
  companyId: string,
): Promise<IRSummaryResult> {
  const res = await api.get(`/ir/summary/${companyId}/text`);
  return res.data;
}
