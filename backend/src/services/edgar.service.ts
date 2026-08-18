import * as cheerio from "cheerio";

export const get8KPressReleaseHtml = async (
  cik: string,
  accessionNumber: string,
) => {
  const SEC_HEADERS = {
    "User-Agent": "YourCompanyName contact@yourcompany.com",
  };
  const cikNumeric = cik.replace(/^CIK0*/, "");
  // Step1: 8-K (item 2.02) のaccessionNumberを取得
  const res = await submissionsList(cik);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SEC API ${res.status}: ${body.slice(0, 200)}`);
  }
  const accNo = accessionNumber.replace(/-/g, "");
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accNo}/${accessionNumber}-index.htm`;
  console.log("indexUrl:", indexUrl);
  const primaryRes = await fetch(indexUrl, { headers: SEC_HEADERS });
  if (!primaryRes.ok) {
    throw new Error(`primaryDocument取得失敗: ${primaryRes.status}`);
  }
  const indexHtml = await primaryRes.text(); // ここでbodyを消費
  // Step3: cheerioでEX-99.1リンクを抽出
  const $ = cheerio.load(indexHtml);
  let ex991Filename: string | undefined;
  $("table tr").each((_, row) => {
    const cells = $(row).find("td");
    const typeCell = cells.eq(3).text().trim(); // Type列
    if (typeCell === "EX-99.1") {
      ex991Filename = cells.eq(2).find("a").attr("href")?.split("/").pop();
    }
  });
  console.log("ex991Filename:", ex991Filename);
  if (!ex991Filename) {
    throw new Error("EX-99.1が見つかりませんでした");
  }

  // Step4: 絶対URLに変換してEX-99.1のHTMLを取得
  const ex991Url = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accNo}/${ex991Filename}`;
  console.log("ex991Url:", ex991Url);

  const ex991Res = await fetch(ex991Url);
  if (!ex991Res.ok) {
    throw new Error(`EX-99.1取得失敗: ${ex991Res.status}`);
  }
  const rawText = await ex991Res.text();
  const htmlStartIndex = rawText.search(/<html/i);
  const stripped =
    htmlStartIndex !== -1 ? rawText.slice(htmlStartIndex) : rawText;
  const ex991Html = stripped.replace(/<\/TEXT>\s*<\/DOCUMENT>\s*$/i, "").trim();
  return {
    ex991Html,
    ex991Url,
  };
};

const submissionsList = async (cik: string) => {
  const res = await fetch(`https://data.sec.gov/submissions/${cik}.json`);
  return res;
};

export const get8k = async (cik: string) => {
  const res = await submissionsList(cik);
  if (!res.ok) throw new Error(`SEC API ${res.status}`);
  const data = await res.json();
  const recent = data.filings.recent;
  //直近2年間の8K
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const targets = [];
  for (let i = 0; i < recent.form.length; i++) {
    if (
      recent.form[i] === "8-K" &&
      recent.items[i]?.includes("2.02") &&
      new Date(recent.filingDate[i]) >= twoYearsAgo
    ) {
      targets.push({
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        primaryDocument: recent.primaryDocument[i],
      });
    }
  }
  return targets;
};

/**
 * 指定したCIK（EDGAR企業識別番号）の企業について、
 * Item 2.02（決算発表）を含む最新の8-Kを取得する。
 *
 * SEC EDGARのSubmissions APIから提出書類一覧を取得し、
 * `form === "8-K"` かつ `items` に "2.02"（決算に関する結果の開示）を
 * 含む最初の（＝最新の）ものを返す。
 *
 * @param cik - SEC EDGARの企業識別番号（Central Index Key）。10桁ゼロ埋め文字列を想定
 * @returns 見つかった最新の8-Kのファイリング情報（accessionNumber, filingDate, primaryDocument）。
 *          該当する8-Kが1件も見つからない場合は `null`
 * @throws {Error} SEC APIのレスポンスが200系以外のステータスを返した場合
 *
 * @example
 * ```ts
 * const filing = await getLatest8k("0001579428"); // Axsome Therapeutics
 * if (filing) {
 *   console.log(filing.primaryDocument); // "axsm-ex99_1.htm"
 * }
 * ```
 */
export const getLatest8k = async (cik: string) => {
  const res = await submissionsList(cik);
  if (!res.ok) throw new Error(`SEC API ${res.status}`);
  const data = await res.json();
  const recent = data.filings.recent;
  let latestFiling = null;
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === "8-K" && recent.items[i]?.includes("2.02")) {
      latestFiling = {
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        primaryDocument: recent.primaryDocument[i],
      };
      break; // 最初に見つかったもの（=直近）だけ使う
    }
  }
  return latestFiling;
};
