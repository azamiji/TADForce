import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preprocess, resolveRefs, buildDocument, readComments } from '../src/build/render.js';
import { resolveConditionals, resolveValues, erd } from '../src/build/directives.js';
import { validateDocument } from '../src/validate/index.js';
import { makeWorkspace } from './helpers.js';

test('headings are numbered; {-}, {#id} and appendix letters work', () => {
  const { headings } = preprocess('# One {#ch-one}\n## A\n## B\n# Two\n### deep\n# Appendices {-}\n## Appendix {{letter}} — X {- #ax}\n### {{sub}} Y {-}\n## Appendix {{letter}} — Z {-}');
  assert.deepEqual(headings.map((h) => h.num), ['1', '1.1', '1.2', '2', '2.0.1', null, null, null, null]);
  assert.equal(headings[0].id, 'ch-one');
  assert.equal(headings[6].text, 'Appendix A — X');
  assert.equal(headings[6].id, 'ax');
  assert.equal(headings[7].text, 'A.1 Y');
  assert.equal(headings[8].text, 'Appendix B — Z');
});

test('sources with Windows line endings build like the others', async () => {
  const w = makeWorkspace();
  try {
    const f = path.join(w.ws, 'src', 'tad', '01-summary.md');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\n/g, '\r\n'));
    const r = await buildDocument(w.ctx, 'tad', { render: false });
    const html = fs.readFileSync(r.html, 'utf8');
    assert.match(html, /<h1 id="ch-summary">/);
    assert.doesNotMatch(html, /\{-\}|\{#[\w-]+\}/, 'heading attributes are never printed');
  } finally { w.cleanup(); }
});

test('references resolve to section numbers', () => {
  const pre = preprocess('# Data {#ch-data}\n## Overview {#data-overview}\nSee {{ref:data-overview}} and {{title:ch-data}}.');
  const problems = [];
  const md = resolveRefs(pre.md, pre.headings, problems);
  assert.match(md, /\[§ 1\.1\]\(#data-overview\)/);
  assert.match(md, /\[1 Data\]\(#ch-data\)/);
  assert.equal(problems.length, 0);
  resolveRefs('{{ref:nope}}', pre.headings, problems);
  assert.equal(problems[0].code, 'unknown-ref');
});

test('conditional blocks follow the facts', () => {
  const scope = { modules: { omnistudio: true, cti: false } };
  const s = resolveConditionals('a\n<!-- tad:if modules.omnistudio -->\nB\n<!-- tad:endif -->\n<!-- tad:if modules.cti -->\nC\n<!-- tad:else -->\nD\n<!-- tad:endif -->\n<!-- tad:if !modules.cti|modules.x -->\nE\n<!-- tad:endif -->', scope);
  assert.deepEqual(s.split('\n'), ['a', 'B', 'D', 'E']);
});

test('placeholders are formatted per language and unknown ones are reported', () => {
  const ctx = { facts: { counts: { cmdt: { records: 2409 } } }, cfg: { client: { name: 'X' } }, lang: 'fr' };
  const problems = [];
  const out = resolveValues('{{n:cmdt.records}} · {{cfg:client.name}} · {{n:missing.key}}', ctx, problems);
  assert.match(out, /^2\s409 · X · /);
  assert.equal(problems.length, 1);
});

test('ERDs only show Lookup and Master-Detail relationships between the chosen objects', () => {
  const w = makeWorkspace();
  try {
    const code = erd(w.facts, ['LoanApplication__c', 'LoanDocument__c', 'Account'], 'Loans');
    assert.match(code, /Account \|o--o\{ LoanApplication__c : "Customer__c"/);
    assert.match(code, /LoanApplication__c \|\|--\|\{ LoanDocument__c : "LoanApplication__c"/);
    assert.doesNotMatch(code, /Branch__c/);
  } finally { w.cleanup(); }
});

test('a scaffolded document builds without browser, in both languages', async () => {
  for (const lang of ['en', 'fr']) {
    const w = makeWorkspace({ lang });
    try {
      const r = await buildDocument(w.ctx, 'tad', { render: false });
      const html = fs.readFileSync(r.html, 'utf8');
      assert.ok(r.pending.length > 40, 'skeleton has pending sections');
      assert.doesNotMatch(html, /@@[A-Z]+/, 'every directive is resolved');
      assert.doesNotMatch(html, /\{\{(n|v|cfg|ref|title|T):/, 'every placeholder is resolved');
      assert.doesNotMatch(html.replace(/<script>[\s\S]*?<\/script>/g, (s) => (s.includes('TAD_I18N') ? s : '')), /\{\{[A-Z0-9_]+\}\}/, 'every template token is filled');
      assert.match(html, /window\.TAD_I18N=\{"editor":/, 'editor labels are injected');
      assert.match(html, /<a class="kpi" href="#annex-objects">/);
      assert.match(html, /id="annex-lwc"/);
      assert.match(html, new RegExp(`<html lang="${lang}">`));
      assert.equal(r.problems.filter((p) => p.level === 'error').length, 0, JSON.stringify(r.problems));
      const ax = await buildDocument(w.ctx, 'axes', { render: false });
      assert.match(fs.readFileSync(ax.html, 'utf8'), /class="b p[123]"/);
    } finally { w.cleanup(); }
  }
});

test('optional sections disappear when the product is absent', async () => {
  const w = makeWorkspace();
  try {
    const r = await buildDocument(w.ctx, 'tad', { render: false });
    const html = fs.readFileSync(r.html, 'utf8');
    assert.match(html, /id="app-omnistudio"/); // OmniStudio detected
    assert.doesNotMatch(html, /id="ui-omnichannel"/); // no Omni-Channel nor CTI
    assert.doesNotMatch(html, /id="int-commerce"/);
    assert.ok(!r.pending.includes('application.ai'));
  } finally { w.cleanup(); }
});

test('comments saved in the browser are carried over with their resolution', async () => {
  const w = makeWorkspace();
  try {
    const first = await buildDocument(w.ctx, 'tad', { render: false });
    const saved = fs.readFileSync(first.html, 'utf8').replace('<script type="application/json" id="tad-comments">[]</script>',
      '<script type="application/json" id="tad-comments">[{"id":"c1","kind":"text","comment":"Rename it","quote":"x","section":"1","status":"open"}]</script>');
    fs.writeFileSync(path.join(w.ws, 'reviewed.html'), saved);
    w.ctx.cfg.review.tad = { commentsFrom: ['reviewed.html'], resolutions: { c1: 'Renamed in § 1.' }, dropImages: [] };
    const second = await buildDocument(w.ctx, 'tad', { render: false });
    const [c] = readComments(fs.readFileSync(second.html, 'utf8'));
    assert.equal(c.status, 'resolved');
    assert.equal(c.response, 'Renamed in § 1.');
  } finally { w.cleanup(); }
});

test('validation catches what must never ship', async () => {
  const w = makeWorkspace({ glossary: { terms: [{ use: 'API Gateway', avoid: ['passerelle'] }] }, exclusions: { exclude: [{ name: 'demoCarousel' }], features: [{ name: 'Old search', keywords: ['legacy search'] }] } });
  try {
    fs.writeFileSync(path.join(w.ws, 'src', 'tad', '50-extra.md'), [
      '# Extra {#extra}',
      'The passerelle forwards calls.',
      'The `demoCarousel` component shows offers.',
      'The legacy search is gone.',
      'Token: Bearer abcdefghijklmnopqrstuvwxyz0123456789',
      'The `NonExistingThing__c` object stores data.',
      'We have 12 Apex classes.',
    ].join('\n'));
    const r = await buildDocument(w.ctx, 'tad', { render: false });
    const v = validateDocument(w.ctx, 'tad', { buildReport: r });
    const codes = new Set([...v.errors, ...v.warnings].map((i) => i.code));
    for (const c of ['pending', 'terminology', 'excluded-component', 'decommissioned', 'secret', 'unknown-component', 'hardcoded-count']) assert.ok(codes.has(c), c);
    assert.equal(v.ok, false);
  } finally { w.cleanup(); }
});
