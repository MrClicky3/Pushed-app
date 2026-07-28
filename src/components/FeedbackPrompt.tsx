import { useEffect, useState } from 'react';
import { firstName } from '../lib/bugReport';

// The once-a-day beta nudge. It floats in the middle of the screen rather than
// dimming everything behind a solid scrim: a strong black gradient pools under
// the card, which is enough to lift it off whatever tab is behind it without
// the heavy, blocking feel of a full modal backdrop.
export default function FeedbackPrompt({
  open, name, onOpen, onDismiss,
}: {
  open: boolean;
  name: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const who = firstName(name);
  const [shown, setShown] = useState(false);

  // Small mount delay so the entrance animation always plays, even when `open`
  // flips true on the very first render.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => setShown(true), 20);
      return () => clearTimeout(t);
    }
    setShown(false);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-6" aria-live="polite">
      {/* Separation, not obstruction — a vertical black gradient that's densest
          around the card and fades toward the edges. Tapping it dismisses. */}
      <div
        className="absolute inset-0"
        onClick={onDismiss}
        style={{
          background:
            'radial-gradient(120% 60% at 50% 50%, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.72) 38%, rgba(0,0,0,0.35) 68%, transparent 100%)',
          opacity: shown ? 1 : 0,
          transition: 'opacity 0.32s ease',
        }}
      />

      <div
        className="relative w-full max-w-[360px]"
        style={{
          transform: shown ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.96)',
          opacity: shown ? 1 : 0,
          transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.34s ease',
        }}
      >
        <div
          className="rounded-te-lg p-5"
          style={{ background: 'var(--te-success)', boxShadow: '0 18px 50px rgba(0,0,0,0.5)' }}
        >
          <div className="flex items-start gap-3">
            <svg
              width="26" height="26" viewBox="0 0 24 24" fill="#08170c"
              className="shrink-0 mt-0.5" style={{ transform: 'rotate(35deg)' }}
            >
              <path d="M10.5 1.875a1.125 1.125 0 0 1 2.25 0v8.219c.517.162 1.02.382 1.5.659V3.375a1.125 1.125 0 0 1 2.25 0v10.937a4.505 4.505 0 0 0-3.25 2.373 8.963 8.963 0 0 1 4-.935A.75.75 0 0 0 18 15v-2.266a3.368 3.368 0 0 1 .988-2.37 1.125 1.125 0 0 1 1.591 1.59 1.118 1.118 0 0 0-.329.79v3.006h-.005a6 6 0 0 1-1.752 4.007l-1.736 1.736a6 6 0 0 1-4.242 1.757H10.5a7.5 7.5 0 0 1-7.5-7.5V6.375a1.125 1.125 0 0 1 2.25 0v5.519c.46-.452.965-.832 1.5-1.141V3.375a1.125 1.125 0 0 1 2.25 0v6.526c.495-.1.997-.151 1.5-.151V1.875Z" />
            </svg>
            <div className="min-w-0">
              <p className="text-[17px] font-semibold tracking-tight leading-tight" style={{ color: '#08170c' }}>
                Got a sec{who ? `, ${who}` : ''}?
              </p>
              <p className="text-[13.5px] mt-1 leading-snug" style={{ color: 'rgba(8,23,12,0.72)' }}>
                You're on the beta – a minute of feedback directly shapes what I build next.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              type="button"
              onClick={onDismiss}
              className="flex-1 rounded-te-md text-[14px] font-semibold tracking-tight py-2.5 transition-colors"
              style={{ color: 'rgba(8,23,12,0.66)', background: 'rgba(8,23,12,0.08)' }}
            >
              Later
            </button>
            <button
              type="button"
              onClick={onOpen}
              className="flex-1 rounded-te-md text-[14px] font-semibold tracking-tight py-2.5 transition-transform active:scale-[0.98]"
              style={{ color: 'var(--te-success)', background: '#08170c' }}
            >
              Sure
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
