// ─────────────────────────────────────────────────────────────
// Data migration: old Supabase project → new Supabase project
// Run with: node migrate.mjs
// ─────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const OLD_URL = 'https://tycxaddzufgghojrwcxm.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5Y3hhZGR6dWZnZ2hvanJ3Y3htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzg1MTAsImV4cCI6MjA4OTYxNDUxMH0.rLoACcXazDbS-3ejJ5glB6BG5h8uWiZXH6H_-KRYf6I';

const NEW_URL = 'https://qgdmcwzcejsnqjlpxvxp.supabase.co';
const NEW_KEY = 'sb_publishable_Bi6IMj3Cda6De0DjS2_meQ_cGaPfwnJ';

async function main() {
  const rl = readline.createInterface({ input, output });
  console.log('\n📦  Overload — data migration\n');
  console.log('Enter your OLD app credentials (the ones you used before):\n');
  const email    = await rl.question('Email:    ');
  const password = await rl.question('Password: ');
  rl.close();

  // ── 1. Sign into OLD project ──────────────────────────────
  console.log('\n🔐  Signing into old project…');
  const oldDb = createClient(OLD_URL, OLD_KEY, { auth: { persistSession: false } });
  const { data: oldAuth, error: oldErr } = await oldDb.auth.signInWithPassword({ email, password });
  if (oldErr) {
    console.error('❌  Could not sign in:', oldErr.message);
    process.exit(1);
  }
  console.log('✅  Signed in:', oldAuth.user.email);

  // ── 2. Fetch all data ─────────────────────────────────────
  console.log('\n📥  Fetching your data…');
  const { data: exercises, error: exErr }  = await oldDb.from('exercises').select('*');
  const { data: logs,      error: logErr } = await oldDb.from('workout_logs').select('*');

  if (exErr)  { console.error('❌  Could not fetch exercises:', exErr.message);  process.exit(1); }
  if (logErr) { console.error('❌  Could not fetch logs:',     logErr.message);  process.exit(1); }

  console.log(`   ${exercises?.length ?? 0} exercises`);
  console.log(`   ${logs?.length ?? 0} workout logs`);

  // Save backup regardless
  writeFileSync('./migration-backup.json', JSON.stringify({ exercises, logs }, null, 2));
  console.log('💾  Backup saved → migration-backup.json');

  if (!exercises?.length && !logs?.length) {
    console.log('\n⚠️  No data found — your exercises may have been stored anonymously.');
    process.exit(0);
  }

  // ── 3. Sign into NEW project ──────────────────────────────
  console.log('\n🔐  Signing into new project with same credentials…');
  const newDb = createClient(NEW_URL, NEW_KEY, { auth: { persistSession: false } });
  const { data: newAuth, error: newErr } = await newDb.auth.signInWithPassword({ email, password });
  if (newErr) {
    console.error('❌  New project sign-in failed:', newErr.message);
    console.log('\n⚠️  Your data is saved in migration-backup.json');
    console.log('    Sign up + verify your email in the app first, then run this script again.');
    process.exit(1);
  }
  const uid = newAuth.user.id;
  console.log('✅  Signed into new project');

  // ── 4. Insert exercises ───────────────────────────────────
  console.log('\n⬆️   Migrating exercises…');
  const exRows = (exercises ?? []).map(r => ({ ...r, user_id: uid }));
  const { error: exInsErr } = await newDb.from('exercises').upsert(exRows, { onConflict: 'id' });
  if (exInsErr) { console.error('❌  Insert failed:', exInsErr.message); process.exit(1); }
  console.log(`✅  ${exRows.length} exercises`);

  // ── 5. Insert logs ────────────────────────────────────────
  console.log('\n⬆️   Migrating workout logs…');
  const logRows = (logs ?? []).map(r => ({ ...r, user_id: uid }));
  const { error: logInsErr } = await newDb.from('workout_logs').upsert(logRows, { onConflict: 'id' });
  if (logInsErr) { console.error('❌  Insert failed:', logInsErr.message); process.exit(1); }
  console.log(`✅  ${logRows.length} workout logs`);

  console.log('\n🎉  All done! Your data is in the new project.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
