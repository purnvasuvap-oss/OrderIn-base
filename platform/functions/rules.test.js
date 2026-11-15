const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rules = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
const storage = fs.readFileSync(path.join(__dirname, '../storage.rules'), 'utf8');

test('firestore rules are not wide open and isolate diners by session', () => {
  assert.equal(/allow read, write: if true/.test(rules), false);
  assert.match(rules, /sessionId == request\.auth\.token\.sessionId/);
  assert.match(rules, /counterCodes/);
  assert.match(rules, /allow read, write: if false/);
  assert.match(rules, /platformAdmin/);
});

test('storage is limited to images for a restaurant the staff member owns', () => {
  assert.match(storage, /image\/\.\*/);
  assert.match(storage, /allow read, write: if false/);
  assert.equal(/allow read, write: if true/.test(storage), false);
});
