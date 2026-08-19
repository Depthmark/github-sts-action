// Copyright 2026 Alexandre Delisle
// SPDX-License-Identifier: MIT

'use strict';

/**
 * Add this repository's documentation module to a github-sts site checkout.
 *
 *   node docs/scripts/mount-into-site.js <path-to-site>/docs/hugo.yaml
 *
 * The site pins a released version of this module. A branch has no release
 * yet, so CI needs the import to exist before it can build this branch's
 * content and prove that its links and shortcodes still resolve. This script
 * writes that import when it is absent, and does nothing when the site already
 * declares it.
 *
 * It edits the file in place, so point it at a throwaway checkout.
 */

const fs = require('fs');

const MODULE_PATH = 'github.com/Depthmark/github-sts-action/docs';
const TARGET = 'content/integrations/github-action';
const ANCHOR = '  imports:\n';

const configPath = process.argv[2];

if (!configPath) {
  console.error('usage: mount-into-site.js <path-to-site>/docs/hugo.yaml');
  process.exit(2);
}

const config = fs.readFileSync(configPath, 'utf8');

if (config.includes(MODULE_PATH)) {
  console.log(`${configPath} already imports ${MODULE_PATH}`);
  process.exit(0);
}

if (!config.includes(ANCHOR)) {
  console.error(`error: ${configPath} has no 'module.imports' list to extend`);
  process.exit(1);
}

const importBlock = [
  `    - path: ${MODULE_PATH}`,
  '      mounts:',
  '        - source: content/en',
  `          target: ${TARGET}`,
  '          lang: en',
  '        - source: content/fr',
  `          target: ${TARGET}`,
  '          lang: fr',
  '',
].join('\n');

fs.writeFileSync(configPath, config.replace(ANCHOR, ANCHOR + importBlock));
console.log(`Added ${MODULE_PATH} to ${configPath}`);
