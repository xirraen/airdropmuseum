# Action Desk 1.2

Action Desk is the default Misi & Bounty view, nested under the four existing primary destinations. It derives a personal work queue from the same normalized state used by the exhibit checklist, campaign intelligence and Hunter Lab. It adds no secondary task store or database migration.

## Working behavior

- Includes tracked projects except completed or archived records. Demonstration projects retain their fictional label.
- Shows overdue/today dates first, blocked tasks, verification tasks and near dates, missing/stale source context, then one pending next task per exhibit. Personal priority breaks otherwise equal ranks. Dates remain calendar dates; no campaign closing time is assumed.
- Keeps overdue dates visible even beyond Radar's 30-day window. Review source rules or update the personal date to resolve them.
- Campaign source reviews are due when no review date exists, or fourteen calendar days after the recorded review. This is a workflow reminder, not a freshness or trust assessment.
- Flags submitted briefs without a recorded submission URL. A complete checklist without a Proof Trail gets a documentation follow-up.
- Combines text, action kind and exhibit filters. Shows thirty rows at a time with an explicit load-more control. Metric counts summarize the complete queue, not the current filter.
- Quick task changes update `done` and `taskStates` together. Only tracked, active, existing task keys can be updated. Existing backup and account sync carry these records under their established explicit flows.
- Filtered Markdown plan previews all matching actions, including rows not loaded yet. Downloads are client-side and do not publish or send a plan. Review private context before sharing.

## Validation

`npm run build` and `npm test`: 85 passing tests. New cases cover queue derivation without mutation, task visibility, overdue dates, invalid dates, fourteen-day review threshold, scoped status updates, backup round trips, brief/proof gaps, combined filters and Markdown escaping.

Browser QA used only a local fictional Prism exhibit. Verified tracking creates the queue, a failed task moves into the blocked section, the blocked filter selects it, its checklist opens with the same state, and marking it done removes it from the blocked queue. Also verified the Markdown preview contains the filtered queue. Production QA does not create projects or change user records.

## Boundaries

Work queue actions are self-reported. A review task is not independent verification, a date is not an eligibility confirmation, and completing a checklist does not award server reputation. No source is fetched or on-chain action sent by Action Desk. Provider dependencies documented in BLUEPRINT_COVERAGE.md remain unchanged.
