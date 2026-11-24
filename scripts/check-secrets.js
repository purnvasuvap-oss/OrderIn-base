#!/usr/bin/env node
/**
 * Blocks commits that would leak payment or messaging credentials.
 *
 *   node scripts/check-secrets.js          scan staged changes (pre-commit hook)
 *   node scripts/check-secrets.js --all    scan every tracked file
 *
 * Exit code 1 when something is found. See razorpay-config/README.md.
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const ALL = process.argv.includes('--all');
const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });

const FORBIDDEN_FILES = [
  { re: /(^|\/)\.env(\.[^/]*)?$/, why: '.env files hold real keys', allow: /\.env\.example$/ },
  { re: /(^|\/)razorpay\.env$/, why: 'razorpay.env holds the Razorpay keys' },
  { re: /(^|\/)\.secret\.local$/, why: 'Functions emulator secrets' },
  { re: /(^|\/)rzp-key[^/]*\.csv$/i, why: 'Razorpay key export from the dashboard' },
];

const PATTERNS = [
  { re: /rzp_(?:live|test)_(?!X{6})[A-Za-z0-9]{10,}/g, why: 'Razorpay key ID (keep it in razorpay-config/razorpay.env)' },
  {
    re: /(?:key_secret|KEY_SECRET|razorpaySecret|RAZORPAY_SECRET|webhook_secret)["']?\s*[:=]\s*["'][A-Za-z0-9]{16,}["']/g,
    why: 'Razorpay secret written in code',
  },
  { re: /\bEAA[A-Za-z0-9]{60,}\b/g, why: 'Meta / WhatsApp access token' },
  { re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, why: 'private key' },
  { re: /"private_key"\s*:\s*"-----BEGIN/g, why: 'service account key file' },
];

// Generated / vendored output that is never hand-written.
const SKIP = /(^|\/)(node_modules|dist|build|coverage|\.firebase)\/|\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|mp4|zip)$|package-lock\.json$/i;

const files = ALL
  ? git(['ls-files']).split('\n').filter(Boolean)
  : git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']).split('\n').filter(Boolean);

const findings = [];
for (const file of files) {
  const posix = file.split(path.sep).join('/');
  for (const f of FORBIDDEN_FILES) {
    if (f.re.test(posix) && !(f.allow && f.allow.test(posix))) findings.push({ file: posix, line: 0, why: f.why });
  }
  if (SKIP.test(posix)) continue;
  let text;
  try {
    // --all reads the working tree (fast, and sees uncommitted fixes);
    // the hook reads the staged copy, which is what will be committed.
    text = ALL
      ? require('fs').readFileSync(path.join(ROOT, posix), 'utf8')
      : git(['show', `:${posix}`], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    continue;
  }
  if (text.includes('\u0000')) continue; // binary
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/secret-scan:\s*allow/.test(line)) return;
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      const m = p.re.exec(line);
      if (m) findings.push({ file: posix, line: i + 1, why: p.why, sample: `${m[0].slice(0, 12)}…` });
    }
  });
}

if (findings.length === 0) {
  console.log(`✔ No secrets found in ${files.length} ${ALL ? 'tracked' : 'staged'} file(s).`);
  process.exit(0);
}
console.error('✖ Possible secrets found. Nothing was committed.\n');
for (const f of findings) console.error(`  ${f.file}${f.line ? `:${f.line}` : ''}  ${f.why}${f.sample ? `  (${f.sample})` : ''}`);
console.error('\nMove the value to razorpay-config/razorpay.env or Secret Manager (see razorpay-config/README.md).');
console.error('If a line is a false alarm, add the comment "secret-scan: allow" to it.');
process.exit(1);
