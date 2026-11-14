# Glossary

Domain terms used in code, tests and reviews. Module names in **bold** are where the term lives.

## Data and honesty

- **Community**: one of APU's 137 clubs, societies or international communities (`src/data/types.ts`).
- **Official field**: a value published by Student Affairs (scraped), kept verbatim in `community.official` (meeting times, eligibility). It is safe to state as fact.
- **Sample value**: made-up demo enrichment (fees, deadlines, join steps, hours, schedules, flags, interested counts) and every event. It must be shown with a "Sample data" chip and phrased as an example ("for example… (sample data)").
- **Provenance** (`src/data/provenance.ts`): the one module that labels each field `official`, `sample` or `none`. Callers read labels; they never re-derive them.
- **Upcoming window**: the 7 days ahead (`UPCOMING_WINDOW_MS`). This window drives brighter stars, `upcoming_events` and offline event replies.
- **Live**: a community with an event today. It gets pulse rings.
- **Timetable fit**: `fits`, `clash` or `unknown` for a student's free times. It carries the **source** of the schedule it rests on.
- **ClubFacts** (`src/card/facts.ts`): everything one student needs about one community (can join, fit, safe official channel, upcoming events, provenance). The detail card renders it, and `get_club` serialises it.
- **Official channel**: the safe join link (`joinHref`): the join URL, then the info page, then the email, then Student Affairs.

## The guide

- **Guide / Ask APU**: the chat that answers and steers the map.
- **GuideAgent** (`server/guideAgent.ts`): `ask(turns, profile)`. It plans with tools, answers as JSON actions, validates, and repairs once. It always resolves, falling back offline.
- **Step** (`server/step.ts`): the seam for one model turn. Adapters: Gemini (`server/gemini.ts`) and scripted steps in tests.
- **Catalog index**: the only catalog the model sees: `id | name | category | tags`. Details come from tools.
- **Tools**: `search_clubs`, `get_club`, `upcoming_events` (`server/tools.ts`).
- **Validator** (`server/validator.ts`): finds **validator problems** in a reply's wording:
  - unknown club names;
  - sample values stated as fact;
  - sample events or schedules presented as real;
  - official links labelled sample;
  - timetable clashes;
  - a hijacked voice.

  A **repair** sends those problems back once as a `[Validator]` message.
- **Hedged sentence**: one that uses "for example", "might", "could" or "sample".
- **Grounded reply**: a reply with non-empty text, only catalog ids (openId first, at most 6) and exactly 3 suggestions (`groundReply` in `shared/conversation.ts`).
- **Trace**: the human-readable agent steps shown as chips under a reply.
- **Offline reply**: an answer from the local matcher (`source: 'offline'`). The same policy runs on the server and the client (`answerOffline`).
- **Confident match**: a hit on a tag, name or country, not just a description word. Only confident matches are called "communities that fit".
- **Related club**: shares a tag with a match. Used to pad thin results.
- **Fenced message**: student text wrapped in `<student_message>` tags, so instructions inside it read as data.

## The map

- **Focus set**: the communities the guide (or the user) zoomed in on, best first, with numbered badges. Its **focus source** is `ai` or `user`.
- **GraphView** (`src/graph/view.ts`): the pure rules for dimming, label priority, camera framing and focus copy. `CampusGraph` is the canvas adapter.
- **Brighter star**: a community with an event in the upcoming window. The sooner the event, the brighter the star.
- **Overview / focus camera**: fit-all framing, versus framing the focus set left of any right-hand overlay (the **inset**).
