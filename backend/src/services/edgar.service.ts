import * as cheerio from "cheerio";
import { summarizeIRText } from "./ai.service.js";

export const get8K = async (cik: string) => {
  console.log(cik);
  const res = await fetch(`https://data.sec.gov/submissions/${cik}.json`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SEC API ${res.status}: ${body.slice(0, 200)}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    const body = await res.text();
    throw new Error(`Expected JSON, got: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  console.log("データ");

  const recent = data.filings.recent;
  const eightKAccessions = [];

  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === "8-K" && recent.items[i]?.includes("2.02")) {
      eightKAccessions.push({
        accessionNumber: recent.accessionNumber[i], // "0001045810-25-000012" 形式
        filingDate: recent.filingDate[i],
        primaryDocument: recent.primaryDocument[i],
      });
    }
  }
  //console.log(eightKAccessions);
  return eightKAccessions;
};

export const get8KPressReleaseHtml2 = async (cik: string) => {
  const cikNumeric = cik.replace(/^CIK0*/, "");
  // Step1: 8-K (item 2.02) のaccessionNumberを取得
  const res = await fetch(`https://data.sec.gov/submissions/${cik}.json`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SEC API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const recent = data.filings.recent;

  const eightKList = [];
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === "8-K" && recent.items[i]?.includes("2.02")) {
      eightKList.push({
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        primaryDocument: recent.primaryDocument[i],
      });
    }
  }

  if (eightKList.length === 0) {
    throw new Error("8-K (item 2.02) が見つかりませんでした");
  }

  // Step2: primaryDocumentのHTMLを取得
  const latest = eightKList[0];
  const accNo = latest.accessionNumber.replace(/-/g, "");
  //const primaryUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accNo}/${latest.primaryDocument}`;
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accNo}/${latest.accessionNumber}-index.htm`;
  //console.log("primaryUrl:", primaryUrl);
  console.log("indexUrl:", indexUrl);

  const primaryRes = await fetch(indexUrl);
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
  const ex991Html = await ex991Res.text();
  const $ex = cheerio.load(ex991Html);
  const text = $ex("body").text().replace(/\s+/g, " ").trim();
  const summary = await summarizeIRText(text);

  return {
    filingDate: latest.filingDate,
    accessionNumber: latest.accessionNumber,
    ex991Url,
    summary,
    ex991Html,
  };
};

export const get8KPressReleaseHtml = async (
  cik: string,
  accessionNumber: string,
  primaryDocument: string,
) => {
  const cikNumeric = cik.replace(/^CIK0*/, "");
  // Step1: 8-K (item 2.02) のaccessionNumberを取得
  const res = await fetch(`https://data.sec.gov/submissions/${cik}.json`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SEC API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const recent = data.filings.recent;

  const eightKList = [];
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === "8-K" && recent.items[i]?.includes("2.02")) {
      eightKList.push({
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        primaryDocument: recent.primaryDocument[i],
      });
    }
  }

  if (eightKList.length === 0) {
    throw new Error("8-K (item 2.02) が見つかりませんでした");
  }

  // Step2: primaryDocumentのHTMLを取得
  const latest = eightKList[0];
  const accNo2 = accessionNumber.replace(/-/g, "");
  const accNo = latest.accessionNumber.replace(/-/g, "");
  //const primaryUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accNo}/${latest.primaryDocument}`;
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accNo}/${latest.accessionNumber}-index.htm`;
  const indexUrl2 = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accNo2}/${accessionNumber}-index.htm`;
  //console.log("primaryUrl:", primaryUrl);
  console.log("indexUrl:", indexUrl);
  console.log("indexUrl2:", indexUrl2);

  const primaryRes = await fetch(indexUrl2);
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
  const ex991Url = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accNo2}/${ex991Filename}`;
  console.log("ex991Url:", ex991Url);

  const ex991Res = await fetch(ex991Url);
  if (!ex991Res.ok) {
    throw new Error(`EX-99.1取得失敗: ${ex991Res.status}`);
  }
  const ex991Html = await ex991Res.text();

  return {
    ex991Html,
    ex991Url,
  };
};
