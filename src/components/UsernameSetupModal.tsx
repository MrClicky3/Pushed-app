import { useState } from 'react';

// First-login gate: capture a unique username before the app is usable.
// Intentionally NOT dismissible — there is no backdrop/close.
export default function UsernameSetupModal({
  onCreate,
}: {
  onCreate: (username: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clean = value.trim().toLowerCase();
  // Unicode-aware: any language's letters/digits, so long as the length fits.
  const valid = /^[\p{L}\p{N}_]{3,20}$/u.test(clean);

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const err = await onCreate(clean);
    if (err) {
      setError(err);
      setSaving(false);
    }
    // On success the parent unmounts this component (needsUsername → false).
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div
        className="w-full max-w-sm rounded-[24px] p-6"
        style={{ background: '#161617', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
      >
        <h2 className="text-[20px] font-bold text-[#f4f1ec] tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          Pick a username
        </h2>
        <p className="text-[13px] text-white/45 mt-1 mb-5 leading-snug">
          This is how friends find you on the leaderboard.
        </p>

        <div
          className="flex items-center rounded-2xl px-3.5 gap-2"
          style={{ background: '#0b0b0b', border: `1px solid ${error ? 'rgba(255,69,58,0.5)' : 'var(--te-border)'}`, height: 52 }}
        >
          <span className="text-[16px] text-white/30 select-none">@</span>
          <input
            data-no-drag
            autoFocus
            value={value}
            onChange={e => { setValue(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 bg-transparent outline-none text-[16px] text-[#f4f1ec] placeholder-white/25 tracking-tight"
          />
        </div>

        <p className="te-label mt-2 px-0.5" style={{ color: error ? '#ff453a' : 'rgba(244,241,236,0.35)' }}>
          {error ?? '3–20 characters · letters, numbers, underscore'}
        </p>

        <button
          onClick={submit}
          disabled={!valid || saving}
          className="w-full mt-5 rounded-2xl font-semibold text-[15px] transition-all active:scale-[0.99]"
          style={{
            height: 52,
            background: valid ? '#f4f1ec' : 'rgba(255,255,255,0.08)',
            color: valid ? '#0a0908' : 'rgba(255,255,255,0.3)',
          }}
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
