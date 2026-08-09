// stores/irSummary.ts
import { defineStore } from "pinia";
import { readCache, writeCache } from "@/lib/irSummaryCache";
import { fetchLatestDocumentId, fetchIRSummary } from "@/api/irSummary";
import type { IRSummary } from "@/types/ir";

type CompanyState = {
  summary: IRSummary | null;
  loading: boolean;
  error: string | null;
  fromCache: boolean;
};

function createEmptyState(): CompanyState {
  return { summary: null, loading: false, error: null, fromCache: false };
}

export const useIRSummaryStore = defineStore("irSummary", {
  state: () => ({
    byCompanyId: {} as Record<number, CompanyState>,
  }),

  getters: {
    // companyIdを指定して個別の状態を取り出すgetter
    getState: (state) => {
      return (companyId: number): CompanyState => {
        return state.byCompanyId[companyId] ?? createEmptyState();
      };
    },
  },

  actions: {
    async load(companyId: number, options?: { force?: boolean }) {
      // stateがまだなければ初期化
      if (!this.byCompanyId[companyId]) {
        this.byCompanyId[companyId] = createEmptyState();
      }
      const target = this.byCompanyId[companyId];

      target.loading = true;
      target.error = null;

      const cached = readCache(companyId);

      // まずlocalStorageのキャッシュを即座に反映(表示のちらつき防止)
      if (cached && !options?.force) {
        target.summary = cached.data;
        target.fromCache = true;
      }

      let latestDocumentId: number;
      try {
        latestDocumentId = await fetchLatestDocumentId(companyId);
      } catch (e) {
        target.loading = false;
        // 最新ID確認に失敗しても、キャッシュがあればそれを表示したまま継続
        if (!cached) {
          target.error = "最新情報の確認に失敗しました";
        }
        return;
      }

      // キャッシュのdocumentIdと一致していれば、これ以上何もしない(GPT処理を叩かない)
      if (cached && cached.documentId === latestDocumentId && !options?.force) {
        target.loading = false;
        return;
      }

      // 新しいDocumentが出ている、またはキャッシュがない → フル取得
      const result = await fetchIRSummary(companyId);

      if (!result.success) {
        target.error = result.error;
        // 失敗時、古いキャッシュがあればそのまま表示を維持(何も上書きしない)
        target.loading = false;
        return;
      }

      target.summary = result.data;
      target.fromCache = false;
      target.loading = false;

      writeCache(companyId, latestDocumentId, result.data);
    },

    clear(companyId: number) {
      delete this.byCompanyId[companyId];
    },
  },
});
