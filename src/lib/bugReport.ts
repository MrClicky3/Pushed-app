// Bug reporting. Primary path is an in-app form → /api/report → email.
// buildBugReportUrl() is kept as a graceful fallback (and for the crash screen,
// where the app's JS can't be trusted to run a fetch).

import { supabase } from './supabase';

export const BUG_REPORT_EMAIL = 'jans@leiterts.com';

// Just the first word of a display name — "Jan Sleiterts" → "Jan". Feedback
// copy addresses testers by name, and a full name mid-sentence reads like a
// form letter. Falls back to '' so callers can drop the name cleanly.
export function firstName(name?: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return first.toLowerCase() === 'you' ? '' : first;
}

function gatherDiagnostics(): string {
  const parts: string[] = [];
  try {
    parts.push(`Page: ${window.location.href}`);
    parts.push(`When: ${new Date().toISOString()}`);
    parts.push(`Device: ${navigator.userAgent}`);
    parts.push(`Screen: ${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x`);
  } catch { /* ignore */ }
  return parts.join('\n');
}

// In-app send — one step, no email client. Throws with a friendly message on
// failure. `kind` only steers the email subject so bugs and beta feedback are
// filterable in the inbox; both share this one delivery path.
export async function sendBugReport(
  message: string,
  context?: string,
  kind: 'bug' | 'feedback' = 'bug',
  honeypot = '',
): Promise<void> {
  let token: string | undefined;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  } catch { /* ignore */ }

  let res: Response;
  try {
    res = await fetch('/api/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message,
        context: context ?? '',
        kind,
        diagnostics: gatherDiagnostics(),
        honeypot,
      }),
    });
  } catch {
    throw new Error('Network error — check your connection.');
  }

  if (!res.ok) {
    let msg = kind === 'feedback' ? 'Could not send your feedback.' : 'Could not send your report.';
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
}

// Fallback for the feedback form: the answers the tester already typed, kept
// intact in a mailto so a failed send never costs them their writing.
export function buildFeedbackUrl(message: string, context?: string): string {
  const lines = [
    message,
    '',
    '──────────────',
    ...(context ? [`Context: ${context}`] : []),
    gatherDiagnostics(),
  ];

  return `mailto:${BUG_REPORT_EMAIL}?subject=${encodeURIComponent('Pushed – Beta feedback')}&body=${encodeURIComponent(lines.join('\n'))}`;
}

// Fallback: a pre-filled mailto with the same diagnostics attached.
export function buildBugReportUrl(opts?: { context?: string; error?: unknown }): string {
  const lines: string[] = [
    'Describe the bug (what happened?):',
    '',
    '',
    'What did you expect to happen?',
    '',
    '',
    '──────────────',
    '(the details below help me debug — please keep them)',
    gatherDiagnostics(),
  ];

  if (opts?.context) lines.push(`Context: ${opts.context}`);
  if (opts?.error) {
    const e = opts.error as { message?: string; stack?: string };
    lines.push(`Error: ${e?.message ?? String(opts.error)}`);
    if (e?.stack) lines.push(`Stack: ${String(e.stack).split('\n').slice(0, 5).join(' | ')}`);
  }

  const subject = 'Pushed — Bug report';
  return `mailto:${BUG_REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}
