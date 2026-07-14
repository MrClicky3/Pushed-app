import { useState, useEffect } from 'react';
import Modal from './Modal';
import { sendBugReport, buildBugReportUrl } from '../lib/bugReport';

// One-step in-app bug report: write it, hit send, it emails the maintainer.
export default function ReportBugSheet({
  open, onClose, context,
}: {
  open: boolean;
  onClose: () => void;
  context?: string;
}) {
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setMessage(''); setHoneypot(''); setStatus('idle'); setError(null); }
  }, [open]);

  const canSend = message.trim().length >= 3 && status !== 'sending';

  async function handleSend() {
    if (honeypot) return;               // bot trap
    if (!canSend) return;
    setStatus('sending'); setError(null);
    try {
      await sendBugReport(message.trim(), context);
      setStatus('sent');
      setTimeout(onClose, 1300);
    } catch (e) {
      setStatus('error');
      setError((e as Error).message);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Report a bug">
      {status === 'sent' ? (
        <div className="flex flex-col items-center text-center py-8 gap-3">
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 52, height: 52, background: 'rgba(59,130,246,0.15)' }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <p className="text-[16px] font-semibold text-[#f4f1ec] tracking-tight">Thanks — sent!</p>
          <p className="text-[13px]" style={{ color: 'rgba(244,241,236,0.45)' }}>
            Every report genuinely helps make this better.
          </p>
        </div>
      ) : (
        <div className="space-y-3 pb-1">
          <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(244,241,236,0.5)' }}>
            Found something off? Tell me what happened — the more detail, the better.
          </p>

          {/* Honeypot */}
          <input
            type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
            value={honeypot} onChange={e => setHoneypot(e.target.value)}
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
          />

          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="What went wrong? What did you expect?"
            rows={5}
            autoFocus
            maxLength={5000}
            className="te-field w-full rounded-xl px-3.5 py-3 text-white text-[15px] placeholder:text-white/25 focus:outline-none resize-none leading-relaxed"
          />

          {status === 'error' && (
            <div className="text-[13px] leading-relaxed" style={{ color: '#ff6b6b' }}>
              {error}{' '}
              <a href={buildBugReportUrl({ context })} className="underline" style={{ color: '#ff8f8f' }}>
                Email it instead
              </a>
            </div>
          )}

          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-[15px] tracking-tight transition-all disabled:opacity-40 active:opacity-85"
            style={{
              background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
              color: '#fff',
              boxShadow: '0 4px 16px rgba(37,99,235,0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
            }}
          >
            {status === 'sending' ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending…
              </>
            ) : 'Send report'}
          </button>
        </div>
      )}
    </Modal>
  );
}
