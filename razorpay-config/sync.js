#!/usr/bin/env node
/**
 * Copies Razorpay settings from razorpay-config/razorpay.env (gitignored) into
 * the places each app reads them from. Every file it writes is gitignored.
 *
 *   <staff app>/functions/.env           RAZORPAY_KEY_ID (Firebase loads it at deploy)
 *   <staff app>/functions/.secret.local  RAZORPAY_KEY_SECRET, only if set (emulator only)
 *   orderin_admin/.env.local             VITE_RAZORPAY_KEY_ID (Razorpay checkout page)
 *
 * Usage:  node razorpay-config/sync.js           write the files
 *         node razorpay-config/sync.js --check   only report what's missing
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(__dirname, 'razorpay.env');
const CHECK_ONLY = process.argv.includes('--check');

const STAFF_APPS = [
  'Orderin-Black-Theme/order_client_11',
  'Orderin-Dessert-Theme/order_clients-Dessert',
  'Orderin-Green-Theme/order_clients-Green',
  'Orderin-Maroon-Theme/order_clients-Maroon',
  'Orderin-RED-Theme/order_clients',
  'Orderin-Stadium-Theme/order_clients-Stadium',
  'orderin-Client_Customer/order_clients-Olive_green-updated',
];
const ADMIN_APP = 'orderin_admin';

const parseEnv = (text) => {
  const out = {};
  text.split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) return;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
  return out;
};

/** Replace or add KEY=value lines in an env file, keeping its other lines. */
const upsertEnv = (file, values) => {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = existing ? existing.split(/\r?\n/) : [];
  for (const [k, v] of Object.entries(values)) {
    const i = lines.findIndex((l) => l.startsWith(`${k}=`));
    if (i >= 0) lines[i] = `${k}=${v}`;
    else lines.push(`${k}=${v}`);
  }
  const text = `${lines.filter((l, i) => l !== '' || i < lines.length - 1).join('\n').trim()}\n`;
  fs.writeFileSync(file, text);
};

const isIgnored = (file) => {
  try {
    execFileSync('git', ['check-ignore', '-q', file], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exitCode = 1;
};

if (!fs.existsSync(SOURCE)) {
  fail('razorpay-config/razorpay.env not found. Copy razorpay.env.example to razorpay.env and fill it in.');
  process.exit();
}
if (!isIgnored(SOURCE)) {
  fail('razorpay-config/razorpay.env is NOT gitignored. Refusing to continue.');
  process.exit();
}

const env = parseEnv(fs.readFileSync(SOURCE, 'utf8'));
const keyId = env.RAZORPAY_KEY_ID || '';
if (!/^rzp_(live|test)_[A-Za-z0-9]{8,}$/.test(keyId) || /X{6,}/.test(keyId)) {
  fail('RAZORPAY_KEY_ID in razorpay.env is missing or still the placeholder.');
  process.exit();
}
const mode = keyId.startsWith('rzp_live_') ? 'LIVE' : 'TEST';
const masked = `${keyId.slice(0, 9)}…${keyId.slice(-4)}`;

const targets = [];
for (const app of STAFF_APPS) {
  const fnDir = path.join(ROOT, app, 'functions');
  if (!fs.existsSync(fnDir)) continue;
  targets.push({ file: path.join(fnDir, '.env'), values: { RAZORPAY_KEY_ID: keyId } });
  if (env.RAZORPAY_KEY_SECRET) {
    const secrets = { RAZORPAY_KEY_SECRET: env.RAZORPAY_KEY_SECRET };
    if (env.RAZORPAY_WEBHOOK_SECRET) secrets.RAZORPAY_WEBHOOK_SECRET = env.RAZORPAY_WEBHOOK_SECRET;
    targets.push({ file: path.join(fnDir, '.secret.local'), values: secrets });
  }
}
targets.push({ file: path.join(ROOT, ADMIN_APP, '.env.local'), values: { VITE_RAZORPAY_KEY_ID: keyId } });

for (const t of targets) {
  const rel = path.relative(ROOT, t.file);
  if (!isIgnored(t.file)) {
    fail(`${rel} would not be gitignored, so it was skipped. Fix .gitignore first.`);
    continue;
  }
  if (CHECK_ONLY) {
    const have = fs.existsSync(t.file) ? parseEnv(fs.readFileSync(t.file, 'utf8')) : {};
    const missing = Object.keys(t.values).filter((k) => have[k] !== t.values[k]);
    console.log(`${missing.length ? '✖' : '✔'} ${rel}${missing.length ? ` (out of date: ${missing.join(', ')})` : ''}`);
    if (missing.length) process.exitCode = 1;
  } else {
    upsertEnv(t.file, t.values);
    console.log(`✔ ${rel}`);
  }
}
console.log(`Razorpay ${mode} key ${masked} ${CHECK_ONLY ? 'checked' : 'synced'} for ${targets.length} file(s).`);
if (!CHECK_ONLY) console.log('Rebuild orderin_admin and redeploy functions for the change to take effect.');
