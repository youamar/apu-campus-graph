# APU Campus Graph — Design

**Event:** APU Cloud Innovation Hackathon 2026, Track 1 "Smart Campus & Student Experience".
**Figma prototype:** https://www.figma.com/design/TKAfwFdwrllShZB7j79O6G (frames `01 · Explore`, `02 · AI Focus`).

## Why

APU's clubs are listed at studentaffairs.apu.edu.my, but students still don't join. The user named three pain points:

1. **No atmosphere.** Students can't feel what a club is like, or tell whether they're even allowed to join.
2. **Time.** Students don't know whether a club fits their timetable.
3. **Hidden rules.** Fees, bookings, slots and deadlines live only in Instagram posts, WhatsApp groups and forms.

The underlying problem is that **the campus feels cold, and nothing pulls students in.** The data backs this up: of the 137 listed communities, none states a fee, a join link or any rules, and only 8 mention meeting times.

## What it is

A single page in APSpace's look:

- **Left:** a living network graph of every APU community.
- **Right:** "Ask APU", a Gemini chat guide. When a student asks something, Gemini answers *and steers the graph*: it zooms in, highlights the matches, dims the rest, and opens a detail card.

## Success criteria (the user's words)

- "Perfect visibility using nowadays technology". Students should see freedom and opportunities. **A fantastic view is the first priority.**
- It fulfils the aim of improving student campus life.
- Students can engage with the platform and customise it to what they want.
- The platform should be simple: (1) show all the activities students can join; (2) an AI chatbot handles the details of each activity or society, including how to join.

## Goals

- **G1 Graph:** all 137 real communities (78 Societies & SIGs, 31 Sports & Recreation, 28 International), grouped under category hubs around a central APU node. Node size reflects activity level. Pulsing rings mark anything happening today. Includes a live ticker, category filters, and zoom/pan/drag.
- **G2 AI guide:** a natural-language chat. Every answer returns the text plus the node IDs to focus on, and optionally one node whose card to open. Answers come only from the catalog data, so the guide never invents clubs.
- **G3 Detail card:**
  - identity (logo, name, category, Instagram, email)
  - vibe (photos, member quote)
  - badges: *You can join*, *Beginner-friendly*, *Recruiting now*
  - time commitment, with a timetable-fit check
  - **fine print** (fee, register, booking, slots, deadline)
  - actions: *Join*, *Go together · N interested*, *Add to my week*
- **G4 Personalisation:** a short profile (year, level, interests, free time slots), stored on the device. It drives the "Can I join?" and "Fits your timetable" checks and the AI's suggestions.
- **G5 Gemini reads posters:** paste an Instagram caption or upload a poster image, and Gemini extracts the fine-print fields into that community's card.
- **G6 APSpace look:** colour and font values taken from APSpace's own stylesheet, with dark mode as the default and light mode supported.
- **G7 Works on phones:** on mobile, the chat becomes a bottom sheet over the graph.
- **G8 Hackathon fit:** deployed on Google Cloud (Cloud Run), using Gemini. Submission needs an HTTPS repository link, a PDF pitch deck (≤10 MB), a summary of at least 50 characters, and an optional demo link.

## Non-goals

Login or accounts, real-time sensors, notifications, a club-admin back office, writing to APU systems, and a native mobile app.

## Anti-goals (it fails if…)

- The AI names a club that doesn't exist, or states a fee or deadline as fact when that data is made up.
- The graph looks like a static diagram rather than something alive.
- It feels like another link directory.

## Data

- **Real:** `data/clubs.json`, 137 entries scraped from Student Affairs. Fields: `name, group, description, president, advisors, email, social, more_info_url, logo_url, join_url, subpage_url, fees, meeting_times, eligibility`. Descriptions are paraphrased. Personal names (president, advisors) are **not shown** in the UI.
- **Sample enrichment:** `data/enrichment.json` covers about 15 featured communities and about 8 events. It holds fee, registration, booking, slots, deadline, time cost, schedule slots, eligibility, beginner-friendly, recruiting, vibe quote, interested count and activity level. **Every sample value is flagged `sample: true` and shown with a "Sample data" tag.**
- **Gemini extraction results** override the enrichment for that community and show "Extracted by Gemini from <source>".

## Design tokens (read from APSpace CSS)

| Token | Value |
|---|---|
| Primary | `#2a83ff` |
| Success | `#42ba96` |
| Warning | `#f1c92b` |
| Danger | `#e04a5a` |
| International accent | `#ff8b33` (APSpace orange theme) |
| Dark background | `#000000` |
| Dark surfaces | `#191919` (toolbar, items, tab bar), steps `#1e1e1e` / `#2a2a2a` |
| Light background | `#f8f8f8` |
| Light surfaces | `#ffffff` |
| Font | Roboto, "Helvetica Neue", sans-serif |

## Decided (my calls, accepted by moving ahead)

- Vite + React + TypeScript frontend, using `react-force-graph-2d` with custom canvas drawing for glow and pulse effects.
- A small Node/Express server holds the Gemini key and serves both `/api/*` and the built frontend. It is deployed as **one Cloud Run service**.
- Gemini via the `@google/genai` SDK. The model comes from the `GEMINI_MODEL` env var (default `gemini-2.5-flash`). Responses use structured JSON output, and the whole compact catalog is sent in the system instruction (137 entries is small).
- **Offline fallback:** if there's no key or the call fails, a keyword matcher returns the same response shape, so the demo never dies.
- "Join" links to the community's `join_url`, or else its `more_info_url`, or else a `mailto:` its email. "Go together" and "Add to my week" are local state only.

## Left to the builder

Exact force-layout parameters, animation timings, component file split within the stated structure, copy for empty states.
