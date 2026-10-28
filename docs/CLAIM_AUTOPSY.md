# Sprint 11 — Claim Autopsy & Decision Intelligence

## Purpose and boundaries

This is a **personal retrospective notebook**, not an airdrop forecasting system. The application never estimates expected value, future reward, eligibility probability, or claim profitability. Historical observations are user-reported and may be incomplete, affected by selection bias and changing project rules.

The feature is implemented on **`feat/sprint-11-claim-autopsy`**, based on `feat/sprint-10-production-hardening`. **Do not merge/deploy directly onto the unintegrated `main` branch.** At the time this feature was authored, `main` only included SQL migrations 0001–0004 and prior Sprint 2–5 migration coverage was incomplete on the Sprint 10 branch. Reconcile migrations 0005–0009, foreign keys and route contracts in a staging D1 database before production deployment.

## UI

- `/decision-lab.html`: Bahasa Indonesia, mobile-first, linked from the app header.
- **Decision Entry** records the reason, HTTPS primary evidence, decision-source category, time budget, cost ceiling, and realistic expectations *before* setting `follow_status='following'` within this journal. The legacy local Portfolio/bookmark workflow is **not modified**; users who follow campaigns through a legacy path do not automatically get a Decision Entry.
- **Outcome Review** links to the user's own decision, and is permitted only after the campaign is marked ended/completed/closed/expired/claimed/archived, or the published claim deadline has passed.
- **Claim Autopsy** stores public EVM address, pre/post-snapshot activity flags, quest/chain counts, gas/bridge USD estimates, research minutes, reported result, hypothesis, and evidence (tx hash or HTTPS URL). No screenshot uploads or wallet signing. Status of campaign must be finished/claim period expired.
- **Pattern Review** shows retrospective cohorts, not causal factors or predictions. Only autopsies with `consent_to_analysis=true` enter calculations. A cohort needs at least 5 records; under threshold, display **“Belum cukup data untuk pola yang dapat dipercaya”**. Report known allocation, no allocation and unknown outcomes separately.
- **Weekly Review** uses UTC calendar weeks (Monday 00:00 through the following Monday 00:00), campaign and evidence-source counts, outstanding outcome reviews and lessons. Entries are limited to the current week. Evidence quality is a *self-reported source-category indicator*, not an objective fact-check.
- **Evidence Chain Card** is generated entirely from the vetted public campaign registry, linked source trust profiles and unresolved conflicts. Only campaigns explicitly published, with an HTTPS source and a completed verification run, are eligible. Cards never read or include user data and always show the manual-verification disclaimer.

## Database

`migrations/0014_claim_autopsy.sql` is additive, creating:

| Table | Role |
| --- | --- |
| `claim_autopsies` | Raw personal observations, evidence JSON, consent bit, owner ID |
| `decision_entries` | One decision per user/campaign, explicit follow status |
| `outcome_reviews` | One review per decision, linked by FK and scoped to the owner |
| `user_pattern_snapshots` | Private, aggregate-only summary, recomputed from opted-in notes |

Each private table includes `user_scope` (the verified `am_users.id` from session or authenticated Telegram init data). All data queries constrain owner identity server-side. Public API, RSS, webhooks and evidence cards do not join these tables.

The SQLite/D1 migration requires the previous tables `am_users`, `am_core_exhibits`, `am_core_schema` and existing source-trust tables. The migration writes version 11 into `am_core_schema`. Migrating version 0014 does **not** retroactively fill missing 0005–0009 migrations.

## Routes

All returns are JSON, with `Cache-Control: private, no-store` and standard Worker security headers. Authentication is required except for the Evidence Card; all writes require same-origin requests.

| Method | Path | Action |
| --- | --- | --- |
| POST | `/api/autopsy` | Save personal autopsy (201); consent defaults false |
| GET | `/api/autopsy?limit=30` | List owner's latest 1–50 autopsies |
| GET | `/api/autopsy/:id` | Get one owner's note |
| PUT | `/api/autopsy/:id/consent` | Grant or withdraw analysis permission |
| DELETE | `/api/autopsy/:id` | Permanently delete an owner's note |
| POST | `/api/decisions` | Create decision, then mark followed (201; unique per user/campaign) |
| GET | `/api/decisions?limit=50` | List owner's decisions with linked outcome |
| PUT | `/api/decisions/:id/outcome` | Create/update the owner's outcome review |
| GET | `/api/insights/patterns` | Recompute consent-filtered private descriptive patterns |
| GET | `/api/insights/weekly` | Private UTC weekly review |
| GET | `/api/evidence-card/:campaignSlug` | Public source-only evidence summary |

Example Claim Autopsy request (authenticated):

```json
{
  "campaign_id": "example-ended-campaign",
  "wallet_address": "0x1111111111111111111111111111111111111111",
  "activity_before_snapshot": true,
  "activity_after_snapshot": false,
  "quest_count": 8,
  "chain_count": 2,
  "gas_cost_usd": 4.25,
  "bridge_cost_usd": 0.50,
  "research_minutes": 120,
  "decision_source": "official",
  "outcome": "unknown",
  "hypothesis": "Belum ada informasi resmi mengenai alasan alokasi.",
  "evidence": [{"kind": "official_link", "value": "https://example.org/claim"}],
  "consent_to_analysis": false
}
```

Validation rejects negative costs, invalid EVM public addresses, unsupported outcomes, non-HTTPS sources, local/internal URLs, suspected secrets, oversized text, unknown evidence types, oversized bodies and invalid tx hashes. URL queries and fragments are discarded to avoid storing sensitive tokens. No secrets, seed phrases, private keys, auth tokens or raw personal observations should enter logs. Do not add raw request logging to this route.

## Descriptive algorithm

The pattern engine reads only opted-in observations belonging to the caller (hard maximum of 5000; above that, fail rather than silently present a biased truncated sample). Grouping dimensions: pre-snapshot activity, post-snapshot activity, quest count >=4, chain count >=2, recorded gas >=USD 10, and self-reported source category. Threshold is at least five observations **within each group**. Every group contains `sample_count`, `period.from`/`period.to`, `limitations`, `allocated`, `not_allocated`, `unknown`. These thresholds are descriptive presentation guards, not statistical validation.

Insights do not imply causation or forecast any outcome. Small samples, nonrepresentative participants, missing transaction verification, unobserved projects and inaccuracies in manual entry remain important limitations.

## Consent, isolation and sharing

- Opt-in is per **autopsy**, off by default. There is no cross-user learning or pooled aggregation.
- The user can withdraw consent from a saved autopsy or delete it. Aggregate snapshots are purged on withdrawal/deletion; `GET /api/insights/patterns` always recalculates from current opted-in records.
- Access control is enforced on SQL `user_scope`, not by accepting an owner ID from the browser. A valid session/Telegram identity is necessary even to see the owner's autopsy count.
- Only vetted public metadata can be copied/shared through Evidence Card. The share payload contains no wallet, autopsy, Decision Entry, Outcome Review or internal user identifier.
- If the organization needs GDPR-style account deletion, include these four tables in the existing scope-deletion and backup retention processes; deleting active records does not automatically purge historical D1 database backups. Review retention separately.
- **No automated outbound alerts or external partner delivery of personal records.**

## Test and deployment

Run in the integrated checkout on Node.js 22:

```bash
npm ci
npm run build
npm test
node --check dist/decision-lab.js
npx wrangler d1 migrations apply airdrop-museum --local
```

Staging verification: confirm schema alignment 0001–0014, submit a journal entry, set an outcome after campaign completion, deny cross-user retrieval, revoke consent and verify the pattern sample shrinks, test published versus draft Evidence Card, inspect response headers/permissions, and check Telegram in-app viewport. Do **not** deploy to production before branch reconciliation, CI, staging testing and authorization sign-off.

After validating staging backups, apply additive migration in the correct order to the intended Cloudflare C0 D1 binding and deploy through the existing protected deployment workflow. Keep DB backups before migration; rollback should disable/remove the route/UI deployment while retaining private tables until a controlled user-data retention decision. Do not drop 0014 tables to roll back a Worker deployment.

No production schema migration, real Telegram sign-in test, external wallet integration or production deployment is asserted here.
