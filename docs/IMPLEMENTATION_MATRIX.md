# Integration evidence

Verified 28 October 2026 (Asia/Jakarta). Status: PRODUCTION BLOCKED. No remote writes, migrations, backup exports, or deployments were performed in this execution.

| Remote branch | Observed head | Ancestor of original RC |
|---|---|---|
| `origin` | `12f5abf` | yes |
| `origin/feat/aggregator-core-2` | `1de37e9` | no |
| `origin/feat/sprint-10-production-hardening` | `e5ad083` | no |
| `origin/feat/sprint-11-claim-autopsy` | `d3c560e` | yes |
| `origin/feat/sprint-11-event-sourced-architecture` | `be63e46` | yes |
| `origin/feat/sprint-4-quest-points` | `e2e7636` | no |
| `origin/feat/sprint-6-discovery-automation` | `0467b09` | yes |
| `origin/feat/sprint-7-source-trust` | `365e702` | yes |
| `origin/feat/sprint-8-public-api` | `f9dcac8` | yes |
| `origin/feat/sprint-9-admin-operations` | `2a1e739` | yes |
| `origin/feat/sprint4-quest-points-tracker` | `21b965b` | no |
| `origin/feat/sprint5-portfolio-intelligence` | `8ede3db` | no |
| `origin/main` | `12f5abf` | yes |
| `origin/release/sprint11-production-candidate` | `7c1ad29` | yes |
| `origin/security/walletconnect-zod-remediation` | `e3dbd9e` | no |

| Module | Current candidate | Remaining gate |
|---|---|---|
| Aggregator registry, scanner, monitoring, Telegram alerts | Sprint 5 lineage source, assets, API, cron and queue restored to Worker | Live bindings, source/provider and Telegram checks |
| Quest, points, next actions | Existing Sprint 4 implementation restored through Sprint 5 lineage | Decision-first enforcement across quest and legacy local flows; unify admin RBAC |
| Portfolio, export, signed R2 backup | Source, APIs, page and tests restored | Provision/verify private R2 and signing secret; restore drill |
| Discovery, source trust, public API, admin, operations | Already in RC ancestry; preserved | Remote resources, production auth, staging E2E |
| Event sourcing, evidence, outcomes, patterns, weekly review | Existing implementation retained; consent cache withdrawal fixed | Real D1 concurrent writes, replay/repair drill and privacy erasure policy |
| Registry follow | New canonical registry projection; owned decision required; follow/unfollow recorded as event/compensation | Staging browser E2E; legacy bookmark and restore integration |
| Telegram framing | HTML allows Telegram ancestors; JSON remains restricted | Real Android/iOS Telegram sessions |
| Legacy public catalog | Explicit public visibility and whitelist serialization | Review historical publication flags before rollout |

Alternative Sprint 4 branch is not blindly merged: Sprint 5 depends on `feat/sprint-4-quest-points`; importing the alternate TypeScript implementation would duplicate services against a different draft 0008 schema. No fictitious 0006/0007 migration was found in the fetched branch inventory. PR #11 contains documentation only, not a dependency fix. PR #12 remains draft and unmerged.
