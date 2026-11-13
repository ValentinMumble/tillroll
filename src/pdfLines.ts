import type {PdfLine} from './bpce';

/**
 * A PDF's text runs with their place on the page, read with pdf.js. It loads only now, the first time a PDF is
 * picked (about 0.5 MB over the network), so the page itself stays as light; the browser keeps it for the next time.
 * The PDF never leaves the device.
 */
export async function readPdfLines(file: File): Promise<PdfLine[]> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer())});
  const document = await task.promise;
  try {
    const lines: PdfLine[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const {height} = page.getViewport({scale: 1});
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        // pdf.js measures from the page's bottom, to the line's baseline: from the top, to the line's top.
        lines.push({
          page: number,
          top: Math.round(height - item.transform[5] - item.height),
          left: Math.round(item.transform[4]),
          text: item.str.trim(),
        });
      }
    }
    return lines;
  } finally {
    await task.destroy();
  }
}
