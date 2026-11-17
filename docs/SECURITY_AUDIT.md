# Airdrop Museum security audit

**Current status: RELEASE BLOCKED — 18 November 2026 (Asia/Jakarta).**

## Dependency security: unresolved

The previous 28 October 2026 report that production and full `npm audit` returned **zero vulnerabilities** was accurate only for its historical audit snapshot; it is **not** the current release posture. The GitHub Advisory Database published a new high-severity picomatch advisory on 19 October 2026 and updated it on 17 November. Current locked dependencies include:

```text
@walletconnect/universal-provider@2.26.0
  @walletconnect/keyvaluestorage@1.1.1
    unstorage@1.17.6
      anymatch@3.1.3
        picomatch@2.3.2
```

- [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) / CVE-2026-112366: ReDoS from crafted repeated extglob input. The advisory lists **no patched version** as of this report.
- `npm audit --omit=dev --audit-level=high` reports **9 high-severity dependency paths** to this advisory, not 9 independently demonstrated exploit mechanisms.
- The forced `npm audit fix --force` proposal downgrades UniversalProvider from 2.26.0 to 2.17.0, a breaking change **not approved** as remediation.
- The production browser WalletConnect bundle is built by esbuild with a fail-closed metafile check. On [CI head 22fe560](https://github.com/xirraen/airdropmuseum/actions/runs/44147979687), the check confirmed **zero emitted** `anymatch` / `picomatch` modules. This is limited **bundle-containment evidence**, not an upstream patch, a dependency-audit exemption or assurance that all Node contexts are safe.

`npm audit` stays mandatory and fail-closed. Track the upstream fix or verify a separately reviewed compatible replacement, with locked install, Node and Worker tests, browser E2E, and actual-wallet lifecycle acceptance. Do **not** add arbitrary glob overrides or introduce a patched-version fiction merely to make audit green. Track resolution in [issue #39](https://github.com/xirraen/airdropmuseum/issues/39).

## Read-only wallet boundaries

The app uses the direct UniversalProvider integration with a bounded read-only facade. Signing, approving, transactions, claims, seed phrases and private keys remain out of scope. Protocol negotiation, CAIP account validation, supported-chain checks, pairing URI validation, cancellation, timeout, disconnect and method allowlisting have automated coverage. Additional regression coverage rejects unapproved or expired `chainChanged` events. Source changes to the adapter require regeneration and review of the committed WalletConnect bundle and Worker asset before merging.

**Real wallet connection, recovery, timeout and disconnect on a physical mobile device have not yet been accepted as a release gate.** A passing mocked-unit test is not a substitute.

## Other security and privacy boundaries

Telegram HMAC and email OTP are used for account authentication; the legacy `/auth/challenge` and `/auth/wallet` signing flows fail closed. Shared admin RBAC, CSRF and audit intent protect management paths; private journal exports are owner-scoped; public catalogue fields are allowlisted. Source and build checks do not establish that every possible attack path is impossible.

Immutable historical plaintext event payload privacy erasure still needs a reviewed retention or cryptographic-erasure design. Production secrets, private backup keys and encrypted backup copies must remain outside source control and chat.

## Release controls

The current production Worker is older than `main`, so the [full 13-gate production policy](RISK_SCOPED_RELEASE.md) applies. New encrypted D1 backup, independently verified isolated restore plus erasure ledger, physical-device WalletConnect checks, isolated staging, binding and secret inventory, rollback drill, reviewed exact-commit evidence and explicit operator authorization remain outstanding in [issue #24](https://github.com/xirraen/airdropmuseum/issues/24).

**No merge to `main`, Cloudflare Worker deployment or production D1 mutation is authorized by this audit.**
