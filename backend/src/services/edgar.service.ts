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
  const res = await fetch(`https://data.sec.gov/submissions/${cik}.json`);
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
  console.log("ex991Html先頭300文字:", ex991Html.slice(0, 300));
  return {
    ex991Html,
    ex991Url,
  };
};
