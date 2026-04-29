import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type IRSummary = {
  company_name: string | null;
  fiscal_period: string | null;
  revenue: number | null;
};

type IRData = {
  revenue: number;
  previous_revenue: number;
  net_income_non_gaap: number;
  net_income_gaap: number;
  previous_net_income_non_gaap: number;
  previous_net_income_gaap: number;
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
- symbol（ティッカーシンボル）
- fiscal_period（例: FY2026 Q2）
- revenue（売上）
- previous_revenue（前期同会計期売上）
- net_income_non_gaap（非GAAP営業利益）
- net_income_gaap（GAAP営業利益）
- previous_net_income_non_gaap（前期同会計期の非GAAP営業利益）
- previous_net_income_gaap（前期同会計期のGAAP営業利益）

例:
{
  "title": "第4Qの決算報告"
  "company_name": "Palo Alto Networks",
  "symbol": "PANW",
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

  const content = res.choices[0].message.content ?? "";

  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("JSON parse error:", content);
    throw new Error("AIレスポンスのパースに失敗");
  }
};

export const compareWithAI = async (prev: IRData, curr: IRData) => {
  const prevMetrics = calcMetrics(prev);
  const currMetrics = calcMetrics(curr);

  const prompt = `
  以下の2つの四半期データを比較し、投資家向けに簡潔に分析してください。
  良い点と懸念点を含めてください。
  
  前四半期:
  ${JSON.stringify(prevMetrics)}
  
  今回:
  ${JSON.stringify(currMetrics)}
  
  出力は日本語の文章のみ。
  `;

  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
  });

  return res.choices[0].message.content;
};

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
