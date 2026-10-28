# Security audit

Verified 28 October 2026 (Asia/Jakarta). Status: PRODUCTION BLOCKED. No remote writes, migrations, backup exports, or deployments were performed in this execution.

Locked dependency installation succeeded after limiting registry connections. Both production-only and complete npm audit report 11 high, 0 critical. Advisory: GHSA-mrhx-c7xc-m3w5, Zod collection validation memory exhaustion. The latest registry version of @walletconnect/ethereum-provider observed is 2.26.0 and pins @reown/appkit 1.8.19. No forced downgrade or unvalidated override was applied. The wallet feature is preserved; production deployment remains blocked.

Implemented: Telegram HTML frame policy fix; nonblocking cancellation of oversized cloned request bodies; explicit publication and whitelisted serialization for legacy catalog routes; atomic deletion of all owner cohort caches on consent withdrawal; event-count checkpoint prevents insertion of a stale cached insight after concurrent owner events; CI now rejects high advisories.

Residual blockers: existing aggregator bearer-token admin paths require migration into session RBAC/CSRF and audit logging; every legacy participation/restore path is not yet decision-first; real wallet connection/disconnection/chain switching and malformed relay payload tests remain unverified. Do not treat the source credential-pattern scan as a comprehensive secret/security audit. No live Telegram bot secret was listed on the production Worker during read-only inspection.
