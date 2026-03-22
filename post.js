// Copyright 2026 Alexandre Delisle
// SPDX-License-Identifier: MIT

'use strict';

/**
 * Post-job cleanup: revoke the GitHub installation token so it cannot be
 * reused after the workflow completes (success, failure, or cancellation).
 */

/**
 * Sanitize a string so it cannot inject GitHub Actions workflow commands.
 */
function sanitizeForCommand(str) {
  return String(str).replace(/::/g, '\u200B:\u200B:').replace(/[\r\n]/g, ' ');
}

const tok = process.env.STATE_token;
const githubApiUrl = (process.env.STATE_github_api_url || 'https://api.github.com').replace(/\/+$/, '');

if (!tok) {
  console.log('::warning::Token not found in state; nothing to revoke.');
  process.exit(0);
}

// Validate the API URL before making any request
try {
  const parsed = new URL(githubApiUrl);
  const isHttps = parsed.protocol === 'https:';
  const isLoopback =
    parsed.protocol === 'http:' &&
    /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(parsed.host);
  if (!isHttps && !isLoopback) {
    throw new Error('only HTTPS URLs are allowed');
  }
} catch (err) {
  console.log(`::warning::Invalid github-api-url in state — skipping revocation: ${sanitizeForCommand(err.message)}`);
  process.exit(0);
}

(async function main() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${githubApiUrl}/installation/token`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${tok}`,
        Accept: 'application/vnd.github+json',
      },
      signal: controller.signal,
    });

    if (res.status === 204) {
      console.log('Token revoked successfully.');
    } else {
      console.log(`::warning::Token revocation returned HTTP ${res.status} ${sanitizeForCommand(res.statusText)}.`);
    }
  } catch (err) {
    console.log(`::warning::Failed to revoke token: ${sanitizeForCommand(err.message)}`);
  } finally {
    clearTimeout(timer);
  }
})();
