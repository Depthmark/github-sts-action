// Copyright 2026 Alexandre Delisle
// SPDX-License-Identifier: MIT

'use strict';

const fs = require('fs');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Write a key/value pair to a GitHub Actions file (GITHUB_OUTPUT or
 * GITHUB_STATE) using the multiline-safe delimiter format.
 *
 * Format:
 *   key<<DELIMITER\nvalue\nDELIMITER\n
 *
 * A random delimiter prevents injection via crafted values.
 */
function appendFileCommand(filePath, key, value) {
  const delimiter = `ghadelim_${crypto.randomUUID()}`;
  fs.appendFileSync(filePath, `${key}<<${delimiter}\n${value}\n${delimiter}\n`);
}

/**
 * Validate that a URL string uses an allowed HTTPS protocol.
 * HTTP is only permitted for loopback addresses (localhost / 127.0.0.1 / [::1]).
 */
function validateUrl(raw, label) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid ${label}: not a valid URL`);
  }
  if (parsed.protocol === 'https:') {
    return parsed;
  }
  if (
    parsed.protocol === 'http:' &&
    /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(parsed.host)
  ) {
    return parsed;
  }
  throw new Error(
    `Invalid ${label}: only HTTPS URLs are allowed (got ${parsed.protocol})`
  );
}

/**
 * Sanitize a string so it cannot inject GitHub Actions workflow commands.
 * Replaces '::' sequences and strips newlines that could start new commands.
 */
function sanitizeForCommand(str) {
  return String(str).replace(/::/g, '\u200B:\u200B:').replace(/[\r\n]/g, ' ');
}

/**
 * Validate the scope input (expects `org/repo` or `org`).
 */
function validateScope(scope) {
  if (!/^[a-zA-Z0-9._-]+(\/[a-zA-Z0-9._-]+)?$/.test(scope)) {
    throw new Error(
      `Invalid scope '${sanitizeForCommand(scope)}': expected 'org' or 'org/repo' format`
    );
  }
}

/**
 * Validate the identity input (alphanumeric, hyphens, underscores, dots).
 */
function validateIdentity(identity) {
  if (!/^[a-zA-Z0-9._-]+$/.test(identity)) {
    throw new Error(
      `Invalid identity '${sanitizeForCommand(identity)}': only alphanumeric, hyphens, underscores, and dots are allowed`
    );
  }
}

/**
 * Validate the optional app input (alphanumeric, hyphens, underscores, dots).
 */
function validateApp(app) {
  if (app && !/^[a-zA-Z0-9._-]+$/.test(app)) {
    throw new Error(
      `Invalid app '${sanitizeForCommand(app)}': only alphanumeric, hyphens, underscores, and dots are allowed`
    );
  }
}

/**
 * Parse JWT claims from the payload segment.
 * Never includes token data in error messages.
 */
function parseJwtClaims(token) {
  if (!token) {
    throw new Error('Token value is missing');
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid JWT structure: expected 3 parts, got ${parts.length}`);
  }
  let payload;
  try {
    payload = Buffer.from(parts[1], 'base64url').toString('utf8');
  } catch {
    throw new Error('Failed to decode token payload: invalid base64url encoding');
  }
  let claims;
  try {
    claims = JSON.parse(payload);
  } catch {
    throw new Error('Failed to parse token payload: invalid JSON');
  }
  return claims;
}

/**
 * Map an HTTP status code from the STS backend to a user-friendly error
 * category string.  The `detail` field from the JSON body is appended.
 */
function formatStsError(status, detail) {
  switch (status) {
    case 400:
      return `Configuration error: ${detail}`;
    case 401:
      return `OIDC token validation failed: ${detail}`;
    case 403:
      return `Trust policy denied the request: ${detail}`;
    case 404:
      return `Trust policy not found: ${detail}`;
    case 409:
      return `Token replay detected: ${detail}`;
    default:
      return `STS server error (HTTP ${status}): ${detail}`;
  }
}

/**
 * Returns true for status codes that are worth retrying.
 */
function isRetryable(status) {
  return status >= 500;
}

/**
 * fetch with exponential back-off + jitter.
 * Only retries on network errors and 5xx responses.
 * Each individual request is guarded by a 30-second timeout.
 */
async function fetchWithRetry(url, options = {}, retries = 3, initialDelay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      // Don't retry client errors — they are deterministic
      if (response.ok || !isRetryable(response.status)) {
        return response;
      }

      // 5xx — worth retrying
      const body = await response.text();
      lastError = new Error(`HTTP ${response.status}: ${body}`);
      lastError.status = response.status;
      lastError.body = body;
    } catch (err) {
      // Network / DNS / timeout errors
      lastError = err;
    } finally {
      clearTimeout(timer);
    }

    if (attempt <= retries) {
      const jitter = Math.floor(Math.random() * 3000);
      const delay = Math.min(2 ** attempt * initialDelay + jitter, 15000);
      console.log(`::warning::Attempt ${attempt} failed — retrying in ${delay}ms …`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

/**
 * Write a GitHub Actions job summary (markdown).
 */
function writeSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    fs.appendFileSync(summaryPath, markdown + '\n');
  }
}

/**
 * Escape a string for safe use inside a markdown table cell.
 */
function escapeMarkdown(str) {
  return String(str).replace(/[|`\\\[\]<>&]/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/**
 * Build the success summary table.
 */
function successSummary({ scope, identity, app, permissions }) {
  const perms = Object.entries(permissions)
    .map(([k, v]) => `\`${escapeMarkdown(k)}: ${escapeMarkdown(v)}\``)
    .join(', ');
  return [
    '## ✅ GitHub STS Token Exchange',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Scope | \`${escapeMarkdown(scope)}\` |`,
    `| Identity | \`${escapeMarkdown(identity)}\` |`,
    `| App | \`${escapeMarkdown(app)}\` |`,
    `| Permissions | ${perms} |`,
  ].join('\n');
}

/**
 * Build the failure summary table.
 */
function failureSummary({ scope, identity, error, detail }) {
  const lines = [
    '## ❌ GitHub STS Token Exchange Failed',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Scope | \`${escapeMarkdown(scope)}\` |`,
    `| Identity | \`${escapeMarkdown(identity)}\` |`,
    `| Error | ${escapeMarkdown(error)} |`,
  ];
  if (detail) {
    lines.push('', `**Details:** ${escapeMarkdown(detail)}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (require.main === module) {
  // Read inputs from environment (GitHub Actions convention: INPUT_<NAME>)
  const stsUrl = (process.env.INPUT_STS_URL || process.env['INPUT_STS-URL'] || '').replace(/\/+$/, '');
  const scope = process.env.INPUT_SCOPE || '';
  const identity = process.env.INPUT_IDENTITY || '';
  const app = process.env.INPUT_APP || '';
  const audience = process.env.INPUT_AUDIENCE || 'github-sts';
  const githubApiUrl = (process.env.INPUT_GITHUB_API_URL || process.env['INPUT_GITHUB-API-URL'] || 'https://api.github.com').replace(/\/+$/, '');

  const actionsToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  const actionsUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;

  // ── Prerequisite checks ──────────────────────────────────────────────────

  if (!stsUrl) {
    console.log("::error::Missing required input 'sts-url'.");
    process.exit(1);
  }
  if (!scope) {
    console.log("::error::Missing required input 'scope'.");
    process.exit(1);
  }
  if (!identity) {
    console.log("::error::Missing required input 'identity'.");
    process.exit(1);
  }

  try {
    validateUrl(stsUrl, 'sts-url');
  } catch (e) {
    console.log(`::error::${sanitizeForCommand(e.message)}`);
    process.exit(1);
  }
  try {
    validateUrl(githubApiUrl, 'github-api-url');
  } catch (e) {
    console.log(`::error::${sanitizeForCommand(e.message)}`);
    process.exit(1);
  }
  try {
    validateScope(scope);
  } catch (e) {
    console.log(`::error::${sanitizeForCommand(e.message)}`);
    process.exit(1);
  }
  try {
    validateIdentity(identity);
  } catch (e) {
    console.log(`::error::${sanitizeForCommand(e.message)}`);
    process.exit(1);
  }
  try {
    validateApp(app);
  } catch (e) {
    console.log(`::error::${sanitizeForCommand(e.message)}`);
    process.exit(1);
  }

  if (!actionsToken || !actionsUrl) {
    console.log(
      "::error::Missing OIDC environment variables. " +
      "Ensure your workflow has 'permissions: id-token: write' set."
    );
    process.exit(1);
  }

  (async function main() {
    try {
      // ── Step 1: Fetch OIDC token from GitHub Actions ───────────────────
      const oidcUrl = new URL(actionsUrl);
      oidcUrl.searchParams.set('audience', audience);
      const oidcRes = await fetchWithRetry(
        oidcUrl.toString(),
        { headers: { Authorization: `Bearer ${actionsToken}` } },
        3,
      );
      if (!oidcRes.ok) {
        const errText = await oidcRes.text();
        throw new Error(`Failed to fetch OIDC token from GitHub Actions: ${errText}`);
      }
      const oidcJson = await oidcRes.json();
      const oidcToken = oidcJson.value;

      if (!oidcToken) {
        throw new Error('GitHub Actions OIDC response did not contain a token.');
      }

      // Debug-log OIDC claims (grouped so they collapse in the UI)
      try {
        const claims = parseJwtClaims(oidcToken);
        console.log('::group::OIDC Token Claims');
        console.log(JSON.stringify(claims, null, 2));
        console.log('::endgroup::');
      } catch (decodeErr) {
        console.log(`::warning::Could not decode OIDC token for logging: ${sanitizeForCommand(decodeErr.message)}`);
      }

      // ── Step 2: Exchange OIDC token for GitHub installation token ──────
      const exchangeUrl = new URL('/sts/exchange', stsUrl);
      exchangeUrl.searchParams.set('scope', scope);
      exchangeUrl.searchParams.set('identity', identity);
      if (app) {
        exchangeUrl.searchParams.set('app', app);
      }

      let exchangeRes;
      try {
        exchangeRes = await fetchWithRetry(
          exchangeUrl.toString(),
          {
            headers: {
              Authorization: `Bearer ${oidcToken}`,
              Accept: 'application/json',
            },
          },
          3,
        );
      } catch (fetchErr) {
        // All retries exhausted (network or 5xx)
        const summary = failureSummary({
          scope,
          identity,
          error: 'Connection failed',
          detail: `Failed to reach STS at ${stsUrl} after multiple attempts: ${fetchErr.message}`,
        });
        writeSummary(summary);
        console.log(`::error::Failed to connect to STS at ${sanitizeForCommand(stsUrl)}: ${sanitizeForCommand(fetchErr.message)}`);
        process.exit(1);
      }

      // ── Step 3: Handle STS response ────────────────────────────────────
      if (!exchangeRes.ok) {
        let detail = '';
        try {
          const errJson = await exchangeRes.json();
          detail = errJson.detail || JSON.stringify(errJson);
        } catch {
          detail = await exchangeRes.text().catch(() => 'unknown error');
        }

        const errorMsg = formatStsError(exchangeRes.status, detail);
        const summary = failureSummary({ scope, identity, error: errorMsg, detail });
        writeSummary(summary);
        console.log(`::error::${sanitizeForCommand(errorMsg)}`);
        process.exit(1);
      }

      const result = await exchangeRes.json();

      if (!result.token) {
        const summary = failureSummary({
          scope,
          identity,
          error: 'Invalid response',
          detail: 'STS response did not contain a token.',
        });
        writeSummary(summary);
        console.log('::error::STS response did not contain a token.');
        process.exit(1);
      }

      // ── Step 4: Set outputs and mask the token ─────────────────────────
      const tok = result.token;
      const tokHash = crypto.createHash('sha256').update(tok).digest('hex');
      console.log(`Token SHA-256: ${tokHash}`);

      // Mask the token so it never appears in logs
      console.log(`::add-mask::${tok}`);

      // Write output using multiline-safe delimiter format
      if (process.env.GITHUB_OUTPUT) {
        appendFileCommand(process.env.GITHUB_OUTPUT, 'token', tok);
      }

      // Save token and API URL in state for post-job revocation
      if (process.env.GITHUB_STATE) {
        appendFileCommand(process.env.GITHUB_STATE, 'token', tok);
        appendFileCommand(process.env.GITHUB_STATE, 'github_api_url', githubApiUrl);
      }

      // ── Step 5: Write job summary ──────────────────────────────────────
      const summary = successSummary({
        scope: result.scope || scope,
        identity: result.identity || identity,
        app: result.app || app || 'default',
        permissions: result.permissions || {},
      });
      writeSummary(summary);

      console.log(
        `Token issued for scope=${sanitizeForCommand(result.scope || scope)} ` +
        `identity=${sanitizeForCommand(result.identity || identity)} ` +
        `app=${sanitizeForCommand(result.app || app || 'default')}`
      );
    } catch (err) {
      console.log(`::error::${sanitizeForCommand(err.message)}`);
      process.exit(1);
    }
  })();
}

module.exports = {
  parseJwtClaims, formatStsError, isRetryable, fetchWithRetry,
  appendFileCommand, validateUrl, sanitizeForCommand, validateScope,
  validateIdentity, validateApp, escapeMarkdown,
};
