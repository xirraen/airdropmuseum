# WalletConnect-only architecture

## Decision
Airdrop Museum uses **WalletConnect as its only external wallet transport**. There is no injected-provider fallback (`window.ethereum`, etc.), internal wallet generation, private-key storage, or custody of user assets.

**Account authentication is separate:** Telegram or email authenticates an Airdrop Museum account. A connected wallet address, proof or session MUST NOT implicitly log in or change server-side account ownership.

The wallet menu may pair, inspect approved public addresses and account activity, switch network with user permission, and disconnect without logging out of the Museum account. Connection, cancellation, timeout, chain change, account change and disconnect are distinct states.

## Current capability boundary
The existing WalletConnect adapter remains **read-only**. It supports public RPC reads, transaction simulation and allowance checks, but rejects `eth_sendTransaction`, signing, and arbitrary batch grants. The protocol itself can support transactions, but enabling them is a separate security-sensitive release and should not be confused with merely switching the connector.

To enable **explicit claim/sign/swap** later, require:
1. A verified official campaign source and reviewed contract registry with chain ID, target contract, function selector, calldata, recipient and native value bound to a short-lived user intent.
2. An explicit user-initiated action, on-screen human-readable transaction summary, simulation, and **two approvals**: the Museum intent and the external wallet confirmation.
3. Strict denial of arbitrary raw signing, unreviewed token approvals, blind signatures, unlimited spending authorizations, and unsupported methods.
4. No autonomous transaction execution; verify receipt on-chain, protect against replay and duplicate submissions, and record evidence privately.
5. Tests covering cancellation, wallet rejection, wrong-chain transactions, malicious calldata, wrong account, suspicious domains, idempotency, revocation and re-entrancy.

Do not claim that a generic WalletConnect integration automatically implements claim or swap.

## Build / release instructions
Changes to `dist/platform.js` or `dist/walletconnect-adapter.js` require regenerating the tracked `dist/platform-bundle.js`, `dist/walletconnect-bundle.js`, and `src/worker.mjs`:

```sh
npm ci
npm run lint
npm run typecheck
npm run build
npm test
npm run test:runtime
npm audit --omit=dev --audit-level=high
git diff --check
```

Generated artifacts and application source MUST be committed together and checked for parity before deploy. Recheck in Telegram on Android and iOS. Do not update production or merge before required security/recovery release gates.

**Known blocker on 2026-11-18:** the existing production WalletConnect dependency graph reaches picomatch under high-severity advisory `GHSA-fc5q-39xc-vjpf`; no verified compatible fix was available in the latest repository audit. Never suppress the dependency audit to allow deployment.
