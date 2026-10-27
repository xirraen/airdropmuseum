# UI structure — 0.6

## Four primary destinations

| Primary section | Included tools |
| --- | --- |
| Beranda | Personal summary, active research, deadlines, progress, collection preview |
| Jelajahi | Search/filter exhibit directory; transparency methodology as a secondary tab |
| Portofolio | Board/list, calendar, archive and outcome ledger as secondary tabs |
| Profil | Overview, invite sharing, backup/privacy/integrations as internal tabs |

Referral sharing is no longer a primary navigation destination. It lives under Profil → Ajak teman. `/referral`, `/voices`, `/archive` and `/calendar` hash routes remain compatible and activate their correct parent navigation section.

## Exhibit detail

The detail dialog now contains three sections: Ringkasan & bukti; Tugas & catatan; Ulasan pribadi. Unsaved task-form drafts survive internal tab switches during the current detail session. Saving explicitly persists the record; checklist interaction retains its existing self-reported autosave behavior. Opening a different exhibit resets the form draft. Drafts do not survive browser reloads.

## Visual system

Navy/silver-blue palette, shared border/shadow/spacing hierarchy, SVG line icons, clear action hierarchy, exhibit artwork built with CSS, a consistent profile cover and share panel. No fabricated graphs, earnings, verification badges or referral incentives are added. Statistic cards reflect local stored data.

## Validation

- Existing server, database and privacy boundaries are retained.
- Main navigation and legacy route grouping are covered by tests.
- Desktop browser and 390 px embedded mobile viewport checked for navigation and layout. This is responsive-browser verification, not a native Telegram device test.
- Profile invite section, exhibit task tabs and unsaved draft retention verified interactively.
- No production data migration is needed for this UI release.
