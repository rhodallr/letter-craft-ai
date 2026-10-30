import { NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const MAX_TEXT = 20_000;
const MIN_TEXT = 200;

const LOGIN_WALLED = /(^|\.)linkedin\.com$|(^|\.)glassdoor\.(com|co\.uk)$/i;

function errorResponse(message, status) {
  return NextResponse.json({ error: message }, { status });
}

/* ------------------------------ SSRF guarding ------------------------------ */

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true;
}

async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UserError('That doesn’t look like a web address. Paste the full link, starting with https://');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new UserError('Only http and https links can be read.');
  if (url.port && !['80', '443'].includes(url.port)) throw new UserError('That link uses a port we can’t read.');
  if (url.username || url.password) throw new UserError('Links with login details can’t be read.');

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new UserError('That address can’t be reached from here.');
  }
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new UserError('That website couldn’t be found. Check the link.');
  if (addresses.some(({ address }) => isPrivateIp(address))) {
    throw new UserError('That address can’t be reached from here.');
  }
  return url;
}

class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function fetchPage(startUrl) {
  let url = await assertPublicUrl(startUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; LetterCraftAI/1.0; +https://github.com/) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await assertPublicUrl(new URL(res.headers.get('location'), url).toString());
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new UserError('That site blocks automatic reading. Copy the job description and paste it instead.', 422);
    }
    if (res.status === 404) throw new UserError('That page wasn’t found. The job may have closed.', 422);
    if (!res.ok) throw new UserError(`The site responded with an error (${res.status}). Paste the description instead.`, 422);

    const type = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      throw new UserError('That link isn’t a web page. If it’s a PDF, open it and paste the text instead.', 422);
    }

    // Read with a size cap.
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const html = new TextDecoder('utf-8').decode(Buffer.concat(chunks));
    return { html, finalUrl: url };
  }
  throw new UserError('That link redirected too many times.', 422);
}

/* ------------------------------ HTML to text ------------------------------ */

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  bull: '•',
  middot: '·',
  pound: '£',
  euro: '€',
  copy: '©',
  reg: '®',
  trade: '™',
};

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      try {
        return Number.isFinite(n) ? String.fromCodePoint(n) : match;
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

function htmlToText(html) {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|form|button|select)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');

  s = s
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|ul|ol|h[1-6]|tr|table|dd|dt)>/gi, '\n')
    .replace(/<(h[1-6])\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ');

  return decodeEntities(s)
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, arr) => l || (arr[i - 1] && arr[i - 1].trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findJobPosting(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  const type = node['@type'];
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return node;
  if (node['@graph']) return findJobPosting(node['@graph']);
  return null;
}

function fromStructuredData(html) {
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, json] of scripts) {
    let data;
    try {
      data = JSON.parse(json.trim());
    } catch {
      continue;
    }
    const job = findJobPosting(data);
    if (!job?.description) continue;

    const company =
      typeof job.hiringOrganization === 'string' ? job.hiringOrganization : job.hiringOrganization?.name || '';
    const place = [].concat(job.jobLocation || [])[0]?.address;
    const location = place
      ? [place.addressLocality, place.addressRegion, place.addressCountry?.name || place.addressCountry]
          .filter((v) => typeof v === 'string' && v)
          .join(', ')
      : '';
    const description = htmlToText(decodeEntities(String(job.description)));
    const header = [
      job.title && `Job title: ${decodeEntities(String(job.title))}`,
      company && `Company: ${decodeEntities(String(company))}`,
      location && `Location: ${location}`,
      job.employmentType && `Employment type: ${[].concat(job.employmentType).join(', ')}`,
    ]
      .filter(Boolean)
      .join('\n');
    return {
      title: job.title ? decodeEntities(String(job.title)) : '',
      company: company ? decodeEntities(String(company)) : '',
      text: `${header}\n\n${description}`.trim(),
      method: 'structured',
    };
  }
  return null;
}

function metaContent(html, name) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`,
    'i'
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1] ?? m[2] ?? '').trim() : '';
}

function fromPageContent(html) {
  const title =
    metaContent(html, 'og:title') || decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim());

  // Prefer the main content region; fall back to the whole body.
  const region =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ||
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ||
    html.match(/<[^>]+(?:id|class)=["'][^"']*(?:job-?description|jobdescription|description|posting)[^"']*["'][^>]*>([\s\S]*)/i)?.[1] ||
    html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ||
    html;

  let text = htmlToText(region);
  if (text.length < MIN_TEXT) {
    const description = metaContent(html, 'og:description') || metaContent(html, 'description');
    if (description.length > text.length) text = description;
  }
  return { title, company: metaContent(html, 'og:site_name'), text, method: 'page' };
}

/* --------------------------------- Handler --------------------------------- */

export async function POST(request) {
  const limit = rateLimit(`extract:${clientIp(request)}`, { limit: 15, windowMs: 10 * 60_000 });
  if (!limit.ok) return errorResponse(`Too many requests. Try again in ${limit.retryAfter} seconds.`, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('The request body must be JSON.', 400);
  }
  const raw = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!raw) return errorResponse('Paste a link to the job advert.', 400);

  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) {
      throw new UserError('Only http and https links can be read.');
    }
    const target = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(target);
    if (LOGIN_WALLED.test(parsed.hostname)) {
      throw new UserError(
        `${parsed.hostname.replace(/^www\./, '')} needs you to be signed in, so it can’t be read automatically. Open the advert, copy the description and paste it instead.`,
        422
      );
    }

    const { html, finalUrl } = await fetchPage(target);
    const result = fromStructuredData(html) || fromPageContent(html);

    if (result.text.length < MIN_TEXT) {
      throw new UserError(
        'We couldn’t find the job description on that page. It may load after sign-in or with JavaScript. Paste the description instead.',
        422
      );
    }

    return NextResponse.json({
      title: result.title.slice(0, 200),
      company: result.company.slice(0, 200),
      text: result.text.slice(0, MAX_TEXT),
      truncated: result.text.length > MAX_TEXT,
      method: result.method,
      url: finalUrl.toString(),
    });
  } catch (err) {
    if (err instanceof UserError) return errorResponse(err.message, err.status);
    if (err?.name === 'TimeoutError') return errorResponse('That site took too long to respond. Paste the description instead.', 504);
    if (err instanceof TypeError && /Invalid URL/i.test(err.message)) {
      return errorResponse('That doesn’t look like a web address. Paste the full link, starting with https://', 400);
    }
    console.error('[extract-job]', err);
    return errorResponse('That page couldn’t be read. Paste the description instead.', 502);
  }
}
