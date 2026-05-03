// src/services/pdf/loadPdf.ts
import pdfjsLib from "../../utils/pdf";

export const loadPdf = async (url: string) => {
  const loadingTask = pdfjsLib.getDocument(url);
  const pdf = await loadingTask.promise;
  return pdf;
};
