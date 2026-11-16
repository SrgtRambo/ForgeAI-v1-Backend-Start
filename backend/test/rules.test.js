import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizePath } from '../src/paths.js';
import { validateOrder, OrderError } from '../src/orders.js';
import { TIERS } from '../src/pricing.js';
import { extractJson, stripCodeFence } from '../src/text.js';
import { normalizePlan } from '../src/engine.js';

test('standard costs $9.99 and pro costs $19.99', () => {
  assert.equal(validateOrder({ prompt: 'A booking site for a dog grooming salon', tier: 'standard' }).amountCents, 999);
  assert.equal(validateOrder({ prompt: 'A booking site for a dog grooming salon', tier: 'pro' }).amountCents, 1999);
});

test('orders reject short prompts, unknown types and unknown tiers', () => {
  assert.throws(() => validateOrder({ prompt: 'too short' }), OrderError);
  assert.throws(() => validateOrder({ prompt: 'A booking site for a dog grooming salon', type: 'game' }), OrderError);
  assert.throws(() => validateOrder({ prompt: 'A booking site for a dog grooming salon', tier: 'free' }), OrderError);
});

test('unsafe file paths are refused', () => {
  for (const bad of ['../secret.js', '/etc/passwd', 'a/../../b.js', '.env', 'node_modules/x.js', 'C:/x.js', 'a\\b.js', 'run.sh', 'x.exe']) {
    assert.equal(sanitizePath(bad), null, bad);
  }
  assert.equal(sanitizePath('./src/app.js'), 'src/app.js');
  assert.equal(sanitizePath('data/sample.csv'), 'data/sample.csv');
});

test('plans are capped at the tier file limit and keep required files', () => {
  const files = Array.from({ length: 30 }, (_, i) => ({ path: `page-${i}.html`, purpose: 'page' }));
  const standard = normalizePlan({ name: 'X', files }, { type: 'website', tier: 'standard' });
  assert.equal(standard.files.length, TIERS.standard.maxFiles);
  assert.deepEqual(standard.files.slice(0, 3).map((f) => f.path), ['index.html', 'styles.css', 'app.js']);
  const pro = normalizePlan({ name: 'X', files }, { type: 'website', tier: 'pro' });
  assert.equal(pro.files.length, TIERS.pro.maxFiles);
});

test('plans drop files Forge writes itself and duplicates', () => {
  const plan = normalizePlan(
    { files: [{ path: 'README.md' }, { path: 'package.json' }, { path: 'app.js' }, { path: './app.js' }] },
    { type: 'website', tier: 'standard' },
  );
  assert.deepEqual(plan.files.map((f) => f.path), ['index.html', 'styles.css', 'app.js']);
});

test('model replies wrapped in fences or prose still parse', () => {
  assert.equal(stripCodeFence('```html\n<p>hi</p>\n```'), '<p>hi</p>');
  assert.deepEqual(extractJson('Sure!\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here you go: {"a":{"b":2}} enjoy'), { a: { b: 2 } });
});
