import { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Full-screen slide-in page (used for the Exercise Library). Behaves like a
 * pushed navigation page rather than a bottom-sheet modal.
 */
export default function FullPageSheet({ open, onClose, children }: Props) {
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

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col ${closing ? '' : 'animate-page-push-in'}`}
      style={{
        background: '#0a0908',
        transform: closing ? 'translateX(100%)' : undefined,
        transition: closing ? 'transform 0.3s cubic-bezier(0.32,0.72,0,1)' : undefined,
      }}
    >
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        style={{
          paddingTop: 'max(12px, env(safe-area-inset-top, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          WebkitOverflowScrolling: 'touch' as never,
        }}
      >
        {children}
      </div>
    </div>
  );
}
