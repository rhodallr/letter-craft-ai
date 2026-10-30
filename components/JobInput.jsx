'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Link2, Loader2, TextCursorInput } from 'lucide-react';

const JOB_MAX = 20000;

const TABS = [
  { id: 'text', label: 'Paste the description', icon: TextCursorInput },
  { id: 'url', label: 'Use a link', icon: Link2 },
];

function useAutoGrow(value) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = Math.max(320, window.innerHeight * 0.7);
    el.style.height = `${Math.min(el.scrollHeight + 4, max)}px`;
    el.style.overflowY = el.scrollHeight + 4 > max ? 'auto' : 'hidden';
  }, [value]);
  return ref;
}

function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export default function JobInput({ job, onJobChange }) {
  const baseId = useId();
  const tabRefs = useRef([]);
  const [fetchState, setFetchState] = useState({ status: 'idle', error: '' });
  const pastedRef = useAutoGrow(job.pasted);
  const fetchedRef = useAutoGrow(job.fetched?.text || '');

  const update = (patch) => onJobChange({ ...job, ...patch });

  function onTabKey(e, index) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length;
    if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = TABS.length - 1;
    update({ mode: TABS[next].id });
    tabRefs.current[next]?.focus();
  }

  async function fetchJob(e) {
    e.preventDefault();
    if (!job.url.trim()) return;
    setFetchState({ status: 'loading', error: '' });
    try {
      const res = await fetch('/api/extract-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: job.url.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That page couldn’t be read. Paste the description instead.');
      update({ fetched: data });
      setFetchState({ status: 'idle', error: '' });
    } catch (err) {
      setFetchState({ status: 'idle', error: err.message });
    }
  }

  const host = (() => {
    try {
      return new URL(job.fetched?.url || '').hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();

  return (
    <section className="panel p-5 sm:p-6" aria-labelledby={`${baseId}-title`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id={`${baseId}-title`} className="text-xl font-extrabold tracking-tight">
            The job
          </h2>
          <p className="mt-1 text-[15px] text-ink/70">The fuller the description, the closer the match.</p>
        </div>

        <div role="tablist" aria-label="How to add the job" className="inline-flex rounded-lg border-2 border-ink bg-envelope p-1">
          {TABS.map((tab, i) => {
            const Icon = tab.icon;
            const selected = job.mode === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => (tabRefs.current[i] = el)}
                id={`${baseId}-tab-${tab.id}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onKeyDown={(e) => onTabKey(e, i)}
                onClick={() => update({ mode: tab.id })}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                  selected ? 'bg-ink text-white' : 'text-ink hover:bg-white'
                }`}
              >
                <Icon size={16} aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {job.mode === 'text' ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-text`}
          aria-labelledby={`${baseId}-tab-text`}
          className="mt-5"
        >
          <label htmlFor={`${baseId}-pasted`} className="sr-only">
            Job description
          </label>
          <textarea
            ref={pastedRef}
            id={`${baseId}-pasted`}
            className="field min-h-[320px] resize-none"
            placeholder="Paste the whole advert: the role summary, responsibilities, requirements and anything about the company."
            value={job.pasted}
            maxLength={JOB_MAX}
            onChange={(e) => update({ pasted: e.target.value })}
          />
          <p className="mt-2 text-right text-sm tabular-nums text-ink/60">{wordCount(job.pasted).toLocaleString('en-GB')} words</p>
        </div>
      ) : (
        <div role="tabpanel" id={`${baseId}-panel-url`} aria-labelledby={`${baseId}-tab-url`} className="mt-5">
          <form onSubmit={fetchJob} className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor={`${baseId}-url`} className="sr-only">
              Link to the job advert
            </label>
            <input
              id={`${baseId}-url`}
              type="url"
              inputMode="url"
              autoComplete="url"
              className="field flex-1"
              placeholder="https://company.com/careers/product-designer"
              value={job.url}
              onChange={(e) => update({ url: e.target.value })}
            />
            <button type="submit" className="btn-blue shrink-0" disabled={!job.url.trim() || fetchState.status === 'loading'}>
              {fetchState.status === 'loading' ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Link2 size={18} aria-hidden />}
              {fetchState.status === 'loading' ? 'Reading the advert…' : 'Read the advert'}
            </button>
          </form>
          <p className="mt-2 text-sm text-ink/60">
            Works with most company career pages and job boards. Sites that need you to sign in, like LinkedIn, can’t be read.
          </p>

          {fetchState.error && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border-2 border-ink bg-[#FFE4DE] p-3 text-sm font-medium">
              <AlertCircle size={18} className="mt-px shrink-0 text-stamp" aria-hidden />
              <span>
                {fetchState.error}{' '}
                <button type="button" className="font-bold underline underline-offset-2" onClick={() => update({ mode: 'text' })}>
                  Paste it instead
                </button>
              </span>
            </p>
          )}

          {job.fetched?.text && (
            <div className="mt-5">
              <p className="flex items-start gap-2 text-[15px]" role="status">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-royal" aria-hidden />
                <span>
                  Read from <strong>{host || 'the page'}</strong>
                  {job.fetched.title ? (
                    <>
                      : {job.fetched.title}
                      {job.fetched.company ? ` at ${job.fetched.company}` : ''}
                    </>
                  ) : null}
                  .{' '}
                  {job.fetched.method === 'page'
                    ? 'We read the whole page, so trim anything that isn’t part of the job.'
                    : 'Check it over; you can edit it.'}
                </span>
              </p>
              <label htmlFor={`${baseId}-fetched`} className="sr-only">
                Job description read from the link
              </label>
              <textarea
                ref={fetchedRef}
                id={`${baseId}-fetched`}
                className="field mt-3 min-h-[320px] resize-none"
                value={job.fetched.text}
                maxLength={JOB_MAX}
                onChange={(e) => update({ fetched: { ...job.fetched, text: e.target.value } })}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** The job text that will be sent for generation. */
export function effectiveJobText(job) {
  return (job.mode === 'url' ? job.fetched?.text : job.pasted)?.trim() || '';
}
