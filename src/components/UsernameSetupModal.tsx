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
        className="w-full max-w-sm rounded-te-lg p-6"
        style={{ background: 'var(--te-surface-3)', border: '1px solid var(--te-border)', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
      >
        <h2 className="text-[20px] font-bold te-t1 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          Pick a username
        </h2>
        <p className="text-[13px] te-t3 mt-1 mb-5 leading-snug">
          This is how friends find you on the leaderboard.
        </p>

        <div
          className="flex items-center rounded-te-md px-3.5 gap-2"
          style={{ background: 'var(--te-well)', border: `1px solid ${error ? 'rgba(255,69,58,0.5)' : 'var(--te-border)'}`, height: 52 }}
        >
          <span className="text-[17px] te-t4 select-none">@</span>
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
            className="flex-1 bg-transparent outline-none text-[17px] te-t1 placeholder-white/25 tracking-tight"
          />
        </div>

        <p className="te-label mt-2 px-0.5" style={{ color: error ? 'var(--te-danger)' : 'var(--te-text-4)' }}>
          {error ?? '3–20 characters · letters, numbers, underscore'}
        </p>

        <button
          onClick={submit}
          disabled={!valid || saving}
          className="w-full mt-5 rounded-te-md font-semibold text-[15px] transition-all active:scale-[0.99]"
          style={{
            height: 52,
            background: valid ? '#f4f1ec' : 'var(--te-border-strong)',
            color: valid ? 'var(--te-ink)' : 'var(--te-text-4)',
          }}
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
