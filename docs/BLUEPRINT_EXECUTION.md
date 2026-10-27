# Blueprint execution — v0.9.0

This release implements a useful slice of the supplied platform blueprint without presenting unfinished services as active.

## Delivered

- Personal campaign intelligence per exhibit: rumor/speculative/confirmed/live/ended or unknown, source announcement, deadline, snapshot date, difficulty, manual gas estimate, reward note, requirements, contract explorer URL, community URL and last review date.
- Source URL required when saving a non-unknown status or campaign date. HTTPS and no embedded credentials. This validates URL format, not official ownership or authenticity.
- Last 20 local edits recorded with device timestamp and changed field names. This is a mutable personal journal, not a historical archive of official announcements.
- Directory filters combine status, opportunity kind, difficulty, gas, ecosystem, source, category and search. Deadline and gas sorting keep unknown values last. Unknown cost remains distinct from a recorded zero.
- Checklist states: pending, done, failed/blocked and needs verification. Done retains the existing backup/XP convention. Needs verification does not claim automatic on-chain checks.
- Museum Radar under Misi & Bounty, plus a header shortcut and home digest. Shows saved unfinished projects' campaign deadlines, snapshot dates and personal research targets in the next seven or previous thirty calendar days. Read state belongs to each project/date/type, so changing a date makes a new unread entry. No timers, cron or outbound messages.
- Export campaign dates as two separate all-day calendar events. Research Pack now includes campaign source data and task states. JSON backup and existing authenticated state serialization support the new fields.

## Still pending

Wallet/email authentication, live campaign ingestion and independent source verification, read-only wallet eligibility checks, push/email/Telegram reminders, shared discussion/moderation, verified scam reports, public reputation/leaderboards, transaction simulation and AI summaries. Telegram authentication and private cloud sync still require this project's bot secret. No unrelated credentials are reused.

The shipped catalog remains fictional demonstration data. Personal edits never become Museum endorsements. All-day dates do not specify a campaign's exact closing hour/timezone; users must inspect the source rules.

Validation: 53 Node tests including eight campaign/radar/backup/calendar cases; browser checks cover source editing, snapshot/deadline rendering and the needs-verification checklist state.
