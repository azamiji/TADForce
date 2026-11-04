import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { claimsCheck, CLAIM_CODES, environmentKind } from '../src/validate/claims.js';
import { claimsCheck as reExported, validateDocument } from '../src/validate/index.js';
import { buildDocument } from '../src/build/render.js';
import { frenchTypography } from '../src/build/typography.js';
import { writeJson, writeText } from '../src/util/fsx.js';
import { loadWorkspace } from '../src/util/config.js';
import { makeWorkspace, ROOT } from './helpers.js';

const codes = (issues, code) => issues.filter((i) => i.code === code);
const run = (w, doc, text, extra = {}) => claimsCheck(w.ctx, doc, { text: [{ file: 'x.md', text }], ...extra });

test('claims: the codes are exported, and re-exported by the validator', () => {
  assert.equal(reExported, claimsCheck);
  assert.deepEqual(CLAIM_CODES, ['absent-feature', 'unproven-schedule', 'environment-mismatch', 'risk-wording', 'control-chars', 'untranslated', 'duplicate-figure']);
});

test('claims: absent features are errors in the TAD unless the sentence states the absence (en, fr)', () => {
  const w = makeWorkspace();
  try {
    // the fixture has no Omni-Channel, no site, no Shield, no CTI; it has permission set groups and OmniStudio
    const out = run(w, 'tad', '# T {#ch-x}\n\nCases are routed by Omni-Channel.\n\nThe org does not use Omni-Channel.\n\nThe buyer portal shows the loans.\n\nAdvisors are grouped in permission set groups.\n\nOmniScripts guide the advisor.\n\nCalls go through Open CTI.\n');
    const af = codes(out, 'absent-feature');
    assert.deepEqual(af.map((i) => i.where), ['x.md:3', 'x.md:7', 'x.md:13']);
    assert.ok(af.every((i) => i.level === 'error'));
    assert.match(af[0].message, /Omni-Channel/);
    // the Axes may propose what the org lacks: a warning at most, nothing for a proposal
    const ax = run(w, 'axes', 'Consider Shield Platform Encryption for the scores.\n\nShield encrypts the scores.\n');
    assert.deepEqual(codes(ax, 'absent-feature').map((i) => [i.where, i.level]), [['x.md:3', 'warn']]);
  } finally { w.cleanup(); }
  const fr = makeWorkspace({ lang: 'fr' });
  try {
    const out = run(fr, 'tad', 'Le routage Omni-Channel distribue les requêtes.\n\nL’org n’utilise pas Omni-Channel.\n\nAucun portail client n’est ouvert.\n\nLe portail client affiche les prêts.\n');
    assert.deepEqual(codes(out, 'absent-feature').map((i) => i.where), ['x.md:1', 'x.md:7']);
  } finally { fr.cleanup(); }
});

test('claims: a weakly detected module (modules.weak) and a generic word are warnings only', () => {
  const w = makeWorkspace();
  try {
    const facts = JSON.parse(JSON.stringify(w.facts));
    facts.modules.weak = ['shield'];
    const out = claimsCheck(w.ctx, 'tad', { facts, text: 'Shield encrypts the scores.\n\nThe portal lists the loans.\n' });
    assert.deepEqual(codes(out, 'absent-feature').map((i) => i.level), ['warn', 'warn']);
  } finally { w.cleanup(); }
});

test('claims: a frequency next to a component that no scheduled job runs is an error; « once scheduled » is not', () => {
  const w = makeWorkspace();
  try {
    const org = { scheduledJobs: [{ name: 'Nightly CustomerSyncBatch', type: 'Scheduled Apex', cron: '0 0 2 * * ?' }] };
    const text = 'Each night, `CustomerSyncBatch` refreshes the segment.\n\nThe hourly job `LoanScoringService` recomputes the scores.\n\n`LoanScoringService` can be scheduled every hour.\n\nThe flow `Loan_Document_Reminder` sends a daily reminder.\n';
    const out = codes(claimsCheck(w.ctx, 'tad', { org, text }), 'unproven-schedule');
    assert.deepEqual(out.map((i) => [i.where, i.level]), [['tad:3', 'error']]);
    assert.match(out[0].message, /LoanScoringService/);
    // without org facts, nothing can be proven: a warning
    const none = codes(claimsCheck(w.ctx, 'tad', { org: null, text: 'Each night, `CustomerSyncBatch` refreshes the segment.\n' }), 'unproven-schedule');
    assert.deepEqual(none.map((i) => i.level), ['warn']);
    // a recurring job without name while the org has no scheduled job at all
    const facts = JSON.parse(JSON.stringify(w.facts));
    facts.automation.flows = facts.automation.flows.filter((f) => !/schedul/i.test(f.triggerType || ''));
    const empty = codes(claimsCheck(w.ctx, 'tad', { facts, org: { scheduledJobs: [] }, text: 'The hourly job refreshes the scores.\n' }), 'unproven-schedule');
    assert.equal(empty.length, 1);
  } finally { w.cleanup(); }
  const fr = makeWorkspace({ lang: 'fr' });
  try {
    const out = codes(claimsCheck(fr.ctx, 'tad', { org: { scheduledJobs: [] }, text: 'Toutes les heures, `LoanScoringService` recalcule les scores.\n\n`LoanScoringService` n’est pas planifié.\n' }), 'unproven-schedule');
    assert.deepEqual(out.map((i) => i.where), ['tad:1']);
  } finally { fr.cleanup(); }
});

test('claims: the environment named in the text and on the cover follows the org', () => {
  assert.equal(environmentKind({ organization: { edition: 'Developer Edition', sandbox: false } }, 'Production'), 'developer');
  assert.equal(environmentKind({ organization: { edition: 'Enterprise Edition', sandbox: true } }, 'Production'), 'sandbox');
  assert.equal(environmentKind(null, 'Recette'), 'sandbox');
  assert.equal(environmentKind(null, 'Production'), 'production');
  const w = makeWorkspace();
  try {
    const org = { organization: { edition: 'Developer Edition', sandbox: false } };
    const out = codes(claimsCheck(w.ctx, 'tad', { org, text: 'Changes are deployed in production every month.\n\nNo sandbox is used.\n' }), 'environment-mismatch');
    // the cover (config: Production) and line 1; line 3 states an absence
    assert.deepEqual(out.map((i) => i.where), ['tadforce.config.json › document.environment', 'tad:1']);
    const prod = codes(claimsCheck(w.ctx, 'tad', { org: null, text: 'This Developer Edition hosts the demo.\n\nFull copy sandboxes are refreshed.\n' }), 'environment-mismatch');
    assert.deepEqual(prod.map((i) => i.where), ['tad:1']);
  } finally { w.cleanup(); }
});

test('claims: risk and debt wording is an error in the TAD, allowed in the Axes; business terms are not risks', () => {
  const w = makeWorkspace({ lang: 'fr' });
  try {
    const text = 'Ce mécanisme présente un risque de doublons.\n\nLe score de risque est calculé par `LoanScoringService`.\n\nLa dette technique est faible.\n';
    assert.deepEqual(codes(run(w, 'tad', text), 'risk-wording').map((i) => i.where), ['x.md:1', 'x.md:5']);
    assert.equal(codes(run(w, 'axes', text), 'risk-wording').length, 0);
  } finally { w.cleanup(); }
});

test('claims: control characters are errors, and the build strips them', async () => {
  const w = makeWorkspace();
  try {
    const out = codes(run(w, 'tad', 'Status\u0001 open\u0002\n\ttabs are fine\n'), 'control-chars');
    assert.equal(out.length, 1);
    assert.match(out[0].message, /2 control character\(s\) \(U\+0001, U\+0002\)/);
    const f = path.join(w.ws, 'src', 'tad', '05-functional.md');
    writeText(f, fs.readFileSync(f, 'utf8') + '\nStatut\u0001 ouvert\u001f.\n');
    const r = await buildDocument(w.ctx, 'tad', { render: false, gate: false });
    assert.equal(r.sanitized.controlChars, 2);
    assert.ok(!/[\u0001\u001f]/.test(fs.readFileSync(r.html, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '')));
    const v = validateDocument(w.ctx, 'tad', { buildReport: r });
    assert.ok(v.errors.some((e) => e.code === 'control-chars' && /05-functional\.md/.test(e.where)));
  } finally { w.cleanup(); }
});

test('claims: English table headers and headings in a French document are warnings; French and Salesforce words are not', () => {
  const w = makeWorkspace({ lang: 'fr' });
  try {
    const text = '## Data model {#x}\n\n## Flows\n\n## Modèle de données\n\n| Object | Description |\n|---|---|\n| `A` | b |\n\n| Objet | Type | Description |\n|---|---|---|\n| `A` | b | c |\n';
    const out = codes(run(w, 'tad', text), 'untranslated');
    assert.deepEqual(out.map((i) => i.where), ['x.md:1', 'x.md:7']);
    assert.ok(out.every((i) => i.level === 'warn'));
    // the French skeletons themselves are clean
    assert.equal(codes(claimsCheck(w.ctx, 'tad'), 'untranslated').length, 0);
  } finally { w.cleanup(); }
  const en = makeWorkspace();
  try { assert.equal(codes(run(en, 'tad', '| Object | Role |\n|---|---|\n'), 'untranslated').length, 0); } finally { en.cleanup(); }
});

test('claims: the same figure twice is an error; the ownership map (understanding/figures.json) places it', () => {
  const w = makeWorkspace();
  try {
    const text = '# Functional {#ch-functional}\n\n## Domains {#functional-domains}\n\n## Leads {#fn-leads}\n\n@@SEQ:lead-intake@@\n\n# Application {#ch-application}\n\n## Sequences {#app-sequences}\n\n@@SEQ:lead-intake|again@@\n\n@@STATE:loan-status@@\n';
    const dup = codes(run(w, 'tad', text, { figures: null }), 'duplicate-figure');
    assert.deepEqual(dup.map((i) => i.where), ['x.md:13']);
    // owned by the sequences section of chapter 7 (spec id → skeleton anchor): the one in chapter 5 is the error
    const owned = codes(run(w, 'tad', text, { figures: { own: { 'SEQ:lead-intake': 'application.sequences' } } }), 'duplicate-figure');
    assert.deepEqual(owned.map((i) => i.where), ['x.md:7']);
    assert.match(owned[0].message, /outside its section/);
    // owned by functional.processes: a writer's own heading (fn-leads) continues the skeleton section above it
    const fn = codes(run(w, 'tad', text, { figures: { own: { 'SEQ:lead-intake': 'functional.processes' } } }), 'duplicate-figure');
    assert.deepEqual(fn.map((i) => i.where), ['x.md:13']);
    // read from the workspace by default
    writeJson(w.ctx.p('understanding', 'figures.json'), { own: { 'SEQ:lead-intake': 'application.sequences' } });
    assert.deepEqual(codes(run(w, 'tad', text), 'duplicate-figure').map((i) => i.where), ['x.md:7']);
  } finally { w.cleanup(); }
});

test('claims: lines inside a false tad:if block, code fences and comments are not read', () => {
  const w = makeWorkspace();
  try {
    const text = '<!-- tad:if modules.omniChannel -->\nOmni-Channel routes the cases.\n<!-- tad:endif -->\n\n```\nOmni-Channel\n```\n\n<!-- Omni-Channel\nstill a comment -->\n';
    assert.equal(run(w, 'tad', text).length, 0);
  } finally { w.cleanup(); }
});

test('claims: the example workspace is clean', () => {
  const ctx = loadWorkspace(path.resolve('examples', 'northwind-bank'));
  for (const doc of ['tad', 'axes']) assert.deepEqual(claimsCheck(ctx, doc).map((i) => `${i.code} ${i.where}`), []);
});

test('French typography: no-break spaces before : ; ! ? », after «, in numbers — never in code, URLs, times, figures', () => {
  const NB = ' ', NN = ' ';
  const out = frenchTypography('<p>Statut : ouvert; voir «ici» et 12 345 dossiers, 50 % à 12:30 ! <code>a : b;</code> https://x.fr/a?b=1 &amp; fin?</p><svg><text>a : b</text></svg><pre>x : y</pre>');
  assert.equal(out, `<p>Statut${NB}: ouvert${NN}; voir «${NB}ici${NB}» et 12${NN}345 dossiers, 50${NB}% à 12:30${NN}! <code>a : b;</code> https://x.fr/a?b=1 &amp; fin${NN}?</p><svg><text>a : b</text></svg><pre>x : y</pre>`);
  // idempotent
  assert.equal(frenchTypography(out), out);
});

test('French typography is applied to French builds only', async () => {
  const fr = makeWorkspace({ lang: 'fr' });
  try {
    const f = path.join(fr.ws, 'src', 'tad', '05-functional.md');
    writeText(f, fs.readFileSync(f, 'utf8') + '\nLe statut : « ouvert » !\n');
    const r = await buildDocument(fr.ctx, 'tad', { render: false, gate: false });
    assert.match(fs.readFileSync(r.html, 'utf8'), /Le statut : « ouvert » !/);
  } finally { fr.cleanup(); }
  const en = makeWorkspace();
  try {
    const f = path.join(en.ws, 'src', 'tad', '05-functional.md');
    writeText(f, fs.readFileSync(f, 'utf8') + '\nThe status: open!\n');
    const r = await buildDocument(en.ctx, 'tad', { render: false, gate: false });
    assert.match(fs.readFileSync(r.html, 'utf8'), /The status: open!/);
  } finally { en.cleanup(); }
});

test('no source of TADForce holds a control character (a \b typed as a backspace breaks a regex)', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const bad = ['src', 'templates/specs', 'skills'].flatMap((d) => walk(path.join(ROOT, d))).filter((f) => /\.(js|json|md|yml)$/.test(f) && /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(bad, []);
});

test('the claims lexicon holds no control character once parsed (in JSON "\b" is a backspace, a regex needs "\\b")', () => {
  const lex = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'validate', 'claims-lexicon.json'), 'utf8'));
  assert.ok(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(JSON.stringify(lex).replace(/\[nrt"\/u]/g, '')), 'a lexicon entry holds a control character');
  const walk = (o) => (typeof o === 'string' ? [o] : Array.isArray(o) ? o.flatMap(walk) : o && typeof o === 'object' ? Object.values(o).flatMap(walk) : []);
  assert.deepEqual(walk(lex).filter((s) => /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s)), []);
});
