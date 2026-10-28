# Sprint 10 Security Review and Responsible Disclosure

Review date: 2026-10-28. Code review of inspected Sprint 9 service modules and incremental Sprint 10 hardening. **This is not a full penetration test and does not certify production readiness.**

## Threat matrix

| Control | Implementation / evidence | Release status |
| --- | --- | --- |
| Authentication | `src/admin/auth.ts` requires a valid digest-backed platform session | Staging verification required |
| Authorization | Four admin RBAC roles in `src/admin/types.ts`; per-route permission mapping | Review actual operator accounts |
| CSRF | Existing origin verification + X-CSRF-Token with comparison in `src/admin/auth.ts` | Regression tests / pepper needed |
| API keys | Existing hash/pepper `src/publicApi/auth.ts`; one-time creation response | Verify rotation procedure |
| Webhook integrity | Existing HMAC-SHA256 and delivery idempotency in `src/publicApi/webhookService.ts` | Test receiver signature |
| Input validation | New ID, UNIX timestamp, EVM address, HTTPS URL validators; existing per-handler validation | Review all legacy request paths |
| Oversized payload | 1 MiB gateway upper bound, smaller per-handler JSON limits | Run body and streaming tests |
| Output encoding | JSON via JSON.stringify/Response.json, XML via feed escaping, legal page HTML escape helper | XML & legacy DOM audit needed |
| SQL injection | Inspected admin and public API paths use D1 prepare/bind; must audit all dynamic SQL in untouched modules | Manual review required |
| XSS | HTML security policy + escaped legal content; other UI modules predate Sprint 10 | CSP browser regression required |
| SSRF | HTTPS/hostname rejection and redirect:'manual' upstream helper; trust sources registered | DNS rebinding remains to mitigate |
| Open redirect | New upstream refuses redirects; discovery handles explicit same-host redirects | Existing routes need scan |
| Rate limiting | Gateway native Cloudflare limiter + D1; public v1 retains separate key quota | Benchmark concurrency |
| CORS | Allowlist remains in public API route; gateway doesn't relax CORS | Verify actual origins |
| Headers | HSTS, nosniff, XFO DENY, strict referrer, CSP, permissions | Telegram Web iframe compatibility risk |
| Errors | Response carries request_id, no stack trace; classified safe logs | Test unhandled upstream cases |
| Secrets | No secrets checked into Sprint 10 source; source pattern scanner; Cloudflare runtime secrets | Audit existing entire history + deployed settings |
| Maintenance | Existing Sprint 9 mode stays in generated fetchCore | Staging fail-safe drill |
| Data leakage | Public API must project only curated data; request logging excludes PII | Privacy/red-team review required |

## Dependency audit — release blocker

At commit `0350419248fe04e69880b8722604f15264bcfcdd`, GitHub Actions `npm audit --omit=dev --audit-level=critical` completed successfully **but reported 11 high-severity vulnerabilities** stemming from transitive `zod <4.6.6` and the WalletConnect / Reown / Coinbase SDK dependency chain, including advisory `GHSA-mrhx-c7xc-m3w5`. A suggested forced downgrade/change to `@walletconnect/ethereum-provider@2.19.4` is potentially breaking. **Do not automatically run `npm audit fix --force` in production.** Investigate supported patched dependency ranges, apply a reviewed lockfile/package update and run wallet-connection regression tests, or document a formal risk acceptance and compensating controls before launch. CI's critical-only gate is not an assertion that high vulnerabilities are remediated.

Audit evidence: GitHub Actions run `40676616614` on PR #8. The production launch checklist remains unchecked.

## Important remaining risks

1. **DNS rebinding and webhooks:** filtering URL hostnames does not prove resolved DNS answers are public; protect partner outbound networking using vetted destinations, external allowlists and egress controls where available. Do not claim fully solved.
2. **Frame policy:** `X-Frame-Options: DENY` may prevent the Telegram Web Mini App iframe. Staging verification is an explicit release blocker.
3. **Operational readiness:** GitHub branch protection, production secrets, production migration state, alert policies, restore drill, CI passing and p95 load performance are not verified by code-only review.
4. **Log scope:** application JSON logs redact sensitive values by using an allowlist. Cloudflare's platform-generated invocation and exception logs are separately governed and need access/retention review.
5. **Runbook and legal accuracy:** security contact is a private GitHub Security Advisory form; verify the repository accepts private vulnerability reports and review legal pages with counsel.

## Responsible disclosure

Use private security advisories at https://github.com/xirraen/airdropmuseum/security/advisories/new . Do not post exploitable details, user data, tokens or secrets in public issues. Include impact, sanitized reproduction and suggested remediation. The project owner coordinates triage, rotation, containment and patch deployment. No implied bounty or fixed response SLA.

## Release sign-off

Require a reviewed PR, successful CI, verified Cloudflare bindings, valid legal/security contact, production secret audit, privacy compliance review, staged load test, backup/restore drill and human production approval.
