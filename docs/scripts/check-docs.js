// Copyright 2026 Alexandre Delisle
// SPDX-License-Identifier: MIT

'use strict';

/**
 * Documentation consistency checks.
 *
 * Run with `make docs-check` or `node docs/scripts/check-docs.js`.
 *
 * 1. Interface parity: the input and output names in action.yml match the
 *    tables in docs/content/{en,fr}/reference.md.
 * 2. Error parity: the action_-prefixed codes in index.js match the tables in
 *    docs/content/{en,fr}/errors.md.
 * 3. Translation parity: every English page has a French page with the same
 *    translationKey and weight, and vice versa.
 *
 * These checks exist because the documented interface previously drifted from
 * the implementation: outputs that never existed were documented for months.
 * Names are checked, not prose, so the check stays robust while the wording
 * stays human-written.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LANGS = ['en', 'fr'];

const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

/**
 * Collect the keys of a top-level block in action.yml.
 *
 * action.yml is a hand-maintained file with a stable shape: `inputs:` and
 * `outputs:` are top-level keys whose direct children are indented by exactly
 * two spaces. Parsing those two levels needs no YAML library, which keeps the
 * action free of dependencies.
 */
function actionKeys(source, blockName) {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => l === `${blockName}:`);
  if (start === -1) {
    fail(`action.yml: no top-level '${blockName}:' block found`);
    return [];
  }
  const keys = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || line.startsWith('#')) continue;
    if (/^\S/.test(line)) break; // next top-level key
    const match = /^ {2}([a-z0-9-]+):\s*$/.exec(line);
    if (match) keys.push(match[1]);
  }
  if (keys.length === 0) fail(`action.yml: '${blockName}:' block has no entries`);
  return keys;
}

/**
 * Extract the first column of the markdown table delimited by
 * `<!-- name:begin -->` and `<!-- name:end -->`, keeping only backticked
 * identifiers and skipping the header and separator rows.
 */
function tableIdentifiers(source, marker, relPath) {
  const begin = source.indexOf(`<!-- ${marker}:begin -->`);
  const end = source.indexOf(`<!-- ${marker}:end -->`);
  if (begin === -1 || end === -1) {
    fail(`${relPath}: missing '${marker}' markers`);
    return [];
  }
  const rows = source
    .slice(begin, end)
    .split('\n')
    .filter((line) => line.startsWith('|'));

  // Drop the header row and everything before the |---|---| separator, so a
  // backticked column heading is not mistaken for an identifier.
  const separator = rows.findIndex((line) => /^\|[\s:|-]+\|$/.test(line));
  if (separator === -1) {
    fail(`${relPath}: table '${marker}' has no header separator row`);
    return [];
  }

  const names = [];
  for (const line of rows.slice(separator + 1)) {
    const cell = line.split('|')[1].trim();
    const match = /^`([^`]+)`$/.exec(cell);
    if (match) names.push(match[1]);
  }
  if (names.length === 0) fail(`${relPath}: table '${marker}' has no identifiers`);
  return names;
}

function compare(label, expected, actual, relPath) {
  const missing = expected.filter((n) => !actual.includes(n));
  const extra = actual.filter((n) => !expected.includes(n));
  if (missing.length) fail(`${relPath}: ${label} missing from the docs: ${missing.join(', ')}`);
  if (extra.length) fail(`${relPath}: ${label} documented but not implemented: ${extra.join(', ')}`);
}

// --- 1. Interface parity ----------------------------------------------------

const actionYml = read('action.yml');
const inputs = actionKeys(actionYml, 'inputs');
const outputs = actionKeys(actionYml, 'outputs');

// The README repeats the interface tables because it is the action's page on
// GitHub and on the Marketplace. It is checked with the same rules so the two
// copies cannot diverge.
const interfaceFiles = [...LANGS.map((lang) => `docs/content/${lang}/reference.md`), 'README.md'];

for (const rel of interfaceFiles) {
  const source = read(rel);
  compare('inputs', inputs, tableIdentifiers(source, 'inputs', rel), rel);
  compare('outputs', outputs, tableIdentifiers(source, 'outputs', rel), rel);
}

// --- 2. Error parity --------------------------------------------------------

const indexJs = read('index.js');
const actionCodes = [...new Set(indexJs.match(/'action_[a-z_]+'/g) || [])]
  .map((s) => s.slice(1, -1))
  .sort();

if (actionCodes.length === 0) fail('index.js: no action_ error codes found');

for (const lang of LANGS) {
  const rel = `docs/content/${lang}/errors.md`;
  const source = read(rel);
  compare('error codes', actionCodes, tableIdentifiers(source, 'action-codes', rel), rel);
}

// --- 3. Translation parity --------------------------------------------------

function pages(lang) {
  const dir = path.join(ROOT, 'docs', 'content', lang);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort();
}

function frontMatterField(source, field) {
  const match = new RegExp(`^${field}:\\s*(.+)$`, 'm').exec(source);
  return match ? match[1].trim() : null;
}

const en = pages('en');
const fr = pages('fr');

for (const file of en) {
  if (!fr.includes(file)) fail(`docs/content/fr/${file}: missing French page`);
}
for (const file of fr) {
  if (!en.includes(file)) fail(`docs/content/en/${file}: missing English page`);
}

for (const file of en.filter((f) => fr.includes(f))) {
  const enSource = read(`docs/content/en/${file}`);
  const frSource = read(`docs/content/fr/${file}`);

  for (const field of ['translationKey', 'weight']) {
    const a = frontMatterField(enSource, field);
    const b = frontMatterField(frSource, field);
    if (a === null) fail(`docs/content/en/${file}: missing '${field}' front matter`);
    if (b === null) fail(`docs/content/fr/${file}: missing '${field}' front matter`);
    if (a !== null && b !== null && a !== b) {
      fail(`docs/content/${file}: '${field}' differs between languages (en: ${a}, fr: ${b})`);
    }
  }

  for (const [lang, source] of [['en', enSource], ['fr', frSource]]) {
    for (const field of ['title', 'description']) {
      if (!frontMatterField(source, field)) {
        fail(`docs/content/${lang}/${file}: missing '${field}' front matter`);
      }
    }
  }
}

// --- Report -----------------------------------------------------------------

if (failures.length) {
  for (const message of failures) console.error(`error: ${message}`);
  console.error(`\n${failures.length} documentation check(s) failed.`);
  process.exit(1);
}

console.log(
  `Documentation checks passed: ${inputs.length} inputs, ${outputs.length} outputs, ` +
  `${actionCodes.length} action error codes, ${en.length} pages per language.`
);
