# APU Campus Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployed, working prototype: a living graph of all 137 APU communities, steered by a Gemini chat guide. Submit it to the APU Cloud Innovation Hackathon portal with its repo and PDF deck.

**Architecture:** A Vite + React + TS single-page app renders the graph (`react-force-graph-2d`), the chat panel and the detail cards from a catalog built at build time. A small Express server serves the built app plus `/api/chat` and `/api/extract`. Both endpoints call Gemini with structured JSON output and fall back to a local keyword matcher. One Docker image runs on Cloud Run.

**Tech Stack:** Node 20, TypeScript 5, React 18, Vite 5, react-force-graph-2d, Vitest + @testing-library/react, Express 4, @google/genai, Docker, Google Cloud Run.

**Spec:** `docs/superpowers/specs/2026-11-13-apu-campus-graph-design.md`

## Global Constraints

- **Project root:** `D:\APU\_Competitions and Hackathons\apu-campus-graph`. Real data lives in `data/clubs.json` (137 entries). Never edit it by hand.
- **Category counts:** 78 `Societies & SIGs`, 31 `Sports & Recreation`, 28 `International`.
- **Group mapping from the raw `group` field:** `"Societies & Special Interest Groups (SIG's)"` → `soc`, `"Sports & Recreation"` → `spo`, `"International communities"` → `intl`.
- **Colours and font:**
  - `--primary #2a83ff`, `--soc #2a83ff`, `--spo #42ba96`, `--intl #ff8b33`, `--live #e04a5a`, `--warn #f1c92b`
  - dark: `--bg #000000`, `--surface #191919`, `--step-50 #1e1e1e`, `--step-100 #2a2a2a`
  - light: `--bg #f8f8f8`, `--surface #ffffff`
  - font: `Roboto, "Helvetica Neue", sans-serif`
- **Sample data:** every value from `data/enrichment.json` carries `sample: true`. The UI shows a "Sample data" tag wherever it is rendered.
- **No personal names in the UI:** `president` and `advisors` are never rendered.
- **AI grounding:** the AI may only reference IDs present in the catalog. Unknown IDs are dropped before reaching the UI.
- **Secrets:** the Gemini key comes only from `GEMINI_API_KEY` on the server. Never ship it to the client, and never commit `.env`.
- **Model:** `GEMINI_MODEL` env var, default `gemini-2.5-flash`. At Task 7, confirm the current model id in the Gemini docs.

## Review Focus

1. **Gemini returns IDs that aren't in the catalog, or malformed JSON.** Expected: the UI shows the text, ignores the bad IDs, and never crashes. Test lives in Task 7 (`parseGuideResponse`).
2. **No API key, or Gemini times out or returns 429.** Expected: `/api/chat` answers within about 8s from the offline matcher, with `source: "offline"`. Test lives in Task 7.
3. **A community with no enrichment** (most of the 137). Expected: the card still renders, the fine print says "Not published yet. Ask the guide to check their latest post", and "Can I join?" shows "Open to all APU students" because Student Affairs says clubs are open to all. Test lives in Task 5.
4. **A profile with no free slots, or no profile at all.** Expected: the time-fit result is `unknown`, shown as "Set your free times to check", never as "clashes". Test lives in Task 5.
5. **The poster extract returns partial fields.** Expected: only the returned fields override; missing fields keep their prior value. Test lives in Task 9.

---

### Task 0: Finish the Figma prototype (design only, no code)

**Files:** Figma file `TKAfwFdwrllShZB7j79O6G`. Existing frames: `3:2` (Explore) and `3:326` (AI Focus).

- [ ] **Step 1:** Add frame `03 · Mobile — Explore + Ask sheet` (390×844) at x=3080, in APSpace **light** tokens:
  - graph on top
  - bottom sheet chat (collapsed: input plus 3 prompt chips)
  - APSpace-style bottom tab bar: Dashboard, Timetable, Campus Life (active), Attendance, More
- [ ] **Step 2:** Add frame `04 · Mobile — Detail card` (390×844): the Photography Club card as a full-height sheet.
- [ ] **Step 3:** Add frame `05 · Paste a poster` (1440×900): a modal with a caption/poster drop zone on the left and the Gemini-extracted fine-print fields on the right, plus "Apply to card".
- [ ] **Step 4:** Wire the prototype links with `setReactionsAsync`, using ON_CLICK → NAVIGATE / SMART_ANIMATE 400ms:
  - `01` prompt chip "I'm free Friday nights…" → `02`
  - `02` "← All communities" → `01`
  - `03` chip → `04`
  - `04` close → `03`
  - Set `01` as the flow starting point.
- [ ] **Step 5:** Take one screenshot of each new frame and check for clipped text. Return the frame IDs.

### Task 1: Scaffold repo, tokens, test runner

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/tokens.css`, `src/styles/app.css`, `.gitignore`, `.env.example`, `README.md`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces:
  - npm scripts `dev` (vite + server concurrently), `build` (vite build + tsc server), `start` (node dist-server/server/index.js), `test` (vitest run)
  - CSS variables from Global Constraints on `:root` (dark) and `:root[data-theme="light"]`
- Dependencies: `react react-dom react-force-graph-2d express @google/genai`
- Dev dependencies: `vite @vitejs/plugin-react typescript vitest jsdom @testing-library/react @testing-library/jest-dom @types/react @types/react-dom @types/express tsx concurrently supertest @types/supertest`

- [ ] **Step 1:** Run `git init` and `npm init -y`, install the deps, and add `.gitignore` covering `node_modules dist dist-server .env`.
- [ ] **Step 2:** Write the failing test `App.test.tsx`: `render(<App/>)` → `getByText('Campus Life')` is in the document.
- [ ] **Step 3:** Run `npx vitest run src/App.test.tsx`. Expected: FAIL (no App).
- [ ] **Step 4:** Implement `App` as the APSpace toolbar shell (brand "APSpace | Campus Life", tabs, theme toggle), plus `tokens.css`. Load Roboto from Google Fonts in `index.html`.
- [ ] **Step 5:** Run `npm test`. Expected: PASS. Run `npm run dev` and confirm the toolbar renders at http://localhost:5173.
- [ ] **Step 6:** Commit: `chore: scaffold vite react app with APSpace tokens`.

### Task 2: Catalog + sample enrichment

**Files:**
- Create: `src/data/types.ts`, `src/data/catalog.ts`, `data/enrichment.json`
- Test: `src/data/catalog.test.ts`

**Interfaces:**
- Produces, in `types.ts`:
  - `type CategoryKey = 'soc'|'spo'|'intl'`
  - `interface FinePrint { fee?: string; register?: string; booking?: string; slots?: string; deadline?: string; source?: string; extractedAt?: string; sample?: boolean }`
  - `interface Slot { day: 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun'; start: string /*HH:MM*/; end: string }`
  - `interface Community { id: string; name: string; shortName: string; category: CategoryKey; description: string; email?: string; instagram?: string; moreInfoUrl?: string; joinUrl?: string; logoUrl?: string; activity: number /*1-5*/; tags: string[]; eligibility: { openToAll: boolean; note?: string }; beginnerFriendly?: boolean; recruiting?: boolean; hoursPerWeek?: string; schedule?: Slot[]; vibeQuote?: string; interested?: number; finePrint?: FinePrint; sample: boolean }`
  - `interface CampusEvent { id: string; communityId: string; title: string; place: string; start: string /*ISO*/; going: number; sample: true }`
- Produces, in `catalog.ts`:
  - `slugify(name: string): string`
  - `shortName(name: string): string` (strips `(...)` and `[...]` and trims)
  - `buildCatalog(raw: RawClub[], enrichment: Enrichment): Community[]`
  - `export const catalog: Community[]` and `export const events: CampusEvent[]`, built from the JSON imports
- **Tags:** derive them with a fixed keyword table over name and description: photo, film, music, dance, tech, ai, cloud, security, business, finance, culture, faith, volunteering, sport-team, martial-arts, outdoor, games, language, leadership, women. Each community has ≥1 tag; fall back to the category name.
- **`enrichment.json` shape:** `{ communities: { [id]: Partial<Community> & {finePrint?: FinePrint} }, events: CampusEvent[] }`.
  - Cover these IDs at minimum: `apu-photography-club`, `visual-cinematography-club-vcc`, `movie-video-club-mvc`, `travelling-club-trvc`, `apu-artificial-intelligence-club-aic`, `aws-cloud-club`, `apu-dance-club`, `badminton-club`, `esports-club`, `apu-indonesian-student-society-auiss`, `apu-music-club-amc`, `apu-game-development-club-apugdc`, `tedxasia-pacific-u`, `mens-futsal-club`, `apu-china-students-association-apu-csa`.
  - Use the values from Figma frame `02` for the photography club: RM 20 / semester; Google Form (link in @apu.pc bio); booking needed for trips; photo walk max 25; deadline 20 Nov 2026; ~2–3 hrs/week; Fri 19:00–21:00.
  - Add 6–8 events dated today and tomorrow.

- **`slugify` rule:**
  1. Lowercase.
  2. Drop apostrophes.
  3. Replace `&` and every run of non-`[a-z0-9]` with `-`.
  4. Trim dashes.

  Example: `"Men's Futsal Club"` → `mens-futsal-club`.
- **Name cleanup:** some raw names carry scraper notes such as `(index name: …)` or `(detail heading: …)`. Remove any parenthetical that contains `:` before slugifying, and use the cleaned name everywhere.
- **Server build:** `tsconfig.server.json` must include `server`, `shared`, `src/data`, `src/card/fit.ts` and `src/profile/profile.ts`, because the server reuses the catalog and fit logic.

- [ ] **Step 1:** Write the failing tests:
  - `catalog.length === 137`
  - `slugify("Men's Futsal Club") === 'mens-futsal-club'`
  - the cleaned name of `"APU Maths Club (AMC) (index name: Maths Club)"` is `"APU Maths Club (AMC)"`
  - IDs are unique
  - counts `{soc:78, spo:31, intl:28}`
  - `slugify('Movie & Video Club (MVC)') === 'movie-video-club-mvc'`
  - `shortName('APU Photography Club') === 'APU Photography Club'`
  - every `enrichment.communities` key exists in the catalog
  - the photography community has `finePrint.fee === 'RM 20 / semester'` and `sample === true`
  - an unenriched community has `sample === false` and `eligibility.openToAll === true`
  - every community has `tags.length >= 1`
  - no `Community` object has keys `president` or `advisors`
- [ ] **Step 2:** Run `npx vitest run src/data`. Expected: FAIL.
- [ ] **Step 3:** Implement `catalog.ts` and write `enrichment.json`.
- [ ] **Step 4:** Run `npx vitest run src/data`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: build community catalog from Student Affairs data + sample enrichment`.

### Task 3: Graph model

**Files:**
- Create: `src/graph/model.ts`
- Test: `src/graph/model.test.ts`

**Interfaces:**
- Consumes: `Community`, `CampusEvent`.
- Produces:
  - `interface GNode { id: string; kind: 'center'|'hub'|'community'; category?: CategoryKey; label: string; size: number; live: boolean; community?: Community }`
  - `interface GLink { source: string; target: string; kind: 'hub'|'member'|'shared' }`
  - `toGraph(c: Community[], e: CampusEvent[]): { nodes: GNode[]; links: GLink[] }`
- **Rules:**
  - 1 `center` (id `apu`) and 3 hubs (`hub-soc`, `hub-spo`, `hub-intl`)
  - hub→center links of kind `hub`
  - each community→its hub link of kind `member`
  - `shared` links between communities of different categories that share a non-category tag, capped at 40, chosen deterministically by sorted ID pairs
  - `size = 3 + activity*1.2`
  - `live` is true when any event of that community starts today

- [ ] **Step 1:** Write the failing tests:
  - `nodes.length === 141`
  - exactly 1 center and 3 hubs
  - member links === 137
  - shared links ≤ 40, and none links two nodes of the same category
  - the photography node is `live` when given an event today, and not live for an event tomorrow (use a fixed `now` param: `toGraph(c, e, now = new Date())`)
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: graph model`.

### Task 4: Living graph view

**Files:**
- Create: `src/graph/CampusGraph.tsx`, `src/graph/draw.ts`, `src/graph/Filters.tsx`, `src/graph/LiveTicker.tsx`, `src/graph/Legend.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `toGraph`, `catalog`, `events`.
- Produces:
  - `CampusGraph` props: `{ focusIds: string[]; selectedId: string|null; filter: CategoryKey|'all'|'today'; onSelect(id: string): void }`
  - a ref handle `CampusGraphHandle { focus(ids: string[]): void; reset(): void }`
- **Behaviour (matches Figma `01`/`02`):**
  - **Node drawing (`draw.ts` `drawNode(node, ctx, scale, state)`):** fill in the category colour with `shadowBlur` glow. Live nodes get two expanding pulse rings animated by time. Label pills appear on live nodes, focused nodes and at zoom > 2.5. Hubs show their count inside and a name pill below. The center is a white disc reading "APU".
  - **Focus:** non-focused nodes and links go to alpha 0.2. Focused nodes get a numbered badge (1..n), dashed links between focused nodes, and `zoomToFit(600, 120, n => focusIds.includes(n.id))`.
  - **Reset:** `zoomToFit(600, 60)`.
  - **Overlays:** title "Discover campus life" with the subtitle, filter chips, live ticker (next event from `events`), legend with "Events are sample data", and zoom buttons. In focus mode, show the breadcrumb "← All communities · {category} › N matches" plus the hint pill.
  - **Background:** `#000` with three blurred radial "nebula" gradients per hub, drawn in `onRenderFramePre`.

- [ ] **Step 1:** Mount `CampusGraph` in `App` with temporary buttons that call `focus(['apu-photography-club','visual-cinematography-club-vcc','movie-video-club-mvc','travelling-club-trvc'])` and `reset()`.
- [ ] **Step 2:** Run `npm run dev`. Use Playwright to screenshot `/` at 1440×900. Expected: it matches the Figma `01` composition (137 glowing nodes, 3 hubs, pulse rings, labels readable, no overlay overlapping a hub).
- [ ] **Step 3:** Click the focus button and take a screenshot. Expected: 4 numbered nodes zoomed in and the rest dimmed, matching Figma `02`.
- [ ] **Step 4:** Remove the temporary buttons, then run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: living campus graph view`.

### Task 5: Profile, join/time-fit logic, detail card

**Files:**
- Create: `src/profile/profile.ts`, `src/profile/ProfileSheet.tsx`, `src/card/fit.ts`, `src/card/DetailCard.tsx`
- Test: `src/card/fit.test.ts`, `src/profile/profile.test.ts`

**Interfaces:**
- Produces:
  - `interface Profile { year: 1|2|3|4; level: 'foundation'|'diploma'|'degree'|'masters'; interests: string[]; free: Slot[]; going: string[]; week: string[] }`
  - `loadProfile(): Profile|null`
  - `saveProfile(p: Profile): void` (localStorage key `apu-campus-graph/profile`, wrapped in try/catch)
  - `canJoin(c: Community, p: Profile|null): { ok: boolean; reason: string }`
  - `timeFit(c: Community, p: Profile|null): { status: 'fits'|'clash'|'unknown'; reason: string }`
  - `joinHref(c: Community): string` (`joinUrl` → `moreInfoUrl` → `mailto:email` → the Student Affairs subpage)
  - `DetailCard` props `{ community: Community; profile: Profile|null; onClose(): void; onToggleGoing(id): void; onToggleWeek(id): void }`
- **Rules:**
  - `timeFit` returns `'fits'` when every schedule slot lies inside some free slot on the same day.
  - It returns `'clash'` when any slot doesn't fit.
  - It returns `'unknown'` when the community has no schedule, there's no profile, or `p.free` is empty.

- [ ] **Step 1:** Write the failing tests:
  - photography + profile free `Fri 18:00–22:00` → `fits`
  - free `Fri 20:00–22:00` → `clash`
  - null profile → `unknown`, with reason `'Set your free times to check'`
  - empty `free` → `unknown`
  - an unenriched community → `canJoin.ok === true`, with reason `'Open to all APU students'`
  - `joinHref` fallback order holds (four cases)
  - `saveProfile` then `loadProfile` round-trips
  - `loadProfile` returns null when localStorage throws
- [ ] **Step 2:** Run `npx vitest run src/card src/profile`. Expected: FAIL.
- [ ] **Step 3:** Implement the logic. Then build `DetailCard` from the Figma `02` card section by section:
  - header
  - vibe strip (gradient placeholders tinted by category, captions from tags)
  - quote
  - badges
  - time commitment with fit bar
  - fine print with a "Sample data" or "Extracted by Gemini from {source}" footer, or the empty-state copy from Review Focus #3
  - buttons
  - "Go together · {interested + (going?1:0)} interested" toggles `profile.going`
  - "Add to my week" toggles `profile.week`
  
  Build `ProfileSheet` as a 4-question sheet: year, level, interest chips (from the tag table), and free-time picker (day × evening/afternoon/weekend presets). It opens from the toolbar avatar, and once on first visit after the first chat message.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then screenshot the card for photography and for an unenriched club (e.g. `kazakh-community`).
- [ ] **Step 5:** Commit: `feat: detail card with join, time-fit and fine print`.

### Task 6: Offline guide matcher (shared by client and server)

**Files:**
- Create: `shared/guide.ts`
- Test: `shared/guide.test.ts`

**Interfaces:**
- Produces:
  - `interface GuideReply { reply: string; focusIds: string[]; openId: string|null; suggestions: string[]; source: 'gemini'|'offline' }`
  - `localMatch(query: string, catalog: Community[], profile: Profile|null): GuideReply`
- **Behaviour:**
  - Score = tag/keyword hits in name, description and tags, + 2 for overlap with profile interests, + 1 if `timeFit === 'fits'`. Take the top 4 with score > 0 as `focusIds`.
  - `openId` is a community whose name appears in the query (e.g. "how do I join the photography club").
  - If nothing matches: empty focus, and a reply pointing to the category filters.
  - `suggestions` are always 3 strings.

- [ ] **Step 1:** Write the failing tests:
  - "I love photography and want friends" → `focusIds` includes `apu-photography-club`, length ≤ 4
  - "how do I join the Photography Club?" → `openId === 'apu-photography-club'`
  - "zzzz" → `focusIds` is `[]`, `source === 'offline'`, `suggestions.length === 3`
  - "badminton" → focus includes `badminton-club`
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: offline guide matcher`.

### Task 7: `/api/chat` with Gemini

**Files:**
- Create: `server/index.ts`, `server/gemini.ts`, `server/chat.ts`
- Test: `server/chat.test.ts`

**Interfaces:**
- Consumes: `catalog`, `localMatch`, `GuideReply`.
- Produces:
  - `POST /api/chat` with body `{ messages: {role:'user'|'model'; text:string}[]; profile: Profile|null }`, returning `GuideReply`
  - `buildSystemPrompt(catalog: Community[], events: CampusEvent[]): string`
  - `parseGuideResponse(raw: string, validIds: Set<string>): GuideReply|null`
  - `createChatHandler(deps: { generate(prompt): Promise<string> | null })`, so tests inject a fake
- **System prompt rules** (copy into the prompt):
  - Answer only from the CATALOG.
  - Never invent communities, fees or dates.
  - When a value is marked sample, say it is an example.
  - Keep replies under 90 words, friendly, and in the user's language.
  - Return 1–6 `focusIds`, ordered best first.
  - Set `openId` only when the user asks about one specific community.
  - The catalog is serialised one line per community: `id | name | category | tags | eligibility | hours | schedule | finePrint`.
- **Structured output:** `responseMimeType: 'application/json'`, with a `responseSchema` matching `reply`, `focusIds`, `openId` (nullable) and `suggestions`.
- **Robustness:** 8s timeout via `AbortController`. On any error, timeout, 429 or missing key, return `localMatch` with `source:'offline'`.
- **Server:** serves `dist/` statically with an SPA fallback, uses `express.json({limit:'6mb'})`, and listens on `PORT` (default 8080).

- [ ] **Step 1:** Write the failing tests (supertest + fake `generate`):
  - valid JSON with one unknown ID → that ID is dropped and `source:'gemini'`
  - non-JSON text → offline result
  - `generate` throws → offline result, status 200
  - no key (`generate` null) → offline
  - `buildSystemPrompt` contains `apu-photography-club` and does **not** contain any `president` value from `clubs.json`
- [ ] **Step 2:** Run `npx vitest run server`. Expected: FAIL.
- [ ] **Step 3:** Implement. `gemini.ts` wraps `new GoogleGenAI({apiKey})` and `models.generateContent({model, contents, config:{systemInstruction, responseMimeType, responseSchema}})`.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then make one live call with a real key: `curl -X POST localhost:8080/api/chat -H "content-type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"text\":\"I like photography, free Friday nights\"}],\"profile\":null}"`. Expected: `source:"gemini"`, and focus includes `apu-photography-club`.
- [ ] **Step 5:** Commit: `feat: gemini chat endpoint with grounded ids and offline fallback`.

### Task 8: Ask APU chat panel wired to the graph

**Files:**
- Create: `src/chat/ChatPanel.tsx`, `src/chat/useGuide.ts`
- Modify: `src/App.tsx`
- Test: `src/chat/useGuide.test.ts`

**Interfaces:**
- Consumes: `/api/chat`, `GuideReply`, `CampusGraphHandle`, `DetailCard`.
- Produces: `useGuide()` returning `{ messages, send(text): Promise<void>, pending: boolean, last: GuideReply|null }`. If `fetch` fails, it falls back to client-side `localMatch`.
- **Behaviour (Figma `01`/`02` right panel):**
  - greeting bubble
  - "Happening today" event cards (click → focus that community)
  - "Try asking" chips
  - user bubbles in primary blue
  - AI bubbles with a numbered list of focused communities (click → open card)
  - suggestion chips
  - typing indicator while pending
  - footer "Answers use APU Student Affairs data · 137 communities"
  - when a reply arrives, call `graph.focus(focusIds)`; if `openId` is set, open its `DetailCard`

- [ ] **Step 1:** Write the failing tests:
  - `send` appends the user message, and then the reply on resolve
  - when `fetch` rejects, `last.source === 'offline'`
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement and wire it into `App`.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then do an end-to-end check with Playwright: type the Figma `02` question and screenshot. Expected: the graph zooms to the matches, the bubbles render, and asking "How do I join the Photography Club?" opens its card.
- [ ] **Step 5:** Commit: `feat: ask APU chat drives graph focus and cards`.

### Task 9: Gemini reads posters (`/api/extract` + modal)

**Files:**
- Create: `server/extract.ts`, `src/extract/PosterModal.tsx`, `src/extract/overrides.ts`
- Test: `server/extract.test.ts`, `src/extract/overrides.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/extract` with body `{ communityId: string; text?: string; imageBase64?: string; mimeType?: string }`, returning `{ finePrint: FinePrint; hoursPerWeek?: string; source: 'gemini'|'unavailable' }`
  - `applyOverride(c: Community, o: FinePrint): Community`, which merges only the defined fields and sets `source`/`extractedAt` (localStorage key `apu-campus-graph/overrides`)
- **Extraction prompt:** "Extract only what is stated. Leave fields empty if not stated. Dates in D Mon YYYY."
- **Without a key:** return `source:'unavailable'`, and the modal shows "Gemini key not configured".
- **Modal (Figma `05`):** open it from the detail card's "Update from a post" link. Left side: textarea plus image drop. Right side: extracted fields. Button: "Apply to card".

- [ ] **Step 1:** Write the failing tests:
  - fake generate returns `{fee:'RM 10'}` → response `finePrint.fee === 'RM 10'`
  - `applyOverride` with `{deadline:'1 Dec 2026'}` keeps the existing `fee`
  - an empty override changes nothing
  - an image payload over 6 MB → 413
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. The image goes in as an `inlineData` part.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then do a live check: paste a sample caption ("Photo walk this Sat 9am, RM5 for non-members, 20 slots, register via link in bio by Thu") → the card updates and shows "Extracted by Gemini".
- [ ] **Step 5:** Commit: `feat: gemini poster extraction into fine print`.

### Task 10: Mobile layout + light theme polish

**Files:**
- Modify: `src/App.tsx`, `src/styles/app.css`, `src/chat/ChatPanel.tsx`, `src/card/DetailCard.tsx`

- [ ] **Step 1:** Below 900px:
  - the toolbar collapses to brand plus avatar
  - an APSpace bottom tab bar appears
  - the chat becomes a draggable bottom sheet (collapsed 140px, expanded 75vh)
  - the detail card becomes a full-height sheet
  - Use `100dvh`, `env(safe-area-inset-bottom)`, a 16px input font, and `touch-action: none` on the canvas only.
- [ ] **Step 2:** The theme toggle switches `data-theme` and is persisted with try/catch. The graph background and label pills read the CSS variables.
- [ ] **Step 3:** Take Playwright screenshots at 390×844 (dark and light) and 1440×900 (light). Expected: no horizontal scroll, no clipped text, and the sheet doesn't cover the input. Run `npm test`. Expected: PASS.
- [ ] **Step 4:** Commit: `feat: mobile bottom-sheet layout and light theme`.

### Task 11: Deploy to Cloud Run

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Modify: `README.md` (run, env, deploy, data sources, "sample data" note)

- [ ] **Step 1:** Write a multi-stage `Dockerfile`: build on node:20, run on node:20-slim with `npm ci --omit=dev`, then `CMD ["node","dist-server/server/index.js"]` on `PORT 8080`.
- [ ] **Step 2:** Run `docker build -t apu-campus-graph .` and `docker run -p 8080:8080 -e GEMINI_API_KEY=... apu-campus-graph`. Expected: http://localhost:8080 works, and the chat returns `source:"gemini"`.
- [ ] **Step 3:** **(User action)** Run `! gcloud auth login` and set the project. Then deploy: `gcloud run deploy apu-campus-graph --source . --region asia-southeast1 --allow-unauthenticated --set-env-vars GEMINI_MODEL=gemini-2.5-flash --set-secrets GEMINI_API_KEY=gemini-key:latest`. Create the secret first with `gcloud secrets create gemini-key --data-file=-`.
- [ ] **Step 4:** Smoke-test the HTTPS URL: the page loads, one chat round-trip returns `source:"gemini"`, and it works on a phone.
- [ ] **Step 5:** Commit: `chore: dockerfile and cloud run deploy docs`.

### Task 12: Repo, pitch deck PDF, submission

**Files:**
- Create: `pitch/deck.html`, `pitch/APU-Campus-Graph-Pitch.pdf`, `pitch/demo-script.md`, `pitch/submission.md`

- [ ] **Step 1:** **(User action)** Create a public GitHub repo, then `git remote add origin … && git push -u origin main`. Check that `.env` is absent from the repo.
- [ ] **Step 2:** Build a 10-slide `deck.html` (1920×1080 slides, APSpace dark tokens). Slides:
  1. Title
  2. Problem: "campus feels cold", with the 3 pain points
  3. Evidence: 137 communities, 0 list fees or join links, 8 list meeting times
  4. Solution overview
  5. Living graph (screenshot)
  6. Gemini guide (screenshot)
  7. Fine print, extracted by Gemini (screenshot)
  8. Architecture: React → Cloud Run → Gemini, with the offline fallback
  9. Impact and roadmap: real club data feed, Student Affairs admin, timetable sync with APSpace
  10. Team + links (live URL, repo)
- [ ] **Step 3:** Export the PDF with Playwright `page.pdf({width:'1920px',height:'1080px',printBackground:true})`. Expected: file ≤ 10 MB with 10 pages. Verify by opening it with the Read tool.
- [ ] **Step 4:** Write `submission.md`:
  - project title "APU Campus Graph"
  - challenge "Smart Campus & Student Experience"
  - a 2–3 sentence summary (≥ 50 chars)
  - repo URL, demo URL
  - a 90-second demo script: explore → ask → zoom → card → paste poster → mobile
- [ ] **Step 5:** **(User action)** In the portal (https://apu-cloud-innovation-hackathon.gdgocapu.com/portal/), the team leader signs in, fills in the fields from `submission.md`, uploads the PDF, reviews, and submits. Final submission locks the entry.
- [ ] **Step 6:** Commit: `docs: pitch deck and submission notes`.
