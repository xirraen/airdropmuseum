# Sprint 11 — Claim Autopsy Architecture (Event-Sourced)

## Scope and design

Sprint 11 is a private, evidence-backed decision journal and retrospective autopsy for campaigns in the existing Airdrop Museum registry. **It is not a forecast, scoring service for future airdrops, or expected-value calculator**. Claims, evidence, outcome changes and cancellations are represented as immutable events; UI views and tables are projections computed from the same source of truth.

This work is a replacement for the **not-yet-deployed** first Sprint 11 design on `feat/sprint-11-claim-autopsy`. The new branch is `feat/sprint-11-event-sourced-architecture`; merge it into the original Sprint 11 branch before moving downstream to Sprint 10.

### Data model

Fresh-install migration: `migrations/0014_claim_autopsy.sql`.

| Table | Purpose | Write policy |
| --- | --- | --- |
| `autopsy_events` | Append-only immutable audit log; identity, version, knowledge cutoff, evidence references, payload | INSERT only; database triggers reject UPDATE/DELETE and version gaps |
| `claim_autopsies` | Materialized per-aggregate state, outcome/status/consent and JSON snapshot | Only projector writes |
| `decision_entries` | Projected decision with original primary source and budget | Projector; one campaign per owner |
| `evidence_items` | Projected, scoped references and redacted/revoked state | Projector writes; never authoritative |
| `pattern_snapshots` | Optional, private historical summaries of generated insights | Generated from consented records |

All personal tables are scoped to the authenticated `am_users.id`, not a client-provided identifier. Event identity uses random UUIDs. Database uniqueness on `(user_scope, aggregate_id, event_version)` plus a trigger requiring exactly previous version + 1 prevents gaps and concurrent overwrites. An aggregate cannot change campaign or owner. D1 `batch()` commits event insert and materialized projection as one SQLite transaction. A failed batch commits neither event nor projection.

**Immutability:** `autopsy_events_immutable_update` and `autopsy_events_immutable_delete` reject SQL mutation. No API calls UPDATE or DELETE on this table. A cancellation appends `event_compensated` with a reason and target event ID. The deterministic projector skips the original event while preserving it in the timeline. Targeting other compensation events is rejected, and a target can only be compensated once. Projected evidence entries may become revoked; the original source event remains intact.

### Event envelope

Every event has `id, user_scope, aggregate_id, campaign_id, event_version, event_type, knowledge_cutoff_at, evidence_refs, payload_json, recorded_at`. The `knowledge_cutoff_at` field is an explicit ISO 8601 UTC timestamp; it records the maximum knowledge available to the author **at that moment**, distinct from server-assigned `recorded_at`.

Claim-bearing events must contain a nonempty array of valid evidence references. A Decision Entry creates its first official HTTPS evidence reference at version 1, so it is never uncited. Additional evidence is `evidence_added`, with a verified HTTPS source URL or correctly formatted transaction hash. URL query and hash fragments are removed before storage. No raw image upload: screenshots are HTTPS links.

Allowed events: `decision_created`, `evidence_added`, `activity_recorded`, `hypothesis_updated`, `outcome_recorded`, `outcome_revised`, `autopsy_finalized`, `insight_generated`. To support required privacy controls and non-destructive reversal, the architecture adds `analysis_consent_changed` and `event_compensated`.

Validation requires `expected_version` and `knowledge_cutoff_at` on every mutation. Updates after an outcome cannot report a cutoff earlier than that outcome. An outcome is accepted only after the campaign has an ended/completed/closed/expired/claimed/archived status **or** its claim deadline has elapsed. `outcome_revised` requires a nonempty human-supplied reason. Finalization requires an outcome, including an explicit `unknown`.

**Important epistemic limitation:** an author-controlled cutoff is a recorded assertion, not independently proven. Retroactively written activity cannot become automatically verified on-chain evidence. Analysis must not present post-outcome entries as proof of a pre-outcome causal feature.

### Projection model

`projectionService.replay(events)` sorts by monotonic `event_version`, honors compensation, and deterministically builds:
- Current version, state and outcome, with decision/outcome knowledge cutoffs.
- Primary and additional evidence, with immutable origin event references.
- Activities, hypothesis, original decision, analysis consent and finalized status.
- Full event timeline including compensated events (no event erasure).

Projection writes are disposable read caches. The only authoritative history is `autopsy_events`. An administrator can rebuild projections from replay after diagnosing corruption; ordinary user routes cannot directly edit caches.

### Privacy and retrospective thresholds

- No prediction, expected value, probability of reward, or guarantee.
- `analysis_consent` defaults off. Consent can be enabled or withdrawn **only through** `analysis_consent_changed`; a withdrawn autopsy is filtered out of all subsequent personal analysis. Historical insight events remain audit records but are not shared.
- Only **finalized and opted-in** autopsies count. Each cohort needs at least **five** autopsies and **two** known outcomes (`allocated`/`not_allocated`) to display an observation.
- Labels: `insufficient_data` below either threshold, `weak_pattern` for 5–11 records or fewer than 5 known, `moderate_pattern` for at least 12 records and 5 known. **These are descriptive sample-size labels, not statistical confidence levels**.
- Every cohort includes `sample_size`, `known_outcomes`, `period.from`/`period.to`, `limitations`, `disclaimer` and the appropriate no-data message.
- Neutral cohorts: recorded before/after snapshot activity, quest count, chain count, gas costs and source type. Sampling and reporting limitations (self-reported activity, selective campaigns, external rules) are disclosed.
- Weekly review uses Monday-to-Monday UTC. Only the requesting account's decisions are analyzed.
- Public Evidence Card reads **only the vetted public campaign/source tables**, never user event tables. It requires published status, an HTTPS primary source, and a completed verification run.

### API

All personal routes require verified Cloudflare session or Telegram init data. All writes require an exact same-origin `Origin` header and a monotonic expected version. HTTP JSON responses are `private, no-store`.

| Method | Route | Event/action |
| --- | --- | --- |
| POST | `/api/autopsy/decisions` | `decision_created` (version 1, creates initial evidence reference) |
| GET | `/api/autopsy/decisions` | List scoped decision projections |
| POST | `/api/autopsy/:id/evidence` | `evidence_added` |
| POST | `/api/autopsy/:id/activity` | `activity_recorded` |
| POST | `/api/autopsy/:id/hypothesis` | `hypothesis_updated` |
| POST | `/api/autopsy/:id/outcome` | `outcome_recorded` or `outcome_revised` with reason |
| POST | `/api/autopsy/:id/finalize` | `autopsy_finalized`; optionally an `insight_generated` event if consented |
| GET | `/api/autopsy/:id` | Replay owner's event history, return private state/timeline |
| GET | `/api/autopsy/insights/patterns` | Personal cohort review |
| GET | `/api/autopsy/insights/weekly` | Weekly review |
| GET | `/api/autopsy/evidence-card/:campaignSlug` | Public, scrubbed, source-only evidence summary |
| POST | `/api/autopsy/:id/consent` | `analysis_consent_changed`, true/false |
| POST | `/api/autopsy/:id/compensate` | `event_compensated` (reason required, no deletion) |

**Deprecated**: direct-mutating prior Sprint 11 routes such as `POST /api/autopsy`, `POST /api/decisions`, and the previous `PUT /api/decisions/:id/outcome` must not mutate old tables. They are rejected with a migration/legacy response where routed. The new architecture does not silently convert direct writes.

Example (authenticated, same origin):

```json
{
  "campaign_id": "public-campaign-slug",
  "reason": "Meninjau dokumen resmi sebelum masuk.",
  "primary_evidence_url": "https://example.org/official",
  "decision_source": "official",
  "time_budget_minutes": 60,
  "cost_ceiling_usd": 5,
  "realistic_expectations": "Tidak ada jaminan mendapatkan alokasi.",
  "expected_version": 0,
  "knowledge_cutoff_at": "2026-10-28T10:00:00.000Z"
}
```

On a subsequent POST, send the returned aggregate ID, current `expected_version`, new cutoff, and `evidence_refs` from the owner-visible projection for a claim-bearing event. A duplicate/late version returns 409. Never log raw payloads or user identity.

### UI

The mobile-first Indonesian `/decision-lab.html` includes Decision Journal, selected aggregate timeline with replayed evidence and revision markers, evidence/activity/hypothesis forms, outcome recording and revision reason, opt-in consent, compensating-event action, finalization, Pattern Insights, Weekly Review, and a safe public Evidence Chain Card share action.

Legacy browser-local Portfolio/bookmark behavior is **not modified**. Decision-first is enforced for follow operations originating in the new journal, not all old saved-item interactions.

## Deployment and rollback

The existing Sprint 10 base branch has **unmerged earlier Sprint 2–5 schemas (0005–0009)**. Reconcile those migrations, registry constraints, authorization, and data retention workflows in a dedicated integration branch before production. The previous iteration of `0014_claim_autopsy.sql` defined an **incompatible, non-event-sourced layout**. If that migration has been applied to *any* persistent environment, **never rewrite the applied migration in place**: create forward-only `0015` migration to preserve and transform already saved private records. This source branch's 0014 replacement is for a fresh, never-migrated environment.

Run on Node 22 with a fresh staging D1:

```bash
npm ci
npm run build
npm test
node --experimental-sqlite scripts/validate-migrations.mjs
node --check dist/decision-lab.js
npx wrangler d1 migrations apply airdrop-museum --local
```

Then perform: two concurrent version submissions (one must fail), immutable UPDATE/DELETE attempts, replay after compensating an event, consent withdrawal, cross-tenant access, private/public card boundary, Telegram native UI review, Worker CSP/frame testing, and staging backup/restore drill. Verify no legacy direct-write route is exposed.

Deploy only after CI, security review, complete migration history reconciliation and required approvals. Rollback **Worker code and UI** via the protected workflow, retain append-only event rows; do not drop production tables or delete event history.


## Registry follow integration (candidate, not deployed)

Migration 0015 bridges aggregator campaigns into reserved agg_ canonical IDs without publishing them or inventing legacy decisions. New Portfolio subscriptions require an owned event-backed Decision Entry. Following appends an activity_recorded event with activity_kind=follow_campaign and unspecified snapshot phase; subscription rows are its read projection. Unfollowing compensates the follow event, and refollow appends a new event. Existing unmatched subscriptions remain readable as decision_required. Legacy local bookmarks, quest participation and backup restore are not fully converted and remain release blockers.

Consent withdrawal deletes all owner pattern snapshots in the same D1 batch as the immutable consent event. Insight cache insertion checks the owner event-count checkpoint so it cannot recreate a stale cache across concurrent owner events. Historical events remain intact.

## Transactional repair and private export

Owner-authenticated POST /api/autopsy/:aggregate/replay repairs projections from immutable events. A guard in the same D1 batch rejects a stale event-version replay. No source event is changed or deleted. GET /api/autopsy/export provides bounded owner-filtered pages with a timestamp cutoff and cursor; historical imports cannot overwrite events. Export is personal data and must remain private.
