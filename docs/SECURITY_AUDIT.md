# Security audit

Verified 28 October 2026 (Asia/Jakarta). User has authorized merge and production release after the technical gates pass. No production deployment or D1 migration has been performed.

Both production-only and complete npm audits now report **zero vulnerabilities**. The original 11 high findings were removed by replacing the EthereumProvider/Reown graph with the direct UniversalProvider 2.26.0 protocol implementation and a bounded read-only adapter. No forced downgrade, advisory exclusion or incompatible Zod override was used. QR and mobile URI presentation, account/address validation, supported-chain checks, cancellation, error cleanup and method allowlisting are covered by unit tests. Real wallet approval/connection in a mobile app remains unverified.

No wallet signing request is allowed; old /auth/challenge and /auth/wallet routes fail closed. Telegram HMAC and email OTP provide account authentication. Authenticated legacy account data is retained. Admin Aggregator/Quest paths use shared session RBAC, CSRF and audit intent; server backups require the separate backup.read permission (super-admin only by default). Public catalog fields are allowlisted; private journal exports filter by owner. Journal/backup identifiers are scrubbed from structured route logs. These results are not a claim of absence of all security risks.

Residual: privacy erasure for existing plaintext immutable event payloads requires a reviewed retention/cryptographic-erasure design; it is not falsely reported as complete. Real Telegram/wallet E2E, production secret provisioning, backup/restore and remote resource checks remain release gates.
