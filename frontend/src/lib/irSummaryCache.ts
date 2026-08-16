import type { CompanyId, DocumentId } from "../types/branded";
import type { CachedIRSummary, IRSummaryText } from "../types/ir";

const CACHE_KEY_PREFIX = "ir-summary:";
const CACHE_VERSION = "v1";

function getCacheKey(companyId: CompanyId): string {
  return `${CACHE_KEY_PREFIX}${CACHE_VERSION}:${companyId}`;
}

export function readCache(companyId: CompanyId): CachedIRSummary | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(getCacheKey(companyId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedIRSummary;

    if (parsed.companyId !== companyId) {
      console.warn("キャッシュのcompanyIdが不一致。破棄します。");
      return null;
    }

    return parsed;
  } catch (e) {
    console.warn("キャッシュの読み込みに失敗しました:", e);
    return null;
  }
}

export function writeCache(
  companyId: CompanyId,
  documentId: DocumentId,
  data: IRSummaryText,
): void {
  if (typeof window === "undefined") return;

  const payload: CachedIRSummary = {
    companyId,
    documentId,
    cachedAt: new Date().toISOString(),
    data,
  };

  try {
    localStorage.setItem(getCacheKey(companyId), JSON.stringify(payload));
  } catch (e) {
    console.warn("キャッシュの保存に失敗しました:", e);
  }
}
