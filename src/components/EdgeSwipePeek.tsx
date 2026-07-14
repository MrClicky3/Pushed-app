import { useState, useRef } from 'react';
import Avatar from './Avatar';

const EDGE_ZONE = 24;     // px from the right screen edge that starts the gesture
const THRESHOLD = 130;    // px dragged left to arm — commits to opening the profile on release
const MAX_DRAG = 190;     // px — hard cap; drag beyond THRESHOLD adds a little extra "pull" feedback

// A thin invisible strip along the right edge. Dragging left from it reveals
// a black gradient with the user's avatar + "Profile" label that grows and
// brightens as you pull; crossing the threshold "arms" it (haptic tick, a
// little spring pop) and releasing there opens the full-screen profile page.
export default function EdgeSwipePeek({
  name, avatarUrl, onComplete,
}: {
  name: string;
  avatarUrl?: string | null;
  onComplete: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [committed, setCommitted] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const active = useRef(false);
  const wasArmed = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    active.current = true;
    wasArmed.current = false;
    setSnapping(false);
    setCommitted(false);
    setDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!active.current) return;
    const deltaX = startX.current - e.touches[0].clientX; // positive = dragging left
    const deltaY = Math.abs(e.touches[0].clientY - startY.current);
    if (deltaY > deltaX + 12) { active.current = false; setDragging(false); setDx(0); return; }
    const clamped = Math.max(0, Math.min(MAX_DRAG, deltaX));
    setDx(clamped);

    const armed = clamped >= THRESHOLD;
    if (armed && !wasArmed.current && 'vibrate' in navigator) navigator.vibrate(8);
    wasArmed.current = armed;
  }

  function onTouchEnd() {
    if (!active.current) { setDragging(false); return; }
    active.current = false;
    if (dx >= THRESHOLD) {
      if ('vibrate' in navigator) navigator.vibrate(16);
      setCommitted(true);
      onComplete();
      // No retract animation — the incoming full-screen page covers this
      // panel within the same frame, so snapping it back first just adds
      // a competing, unnecessary motion.
      setDragging(false);
      setDx(0);
    } else {
      setSnapping(true);
      setDx(0);
      setTimeout(() => setDragging(false), 260);
    }
  }

  const progress = Math.min(1, dx / THRESHOLD);
  const overpull = Math.max(0, Math.min(1, (dx - THRESHOLD) / (MAX_DRAG - THRESHOLD)));
  const armed = dx >= THRESHOLD;
  const scale = committed ? 1.16 : armed ? 1.08 + overpull * 0.06 : 0.94 + progress * 0.06;

  return (
    <>
      {/* Touch-capture strip — invisible, right screen edge only */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="fixed top-0 bottom-0 right-0 z-40"
        style={{ width: EDGE_ZONE, touchAction: 'none' }}
      />

      {/* Peek panel */}
      {dragging && (
        <div
          className="fixed top-0 bottom-0 right-0 z-40 flex items-center justify-end pointer-events-none"
          style={{
            width: MAX_DRAG + 40,
            transform: `translateX(${(1 - progress) * 100}%)`,
            transition: snapping ? 'transform 0.32s cubic-bezier(0.22,1,0.36,1)' : 'none',
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: armed
                ? 'linear-gradient(to left, rgba(20,10,4,0.97) 50%, transparent 100%)'
                : 'linear-gradient(to left, rgba(0,0,0,0.92) 45%, transparent 100%)',
              opacity: Math.max(0.15, progress),
              transition: 'background 0.15s ease',
            }}
          />
          <div
            className="relative flex flex-col items-center gap-2 shrink-0"
            style={{
              paddingRight: 28,
              opacity: progress,
              transform: `scale(${scale})`,
              transition: snapping ? 'transform 0.32s cubic-bezier(0.34,1.56,0.64,1)' : 'transform 0.12s ease-out',
            }}
          >
            <Avatar name={name} avatarUrl={avatarUrl} size={52} />
            <span className="te-label" style={{ color: armed ? '#f4f1ec' : 'rgba(244,241,236,0.7)', transition: 'color 0.15s ease' }}>
              {armed ? 'Release' : 'Profile'}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
