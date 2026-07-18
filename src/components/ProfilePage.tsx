import { useState, useEffect, useRef } from 'react';
import {
  Cog6ToothIcon, ChevronRightIcon, ChevronLeftIcon, CameraIcon, PhotoIcon,
} from '@heroicons/react/24/outline';
import Modal from './Modal';
import Avatar, { AVATAR_PRESETS, presetKeyOf } from './Avatar';
import type { Profile } from '../types';
import type { useProfile } from '../hooks/useProfile';
import ReportBugSheet from './ReportBugSheet';

type ProfileApi = ReturnType<typeof useProfile>;

interface Props {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  onOpenSettings: () => void;
  setAvatar: ProfileApi['setAvatar'];
  uploadAvatarFile: ProfileApi['uploadAvatarFile'];
  updateBio: ProfileApi['updateBio'];
}

const BIO_MAX = 160;

// ── Bio edit sheet ───────────────────────────────────────────────
function BioEditSheet({
  open, onClose, bio, updateBio,
}: {
  open: boolean;
  onClose: () => void;
  bio: string | null;
  updateBio: ProfileApi['updateBio'];
}) {
  const [value, setValue] = useState(bio ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setValue(bio ?? ''); setError(null); } }, [open, bio]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const err = await updateBio(value);
    if (err) { setError(err); setSaving(false); return; }
    setSaving(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Bio">
      <div className="space-y-3">
        <textarea
          data-no-drag
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value.slice(0, BIO_MAX))}
          placeholder="Tell friends a bit about yourself…"
          rows={4}
          className="w-full rounded-te-md px-3.5 py-3 text-[15px] te-t1 placeholder-white/25 tracking-tight outline-none resize-none"
          style={{ background: 'var(--te-well)', border: '1px solid var(--te-border)' }}
        />
        <div className="flex items-center justify-between px-0.5">
          <p className="te-label" style={{ color: error ? 'var(--te-danger)' : 'var(--te-text-4)' }}>
            {error ?? `${value.length}/${BIO_MAX}`}
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="te-white-btn w-full rounded-te-md font-semibold text-[15px] disabled:opacity-50"
          style={{ height: 48 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}

// ── Avatar picker sheet — 5 presets + upload your own ──────────
function AvatarPickerSheet({
  open, onClose, name, avatarUrl, setAvatar, uploadAvatarFile,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  avatarUrl: string | null;
  setAvatar: ProfileApi['setAvatar'];
  uploadAvatarFile: ProfileApi['uploadAvatarFile'];
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedPreset = presetKeyOf(avatarUrl);

  async function choosePreset(key: string) {
    if (saving) return;
    setSaving(true);
    setError(null);
    const err = await setAvatar(`preset:${key}`);
    if (err) setError(err);
    setSaving(false);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    setSaving(true);
    setError(null);
    const err = await uploadAvatarFile(file);
    if (err) setError(err);
    setSaving(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="Profile photo">
      <div className="space-y-5">
        <div className="flex justify-center">
          <Avatar name={name} avatarUrl={avatarUrl} size={88} />
        </div>

        <div>
          <p className="te-label mb-2 px-0.5">Choose an icon</p>
          <div className="grid grid-cols-5 gap-2.5">
            {AVATAR_PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => choosePreset(p.key)}
                disabled={saving}
                className="relative flex items-center justify-center rounded-full active:opacity-70 transition-opacity disabled:opacity-40"
                style={{
                  aspectRatio: '1 / 1',
                  boxShadow: selectedPreset === p.key ? '0 0 0 2px #f4f1ec' : 'none',
                  borderRadius: '9999px',
                }}
              >
                <img src={p.src} alt="" className="w-full h-full rounded-full" />
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={saving}
          className="te-panel w-full flex items-center gap-3 px-4 py-3.5 rounded-te-md active:bg-white/[0.04] transition-colors text-left disabled:opacity-50"
        >
          <PhotoIcon className="w-4 h-4 te-t4 shrink-0" />
          <span className="flex-1 text-[15px] font-medium te-t1 tracking-tight">
            {saving ? 'Uploading…' : 'Upload photo'}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleFile}
        />

        {error && <p className="text-[13px] px-0.5" style={{ color: 'var(--te-danger)' }}>{error}</p>}
      </div>
    </Modal>
  );
}

// ── Full-screen profile page — identity & settings only ─────────
// The social sections (competitions, leaderboard, friends) moved to the
// Compete tab where they're one tap away instead of buried behind the avatar.
export default function ProfilePage({
  open, onClose, profile, onOpenSettings, setAvatar, uploadAvatarFile, updateBio,
}: Props) {
  const name = profile?.display_name || profile?.username || 'You';
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [dx, setDx] = useState(0);
  const [dragSnapping, setDragSnapping] = useState(false);
  const dragStartX = useRef(0);
  const dragEligible = useRef(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setDismissing(false);
    } else if (visible && !dismissing) {
      setDismissing(true);
      setTimeout(() => { setVisible(false); setDismissing(false); }, 300);
    }
  }, [open]);

  // Swipe right from the left edge to go back — mirrors Modal's onBack gesture.
  useEffect(() => {
    if (!visible) return;
    function onTouchStart(e: TouchEvent) {
      dragStartX.current = e.touches[0].clientX;
      dragEligible.current = dragStartX.current < 28;
    }
    function onTouchMove(e: TouchEvent) {
      if (!dragEligible.current) return;
      const delta = e.touches[0].clientX - dragStartX.current;
      if (delta > 0) setDx(Math.min(delta, window.innerWidth));
    }
    function onTouchEnd(e: TouchEvent) {
      if (!dragEligible.current) return;
      const delta = e.changedTouches[0].clientX - dragStartX.current;
      dragEligible.current = false;
      setDragSnapping(true);
      if (delta > 90) onClose();
      setDx(0);
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  const dragging = dx > 0;

  return (
    <div
      className={dismissing || dragging ? '' : 'animate-page-push-in'}
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: '#010101',
        display: 'flex', flexDirection: 'column',
        transform: dismissing ? 'translateX(100%)' : `translateX(${dx}px)`,
        transition: dismissing ? 'transform 0.3s cubic-bezier(0.32,0.72,0,1)'
          : dragSnapping ? 'transform 0.28s cubic-bezier(0.22,1,0.36,1)' : 'none',
      }}
      onTransitionEnd={() => setDragSnapping(false)}
    >
      <AvatarPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        name={name}
        avatarUrl={profile?.avatar_url ?? null}
        setAvatar={setAvatar}
        uploadAvatarFile={uploadAvatarFile}
      />

      <ReportBugSheet open={reportOpen} onClose={() => setReportOpen(false)} context="Profile" />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <div className="max-w-lg mx-auto pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] space-y-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
          {/* Header row */}
          <div
            className="flex items-center justify-between"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
          >
            <div className="flex items-center gap-1 min-w-0">
              <button
                onClick={onClose}
                className="flex items-center justify-center shrink-0 active:opacity-60 transition-opacity -ml-2"
                style={{ width: 40, height: 40 }}
                aria-label="Back"
              >
                <ChevronLeftIcon className="w-6 h-6 te-t2" />
              </button>
              <h2 className="text-[17px] font-semibold te-t1 tracking-tight truncate">Profile</h2>
            </div>

            <button
              onClick={() => setReportOpen(true)}
              className="flex items-center gap-1.5 rounded-full active:opacity-60 transition-opacity"
              style={{
                height: 32, padding: '0 12px 0 10px',
                background: 'var(--te-surface-3)',
                border: '1px solid var(--te-border-strong)',
              }}
              aria-label="Report a bug"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--te-text-3)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2l1.5 2.5M16 2l-1.5 2.5" />
                <rect x="7" y="6" width="10" height="12" rx="5" />
                <path d="M12 6v12M3 10h4M17 10h4M3 15h4M17 15h4M4 6l3 2M20 6l-3 2M4 19l3-2M20 19l-3-2" />
              </svg>
              <span className="te-label">Bug</span>
            </button>
          </div>

          {/* Identity band */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => setPickerOpen(true)}
              className="relative shrink-0 active:opacity-70 transition-opacity"
              aria-label="Change profile photo"
            >
              <Avatar name={name} avatarUrl={profile?.avatar_url} size={88} />
              <span
                className="absolute flex items-center justify-center rounded-full"
                style={{ width: 24, height: 24, right: -2, bottom: -2, background: '#f4f1ec', border: '2.5px solid var(--te-ink)' }}
              >
                <CameraIcon className="w-3.5 h-3.5" style={{ color: 'var(--te-ink)' }} strokeWidth={1.5} />
              </span>
            </button>

            <div className="text-center">
              <p className="text-[20px] font-bold te-t1 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
                {name}
              </p>
              {profile?.username && <p className="te-label mt-1">@{profile.username}</p>}
            </div>
          </div>

          <button
            onClick={() => setBioOpen(true)}
            className="w-full text-left active:opacity-60 transition-opacity"
          >
            {profile?.bio ? (
              <p className="text-[15px] te-t2 leading-snug">{profile.bio}</p>
            ) : (
              <p className="te-label" style={{ color: 'var(--te-text-2)' }}>+ Add bio</p>
            )}
          </button>

          <BioEditSheet
            open={bioOpen}
            onClose={() => setBioOpen(false)}
            bio={profile?.bio ?? null}
            updateBio={updateBio}
          />

          {/* Settings entry — opens the existing schedule/settings sheet */}
          <button
            onClick={onOpenSettings}
            className="te-panel w-full flex items-center gap-3 px-4 py-3.5 rounded-te-md active:bg-white/[0.04] transition-colors text-left"
          >
            <Cog6ToothIcon className="w-4 h-4 te-t4 shrink-0" />
            <span className="flex-1 text-[15px] font-medium te-t1 tracking-tight">Settings & schedule</span>
            <ChevronRightIcon className="w-3.5 h-3.5 te-t4 shrink-0" />
          </button>

          {/* Legal */}
          <div className="flex items-center justify-center gap-4 pt-1">
            <a href="/privacy.html" target="_blank" rel="noopener" className="te-label active:opacity-60 transition-opacity" style={{ color: 'var(--te-text-4)' }}>
              Privacy Policy
            </a>
            <span className="te-label" style={{ color: 'var(--te-text-4)' }}>·</span>
            <a href="/terms.html" target="_blank" rel="noopener" className="te-label active:opacity-60 transition-opacity" style={{ color: 'var(--te-text-4)' }}>
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
