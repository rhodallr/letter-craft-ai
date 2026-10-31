'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2, PenLine, RotateCcw } from 'lucide-react';
import CvUploader from '@/components/CvUploader';
import JobInput, { effectiveJobText } from '@/components/JobInput';
import LetterPreview from '@/components/LetterPreview';

const STORAGE_KEY = 'lettercraft:v1';
const MIN_CV = 100;
const MIN_JOB = 80;

const STEPS = [
  { n: 1, label: 'Your CV' },
  { n: 2, label: 'The job' },
  { n: 3, label: 'Your letter' },
];

const EMPTY_JOB = { mode: 'text', pasted: '', url: '', fetched: null };

let messageSeq = 0;
const msg = (role, text, extra = {}) => ({ id: `${Date.now()}-${messageSeq++}`, role, text, ...extra });

function today() {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function loadSaved() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(1);
  const [cv, setCv] = useState(null);
  const [notes, setNotes] = useState('');
  const [job, setJob] = useState(EMPTY_JOB);

  const [versions, setVersions] = useState([]);
  const [versionIndex, setVersionIndex] = useState(-1);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(null); // 'generate' | 'refine' | null
  const [revealKey, setRevealKey] = useState(0);
  const [lastAction, setLastAction] = useState(null);

  const [styleId, setStyleId] = useState('classic');
  const [referenceStyle, setReferenceStyle] = useState(null);

  const topRef = useRef(null);
  const letter = versions[versionIndex] || null;
  const jobText = effectiveJobText(job);
  const cvReady = (cv?.text?.trim().length || 0) >= MIN_CV;
  const jobReady = jobText.length >= MIN_JOB;

  /* ----------------------------- Persistence ----------------------------- */

  useEffect(() => {
    const saved = loadSaved();
    if (saved) {
      setCv(saved.cv ?? null);
      setNotes(saved.notes ?? '');
      setJob({ ...EMPTY_JOB, ...(saved.job || {}) });
      setStyleId(saved.styleId || 'classic');
      setReferenceStyle(saved.referenceStyle ?? null);
      if (Array.isArray(saved.versions) && saved.versions.length) {
        setVersions(saved.versions);
        setVersionIndex(Math.min(saved.versionIndex ?? saved.versions.length - 1, saved.versions.length - 1));
        setMessages(Array.isArray(saved.messages) ? saved.messages : []);
        setStep(3);
      } else if (saved.cv?.text) {
        setStep(saved.step === 2 ? 2 : 1);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            step,
            cv,
            notes,
            job,
            styleId,
            referenceStyle,
            versions: versions.slice(-20),
            versionIndex: Math.min(versionIndex, 19),
            messages: messages.slice(-30),
          })
        );
      } catch {
        // Storage full or blocked (private mode). The app still works without it.
      }
    }, 400);
    return () => clearTimeout(t);
  }, [hydrated, step, cv, notes, job, styleId, referenceStyle, versions, versionIndex, messages]);

  /* ------------------------------ Navigation ------------------------------ */

  const goTo = useCallback((n) => {
    setStep(n);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);

  const canVisit = (n) => n === 1 || (n === 2 && cvReady) || (n === 3 && versions.length > 0);

  /* ------------------------------ AI actions ------------------------------ */

  async function callApi(payload) {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.error || 'Something went wrong. Try again.');
      error.details = Array.isArray(data.details) ? data.details : [];
      throw error;
    }
    return data;
  }

  function pushVersion(next) {
    setVersions((prev) => {
      const kept = prev.slice(0, versionIndex + 1);
      const updated = [...kept, next].slice(-20);
      setVersionIndex(updated.length - 1);
      return updated;
    });
  }

  async function generate() {
    if (busy || !cvReady || !jobReady) return;
    setLastAction({ type: 'generate' });
    setBusy('generate');
    goTo(3);
    try {
      const data = await callApi({ mode: 'generate', cvText: cv.text, notes, jobText });
      const fresh = { ...data.letter, date: today() };
      setVersions((prev) => {
        const updated = [...prev, fresh].slice(-20);
        setVersionIndex(updated.length - 1);
        return updated;
      });
      setRevealKey((k) => k + 1);
      setMessages((prev) => [
        ...prev,
        msg('assistant', data.changes || 'Here’s your first draft, matched to the job.', {
          matches: data.matches,
          gaps: data.gaps,
        }),
      ]);
    } catch (err) {
      setMessages((prev) => [...prev, msg('error', err.message, { details: err.details })]);
    } finally {
      setBusy(null);
    }
  }

  async function refine(instruction) {
    if (busy || !letter) return;
    setLastAction({ type: 'refine', instruction });
    const history = messages.filter((m) => m.role === 'user').map((m) => m.text).slice(-6);
    setMessages((prev) => [...prev, msg('user', instruction)]);
    setBusy('refine');
    try {
      const { date, ...current } = letter;
      const data = await callApi({ mode: 'refine', cvText: cv.text, notes, jobText, letter: current, instruction, history });
      pushVersion({ ...data.letter, date: date || today() });
      setMessages((prev) => [...prev, msg('assistant', data.changes || 'Done. The page shows the new version.')]);
    } catch (err) {
      setMessages((prev) => [...prev, msg('error', err.message, { details: err.details })]);
    } finally {
      setBusy(null);
    }
  }

  function retry() {
    if (!lastAction) return;
    if (lastAction.type === 'generate') generate();
    else {
      // Drop the user message that failed so it isn't duplicated.
      setMessages((prev) => {
        const i = prev.map((m) => m.role).lastIndexOf('user');
        return i === -1 ? prev : prev.slice(0, i);
      });
      refine(lastAction.instruction);
    }
  }

  function editLetter(next) {
    setVersions((prev) => prev.map((v, i) => (i === versionIndex ? next : v)));
  }

  function startOver() {
    if (!window.confirm('Clear your CV, notes, job and letters from this browser?')) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setCv(null);
    setNotes('');
    setJob(EMPTY_JOB);
    setVersions([]);
    setVersionIndex(-1);
    setMessages([]);
    setStyleId('classic');
    setReferenceStyle(null);
    setLastAction(null);
    goTo(1);
  }

  /* -------------------------------- Render -------------------------------- */

  return (
    <div className="flex min-h-screen flex-col">
      <div className="airmail" aria-hidden />

      <header ref={topRef} className="border-b-2 border-ink bg-white">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-4 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <a href="/" className="flex items-center gap-2.5 self-start rounded-md" aria-label="LetterCraft AI home">
            <span className="grid h-10 w-10 place-items-center rounded-lg border-2 border-ink bg-stamp shadow-hard-sm">
              <PenLine size={20} strokeWidth={2.5} aria-hidden />
            </span>
            <span className="text-[26px] font-black leading-none tracking-[-0.04em]">
              LetterCraft<span className="text-royal"> AI</span>
            </span>
          </a>

          <nav aria-label="Progress">
            <ol className="flex items-center gap-1.5 sm:gap-2">
              {STEPS.map((s, i) => {
                const current = step === s.n;
                const done = s.n < step || (s.n === 3 && versions.length > 0 && step !== 3);
                const enabled = canVisit(s.n) && !busy;
                return (
                  <li key={s.n} className="flex items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => enabled && goTo(s.n)}
                      disabled={!enabled && !current}
                      aria-current={current ? 'step' : undefined}
                      className={`inline-flex items-center gap-2 rounded-full border-2 border-ink py-1.5 pl-1.5 pr-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
                        current ? 'bg-ink text-white' : enabled ? 'bg-white hover:bg-envelope' : 'bg-white text-ink/45'
                      }`}
                    >
                      <span
                        className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${
                          current ? 'bg-marker text-ink' : done ? 'bg-royal text-white' : 'bg-envelope'
                        }`}
                      >
                        {done && !current ? <Check size={14} strokeWidth={3} aria-hidden /> : s.n}
                      </span>
                      <span className={current ? '' : 'hidden sm:inline'}>{s.label}</span>
                    </button>
                    {i < STEPS.length - 1 && <span aria-hidden className="h-0.5 w-3 bg-ink sm:w-5" />}
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        {step === 1 && (
          <>
            <div className="mb-8 max-w-3xl">
              <h1 className="text-[clamp(2.1rem,5.2vw,3.9rem)] font-black leading-[0.98] tracking-[-0.035em]">
                Cover letters that read like you wrote them for this job.
              </h1>
              <p className="mt-4 max-w-xl text-lg text-ink/75">
                Add your CV and the advert. You get a specific, three-to-four paragraph letter built from your real
                experience, then refine it and download a clean PDF.
              </p>
            </div>
            <CvUploader cv={cv} onCvChange={setCv} notes={notes} onNotesChange={setNotes} />
            <div className="mt-8 flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-center sm:justify-end">
              {!cvReady && <p className="text-sm text-ink/60">Add your CV to continue.</p>}
              <button type="button" className="btn-blue px-6 py-3.5 text-base" disabled={!cvReady} onClick={() => goTo(2)}>
                Continue to the job
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="mb-6 text-[clamp(1.8rem,3.6vw,2.7rem)] font-black leading-none tracking-[-0.03em]">
              Which job is this letter for?
            </h1>
            <JobInput job={job} onJobChange={setJob} />
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" className="btn-plain self-start" onClick={() => goTo(1)}>
                <ArrowLeft size={18} aria-hidden />
                Back to your CV
              </button>
              <div className="flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-center">
                {!jobReady && <p className="text-sm text-ink/60">Add the job description to continue.</p>}
                <button
                  type="button"
                  className="btn-primary px-7 py-4 text-lg"
                  disabled={!jobReady || !!busy}
                  onClick={generate}
                >
                  {busy === 'generate' ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <PenLine size={20} aria-hidden />}
                  Write my letter
                </button>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <h1 className="text-[clamp(1.8rem,3.6vw,2.7rem)] font-black leading-none tracking-[-0.03em]">
                Your letter
              </h1>
              <div className="flex gap-2">
                <button type="button" className="btn-plain py-2 text-sm" onClick={() => goTo(2)} disabled={!!busy}>
                  <ArrowLeft size={16} aria-hidden />
                  Change the job
                </button>
                <button
                  type="button"
                  className="btn-plain py-2 text-sm"
                  onClick={generate}
                  disabled={!!busy || !cvReady || !jobReady}
                >
                  <RotateCcw size={16} aria-hidden />
                  Write a fresh draft
                </button>
              </div>
            </div>
            <LetterPreview
              letter={letter}
              onLetterChange={editLetter}
              busy={busy}
              messages={messages}
              onRefine={refine}
              onRetry={retry}
              versionIndex={versionIndex}
              versionCount={versions.length}
              onUndo={() => setVersionIndex((i) => Math.max(0, i - 1))}
              onRedo={() => setVersionIndex((i) => Math.min(versions.length - 1, i + 1))}
              revealKey={revealKey}
              styleId={styleId}
              referenceStyle={referenceStyle}
              onStyleSelect={setStyleId}
              onReferenceStyle={setReferenceStyle}
            />
          </>
        )}
      </main>

      <footer className="border-t-2 border-ink bg-white">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-2 px-4 py-4 text-sm text-ink/70 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Your CV is saved in this browser only. Its text is sent to the AI when you write or revise a letter.</p>
          <button type="button" className="btn-ghost self-start sm:self-auto" onClick={startOver} disabled={!!busy}>
            <RotateCcw size={15} aria-hidden />
            Start over
          </button>
        </div>
      </footer>
    </div>
  );
}
