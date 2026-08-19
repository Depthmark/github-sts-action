---
title: Error Reference
description: Every error-code value the action can set, what causes it, and how server codes are passed through.
weight: 4
translationKey: github-action-errors
---

Every failure path writes `error-code`, `error-message`, and, when a response arrived, `http-status`. Branch on `error-code` rather than parsing log text. Reading these outputs requires `continue-on-error: true` on the step, because the action exits with status 1 on failure.

`error-code` carries values from two sources.

- Codes prefixed with `action_` come from the action itself. They describe failures that never reached the server, plus responses the action could not interpret.
- Every other value is the `code` field from the server's own error body, passed through unchanged.

## Action codes

<!-- action-codes:begin -->
| `error-code` | `http-status` | Cause | Fix |
|---|---|---|---|
| `action_invalid_input` | empty | An input is missing or fails validation. Raised before any network call. | Check the value against the rules in [Inputs and Outputs]({{< relref "reference" >}}). |
| `action_missing_oidc_env` | empty | `ACTIONS_ID_TOKEN_REQUEST_TOKEN` or `ACTIONS_ID_TOKEN_REQUEST_URL` is unset. | Add `permissions: id-token: write` to the job. |
| `action_oidc_fetch_failed` | empty | GitHub Actions did not return an OIDC token, or returned a body with no `value` field. | Usually transient. Re-run the job, then check the GitHub Actions status page. |
| `action_connection_failed` | status of the last attempt, when one was received | The server could not be reached after four attempts, and the last response body was not a github-sts error object. | Verify `sts-url` resolves and is reachable from the runner. |
| `action_invalid_response` | `200` | The server returned success with no `token` field. | Check the server logs. A `200` without a token indicates a server-side defect. |
| `action_malformed_error_response` | the response status | The server returned an error whose body had no string `code` field. | Check the server version and logs. The error contract may have changed. |
| `action_internal_error` | empty | An unexpected exception inside the action. | Read the full step log and open an issue against the action. |
<!-- action-codes:end -->

## Server codes

Any other value of `error-code` is the server's own code, forwarded exactly as received. The authoritative list, with the HTTP status attached to each code, is the [API Reference error table]({{< relref "/reference/api" >}}#error-responses). Codes such as `policy_denied`, `audience_mismatch`, `policy_not_found`, and `replay_detected` reach your workflow unchanged.

The action does not maintain a copy of that list. A code added by a newer server release passes through without an action release.

### How server codes reach the output

Two paths write a server code.

1. The response is not retryable, that is any status below 500. The action reads the body, takes `code`, and writes it directly.
2. The response is a 5xx and every retry produced the same failure. The action then parses the body of the final attempt. If it carries a `code`, that value is written; otherwise the code becomes `action_connection_failed`.

The second path matters for deterministic 5xx codes. A `502` with `upstream_error`, raised when the trust policy grants a permission the GitHub App does not hold, is retried four times before it surfaces. The step takes several seconds longer than a `403` denial does.

## Interpreting the error message

`error-message` is built from the HTTP status and the `detail` field of the response body.

| Status | Message prefix |
|---|---|
| `400` | `Configuration error:` |
| `401` | `OIDC token validation failed:` |
| `403` | `Trust policy denied the request:` |
| `404` | `Trust policy not found:` |
| `409` | `Token replay detected:` |
| any other | `STS server error (HTTP {status}):` |

The message is for humans. Its wording is not a stable interface. Branch on `error-code`.

## Branching on the failure

```yaml
      - uses: Depthmark/github-sts-action@v0.2.0
        id: sts
        continue-on-error: true
        with:
          sts-url: ${{ vars.STS_URL }}
          audience: https://sts.example.com
          scope: my-org/my-repo
          identity: ci

      - name: Handle the result
        run: |
          case "${{ steps.sts.outputs.error-code }}" in
            "")
              echo "Token issued" ;;
            replay_detected)
              echo "Transient: another job consumed this OIDC token, re-run" ;;
            policy_denied|audience_mismatch)
              echo "::error::Trust policy rejected this workflow: ${{ steps.sts.outputs.error-message }}"
              exit 1 ;;
            *)
              echo "::error::${{ steps.sts.outputs.error-code }}: ${{ steps.sts.outputs.error-message }}"
              exit 1 ;;
          esac
```

For diagnosing a denial from the server side, including the `trace_id` correlation, see [Troubleshooting]({{< relref "/operations/troubleshooting" >}}).
