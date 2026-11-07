# Local role wireframes / concepts

These are reviewable design concepts, not implemented screenshots or Figma signoff. Existing route/query navigation remains.

```text
PARTICIPANT — narrow layout
[ROSE PULSE] [language] [login/profile]
[SYNTHETIC DEMO — all people and events fictional]
Community events                    [Search]
[Relevant event cover]
Event title / status
Date + local timezone / location
Who can apply / places are server-confirmed
[View event] → full overview → [Apply] [Continue as Guest]
My registrations → state / cancellation / offer acceptance
```

```text
ORGANIZER — wide layout, single-column on narrow view
[navigation] [Your events / Create event] [account]
Pending review · waiting · capacity · updated time (real DB)
Event / operational state / primary action
Manage registrations → selected record
  participant form / status / authorized review actions
  Supporting documents (N)
  [thumbnail + name/type/status] [Preview] [Download]
  [modal: Close | Fit | − | + | Download]
Event operations: assignment / promotion / outbox / attendance / closeout
```

```text
LEADER — task order
[Assigned/downloadable events] [Current account]
[Demo network controls + clearly labelled simulation]
Selected cached event / snapshot time / no place guarantee
Six-field assisted form / attachments require connection
[Save locally] → committed/read-back receipt
Drafts → saved / queued / needs_review counts
[Restore] → no automatic POST → [Sync] → per-item results
Unknown result → immutable IDs retained → [Reconcile GET]
```

Dialog design: fixed backdrop, bounded panel max90dvh, image inside scrollable stage; actions wrap at320px; initial focus Close, Tab stays inside top dialog, Escape closes, focus returns to trigger. PDF is a document card with safe-browser preview attempt or explicit download fallback; never call an icon a page thumbnail.
