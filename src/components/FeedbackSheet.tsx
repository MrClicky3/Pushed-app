import { useState, useEffect } from 'react';
import Modal from './Modal';
import { sendBugReport, buildFeedbackUrl, firstName } from '../lib/bugReport';

const FEEDBACK_SENT_KEY = 'feedback_sent_date';

const RATINGS = [
  { value: 'Love it', emoji: '😍' },
  { value: 'Good', emoji: '🙂' },
  { value: 'Okay', emoji: '😐' },
  { value: 'Needs work', emoji: '🙁' },
] as const;

type Rating = typeof RATINGS[number]['value'];

const TOTAL_STEPS = 3;

function alreadySentToday(): boolean {
  try {
    const last = localStorage.getItem(FEEDBACK_SENT_KEY);
    return !!last && last === new Date().toISOString().slice(0, 10);
  } catch { return false; }
}

function markSentToday() {
  try { localStorage.setItem(FEEDBACK_SENT_KEY, new Date().toISOString().slice(0, 10)); } catch { /* ignore */ }
}

// Segmented progress meter — three interrupted pills, mirroring the level meter
// on the Progress page. The active step's pill fills from the left; completed
// pills stay full. The very first step already reads a third full, so the form
// feels underway from the first tap rather than empty.
function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5" style={{ height: 4 }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const filled = i <= step;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 9999,
              background: 'var(--te-surface-4, rgba(255,255,255,0.10))',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: filled ? '100%' : '0%',
                borderRadius: 9999,
                background: 'var(--te-success)',
                transition: 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
                // Stagger so the fill of a newly-reached pill lands just after
                // the slide, which reads as one continuous motion.
                transitionDelay: filled ? `${i * 40}ms` : '0ms',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function FeedbackSheet({
  open, onClose, context, name,
}: {
  open: boolean;
  onClose: () => void;
  context?: string;
  name?: string;
}) {
  const who = firstName(name);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<'next' | 'back'>('next');
  const [rating, setRating] = useState<Rating | null>(null);
  const [improve, setImprove] = useState('');
  const [anythingElse, setAnythingElse] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error' | 'already'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(0); setDir('next');
      setRating(null); setImprove(''); setAnythingElse('');
      setHoneypot(''); setError(null);
      setStatus(alreadySentToday() ? 'already' : 'idle');
    }
  }, [open]);

  // Each step unlocks the next only once it's answered. The last step is
  // optional, so it's always "complete" for the purpose of sending.
  const stepComplete = step === 0 ? !!rating
    : step === 1 ? improve.trim().length >= 3
    : true;

  function goNext() {
    if (!stepComplete) return;
    if (step < TOTAL_STEPS - 1) { setDir('next'); setStep(s => s + 1); }
    else handleSend();
  }
  function goBack() {
    if (step === 0) return;
    setDir('back'); setStep(s => s - 1);
  }

  function buildMessage(): string {
    const chosen = RATINGS.find(r => r.value === rating);
    return [
      `How's the app treating you so far?  ${chosen?.emoji ?? ''} ${rating ?? '-'}`,
      '',
      'What should I fix first?',
      improve.trim(),
      ...(anythingElse.trim()
        ? ['', 'Anything else on your mind?', anythingElse.trim()]
        : []),
    ].join('\n');
  }

  async function handleSend() {
    if (honeypot) return;
    setStatus('sending'); setError(null);
    try {
      await sendBugReport(buildMessage(), context, 'feedback', honeypot);
      markSentToday();
      setStatus('sent');
      setTimeout(onClose, 1800);
    } catch (e) {
      setStatus('error');
      setError((e as Error).message);
    }
  }

  const sending = status === 'sending';
  const isLast = step === TOTAL_STEPS - 1;

  return (
    <Modal open={open} onClose={onClose} title="Send feedback" noPadBottom>
      {status === 'already' || status === 'sent' ? (
        <div
          className="flex flex-col items-center text-center gap-3"
          style={{ paddingTop: 36, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 36px)' }}
        >
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 52, height: 52, background: 'color-mix(in srgb, var(--te-success) 15%, transparent)' }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--te-success)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <p className="text-[17px] font-semibold te-t1 tracking-tight">
            {status === 'sent' ? `Thank you${who ? `, ${who}` : ''}!` : 'Already sent today!'}
          </p>
          <p className="text-[13px] leading-relaxed px-6" style={{ color: 'var(--te-text-3)' }}>
            {status === 'sent'
              ? 'That landed in my inbox. You can send new feedback again tomorrow.'
              : 'You can send new feedback again tomorrow. Thanks for taking the time.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
          <StepBar step={step} />

          {/* Honeypot */}
          <input
            type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
            value={honeypot} onChange={e => setHoneypot(e.target.value)}
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
          />

          {/* Steps — only the current one is mounted, keyed so it re-animates
              its glide on every change. */}
          <div key={step} className={`mt-6 ${dir === 'next' ? 'animate-step-next' : 'animate-step-back'}`}>
            {step === 0 && (
              <div>
                <p className="text-[19px] font-semibold te-t1 tracking-tight leading-snug">
                  {who ? `Hey ${who}, how's` : "How's"} Pushed treating you so far?
                </p>
                <p className="text-[13.5px] mt-1.5 mb-5 leading-relaxed" style={{ color: 'var(--te-text-3)' }}>
                  You're one of the first to use it – your honest read counts for a lot.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {RATINGS.map(r => {
                    const active = rating === r.value;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => { setRating(r.value); }}
                        aria-pressed={active}
                        className={`flex items-center gap-2 px-3 py-3.5 rounded-te-sm text-[14px] font-medium tracking-tight transition-colors ${
                          active ? 'te-white-btn' : 'te-field te-t1 active:bg-white/[0.06]'
                        }`}
                      >
                        <span style={{ fontSize: 17, lineHeight: 1 }}>{r.emoji}</span>
                        {r.value}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <p className="text-[19px] font-semibold te-t1 tracking-tight leading-snug">
                  What should I fix first?
                </p>
                <p className="text-[13.5px] mt-1.5 mb-5 leading-relaxed" style={{ color: 'var(--te-text-3)' }}>
                  Be blunt – the annoying stuff is the useful stuff.
                </p>
                <textarea
                  value={improve}
                  onChange={e => setImprove(e.target.value)}
                  placeholder="Whatever got in the way, or just felt clunky…"
                  rows={5}
                  autoFocus
                  maxLength={5000}
                  className="te-field w-full rounded-te-sm px-3.5 py-3 te-t1 text-[15px] placeholder:text-white/25 focus:outline-none resize-none leading-relaxed"
                />
              </div>
            )}

            {step === 2 && (
              <div>
                <p className="text-[19px] font-semibold te-t1 tracking-tight leading-snug">
                  Anything else on your mind?
                </p>
                <p className="text-[13.5px] mt-1.5 mb-5 leading-relaxed" style={{ color: 'var(--te-text-3)' }}>
                  Bugs, ideas, something you loved. Totally optional.
                </p>
                <textarea
                  value={anythingElse}
                  onChange={e => setAnythingElse(e.target.value)}
                  placeholder="No pressure – anything at all"
                  rows={4}
                  autoFocus
                  maxLength={5000}
                  className="te-field w-full rounded-te-sm px-3.5 py-3 te-t1 text-[15px] placeholder:text-white/25 focus:outline-none resize-none leading-relaxed"
                />
              </div>
            )}
          </div>

          {status === 'error' && (
            <div className="text-[13px] leading-relaxed mt-4" style={{ color: 'var(--te-danger)' }}>
              {error}{' '}
              <a
                href={buildFeedbackUrl(buildMessage(), context)}
                className="underline"
                style={{ color: 'var(--te-danger)' }}
              >
                Email it instead
              </a>
            </div>
          )}

          {/* Controls — Back appears from step 2 on; the primary button reads
              Next until the final step, then Send. */}
          <div className="flex items-center gap-2.5 mt-7">
            {step > 0 && (
              <button
                type="button"
                onClick={goBack}
                disabled={sending}
                className="te-field te-t1 flex items-center justify-center rounded-te-md px-4 shrink-0 active:bg-white/[0.06] transition-colors disabled:opacity-40"
                style={{ height: 52 }}
                aria-label="Back"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={goNext}
              disabled={!stepComplete || sending}
              className="te-white-btn flex-1 flex items-center justify-center gap-2 rounded-te-md font-semibold text-[15px] tracking-tight disabled:opacity-40 transition-opacity"
              style={{ height: 52 }}
            >
              {sending ? (
                <>
                  <span className="w-4 h-4 border-2 border-black/20 border-t-black/70 rounded-full animate-spin" />
                  Sending…
                </>
              ) : isLast ? 'Send feedback' : 'Next'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
