# WalletConnect storage subset

This private package contains byte-identical runtime files from MIT-licensed
`unstorage@1.17.6` (https://github.com/unjs/unstorage). SHA-256 hashes in
`upstream-sha256.json` pin every copied file. It retains the memory/core API,
browser custom-driver support and Node `fs-lite` driver used by
`@walletconnect/keyvaluestorage@1.1.1`.

The npm override removes unused filesystem watching, glob matching, HTTP server
and cloud drivers from the installed dependency graph. In particular it removes
`anymatch` → `picomatch` (GHSA-fc5q-39xc-vjpf), rather than suppressing audit findings.
No upstream runtime code is patched. Unsupported driver imports fail explicitly.

When updating WalletConnect or unstorage, review all storage imports, regenerate
hashes from the original package, and run the storage compatibility and wallet
lifecycle tests plus npm audit. Do not broaden exports without reviewing their
transitive dependencies. Keep LICENSE with all redistributed copies.
