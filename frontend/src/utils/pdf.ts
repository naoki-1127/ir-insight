// pdf.ts
import * as pdfjsLib from "pdfjs-dist";

// ★ Vite / ESMではworkerを明示指定する
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export default pdfjsLib;
