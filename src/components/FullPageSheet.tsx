import { useEffect, useState } from 'react';
import { ChevronLeftIcon } from '@heroicons/react/24/outline';

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Shows a top nav bar with this title. Pass "" for a bar with just a back button. */
  title?: string;
  /** If set, the back button goes here (a sub-page); otherwise it calls onClose. */
  onBack?: () => void;
  /** Adds horizontal + vertical content padding (for text pages like Settings). */
  padded?: boolean;
}

/**
 * Full-screen slide-in page (used for the Exercise Library and Settings).
 * Behaves like a pushed navigation page rather than a bottom-sheet modal.
 * Pass `title`/`onBack` to render a native-style top bar with a back button.
 */
export default function FullPageSheet({ open, onClose, children, title, onBack, padded }: Props) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      setClosing(true);
      const t = setTimeout(() => { setVisible(false); setClosing(false); }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = visible ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [visible, onClose]);

  if (!visible) return null;

  const showHeader = title !== undefined || !!onBack;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col ${closing ? '' : 'animate-page-push-in'}`}
      style={{
        background: '#0a0908',
        transform: closing ? 'translateX(100%)' : undefined,
        transition: closing ? 'transform 0.3s cubic-bezier(0.32,0.72,0,1)' : undefined,
      }}
    >
      {showHeader && (
        <div
          className="shrink-0 flex items-center gap-1 pl-[max(10px,env(safe-area-inset-left))] pr-[max(19px,env(safe-area-inset-right))]"
          style={{ paddingTop: 'calc(max(12px, env(safe-area-inset-top, 0px)) + 6px)', paddingBottom: 10 }}
        >
          <button
            onClick={onBack ?? onClose}
            className="flex items-center justify-center shrink-0 active:opacity-60 transition-opacity"
            style={{ width: 40, height: 40 }}
            aria-label={onBack ? 'Back' : 'Close'}
          >
            <ChevronLeftIcon className="w-6 h-6 text-white/70" />
          </button>
          {title && <h2 className="text-[17px] font-semibold text-[#f4f1ec] tracking-tight">{title}</h2>}
        </div>
      )}

      <div
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${padded ? 'pl-[max(19px,env(safe-area-inset-left))] pr-[max(19px,env(safe-area-inset-right))] pt-1 pb-8' : ''}`}
        style={{
          paddingTop: showHeader ? undefined : 'max(12px, env(safe-area-inset-top, 0px))',
          paddingBottom: padded ? undefined : 'env(safe-area-inset-bottom, 0px)',
          WebkitOverflowScrolling: 'touch' as never,
        }}
      >
        {children}
      </div>
    </div>
  );
}
