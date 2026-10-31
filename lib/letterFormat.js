// Shared letter text rules, used by the API route, the on-screen page and the PDF.
//
// A paragraph is a string. A paragraph that holds a bullet list keeps one item
// per line, each starting with BULLET; it may open with a plain lead-in line
// (usually ending in a colon). Plain paragraphs are a single line.

export const BULLET = '• ';

// "- item", "* item", "• item", "1. item", "2) item"
const BULLET_MARKER = /^\s*(?:[-*•●▪◦‣–]|\d{1,2}[.)])\s+/;

export function isBulletLine(line) {
  return typeof line === 'string' && line.startsWith(BULLET);
}

export function paragraphHasBullets(paragraph) {
  return typeof paragraph === 'string' && paragraph.split('\n').some(isBulletLine);
}

/** Cleans one paragraph: tidies spaces, strips markdown bold, standardises bullet markers. */
export function normaliseParagraph(text) {
  if (typeof text !== 'string') return '';
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) =>
      line
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/[ \t ]+/g, ' ')
        .trim()
    )
    .filter(Boolean);

  if (!lines.some((line) => BULLET_MARKER.test(line))) return lines.join(' ');

  return lines
    .map((line) => (BULLET_MARKER.test(line) ? BULLET + line.replace(BULLET_MARKER, '').trim() : line))
    .filter((line) => line !== BULLET.trim())
    .join('\n');
}

/**
 * Models sometimes return each bullet as its own paragraph. Join runs of
 * bullet-only paragraphs onto the bullet list or lead-in line before them.
 */
export function mergeBulletParagraphs(paragraphs) {
  const out = [];
  for (const paragraph of paragraphs) {
    const lines = paragraph.split('\n');
    const allBullets = lines.every(isBulletLine);
    const previous = out[out.length - 1];
    if (allBullets && previous !== undefined) {
      const previousLast = previous.split('\n').pop();
      if (isBulletLine(previousLast) || /:$/.test(previousLast)) {
        out[out.length - 1] = `${previous}\n${paragraph}`;
        continue;
      }
    }
    out.push(paragraph);
  }
  return out;
}

export function normaliseParagraphs(paragraphs, { maxLength = 2500, maxCount = 8 } = {}) {
  const cleaned = (Array.isArray(paragraphs) ? paragraphs : [])
    .map((p) => normaliseParagraph(p).slice(0, maxLength))
    .filter(Boolean);
  return mergeBulletParagraphs(cleaned).slice(0, maxCount);
}

/** "Yours sincerely, Lanruo Li" -> "Yours sincerely," (the name is printed underneath). */
export function cleanSignOff(signOff, candidateName) {
  let s = typeof signOff === 'string' ? signOff.replace(/\s+/g, ' ').trim() : '';
  const name = typeof candidateName === 'string' ? candidateName.trim() : '';
  if (name && s.toLowerCase().endsWith(name.toLowerCase())) {
    s = s.slice(0, s.length - name.length).trim();
  }
  s = s.replace(/[\s,.;:–-]+$/, '');
  return s ? `${s},` : 'Kind regards,';
}

export function countWords(letter) {
  return (letter?.paragraphs || [])
    .join(' ')
    .split(/\s+/)
    .filter((w) => w && w !== BULLET.trim()).length;
}
