import { useState, useRef, useEffect } from 'react';

interface Props {
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onSignUp: (email: string, password: string, name: string) => Promise<string | null>;
  onResend: (email: string) => Promise<string | null>;
  onVerifyOtp: (email: string, token: string) => Promise<string | null>;
  onResetPassword: (email: string) => Promise<string | null>;
  onGoogle: () => Promise<string | null>;
}

function IconGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.26-2.09 3.58-5.17 3.58-8.87Z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24Z"/>
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.27a12 12 0 0 0 0 10.74l4-3.09Z"/>
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.27 6.63l4 3.09C6.22 6.86 8.87 4.75 12 4.75Z"/>
    </svg>
  );
}

type Step = 'form' | 'verify' | 'forgot' | 'forgot_sent';
type Mode = 'signin' | 'signup';

function friendlyError(msg: string): string {
  if (msg.includes('Invalid login credentials'))   return 'Incorrect email or password.';
  if (msg.includes('Email not confirmed'))          return 'Please verify your email first.';
  if (msg.includes('User already registered'))      return 'An account with this email already exists.';
  if (msg.includes('Password should be'))           return 'Password must be at least 6 characters.';
  if (msg.includes('Token has expired') || msg.includes('expired')) return 'Code expired – request a new one.';
  if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('otp')) return 'Wrong code. Check your email and try again.';
  return msg;
}

function IconWave() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10.5 1.875a1.125 1.125 0 0 1 2.25 0v8.219c.517.162 1.02.382 1.5.659V3.375a1.125 1.125 0 0 1 2.25 0v10.937a4.505 4.505 0 0 0-3.25 2.373 8.963 8.963 0 0 1 4-.935A.75.75 0 0 0 18 15v-2.266a3.368 3.368 0 0 1 .988-2.37 1.125 1.125 0 0 1 1.591 1.59 1.118 1.118 0 0 0-.329.79v3.006h-.005a6 6 0 0 1-1.752 4.007l-1.736 1.736a6 6 0 0 1-4.242 1.757H10.5a7.5 7.5 0 0 1-7.5-7.5V6.375a1.125 1.125 0 0 1 2.25 0v5.519c.46-.452.965-.832 1.5-1.141V3.375a1.125 1.125 0 0 1 2.25 0v6.526c.495-.1.997-.151 1.5-.151V1.875Z" />
    </svg>
  );
}
function IconEmail() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3 3 0 0 1-3.144 0L1.5 8.67Z" />
      <path d="M22.5 6.908V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.158l9.714 5.978a1.5 1.5 0 0 0 1.572 0L22.5 6.908Z" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clipRule="evenodd" />
    </svg>
  );
}
function IconPerson() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.25"/>
      <path d="M2.5 13.5c0-2.485 2.462-4.5 5.5-4.5s5.5 2.015 5.5 4.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  );
}
function IconEye({ show }: { show: boolean }) {
  return show ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 0 1 0-1.113ZM17.25 12a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0Z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.53 2.47a.75.75 0 0 0-1.06 1.06l18 18a.75.75 0 1 0 1.06-1.06l-18-18ZM22.676 12.553a11.249 11.249 0 0 1-2.631 4.31l-3.099-3.099a5.25 5.25 0 0 0-6.71-6.71L7.759 4.577a11.217 11.217 0 0 1 4.242-.827c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113Z" />
      <path d="M15.75 12c0 .18-.013.357-.037.53l-4.244-4.243A3.75 3.75 0 0 1 15.75 12ZM12.53 15.713l-4.243-4.244a3.75 3.75 0 0 0 4.244 4.243Z" />
      <path d="M6.75 12c0-.619.107-1.213.304-1.764l-3.1-3.1a11.25 11.25 0 0 0-2.63 4.31c-.12.362-.12.752 0 1.114 1.489 4.467 5.704 7.69 10.675 7.69 1.5 0 2.933-.294 4.242-.827l-2.477-2.477A5.25 5.25 0 0 1 6.75 12Z" />
    </svg>
  );
}

function FieldInput({
  icon, type, value, onChange, placeholder, autoComplete, right,
}: {
  icon: React.ReactNode;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="relative w-full">
      <div className="absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--te-text-3)' }}>
        {icon}
      </div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full h-[55px] rounded-full pl-[46px] pr-11 text-[17px] te-t1 placeholder:text-white/25 focus:outline-none"
        style={{ background: 'var(--te-surface-3)' }}
      />
      {right && (
        <div className="absolute right-5 top-1/2 -translate-y-1/2">{right}</div>
      )}
    </div>
  );
}

export default function AuthView({ onSignIn, onSignUp, onResend, onVerifyOtp, onResetPassword, onGoogle }: Props) {
  const [mode, setMode]   = useState<Mode>('signin');
  const [step, setStep]   = useState<Step>('form');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]       = useState('');
  const [otp, setOtp]         = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [showPw, setShowPw]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  const [honeypot, setHoneypot] = useState('');
  const formLoadedAt = useRef(Date.now());
  const lastSubmitAt = useRef(0);
  const resendInFlight = useRef(false);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCooldown() {
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    setResendCooldown(60);
    cooldownTimer.current = setInterval(() => {
      setResendCooldown(c => {
        if (c <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          cooldownTimer.current = null;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  useEffect(() => () => {
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    if (honeypot) return;
    if (mode === 'signup' && Date.now() - formLoadedAt.current < 1500) return;
    if (Date.now() - lastSubmitAt.current < 700) return;
    lastSubmitAt.current = Date.now();

    setError(null); setLoading(true);
    const err = mode === 'signin'
      ? await onSignIn(email.trim(), password)
      : await onSignUp(email.trim(), password, name);
    setLoading(false);
    if (err) setError(friendlyError(err));
    else if (mode === 'signup') setStep('verify');
  }

  function handleOtpChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setOtp(digits); setError(null);
    if (digits.length === 6) submitOtp(digits);
  }
  async function submitOtp(code: string) {
    setLoading(true);
    const err = await onVerifyOtp(email.trim(), code);
    setLoading(false);
    if (err) { setError(friendlyError(err)); setOtp(''); }
  }

  async function handleResend() {
    // Two guards, both needed: the cooldown blocks a second attempt a moment
    // later, the in-flight ref blocks a double-tap firing two requests at once
    // (neither has resolved yet, so the cooldown alone would let both past).
    if (resendCooldown > 0 || resendInFlight.current) return;
    resendInFlight.current = true;
    setResendMsg(null);

    const err = await onResend(email.trim());
    resendInFlight.current = false;

    // Start the cooldown either way. Only starting it on success meant a
    // rate-limited request left the button live, so the user retried
    // immediately and dug themselves further into the rate limit.
    startCooldown();

    if (err) {
      setResendMsg(/rate|429|too many|security purposes/i.test(err)
        ? 'Too many requests – wait a minute and try again.'
        : 'Could not resend.');
    } else {
      setOtp(''); setError(null); setResendMsg('Sent!');
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setError(null); setLoading(true);
    const err = await onResetPassword(forgotEmail.trim());
    setLoading(false);
    if (err) setError(friendlyError(err));
    else setStep('forgot_sent');
  }

  function switchMode() {
    setMode(m => m === 'signin' ? 'signup' : 'signin');
    setStep('form'); setError(null);
    setEmail(''); setPassword(''); setName(''); setOtp('');
    setResendMsg(null); setResendCooldown(0);
  }

  function SubmitBtn({ label, disabled }: { label: string; disabled?: boolean }) {
    return (
      <button
        type="submit"
        disabled={loading || disabled}
        className="te-white-btn w-full h-[55px] rounded-full font-semibold text-[15px] tracking-tight disabled:opacity-40 flex items-center justify-center"
      >
        {loading ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-black/20 border-t-black/70 rounded-full animate-spin" />
            {label}…
          </span>
        ) : label}
      </button>
    );
  }

  if (step === 'form') {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-5"
        style={{ background: 'var(--te-bg)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <form onSubmit={handleSubmit} className="w-full max-w-[355px] flex flex-col items-center gap-[50px]">

          <div className="flex flex-col items-center gap-2.5 w-full">
            <img
              src="/logo-mark.svg"
              alt="Pushed"
              className="h-20 w-auto"
            />
            <div className="flex flex-col items-center gap-1">
              <p className="text-[20px] font-semibold te-t1 tracking-[-0.17px] text-center inline-flex items-center gap-1.5">
                Welcome back to Pushed!
                <span className="inline-flex items-center" style={{ transform: 'rotate(35deg)' }} aria-hidden><IconWave /></span>
              </p>
              <p className="text-[17px]" style={{ color: 'var(--te-text-3)' }}>
                {mode === 'signin' ? 'Sign in to continue' : 'Create an account to start'}
              </p>
            </div>
          </div>

          <div className="w-full flex flex-col gap-3">
            <input
              type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
              value={honeypot} onChange={e => setHoneypot(e.target.value)}
              style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
            />

            <div className="w-full flex flex-col gap-2.5">
              {mode === 'signup' && (
                <FieldInput icon={<IconPerson />} type="text" value={name}
                  onChange={setName} placeholder="Your name" autoComplete="name" />
              )}
              <FieldInput icon={<IconEmail />} type="email" value={email}
                onChange={setEmail} placeholder="Email" autoComplete="email" />
              <FieldInput
                icon={<IconLock />}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                placeholder="Password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                right={
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    className="p-1 transition-opacity active:opacity-50" style={{ color: 'var(--te-text-3)' }}>
                    <IconEye show={showPw} />
                  </button>
                }
              />
              {mode === 'signin' && (
                <button type="button"
                  onClick={() => { setForgotEmail(email); setStep('forgot'); setError(null); }}
                  className="text-[15px] text-right w-full pr-1 transition-opacity active:opacity-60"
                  style={{ color: 'var(--te-text-3)' }}>
                  Forgot password?
                </button>
              )}
            </div>

            {error && <p className="text-[13px] text-center" style={{ color: 'var(--te-danger)' }}>{error}</p>}

            <div className="w-full flex flex-col gap-[15px]">
              <SubmitBtn
                label={mode === 'signin' ? 'Sign in' : 'Create account'}
                disabled={!email.trim() || !password.trim()}
              />

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: 'var(--te-border)' }} />
                <span className="text-[13px]" style={{ color: 'var(--te-text-3)' }}>or</span>
                <div className="flex-1 h-px" style={{ background: 'var(--te-border)' }} />
              </div>

              <button
                type="button"
                onClick={async () => { const err = await onGoogle(); if (err) setError(friendlyError(err)); }}
                className="w-full h-[52px] rounded-te-md flex items-center justify-center gap-2.5 active:opacity-80 transition-opacity"
                style={{ background: 'var(--te-surface-3)', border: '1px solid var(--te-border-strong)' }}
              >
                <IconGoogle />
                <span className="text-[15px] font-semibold te-t1 tracking-[-0.17px]">
                  Continue with Google
                </span>
              </button>

              <button type="button" onClick={switchMode} className="text-center text-[15px]" style={{ color: 'var(--te-text-3)' }}>
                {mode === 'signin'
                  ? <>No account yet?{' '}<span className="font-semibold te-t1">Sign up for free</span></>
                  : <>Already have an account?{' '}<span className="font-semibold te-t1">Sign in</span></>
                }
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))]"
      style={{
        background: 'radial-gradient(ellipse 100% 50% at 50% -10%, color-mix(in srgb, var(--te-text-1) 7%, var(--te-bg)) 0%, var(--te-bg) 55%)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="w-full max-w-sm flex flex-col gap-4">

        <div className="flex items-center justify-center gap-3">
          <div className="relative">
            <div
              className="absolute inset-0 rounded-te-md blur-xl"
              style={{ background: '#f4f1ec', opacity: 0.12 }}
            />
            <img
              src="/apple-touch-icon.png"
              alt="Pushed"
              className="relative w-[44px] h-[44px] rounded-te-md"
              style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
            />
          </div>
          <p className="text-[20px] font-bold te-t1" style={{ letterSpacing: '-0.03em' }}>
            Pushed
          </p>
        </div>

        <div
          className="rounded-te-md p-5 space-y-4"
          style={{ background: 'var(--te-surface-3)', border: '1px solid var(--te-fill-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.45)' }}
        >

          {step === 'verify' && (
            <div className="space-y-4">
              {/* Primary path — the confirmation link. It's the reliable way in:
                  opening it on this device signs the user in automatically, so
                  they never depend on the fast-expiring email code. */}
              <div
                className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
                style={{ background: 'rgba(244,241,236,0.12)' }}
              >
                <svg className="w-6 h-6" viewBox="0 0 20 20" fill="none">
                  <path d="M3 5.5L10 11l7-5.5M3 5.5h14v10H3V5.5z" stroke="#f4f1ec" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="text-center space-y-1">
                <p className="text-[17px] font-semibold te-t1 tracking-tight">Confirm your email</p>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--te-text-3)' }}>
                  We sent a confirmation link to <span className="te-t2">{email}</span>. Open it on this
                  device to finish — you'll be signed in automatically.
                </p>
              </div>

              <div className="flex flex-col items-center gap-1">
                <button onClick={handleResend} disabled={resendCooldown > 0}
                  className="text-[13px] font-semibold disabled:opacity-40 transition-opacity"
                  style={{ color: 'var(--te-text-1)' }}>
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend email'}
                </button>
                {resendMsg && <p className="text-[13px]" style={{ color: resendMsg === 'Sent!' ? 'var(--te-success)' : 'var(--te-danger)' }}>{resendMsg}</p>}
              </div>

              {/* Secondary fallback — the 6-digit code, for anyone who opened the
                  email on another device. De-emphasised since it expires quickly. */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: 'var(--te-border)' }} />
                <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--te-text-4)' }}>or enter the code</span>
                <div className="flex-1 h-px" style={{ background: 'var(--te-border)' }} />
              </div>
              <input
                type="text" inputMode="numeric" autoComplete="one-time-code"
                value={otp} onChange={e => handleOtpChange(e.target.value)}
                placeholder="000000" maxLength={6} disabled={loading}
                className="w-full text-center rounded-te-md px-4 py-4 text-[32px] font-bold te-mono te-t1 placeholder:text-white/25 focus:outline-none disabled:opacity-50 transition-opacity"
                style={{ letterSpacing: '0.25em', background: 'var(--te-fill-subtle)', border: '1px solid var(--te-fill-subtle)' }}
              />
              {error && <p className="text-[13px] text-center" style={{ color: 'var(--te-danger)' }}>{error}</p>}
              {loading && <div className="flex justify-center"><div className="w-5 h-5 border-2 border-white/20 border-t-[#f4f1ec] rounded-full animate-spin" /></div>}

              <div className="h-px" style={{ background: 'var(--te-border)' }} />
              <p className="text-[13px] text-center" style={{ color: 'var(--te-text-4)' }}>
                Already confirmed?{' '}
                <button onClick={() => { setStep('form'); setMode('signin'); setError(null); setOtp(''); }}
                  className="font-semibold" style={{ color: 'var(--te-text-1)' }}>Sign in →</button>
              </p>
            </div>
          )}

          {step === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="text-center space-y-1">
                <p className="text-[17px] font-semibold te-t1 tracking-tight">Reset password</p>
                <p className="text-[13px]" style={{ color: 'var(--te-text-4)' }}>
                  We'll send a reset link to your email
                </p>
              </div>
              <FieldInput icon={<IconEmail />} type="email" value={forgotEmail}
                onChange={setForgotEmail} placeholder="Email" autoComplete="email" />
              {error && <p className="text-[13px]" style={{ color: 'var(--te-danger)' }}>{error}</p>}
              <SubmitBtn label="Send reset link" disabled={!forgotEmail.trim()} />
              <button type="button" onClick={() => { setStep('form'); setError(null); }}
                className="w-full text-center text-[13px] font-semibold"
                style={{ color: 'var(--te-text-4)' }}>← Back to sign in</button>
            </form>
          )}

          {step === 'forgot_sent' && (
            <div className="space-y-4 text-center">
              <div
                className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
                style={{ background: 'rgba(244,241,236,0.12)' }}
              >
                <svg className="w-6 h-6" viewBox="0 0 20 20" fill="none">
                  <path d="M3 5.5L10 11l7-5.5M3 5.5h14v10H3V5.5z" stroke="#f4f1ec" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="space-y-1">
                <p className="text-[17px] font-semibold te-t1 tracking-tight">Check your inbox</p>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--te-text-3)' }}>
                  Reset link sent to <span className="te-t2">{forgotEmail}</span>.
                  Click it — it'll bring you straight back here.
                </p>
              </div>
              <button onClick={() => { setStep('form'); setError(null); setForgotEmail(''); }}
                className="w-full text-center text-[13px] font-semibold"
                style={{ color: 'var(--te-text-1)' }}>← Back to sign in</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
