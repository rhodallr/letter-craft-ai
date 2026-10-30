'use client';

import { useId, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, ClipboardType, FileText, FileUp, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { readPdf } from '@/lib/pdfText';

const NOTES_MAX = 3000;
const CV_MAX = 30000;

export default function CvUploader({ cv, onCvChange, notes, onNotesChange }) {
  const inputId = useId();
  const notesId = useId();
  const inputRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | reading
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [showText, setShowText] = useState(false);
  const [pasteMode, setPasteMode] = useState(cv?.source === 'paste');

  async function handleFile(file) {
    if (!file) return;
    setError('');
    setStatus('reading');
    try {
      const { text, pageCount } = await readPdf(file);
      if (text.replace(/\s/g, '').length < 100) {
        setError('We couldn’t find text in this PDF. It may be a scanned image. Paste your CV text instead.');
        setPasteMode(true);
        return;
      }
      onCvChange({ source: 'pdf', fileName: file.name, pageCount, text: text.slice(0, CV_MAX) });
      setPasteMode(false);
    } catch (err) {
      setError(err.message || 'That PDF couldn’t be read.');
    } finally {
      setStatus('idle');
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  const hasPdf = cv?.source === 'pdf' && cv.text;
  const charCount = cv?.text?.length || 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
      {/* CV */}
      <section className="panel p-5 sm:p-6" aria-labelledby={`${inputId}-title`}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={`${inputId}-title`} className="text-xl font-extrabold tracking-tight">
            Your CV
          </h2>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setPasteMode((v) => !v);
              setError('');
            }}
          >
            {pasteMode ? <FileUp size={16} aria-hidden /> : <ClipboardType size={16} aria-hidden />}
            {pasteMode ? 'Upload a PDF instead' : 'Paste text instead'}
          </button>
        </div>

        {pasteMode ? (
          <div className="mt-4">
            <label htmlFor={`${inputId}-paste`} className="sr-only">
              CV text
            </label>
            <textarea
              id={`${inputId}-paste`}
              className="field min-h-[280px] resize-y font-letterSans text-[14px]"
              placeholder="Paste the full text of your CV: roles, dates, achievements, skills and contact details."
              value={cv?.source === 'paste' ? cv.text : ''}
              maxLength={CV_MAX}
              onChange={(e) =>
                onCvChange(e.target.value ? { source: 'paste', fileName: '', pageCount: 0, text: e.target.value } : null)
              }
            />
            <p className="mt-2 text-sm text-ink/60">Include your name and contact details so the letterhead fills itself.</p>
          </div>
        ) : hasPdf ? (
          <div className="mt-4">
            <div className="flex items-center gap-3 rounded-lg border-2 border-ink bg-envelope p-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border-2 border-ink bg-white">
                <FileText size={22} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{cv.fileName}</p>
                <p className="text-sm text-ink/65">
                  {cv.pageCount} {cv.pageCount === 1 ? 'page' : 'pages'}, {charCount.toLocaleString('en-GB')} characters read
                </p>
              </div>
              <button type="button" className="btn-ghost" onClick={() => inputRef.current?.click()}>
                <RefreshCw size={16} aria-hidden />
                <span className="hidden sm:inline">Replace</span>
              </button>
              <button
                type="button"
                className="btn-ghost"
                aria-label="Remove CV"
                onClick={() => {
                  onCvChange(null);
                  setShowText(false);
                }}
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </div>

            <button
              type="button"
              className="btn-ghost mt-3"
              aria-expanded={showText}
              onClick={() => setShowText((v) => !v)}
            >
              <ChevronDown size={16} aria-hidden className={showText ? 'rotate-180 transition-transform' : 'transition-transform'} />
              Check what we read
            </button>
            {showText && (
              <div className="mt-2">
                <label htmlFor={`${inputId}-text`} className="sr-only">
                  Extracted CV text
                </label>
                <textarea
                  id={`${inputId}-text`}
                  className="field min-h-[240px] resize-y font-letterSans text-[13px] leading-snug"
                  value={cv.text}
                  maxLength={CV_MAX}
                  onChange={(e) => onCvChange({ ...cv, text: e.target.value })}
                />
                <p className="mt-2 text-sm text-ink/60">Fix anything that came out jumbled. Edits are used when you generate.</p>
              </div>
            )}
          </div>
        ) : (
          <label
            htmlFor={inputId}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`mt-4 flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-ink p-6 text-center transition-colors ${
              dragging ? 'bg-marker' : 'bg-envelope hover:bg-[#e3e6fb]'
            }`}
          >
            {status === 'reading' ? (
              <>
                <Loader2 size={34} className="animate-spin" aria-hidden />
                <span className="font-semibold" role="status">
                  Reading your CV…
                </span>
              </>
            ) : (
              <>
                <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-ink bg-white shadow-hard-sm">
                  <FileUp size={26} aria-hidden />
                </span>
                <span className="text-lg font-bold">Drop your CV here, or choose a PDF</span>
                <span className="max-w-sm text-sm text-ink/65">
                  Up to 10 MB. It’s read in your browser; only the text is sent when you generate a letter.
                </span>
              </>
            )}
          </label>
        )}

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={status === 'reading'}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border-2 border-ink bg-[#FFE4DE] p-3 text-sm font-medium">
            <AlertCircle size={18} className="mt-px shrink-0 text-stamp" aria-hidden />
            {error}
          </p>
        )}
      </section>

      {/* Notes */}
      <section className="panel flex flex-col bg-marker p-5 sm:p-6">
        <label htmlFor={notesId} className="text-xl font-extrabold tracking-tight">
          What should the letter lean on?
        </label>
        <p className="mt-1 text-[15px] text-ink/75">
          Achievements, strengths or context you want front and centre. The letter is built around these first.
        </p>
        <textarea
          id={notesId}
          className="field mt-4 min-h-[200px] flex-1 resize-y bg-white/90"
          placeholder={
            'For example:\nLed the checkout redesign that lifted conversion 18%.\nI want to stress my accessibility work.\nRelocating to Manchester in March.'
          }
          value={notes}
          maxLength={NOTES_MAX}
          onChange={(e) => onNotesChange(e.target.value)}
        />
        <p className="mt-2 text-right text-sm tabular-nums text-ink/60" aria-live="polite">
          {notes.length.toLocaleString('en-GB')} / {NOTES_MAX.toLocaleString('en-GB')}
        </p>
      </section>
    </div>
  );
}
