'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FileUp,
  Loader2,
  Redo2,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import {
  LETTER_STYLES,
  MUTED_COLOR,
  countWords,
  downloadLetterPdf,
  layoutBlocks,
  letterToPlainText,
  referenceStyle as buildReferenceStyle,
} from '@/lib/pdfExporter';
import { readPdf } from '@/lib/pdfText';

const QUICK_TWEAKS = [
  'Make it more enthusiastic',
  'Shorten to 250 words',
  'Emphasise leadership',
  'Make it more formal',
  'Give it a sharper opening line',
  'Add a specific result with numbers',
];

const FONT_STACKS = {
  serif: 'Tinos, "Times New Roman", Times, serif',
  sans: 'Arimo, Arial, Helvetica, sans-serif',
};

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/* --------------------------------- Editable --------------------------------- */

function Editable({ value, onCommit, multiline, placeholder, label, style, className }) {
  const ref = useRef(null);

  // Only push outside changes into the DOM when the field isn't being typed in.
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerText !== value) el.innerText = value;
  }, [value]);

  return (
    <div
      ref={ref}
      role="textbox"
      aria-label={label}
      aria-multiline={multiline ? 'true' : 'false'}
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-placeholder={placeholder}
      className={className}
      style={style}
      onBlur={(e) => {
        const text = e.currentTarget.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        if (text !== value) onCommit(text);
        if (!text) e.currentTarget.innerText = '';
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, multiline ? text : text.replace(/\s*\n\s*/g, ' '));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !multiline) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') e.currentTarget.blur();
      }}
    />
  );
}

/* ---------------------------------- Sheet ---------------------------------- */

function LetterSheet({ letter, style, onLetterChange, revealKey, writing }) {
  const pt = (n) => `calc(var(--pt) * ${n.toFixed(2)})`;

  if (writing || !letter) {
    return (
      <div className="sheet-frame">
        <div
          className="sheet bg-white"
          style={{ padding: `${pt(style.margin * 0.85)} ${pt(style.margin)}` }}
          role="status"
          aria-label="Writing your letter"
        >
          {[38, 62, 0, 30, 0, 96, 100, 92, 70, 0, 100, 97, 88, 100, 64, 0, 100, 94, 52].map((w, i) => (
            <div
              key={i}
              className={w ? 'writing-line rounded-sm bg-[#DADCF0]' : ''}
              style={{ '--i': i, width: `${w}%`, height: pt(style.fontSize * 0.75), marginTop: pt(i ? style.fontSize * 0.9 : 0) }}
            />
          ))}
        </div>
      </div>
    );
  }

  const { blocks, header } = layoutBlocks(letter, style);

  function commit(block, text) {
    const next = { ...letter };
    if (block.field === 'paragraphs') {
      const paragraphs = [...letter.paragraphs];
      const parts = text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
      paragraphs.splice(block.index, 1, ...parts);
      next.paragraphs = paragraphs;
    } else if (block.field === 'recipientLines') {
      next.recipientLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    } else {
      next[block.field] = text.replace(/\s*\n\s*/g, ' ');
    }
    onLetterChange(next);
  }

  return (
    <div className="sheet-frame">
      <article
        className="sheet relative bg-white"
        aria-label="Cover letter preview"
        style={{
          fontFamily: FONT_STACKS[style.family],
          padding: `${pt(style.margin * 0.85)} ${pt(style.margin)}`,
        }}
      >
        {header.bar && (
          <div aria-hidden className="absolute inset-y-0 left-0" style={{ width: pt(10), background: style.accent }} />
        )}
        <div key={revealKey}>
          {blocks.map((block, i) => {
            if (block.kind === 'rule') {
              return (
                <div
                  key={`rule-${i}`}
                  aria-hidden
                  className={revealKey ? 'ink-in' : ''}
                  style={{ '--i': i, marginTop: pt(block.spaceBefore), borderTop: `${pt(0.6)} solid ${MUTED_COLOR}` }}
                />
              );
            }
            return (
              <Editable
                key={`${block.field}-${block.index ?? ''}-${i}`}
                value={block.text}
                placeholder={block.placeholder}
                label={block.field === 'paragraphs' ? `Paragraph ${block.index + 1}` : block.placeholder}
                multiline={block.multiline}
                className={revealKey ? 'ink-in' : ''}
                onCommit={(text) => commit(block, text)}
                style={{
                  '--i': i,
                  fontSize: pt(block.size),
                  lineHeight: block.lineHeight,
                  fontWeight: block.bold ? 700 : 400,
                  color: block.color,
                  textAlign: block.align,
                  marginTop: pt(block.spaceBefore),
                  whiteSpace: 'pre-wrap',
                }}
              />
            );
          })}
        </div>
      </article>
    </div>
  );
}

/* --------------------------------- Console --------------------------------- */

function Message({ message, onRetry, busy }) {
  if (message.role === 'user') {
    return (
      <li className="ml-8 self-end rounded-xl rounded-br-sm border-2 border-ink bg-ink px-3.5 py-2.5 text-[15px] text-white">
        {message.text}
      </li>
    );
  }
  if (message.role === 'error') {
    return (
      <li className="mr-4 rounded-xl rounded-bl-sm border-2 border-ink bg-[#FFE4DE] px-3.5 py-3 text-[15px]">
        <p className="flex items-start gap-2 font-medium">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-stamp" aria-hidden />
          {message.text}
        </p>
        {onRetry && (
          <button type="button" className="btn-plain mt-3 py-2 text-sm" onClick={onRetry} disabled={!!busy}>
            <RotateCcw size={15} aria-hidden />
            Try again
          </button>
        )}
      </li>
    );
  }
  return (
    <li className="mr-4 rounded-xl rounded-bl-sm border-2 border-ink bg-white px-3.5 py-3 text-[15px]">
      <p>{message.text}</p>
      {message.matches?.length > 0 && (
        <div className="mt-3">
          <p className="font-bold">Where your CV meets the job</p>
          <ul className="mt-1.5 space-y-2">
            {message.matches.map((m, i) => (
              <li key={i} className="border-l-4 border-royal pl-2.5 text-sm leading-snug">
                <span className="font-semibold">{m.requirement}</span>
                <span className="block text-ink/70">{m.evidence}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {message.gaps?.length > 0 && (
        <div className="mt-3">
          <p className="font-bold">Asked for, but not in your CV</p>
          <ul className="mt-1.5 space-y-1">
            {message.gaps.map((g, i) => (
              <li key={i} className="border-l-4 border-stamp pl-2.5 text-sm leading-snug">
                {g}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink/65">
            If you have this experience, add it to your notes and ask for it to be included.
          </p>
        </div>
      )}
      {message.meta && <p className="mt-2 text-xs text-ink/50">{message.meta}</p>}
    </li>
  );
}

function RefineConsole({ messages, busy, onRefine, onRetry, versionIndex, versionCount, onUndo, onRedo, hasLetter }) {
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const logRef = useRef(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, busy]);

  function send(text) {
    const value = text.trim();
    if (!value || busy || !hasLetter) return;
    onRefine(value);
    setDraft('');
  }

  const lastError = [...messages].reverse().find((m) => m.role === 'error');

  return (
    <section className="panel flex h-full min-h-[480px] flex-col overflow-hidden" aria-labelledby={`${inputId}-title`}>
      <header className="flex items-center justify-between gap-2 border-b-2 border-ink px-4 py-3">
        <h2 id={`${inputId}-title`} className="text-lg font-extrabold tracking-tight">
          Refine
        </h2>
        <div className="flex items-center gap-1">
          {versionCount > 0 && (
            <span className="mr-1 text-sm tabular-nums text-ink/60">
              Draft {versionIndex + 1} of {versionCount}
            </span>
          )}
          <button
            type="button"
            className="btn-ghost"
            onClick={onUndo}
            disabled={!!busy || versionIndex <= 0}
            aria-label="Previous draft"
            title="Previous draft"
          >
            <Undo2 size={17} aria-hidden />
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={onRedo}
            disabled={!!busy || versionIndex >= versionCount - 1}
            aria-label="Next draft"
            title="Next draft"
          >
            <Redo2 size={17} aria-hidden />
          </button>
        </div>
      </header>

      <ol ref={logRef} className="flex flex-1 flex-col gap-3 overflow-y-auto bg-envelope p-4 lg:max-h-[52vh]" aria-live="polite">
        {messages.map((m) => (
          <Message key={m.id} message={m} busy={busy} onRetry={m === lastError ? onRetry : undefined} />
        ))}
        {busy && (
          <li className="mr-4 flex items-center gap-2 self-start rounded-xl rounded-bl-sm border-2 border-ink bg-white px-3.5 py-2.5 text-[15px]">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            {busy === 'generate' ? 'Reading your CV against the job…' : 'Revising the letter…'}
          </li>
        )}
      </ol>

      <div className="border-t-2 border-ink p-4">
        <div className="flex flex-wrap gap-2" aria-label="Quick changes">
          {QUICK_TWEAKS.map((t) => (
            <button key={t} type="button" className="chip" onClick={() => send(t)} disabled={!!busy || !hasLetter}>
              {t}
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Ask for a change
          </label>
          <textarea
            id={inputId}
            rows={2}
            maxLength={500}
            className="field flex-1 resize-none py-2.5"
            placeholder="Ask for a change, e.g. mention my Figma plugin"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
          />
          <button type="submit" className="btn-blue h-[52px] px-3.5" disabled={!!busy || !draft.trim() || !hasLetter}>
            <SendHorizontal size={18} aria-hidden />
            <span className="sr-only sm:not-sr-only">Revise</span>
          </button>
        </form>
      </div>
    </section>
  );
}

/* --------------------------------- Toolbar --------------------------------- */

function StylePicker({ styleId, referenceStyle, onStyleSelect, onReferenceStyle, onClearReference }) {
  const fileRef = useRef(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');

  const options = [
    ...Object.values(LETTER_STYLES),
    ...(referenceStyle ? [referenceStyle] : []),
  ];

  async function onFile(file) {
    if (!file) return;
    setError('');
    setReading(true);
    try {
      const { typography } = await readPdf(file);
      if (!typography) throw new Error('We couldn’t read any text styling from that PDF. Try one with selectable text.');
      onReferenceStyle(buildReferenceStyle(typography, file.name));
    } catch (err) {
      setError(err.message);
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <fieldset>
        <legend className="sr-only">Letter style</legend>
        <div className="flex flex-wrap items-center gap-2">
          {options.map((opt) => {
            const selected = styleId === opt.id;
            return (
              <label
                key={opt.id}
                title={opt.hint}
                className={`relative inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-2 border-ink px-3 py-2 text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-royal ${
                  selected ? 'bg-ink text-white' : 'bg-white hover:bg-envelope'
                }`}
              >
                <input
                  type="radio"
                  name="letter-style"
                  value={opt.id}
                  checked={selected}
                  onChange={() => onStyleSelect(opt.id)}
                  className="sr-only"
                />
                <span style={{ fontFamily: FONT_STACKS[opt.family] }}>{opt.label}</span>
                {opt.id === 'reference' && (
                  <button
                    type="button"
                    aria-label="Remove reference style"
                    className="-mr-1 rounded p-0.5 hover:bg-white/20"
                    onClick={(e) => {
                      e.preventDefault();
                      onClearReference();
                    }}
                  >
                    <X size={14} aria-hidden />
                  </button>
                )}
              </label>
            );
          })}
          <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={reading}>
            {reading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <FileUp size={16} aria-hidden />}
            {reading ? 'Reading…' : 'Match a reference PDF'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
      </fieldset>
      {referenceStyle && styleId === 'reference' && (
        <p className="mt-2 text-sm text-ink/65">
          Matched from {referenceStyle.source}: {referenceStyle.hint}.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm font-medium">
          <AlertCircle size={16} className="shrink-0 text-stamp" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

function CopyButton({ letter }) {
  const [state, setState] = useState('idle'); // idle | copied | failed
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    const text = letterToPlainText(letter);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers that block the async clipboard API.
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (!ok) {
        setState('failed');
        timer.current = setTimeout(() => setState('idle'), 2500);
        return;
      }
    }
    setState('copied');
    timer.current = setTimeout(() => setState('idle'), 2000);
  }

  return (
    <button type="button" className="btn-plain" onClick={copy} disabled={!letter} aria-live="polite">
      {state === 'copied' ? <Check size={18} className="text-royal" aria-hidden /> : <Copy size={18} aria-hidden />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy blocked' : 'Copy text'}
    </button>
  );
}

function DownloadButton({ letter, style }) {
  const [state, setState] = useState('idle'); // idle | working | done | error
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function download() {
    setState('working');
    try {
      await downloadLetterPdf(letter, style);
      setState('done');
    } catch (err) {
      console.error(err);
      setState('error');
    }
    timer.current = setTimeout(() => setState('idle'), 2200);
  }

  return (
    <button type="button" className="btn-primary" onClick={download} disabled={!letter || state === 'working'}>
      {state === 'working' ? (
        <Loader2 size={18} className="animate-spin" aria-hidden />
      ) : state === 'done' ? (
        <Check size={18} aria-hidden />
      ) : (
        <Download size={18} aria-hidden />
      )}
      {state === 'working' ? 'Preparing PDF…' : state === 'done' ? 'Downloaded' : state === 'error' ? 'PDF failed, try again' : 'Download PDF'}
    </button>
  );
}

/* ---------------------------------- Main ---------------------------------- */

export default function LetterPreview({
  letter,
  onLetterChange,
  busy,
  messages,
  onRefine,
  onRetry,
  versionIndex,
  versionCount,
  onUndo,
  onRedo,
  revealKey,
  styleId,
  referenceStyle,
  onStyleSelect,
  onReferenceStyle,
}) {
  const style =
    styleId === 'reference' && referenceStyle ? referenceStyle : LETTER_STYLES[styleId] || LETTER_STYLES.classic;
  const words = countWords(letter);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(320px,400px)_1fr]">
      <div className="order-2 lg:sticky lg:top-6 lg:order-1">
        <RefineConsole
          messages={messages}
          busy={busy}
          onRefine={onRefine}
          onRetry={onRetry}
          versionIndex={versionIndex}
          versionCount={versionCount}
          onUndo={onUndo}
          onRedo={onRedo}
          hasLetter={!!letter}
        />
      </div>

      <div className="order-1 min-w-0 lg:order-2">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <StylePicker
            styleId={style.id}
            referenceStyle={referenceStyle}
            onStyleSelect={onStyleSelect}
            onReferenceStyle={(s) => {
              onReferenceStyle(s);
              onStyleSelect('reference');
            }}
            onClearReference={() => {
              onReferenceStyle(null);
              onStyleSelect('classic');
            }}
          />
          <div className="flex shrink-0 gap-2">
            <CopyButton letter={letter} />
            <DownloadButton letter={letter} style={style} />
          </div>
        </div>

        {/* The desk: the page sits on fountain-pen blue. */}
        <div className="mt-4 rounded-xl border-2 border-ink bg-royal p-3 shadow-hard sm:p-8">
          <div className={`mx-auto max-w-[760px] transition-opacity ${busy === 'refine' ? 'opacity-60' : ''}`}>
            <div className="shadow-hard-lg ring-2 ring-ink">
              <LetterSheet
                letter={letter}
                style={style}
                onLetterChange={onLetterChange}
                revealKey={revealKey}
                writing={busy === 'generate'}
              />
            </div>
          </div>
          {letter && busy !== 'generate' && (
            <p className="mx-auto mt-4 flex max-w-[760px] flex-wrap items-center justify-between gap-2 text-sm text-white/90">
              <span className="tabular-nums">{words} words in the body</span>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles size={15} aria-hidden />
                Click any line on the page to edit it
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
