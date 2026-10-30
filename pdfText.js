// Client-side PDF reading with pdfjs-dist.
// Used for CV text extraction and for reading the typography of a reference letter.

export const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_PAGES = 12;

let pdfjsPromise = null;

async function loadPdfjs() {
  if (typeof window === 'undefined') {
    throw new Error('PDF reading only runs in the browser.');
  }
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist')
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
        return pdfjs;
      })
      .catch((err) => {
        pdfjsPromise = null;
        throw err;
      });
  }
  return pdfjsPromise;
}

function isPdf(file) {
  return file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
}

/** Rebuilds readable text from positioned pdf.js text items. */
function itemsToText(items) {
  let out = '';
  let prev = null;

  for (const item of items) {
    if (!('str' in item)) continue;
    const [a, b, c, d, x, y] = item.transform;
    const size = Math.hypot(c, d) || Math.hypot(a, b) || item.height || 10;

    if (prev) {
      const lineSize = Math.max(size, prev.size);
      const sameLine = Math.abs(y - prev.y) < lineSize * 0.5;
      if (!sameLine) {
        if (!out.endsWith('\n')) out += '\n';
        // A tall vertical gap usually means a new section.
        if (prev.y - y > lineSize * 1.9 && !out.endsWith('\n\n')) out += '\n';
      } else {
        const gap = x - prev.endX;
        if (gap > size * 0.18 && !/\s$/.test(out) && !/^\s/.test(item.str)) out += ' ';
      }
    }

    out += item.str;
    if (item.hasEOL && !out.endsWith('\n')) out += '\n';
    prev = { y, endX: x + (item.width || 0), size };
  }
  return out;
}

function tidy(text) {
  return text
    .replace(/\u0000/g, '')
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((p, q) => p - q);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function classifyFamily(name = '') {
  if (/sans|arial|helvetica|calibri|verdana|roboto|inter|grotesk|segoe|open|lato|avenir/i.test(name)) return 'sans';
  if (/serif|times|georgia|garamond|caslon|cambria|book|baskerville|minion|palatino|tinos/i.test(name)) return 'serif';
  return 'sans';
}

/**
 * Reads typographic choices from the first page: body font size,
 * serif or sans, left margin and line spacing. Used for "Match a reference".
 */
function analyseTypography(samples, pageWidth) {
  const body = samples.filter((s) => s.text.length > 2);
  if (!body.length) return null;

  // Weight font sizes by characters so a big name heading doesn't win.
  const weightedSizes = [];
  for (const s of body) {
    const rounded = Math.round(s.size * 2) / 2;
    for (let i = 0; i < Math.min(s.text.length, 200); i += 4) weightedSizes.push(rounded);
  }
  const fontSize = Math.min(14, Math.max(8.5, median(weightedSizes) || 11));

  let serifChars = 0;
  let sansChars = 0;
  for (const s of body) {
    if (classifyFamily(s.family) === 'serif') serifChars += s.text.length;
    else sansChars += s.text.length;
  }

  const xs = body.map((s) => s.x).sort((p, q) => p - q);
  const leftEdge = xs[Math.floor(xs.length * 0.05)] ?? 72;
  const margin = Math.min(108, Math.max(36, Math.round(leftEdge)));

  const bodyLines = [...new Set(body.filter((s) => Math.abs(s.size - fontSize) < 1.5).map((s) => Math.round(s.y)))].sort(
    (p, q) => q - p
  );
  const gaps = [];
  for (let i = 1; i < bodyLines.length; i++) {
    const gap = bodyLines[i - 1] - bodyLines[i];
    if (gap >= fontSize * 1.0 && gap <= fontSize * 2.2) gaps.push(gap);
  }
  const lineHeight = Math.min(1.8, Math.max(1.2, (median(gaps) || fontSize * 1.4) / fontSize));

  return {
    family: serifChars > sansChars ? 'serif' : 'sans',
    fontSize: Math.round(fontSize * 2) / 2,
    margin,
    lineHeight: Math.round(lineHeight * 100) / 100,
    pageWidth: Math.round(pageWidth),
  };
}

/**
 * Reads a PDF in the browser.
 * @returns {Promise<{ text: string, pageCount: number, typography: object|null }>}
 */
export async function readPdf(file) {
  if (!isPdf(file)) throw new Error('That file isn’t a PDF. Choose a .pdf file.');
  if (file.size > MAX_PDF_BYTES) throw new Error('That PDF is over 10 MB. Export a smaller version and try again.');

  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data,
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
    }).promise;
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new Error('This PDF is password-protected. Remove the password and upload it again.');
    }
    throw new Error('This PDF couldn’t be opened. It may be damaged; try exporting it again.');
  }

  try {
    const pageTexts = [];
    const samples = [];
    let pageWidth = 595.28;
    const pages = Math.min(doc.numPages, MAX_PAGES);

    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pageTexts.push(itemsToText(content.items));

      if (n === 1) {
        pageWidth = page.getViewport({ scale: 1 }).width;
        for (const item of content.items) {
          if (!('str' in item) || !item.str.trim()) continue;
          const [, , c, d, x, y] = item.transform;
          samples.push({
            text: item.str.trim(),
            size: Math.hypot(c, d) || item.height || 11,
            x,
            y,
            family: content.styles?.[item.fontName]?.fontFamily || '',
          });
        }
      }
      page.cleanup();
    }

    return {
      text: tidy(pageTexts.join('\n\n')),
      pageCount: doc.numPages,
      typography: analyseTypography(samples, pageWidth),
    };
  } finally {
    doc.destroy();
  }
}
