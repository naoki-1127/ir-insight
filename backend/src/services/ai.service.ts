import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type IRSummary = {
  title: string;
  company_name: string;
  ticker: string;
  fiscal_period: string;
  revenue: number | null;
  previous_revenue: number | null;
  net_income_non_gaap: number | null;
  net_income_gaap: number | null;
  previous_net_income_non_gaap: number | null;
  previous_net_income_gaap: number | null;
};

type IRSummaryText = {
  driver: string | null;
  risks: string[];
  summaries: {
    text: string;
    sentiment: "positive" | "negative" | "neutral";
  }[];
};

type IRData = {
  revenue: number;
  previous_revenue: number;
  net_income_non_gaap: number;
  net_income_gaap: number;
  previous_net_income_non_gaap: number;
  previous_net_income_gaap: number;
};

// 成功/失敗を型で区別する
export type IRSummaryResult =
  | { success: true; data: IRSummaryText }
  | { success: false; error: string };

function isIRSummaryText(value: unknown): value is IRSummaryText {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  if (v.driver !== null && typeof v.driver !== "string") return false;
  if (!Array.isArray(v.risks) || !v.risks.every((r) => typeof r === "string"))
    return false;
  if (!Array.isArray(v.summaries)) return false;

  return v.summaries.every(
    (s) =>
      typeof s === "object" &&
      s !== null &&
      typeof (s as any).text === "string" &&
      ["positive", "negative", "neutral"].includes((s as any).sentiment),
  );
}

const calcMetrics = (data: IRData) => {
  const revenue_yoy =
    (data.revenue - data.previous_revenue) / data.previous_revenue;
  const net_income_yoy =
    (data.net_income_non_gaap - data.previous_net_income_non_gaap) /
    data.previous_net_income_non_gaap;
  const margin = data.net_income_non_gaap / data.revenue;
  const gap = data.net_income_non_gaap - data.net_income_gaap;
  const gap_ratio = gap / data.net_income_non_gaap;
  return {
    revenue_yoy,
    net_income_yoy,
    margin,
    gap_ratio,
  };
};

export const summarizeIR = async (text: string): Promise<IRSummary> => {
  const prompt = `
以下のIRテキストから情報を抽出してください。
不明な場合は null を返してください。
必ずJSONのみを返してください。

重要ルール:
- IR文書のタイトルは翻訳して表示してください
- 数値はすべてドル（USD）の絶対値で返してください（省略不可、millionやbillionは禁止）
- 会計期は必ず四半期まで含める（例: FY2026 Q2）
- 「前期同会計期」は前年の同四半期（YoY）を指す
- 利益は「純利益」を取得する
- Non-GAAPが存在する場合はそれを優先し、GAAPも可能な限り取得する
- 数値が複数ある場合は最も代表的なものを1つ選ぶ

項目:
- title (IRタイトル)
- company_name（会社名）
- ticker（ティッカーシンボル）
- fiscal_period（例: FY2026 Q2）
- revenue（売上）
- previous_revenue（前期同会計期売上）
- net_income_non_gaap（非GAAP営業利益）
- net_income_gaap（GAAP営業利益）
- previous_net_income_non_gaap（前期同会計期の非GAAP営業利益）
- previous_net_income_gaap（前期同会計期のGAAP営業利益）

例:
{
  "title": "第4Qの決算報告",
  "company_name": "Palo Alto Networks",
  "ticker": "PANW",
  "fiscal_period": "FY2026 Q2",
  "revenue": 1200000000000,
  "previous_revenue": 1000000000000,
  "net_income_non_gaap": 300000000,
  "net_income_gaap": 150000000,
  "previous_net_income_non_gaap": 250000000,
  "previous_net_income_gaap": 120000000
}

テキスト:
"""
${text.slice(0, 8000)}
"""
`;
  const res = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });
  let content = res.choices[0].message.content ?? "";
  try {
    let jsonContent = JSON.parse(content);
    let metrics = calcMetrics(jsonContent);
    jsonContent = { ...jsonContent, ...metrics };
    return jsonContent;
  } catch (e) {
    console.error("JSON parse error:", content);
    throw new Error("AIレスポンスのパースに失敗");
  }
};

export const summarizeIRText = async (
  text: string,
): Promise<IRSummaryResult> => {
  const prompt = `
あなたはグロース株投資家向けに決算を要約するアナリストです。
以下のIRテキストから、投資判断に必要な要点のみを抽出してください。

# 出力ルール（厳守）
- 必ず有効なJSONのみを返す（説明・前置き・コードブロック禁止）
- 抽象的な表現は禁止（具体的な事業・要因を書く）
- 重複は禁止

# 出力フォーマット
{
  "driver": string | null,
  "risks": string[],
  "summaries": [
    {
      "text": string,
      "sentiment": "positive" | "negative" | "neutral"
    }
  ]
}

# 各項目の定義
- driver: 成長を牽引している主な要因（1つ）
- risks: 懸念点を最大5つまで列挙（重要度順）
- summaries: 最大3件の要約（それぞれ異なる観点）

# summariesのルール（重要）
- 最大3件
- 日本語で翻訳する
- 各要約は1文で簡潔に
- 各要約は異なる観点にする：
  1つ目：成長（売上・ガイダンス）
  2つ目：事業構造（セグメント）
  3つ目：リスクまたは変化
- 数値や具体的な事業名を含める
- 同じ内容の言い換えは禁止

# sentimentの判定基準（厳守）
- positive：
  - 売上成長が強い（例：+20%以上）
  - 成長が加速
  - ガイダンスが強気
  - 主力事業が好調
- negative：
  - 成長が減速
  - ガイダンスが弱気
  - 主力事業が悪化
  - 明確なリスク要因
- neutral：
  - 明確な強弱がない
  - ポジとネガが混在

# 重要ルール
- textとsentimentは必ず整合性を取る（矛盾禁止）
- 不明な場合はneutral
- すべてのキーと文字列値はダブルクォーテーション(")で囲むこと

# risksのルール
- 最大5件
- 具体的に書く
- 重複禁止
- なければ空配列 []

# 注意事項
- 決算の事実ベースで書く（推測禁止）
- CEOコメントやセグメント情報を優先
- EPSや関係ない指標に引っ張られない

# 入力テキスト
"""
${text.slice(0, 8000)}
"""
`;
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });
    const content = res.choices[0].message.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("JSON parse error:", content);
      return {
        success: false,
        error: "AIレスポンスの解析に失敗しました。もう一度お試しください。",
      };
    }
    if (!isIRSummaryText(parsed)) {
      console.error("Unexpected shape:", parsed);
      return {
        success: false,
        error: "AIレスポンスの形式が想定と異なります。",
      };
    }
    return { success: true, data: parsed };
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      if (err.status === 429) {
        console.error("レート制限またはクレジット不足:", err.message);
        // ユーザーへの通知やリトライ処理をここに
        return {
          success: false,
          error: "レート制限またはクレジット不足です。",
        };
      } else {
        console.error(`APIエラー (status: ${err.status}):`, err.message);
        return {
          success: false,
          error:
            "リクエストが混み合っています。しばらく待ってから再度お試しください。",
        };
      }
    } else {
      console.error("予期しないエラー:", err);
      return {
        success: false,
        error: "予期しないエラーが発生しました。",
      };
    }
  }
};
