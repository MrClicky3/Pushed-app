// Vercel serverless function — receives an in-app bug report and emails it to
// the maintainer. Verifies the reporter is a signed-in user (reusing the
// project's existing Supabase env vars) and sends via Resend.
//
// Required env var: RESEND_API_KEY  (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// are already present from the frontend build and reused here).

interface Req {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  status: (code: number) => Res;
  json: (body: unknown) => void;
}

const REPORT_TO = 'jans@leiterts.com';
const FROM = 'Overload Bugs <onboarding@resend.dev>';

function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s); } catch { return {}; }
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const body = (typeof req.body === 'string' ? safeParse(req.body) : (req.body ?? {})) as Record<string, unknown>;
  const message = String(body.message ?? '');
  const context = String(body.context ?? '');
  const diagnostics = String(body.diagnostics ?? '');
  const honeypot = String(body.honeypot ?? '');

  // Bot trap — pretend success so scripts get no signal.
  if (honeypot.trim()) { res.status(200).json({ ok: true }); return; }

  const trimmed = message.trim();
  if (trimmed.length < 3) { res.status(400).json({ error: 'Please describe the bug first.' }); return; }
  if (trimmed.length > 5000) { res.status(400).json({ error: 'That message is too long.' }); return; }

  // Verify the reporter is signed in (only authenticated users can report).
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;

  if (!authHeader) { res.status(401).json({ error: 'Please sign in to report a bug.' }); return; }

  // Fail closed: without these we cannot verify anyone, so accepting the
  // report would mean emailing on behalf of an unauthenticated stranger.
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    res.status(503).json({ error: 'Bug reporting isn\'t configured yet.' }); return;
  }

  let reporter = 'unknown';
  let reporterId = '';
  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: authHeader },
    });
    if (!u.ok) { res.status(401).json({ error: 'Your session expired — sign in again.' }); return; }
    const j = (await u.json()) as { email?: string; id?: string };
    reporterId = j.id ?? '';
    reporter = j.email || j.id || 'authenticated';
  } catch {
    res.status(502).json({ error: 'Could not verify your session. Try again.' }); return;
  }

  if (!reporterId) { res.status(401).json({ error: 'Your session expired — sign in again.' }); return; }

  // Per-user rate limit. The counter lives in Postgres because a serverless
  // instance's memory does not survive between invocations. RLS scopes both
  // the count and the insert to the caller's own rows.
  const REPORTS_PER_HOUR = 5;
  const restHeaders = { apikey: SUPABASE_ANON, Authorization: authHeader, 'Content-Type': 'application/json' };
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  try {
    const recent = await fetch(
      `${SUPABASE_URL}/rest/v1/bug_reports?select=id&created_at=gte.${encodeURIComponent(since)}`,
      { headers: restHeaders },
    );
    if (recent.ok) {
      const rows = (await recent.json()) as unknown[];
      if (Array.isArray(rows) && rows.length >= REPORTS_PER_HOUR) {
        res.status(429).json({ error: 'You\'ve sent a few reports already — try again in an hour.' });
        return;
      }
    }
  } catch {
    // Counting failed (network/transient). This is a quota guard, not an auth
    // boundary, so let the report through rather than losing it.
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) { res.status(503).json({ error: 'Bug reporting isn\'t configured yet.' }); return; }

  const replyTo = /@/.test(reporter) ? reporter : undefined;
  const text = [
    trimmed,
    '',
    '──────────────',
    `Reporter: ${reporter}`,
    context ? `Context: ${context}` : '',
    diagnostics || '',
  ].filter(Boolean).join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [REPORT_TO],
        subject: `Overload bug report${replyTo ? ` — ${reporter}` : ''}`,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!r.ok) {
      // Resend's own error text can name the account and key state — log it
      // server-side, return something generic to the browser.
      console.error('resend send failed', r.status, (await r.text().catch(() => '')).slice(0, 300));
      res.status(502).json({ error: 'Couldn\'t send the report.' }); return;
    }
    // Record the accepted report so it counts against the caller's hourly limit.
    await fetch(`${SUPABASE_URL}/rest/v1/bug_reports`, {
      method: 'POST',
      headers: restHeaders,
      body: JSON.stringify({ user_id: reporterId }),
    }).catch(() => {});
    res.status(200).json({ ok: true });
  } catch {
    res.status(502).json({ error: 'Couldn\'t send the report.' });
  }
}
