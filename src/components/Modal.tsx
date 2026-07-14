import { useEffect, useRef, useCallback, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
  noPadTop?: boolean;
  noPadBottom?: boolean;
}

const DISMISS_THRESHOLD = 160;
const VELOCITY_THRESHOLD = 900;
const START_THRESHOLD = 6;

export default function Modal({ open, onClose, title, children, onBack, noPadTop, noPadBottom }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    startY: number;
    startTime: number;
    dragging: boolean;
    fromHandle: boolean;
  } | null>(null);
  const draggingRef = useRef(false);
  const [offsetY, setOffsetY] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setDismissing(false);
      setOffsetY(0);
    } else if (visible && !dismissing) {
      setDismissing(true);
      setTimeout(() => {
        setVisible(false);
        setDismissing(false);
        setOffsetY(0);
      }, 280);
    }
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = visible ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [visible]);

  const dismiss = useCallback(() => {
    setDismissing(true);
    setTimeout(() => {
      setVisible(false);
      setDismissing(false);
      setOffsetY(0);
      onClose();
    }, 280);
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, dismiss]);

  // ── Left-edge swipe to go back ───────────────────────────────────────────
  useEffect(() => {
    if (!visible || !onBack) return;
    let startX = 0;
    let startY = 0;
    let eligible = false;

    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      eligible = startX < 28;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!eligible) return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = Math.abs(e.changedTouches[0].clientY - startY);
      if (dx > 70 && dy < 80) onBack();
      eligible = false;
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [visible, onBack]);

  // ── Drag-to-dismiss ───────────────────────────────────────────────────────
  // A single pointer-driven gesture translates the whole sheet 1:1 with the
  // finger (iOS-style). A non-passive touchmove listener cancels native
  // scrolling only while we're actively dragging, so the content never fights
  // the sheet transform. Nothing dismisses until the pointer is released.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || !visible) return;
    const onTouchMove = (e: TouchEvent) => { if (draggingRef.current) e.preventDefault(); };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [visible]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, [data-no-drag]')) return;
    const fromHandle = !!target.closest('[data-drag-handle]');
    if (target.closest('button') && !fromHandle) return;
    drag.current = {
      startY: e.clientY,
      startTime: Date.now(),
      dragging: false,
      fromHandle,
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const s = drag.current;
    if (!s) return;
    const dy = e.clientY - s.startY;

    if (!s.dragging) {
      if (dy < START_THRESHOLD) {
        if (dy < -START_THRESHOLD) drag.current = null; // upward → let content scroll
        return;
      }
      const atTop = (contentRef.current?.scrollTop ?? 0) <= 0;
      if (!atTop && !s.fromHandle) { drag.current = null; return; }
      s.dragging = true;
      s.startY = e.clientY;
      s.startTime = Date.now();
      draggingRef.current = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }

    setOffsetY(Math.max(0, e.clientY - s.startY));
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const s = drag.current;
    draggingRef.current = false;
    if (!s || !s.dragging) { drag.current = null; return; }

    const dy = e.clientY - s.startY;
    const dt = (Date.now() - s.startTime) / 1000;
    const velocity = dt > 0 ? dy / dt : 0;

    if (dy > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) dismiss();
    else setOffsetY(0);

    drag.current = null;
  }, [dismiss]);

  if (!visible) return null;

  const backdropOpacity = dismissing
    ? 0
    : offsetY > 0
      ? Math.max(0, 1 - offsetY / 400)
      : 1;

  const isDragging = offsetY > 0;
  const sheetTransform = dismissing ? 'translateY(105%)' : `translateY(${offsetY}px)`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        paddingLeft: 'max(2px, env(safe-area-inset-left))',
        paddingRight: 'max(2px, env(safe-area-inset-right))',
        paddingBottom: 'max(2px, env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div
        className={`absolute inset-0 bg-black/50 ${!dismissing && !isDragging ? 'animate-fade-in' : ''}`}
        style={{ opacity: backdropOpacity, transition: isDragging ? 'none' : 'opacity 0.3s ease' }}
        onClick={dismiss}
      />
      <div
        ref={sheetRef}
        className={`relative w-full max-w-lg rounded-[28px] z-10 flex flex-col ${!dismissing && !isDragging ? 'animate-slide-up' : ''}`}
        style={{
          maxHeight: '90dvh',
          transform: sheetTransform,
          transition: isDragging ? 'none' : 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
          background: '#161617',
          boxShadow: '0 2px 34px rgba(0,0,0,0.55)',
        }}
        onClick={e => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div data-drag-handle className="relative flex justify-center shrink-0 cursor-grab active:cursor-grabbing touch-none" style={{ height: 26 }}>
          <div className="absolute w-9 h-[4px] rounded-full bg-white/25" style={{ top: 6 }} />
        </div>
        {title && (
          <div className="flex items-center justify-between pl-[max(19px,env(safe-area-inset-left))] pr-[max(19px,env(safe-area-inset-right))] pt-1 pb-0.5 shrink-0">
            <h2 className="text-[16px] font-semibold text-white tracking-tight">{title}</h2>
          </div>
        )}
        <div
          ref={contentRef}
          className={`pl-[max(19px,env(safe-area-inset-left))] pr-[max(19px,env(safe-area-inset-right))] ${noPadTop ? 'pt-0' : 'pt-2.5'} ${noPadBottom ? 'pb-0' : 'pb-5'} overflow-y-auto overscroll-contain`}
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
