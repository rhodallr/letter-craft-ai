# LetterCraft AI

Upload a CV, add a job description, and get a specific, cliché-free cover letter you can refine in plain English and download as a PDF.

Built with Next.js 15 (App Router), Tailwind CSS, Lucide icons, pdfjs-dist (CV reading in the browser) and pdf-lib (PDF export in the browser).

## Run it locally

1. Install Node.js 18.18 or newer.
2. In this folder:
   ```bash
   npm install
   cp .env.example .env.local
   ```
3. Put a free Gemini key in `.env.local` (get one at https://aistudio.google.com/app/apikey):
   ```
   GEMINI_API_KEY=your-key
   ```
   Optionally add `GROQ_API_KEY` (https://console.groq.com/keys). If Gemini is rate-limited or down, Groq is used instead.
4. `npm run dev` and open http://localhost:3000

## Deploy to Vercel

1. Push this folder to a GitHub repository (the `.gitignore` keeps `node_modules`, `.next` and `.env.local` out).
2. In Vercel, choose **Add New → Project** and import the repo. The framework is detected automatically.
3. Under **Environment Variables**, add `GEMINI_API_KEY` (and `GROQ_API_KEY` if you have one).
4. Deploy. If you add or change a key later, redeploy for it to take effect.

## Environment variables

| Name | Required | Default |
| --- | --- | --- |
| `GEMINI_API_KEY` | One of the two keys | none |
| `GEMINI_MODEL` | No | `gemini-3.8-flash` |
| `GROQ_API_KEY` | One of the two keys | none |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` |

Model names change over time. If generation starts failing with a 404 in the server logs, set `GEMINI_MODEL` to a current Flash model from Google's model list.

## How it works

| Step | What happens |
| --- | --- |
| 1. Your CV | The PDF is read in the browser with pdfjs-dist. The file never leaves the device; you can check and correct the extracted text. Scanned (image-only) PDFs can't be read, so there's a paste option. Notes go in the yellow panel and are treated as the top priority. |
| 2. The job | Paste the description, or give a link. `/api/extract-job` fetches the page on the server and reads the job from its structured data (JSON-LD `JobPosting`, which most job boards publish), falling back to the main page content and then the meta description. Sign-in sites such as LinkedIn are refused with a prompt to paste instead. |
| 3. Your letter | `/api/generate` asks the model for structured JSON: the letter, which job requirements it matched to which CV evidence, and any requirements the CV doesn't show. The console on the left takes refinement requests; every result is a new draft you can step back and forth through. Click any line of the page to edit it directly. |

### PDF export

`lib/pdfExporter.js` defines the letter layout once (`layoutBlocks`). The on-screen page renders those same blocks scaled to the sheet width, so line breaks in the preview match the PDF. Styles:

- **Classic**: Times, centred letterhead with a rule
- **Modern**: Helvetica, bold name, blue edge
- **Minimalist**: small Helvetica, wide margins
- **Your reference**: upload any PDF letter and its body font (serif or sans), size, margins and line spacing are read and applied

The PDF uses the standard PDF fonts, so files are small and the text is selectable. Characters those fonts can't draw (for example Chinese or emoji) are replaced; accented Latin letters are kept.

## Safeguards

- Inputs are length-capped on the server; the model is told to treat CV and job text as data, not instructions.
- The prompt forbids inventing experience, bans common cover-letter clichés, and matches British or American spelling to the job ad.
- Both API routes are rate-limited per IP (in memory, so per server instance; use a shared store such as Upstash Redis if you need a hard global limit).
- The link reader blocks private and internal network addresses, non-standard ports and excessive redirects, and caps page size at 3 MB.
- CV text, notes, the job and drafts are saved in the browser's localStorage so a refresh doesn't lose work. **Start over** in the footer clears them.

## Project structure

```
app/
  layout.jsx                 Root layout, self-hosted fonts
  page.jsx                   Three-step workspace and state
  globals.css                Tailwind layers, letter-sheet styles
  api/generate/route.js      Gemini / Groq generation and refinement
  api/extract-job/route.js   Job advert reader for links
components/
  CvUploader.jsx             PDF picker, extraction, notes
  JobInput.jsx               Paste / link tabs
  LetterPreview.jsx          Refine console, live page, styles, copy, PDF
lib/
  pdfExporter.js             Shared letter layout + pdf-lib export
  pdfText.js                 pdfjs-dist text and typography reading
  rateLimit.js               In-memory rate limiter
```
