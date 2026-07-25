// Bug reporting. Primary path is an in-app form → /api/report → email.
// buildBugReportUrl() is kept as a graceful fallback (and for the crash screen,
// where the app's JS can't be trusted to run a fetch).

import { supabase } from './supabase';

export const BUG_REPORT_EMAIL = 'jans@leiterts.com';

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

// In-app send — one step, no email client. Throws with a friendly message on failure.
export async function sendBugReport(message: string, context?: string): Promise<void> {
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
        diagnostics: gatherDiagnostics(),
        honeypot: '',
      }),
    });
  } catch {
    throw new Error('Network error — check your connection.');
  }

  if (!res.ok) {
    let msg = 'Could not send your report.';
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
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
