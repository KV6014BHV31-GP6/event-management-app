# Design redlines before React edits

Status: DESIGN_PROPOSED, based on current source and actual public-home browser observation. Before evidence: before-participant-desktop.png (old5205 runtime, not candidate).

Product: synthetic NGO event operations demo for Participant, Leader and Organizer.
Character: calm, practical and legible. World: community events with limited places and unreliable connectivity.
Moments: secure document inspection; visible durable offline recovery. Signature: existing ROSE forest-green navigation with warm-white workspace and restrained gold focus/accent.

Observed LIGHT issues: home hero uses unrelated mountain-lake image ahead of dates/locations; supporting documents render download-only with no empty state; role priorities are split across navigation rather than first-screen work. New operational surfaces are necessary functionality, not a separate static app.

| Surface | Before | Planned after | Preserved checks |
|---|---|---|---|
| Participant home | Decorative lake and broad marketing copy | Upcoming event list first; title/date/place/status/eligibility guidance; account or Guest apply | search/detail/pagination/share/login/guest/session guard |
| Organizer | Own events and records routes | Pending review, document count, quota and operations entry first | Create/Edit/gallery max3, server ownership, unknown-write lock |
| Leader | Offline drafts navigation | Download event, saved drafts, needs-review and explicit Sync/Reconcile actions first | same actor unlock/fresh auth/immutable queue/manual recovery |
| Registration detail | Download-only files; empty renders nothing | Count, named file cards, image thumbnail, controlled modal, PDF fallback | private fetch ACL/no-store, no token URL, original download |
| Private viewer | absent | labelled dialog, close/fit/zoom/download, keyboard trap/Escape/focus return | cleanup on actor/record/unmount; thumbnail and viewer lifetime separate |
| Demo controls | absent | synthetic notice; Connected/Simulated Offline/Restore/Lose ACK/Reconcile | no OS changes; no auto sync; controls only demo build |

Apply spacing→color→icons→copy→type→layout→detail→visual→motion only where useful. No unrelated library/root-lock changes. Use existing type/icon system; functional transitions only, reduced motion respected. Mobile320/390, tablet768, desktop1440; EN/MS;200%zoom; keyboard focus and scrolling need actual browser evidence. No full accessibility certification claim.
