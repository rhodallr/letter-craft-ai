// Letter layout + client-side PDF generation with pdf-lib.
//
// layoutBlocks() is the single source of truth for the letter's structure and
// spacing. The on-screen preview (components/LetterPreview.jsx) renders the same
// blocks, so what you see is what downloads.


import { BULLET, isBulletLine } from './letterFormat';

export { countWords } from './letterFormat';

export const PAGE = { width: 595.28, height: 841.89 }; // A4 in points

export const TEXT_COLOR = '#1C1C1F';
export const MUTED_COLOR = '#55555F';

export const LETTER_STYLES = {
  classic: {
    id: 'classic',
    label: 'Classic',
    hint: 'Serif, centred letterhead',
    family: 'serif',
    fontSize: 11.5,
    lineHeight: 1.42,
    margin: 72,
    layout: 'classic',
    accent: TEXT_COLOR,
  },
  modern: {
    id: 'modern',
    label: 'Modern',
    hint: 'Sans, bold name, blue edge',
    family: 'sans',
    fontSize: 10.5,
    lineHeight: 1.5,
    margin: 64,
    layout: 'modern',
    accent: '#2A33E8',
  },
  minimal: {
    id: 'minimal',
    label: 'Minimalist',
    hint: 'Small type, wide margins',
    family: 'sans',
    fontSize: 10,
    lineHeight: 1.6,
    margin: 84,
    layout: 'minimal',
    accent: MUTED_COLOR,
  },
};

/** Builds a style from the typography read out of a reference PDF. */
export function referenceStyle(typography, fileName = 'reference.pdf') {
  const t = typography || {};
  return {
    id: 'reference',
    label: 'Your reference',
    hint: describeTypography(t),
    family: t.family === 'serif' ? 'serif' : 'sans',
    fontSize: clamp(t.fontSize || 11, 9, 13),
    lineHeight: clamp(t.lineHeight || 1.45, 1.2, 1.8),
    margin: clamp(t.margin || 72, 40, 100),
    layout: 'reference',
    accent: TEXT_COLOR,
    source: fileName,
  };
}

export function describeTypography(t = {}) {
  const family = t.family === 'serif' ? 'Serif' : 'Sans';
  const size = t.fontSize ? `${t.fontSize}pt` : '11pt';
  const margin = t.margin ? `${Math.round(((t.margin / 72) * 2.54) * 10) / 10}cm margins` : 'standard margins';
  return `${family}, ${size}, ${margin}`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number(n) || min));
}

function headerSpec(style) {
  const fs = style.fontSize;
  switch (style.layout) {
    case 'classic':
      return {
        name: { size: fs * 1.75, bold: true, align: 'center', color: TEXT_COLOR },
        contact: { size: fs * 0.86, align: 'center', color: MUTED_COLOR },
        rule: true,
        bar: false,
        gapAfterHeader: fs * 2.2,
        date: { color: TEXT_COLOR },
      };
    case 'modern':
      return {
        name: { size: fs * 2.3, bold: true, align: 'left', color: '#10145C' },
        contact: { size: fs * 0.92, align: 'left', color: style.accent, bold: true },
        rule: false,
        bar: true,
        gapAfterHeader: fs * 2.6,
        date: { color: MUTED_COLOR },
      };
    case 'minimal':
      return {
        name: { size: fs * 1.3, bold: false, align: 'left', color: TEXT_COLOR },
        contact: { size: fs * 0.9, align: 'left', color: MUTED_COLOR },
        rule: false,
        bar: false,
        gapAfterHeader: fs * 3.4,
        date: { color: MUTED_COLOR },
      };
    default:
      return {
        name: { size: fs * 1.6, bold: true, align: 'left', color: TEXT_COLOR },
        contact: { size: fs * 0.9, align: 'left', color: MUTED_COLOR },
        rule: false,
        bar: false,
        gapAfterHeader: fs * 2.2,
        date: { color: TEXT_COLOR },
      };
  }
}

/**
 * Turns a letter + style into an ordered list of blocks.
 * Text blocks: { kind:'text', field, index?, text, size, bold, color, align, lineHeight, spaceBefore, multiline, placeholder }
 * Rule blocks: { kind:'rule', spaceBefore, spaceAfter }
 */
export function layoutBlocks(letter, style) {
  const fs = style.fontSize;
  const lh = style.lineHeight;
  const h = headerSpec(style);
  const blocks = [];
  const body = { size: fs, bold: false, color: TEXT_COLOR, align: 'left', lineHeight: lh };

  blocks.push({
    kind: 'text',
    field: 'candidateName',
    text: letter.candidateName || '',
    placeholder: 'Your name',
    lineHeight: 1.15,
    spaceBefore: 0,
    ...h.name,
  });
  blocks.push({
    kind: 'text',
    field: 'contactLine',
    text: letter.contactLine || '',
    placeholder: 'Email | Phone | Location',
    lineHeight: 1.35,
    spaceBefore: h.name.size * 0.3,
    optional: true,
    bold: false,
    ...h.contact,
  });
  if (h.rule) blocks.push({ kind: 'rule', spaceBefore: fs * 0.9, spaceAfter: 0 });

  blocks.push({
    kind: 'text',
    field: 'date',
    text: letter.date || '',
    placeholder: 'Date',
    spaceBefore: h.gapAfterHeader,
    optional: true,
    ...body,
    color: h.date.color,
  });
  blocks.push({
    kind: 'text',
    field: 'recipientLines',
    text: (letter.recipientLines || []).join('\n'),
    placeholder: 'Hiring manager, company',
    multiline: true,
    optional: true,
    spaceBefore: fs * lh,
    ...body,
  });
  blocks.push({
    kind: 'text',
    field: 'salutation',
    text: letter.salutation || '',
    placeholder: 'Dear Hiring Manager,',
    spaceBefore: fs * lh,
    ...body,
  });
  (letter.paragraphs || []).forEach((p, i) => {
    const paragraphSpace = i === 0 ? fs * lh * 0.75 : fs * 0.85;
    const lines = p.split('\n');

    if (!lines.some(isBulletLine)) {
      blocks.push({
        kind: 'text',
        field: 'paragraphs',
        index: i,
        text: p,
        placeholder: 'Paragraph',
        multiline: true,
        spaceBefore: paragraphSpace,
        ...body,
      });
      return;
    }

    // A bullet list: each line is its own block so it can hang-indent and be edited alone.
    lines.forEach((line, j) => {
      const bullet = isBulletLine(line);
      const itemText = bullet ? line.slice(BULLET.length) : line;
      blocks.push({
        kind: 'text',
        field: 'paragraphs',
        index: i,
        line: j,
        bullet,
        indent: bullet ? fs * 1.45 : 0,
        bulletX: fs * 0.35,
        text: itemText,
        boldLead: bullet ? boldLeadLength(itemText) : 0,
        placeholder: bullet ? 'Bullet point' : 'Lead-in',
        spaceBefore: j === 0 ? paragraphSpace : bullet ? fs * 0.35 : fs * 0.5,
        ...body,
      });
    });
  });
  blocks.push({
    kind: 'text',
    field: 'signOff',
    text: letter.signOff || '',
    placeholder: 'Kind regards,',
    spaceBefore: fs * 1.2,
    ...body,
  });
  blocks.push({
    kind: 'text',
    field: 'candidateName',
    text: letter.candidateName || '',
    placeholder: 'Your name',
    spaceBefore: fs * 2.6,
    ...body,
    bold: style.layout === 'modern',
  });
  return { blocks, header: h };
}

/** Length of a bullet's "Keyword:" lead, which is set in bold so recruiters can scan for it. */
export function boldLeadLength(text) {
  const m = typeof text === 'string' ? text.match(/^([^:.]{2,48}):\s/) : null;
  return m ? m[1].length + 1 : 0;
}

/** Plain text for the clipboard. */
export function letterToPlainText(letter) {
  if (!letter) return '';
  const parts = [];
  const head = [letter.candidateName, letter.contactLine].filter(Boolean).join('\n');
  if (head) parts.push(head);
  if (letter.date) parts.push(letter.date);
  if (letter.recipientLines?.length) parts.push(letter.recipientLines.join('\n'));
  if (letter.salutation) parts.push(letter.salutation);
  parts.push(...(letter.paragraphs || []));
  parts.push([letter.signOff, letter.candidateName].filter(Boolean).join('\n'));
  return parts.filter(Boolean).join('\n\n').trim();
}


/* ------------------------------ PDF rendering ------------------------------ */

function hexToRgb(rgb, hex) {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const FALLBACKS = {
  '‐': '-',
  '‑': '-',
  '‒': '-',
  '―': '-',
  '′': "'",
  '″': '"',
  '→': '->',
  '←': '<-',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '​': '',
};

/** Standard PDF fonts use WinAnsi encoding; replace anything they can't draw. */
function makeSanitiser(font) {
  const cache = new Map();
  const canEncode = (ch) => {
    try {
      font.encodeText(ch);
      return true;
    } catch {
      return false;
    }
  };
  return (text) => {
    let out = '';
    for (const ch of text) {
      if (cache.has(ch)) {
        out += cache.get(ch);
        continue;
      }
      let rep = ch;
      if (ch !== '\n' && !canEncode(ch)) {
        if (ch in FALLBACKS) rep = FALLBACKS[ch];
        else {
          const stripped = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
          rep = stripped && [...stripped].every(canEncode) ? stripped : '?';
        }
      }
      cache.set(ch, rep);
      out += rep;
    }
    return out;
  };
}

function wrapLine(text, font, size, maxWidth) {
  const words = text.split(/ +/);
  const lines = [];
  let line = '';
  const width = (s) => font.widthOfTextAtSize(s, size);

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (width(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // Break words longer than the line (long URLs).
    if (width(word) > maxWidth) {
      let chunk = '';
      for (const ch of word) {
        if (width(chunk + ch) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    } else line = word;
  }
  lines.push(line);
  return lines;
}

/** Wraps words that each carry their own font (for a bold lead followed by regular text). */
function wrapRuns(words, size, maxWidth, spaceWidth) {
  const lines = [];
  let line = [];
  let width = 0;
  for (const word of words) {
    const w = word.f.widthOfTextAtSize(word.w, size);
    const next = line.length ? width + spaceWidth + w : w;
    if (line.length && next > maxWidth) {
      lines.push(line);
      line = [word];
      width = w;
    } else {
      line.push(word);
      width = next;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

function wrapText(text, font, size, maxWidth) {
  return text.split('\n').flatMap((part) => wrapLine(part, font, size, maxWidth));
}

/**
 * Renders the letter to a PDF.
 * @returns {Promise<{ bytes: Uint8Array, pageCount: number }>}
 */
export async function renderLetterPdf(letter, style) {
  // Loaded on demand so pdf-lib stays out of the initial page bundle.
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const toColor = (hex) => hexToRgb(rgb, hex);
  const doc = await PDFDocument.create();
  const serif = style.family === 'serif';
  const fonts = {
    regular: await doc.embedFont(serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica),
    bold: await doc.embedFont(serif ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold),
  };
  const sanitise = {
    regular: makeSanitiser(fonts.regular),
    bold: makeSanitiser(fonts.bold),
  };

  const { blocks, header } = layoutBlocks(letter, style);
  const margin = style.margin;
  const topMargin = margin * 0.85;
  const contentWidth = PAGE.width - margin * 2;
  const bottomLimit = margin * 0.85;

  let page;
  let top;
  const newPage = () => {
    page = doc.addPage([PAGE.width, PAGE.height]);
    top = PAGE.height - topMargin;
    if (header.bar) {
      page.drawRectangle({ x: 0, y: 0, width: 10, height: PAGE.height, color: toColor(style.accent) });
    }
  };
  newPage();

  for (const block of blocks) {
    if (block.kind === 'rule') {
      top -= block.spaceBefore;
      page.drawLine({
        start: { x: margin, y: top },
        end: { x: PAGE.width - margin, y: top },
        thickness: 0.6,
        color: toColor(MUTED_COLOR),
      });
      top -= block.spaceAfter;
      continue;
    }

    const raw = (block.text || '').trim();
    if (!raw) continue; // Empty fields show a placeholder on screen but are left out of the PDF.

    const font = block.bold ? fonts.bold : fonts.regular;
    const text = (block.bold ? sanitise.bold : sanitise.regular)(raw);
    const lineBox = block.size * block.lineHeight;
    const indent = block.indent || 0;

    if (block.boldLead) {
      const lead = sanitise.bold(raw.slice(0, block.boldLead));
      const rest = sanitise.regular(raw.slice(block.boldLead).trim());
      const runs = wrapRuns(
        [
          ...lead.split(/ +/).map((w) => ({ w, f: fonts.bold })),
          ...rest.split(/ +/).filter(Boolean).map((w) => ({ w, f: fonts.regular })),
        ],
        block.size,
        contentWidth - indent,
        fonts.regular.widthOfTextAtSize(' ', block.size)
      );
      if (top - block.spaceBefore - lineBox < bottomLimit) newPage();
      else top -= block.spaceBefore;
      runs.forEach((words, lineIndex) => {
        if (top - lineBox < bottomLimit) newPage();
        const baseline = top - lineBox / 2 - block.size * 0.34;
        if (lineIndex === 0) {
          page.drawText('•', { x: margin + block.bulletX, y: baseline, size: block.size, font: fonts.regular, color: toColor(block.color) });
        }
        let x = margin + indent;
        const space = fonts.regular.widthOfTextAtSize(' ', block.size);
        for (const { w, f } of words) {
          page.drawText(w, { x, y: baseline, size: block.size, font: f, color: toColor(block.color) });
          x += f.widthOfTextAtSize(w, block.size) + space;
        }
        top -= lineBox;
      });
      continue;
    }

    const lines = wrapText(text, font, block.size, contentWidth - indent);

    // Don't start a block in the bottom gutter if its first line won't fit.
    if (top - block.spaceBefore - lineBox < bottomLimit) newPage();
    else top -= block.spaceBefore;

    lines.forEach((line, lineIndex) => {
      if (top - lineBox < bottomLimit) newPage();
      const baseline = top - lineBox / 2 - block.size * 0.34;
      if (block.bullet && lineIndex === 0) {
        page.drawText('•', { x: margin + block.bulletX, y: baseline, size: block.size, font, color: toColor(block.color) });
      }
      const w = font.widthOfTextAtSize(line, block.size);
      let x = margin + indent;
      if (block.align === 'center') x = margin + (contentWidth - w) / 2;
      if (block.align === 'right') x = margin + contentWidth - w;
      page.drawText(line, { x, y: baseline, size: block.size, font, color: toColor(block.color) });
      top -= lineBox;
    });
  }

  const name = (letter.candidateName || '').trim();
  doc.setTitle(name ? `Cover letter – ${name}` : 'Cover letter');
  if (name) doc.setAuthor(name);
  doc.setCreator('LetterCraft AI');
  doc.setProducer('LetterCraft AI (pdf-lib)');

  const bytes = await doc.save();
  return { bytes, pageCount: doc.getPageCount() };
}

/** Renders and downloads the letter as a PDF in the browser. */
export async function downloadLetterPdf(letter, style) {
  const { bytes, pageCount } = await renderLetterPdf(letter, style);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const safeName = (letter.candidateName || 'Cover letter')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .slice(0, 60);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName || 'Cover letter'} - cover letter.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { pageCount };
}
