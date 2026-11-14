# APU Campus Graph

A living graph of APU clubs and societies plus a Gemini-powered chat guide that helps students find communities and events that match their interests. Vite + React + TypeScript frontend, Express 5 API (`/api/chat`) using `@google/genai`.

Team: Vancomycin (Chang Kai Yang & Joseph Ang)

## Features

- Interactive graph of campus communities
- Chat guide (Gemini) that recommends communities and highlights them on the graph
- Offline fallback when no API key is configured

## Data

137 communities from the APU Student Affairs website. Enrichment values (e.g. activity levels, events) are **sample data** and marked as such.

## Run locally

```
npm install
cp .env.example .env   # add GEMINI_API_KEY
npm run dev            # http://localhost:5173
```

## Test

```
npm test
```

## Docker

```
docker build -t apu-campus-graph .
docker run -p 8080:8080 --env-file .env apu-campus-graph   # http://localhost:8080
```

The `.env` file is excluded from the image; pass secrets at runtime.

## How the guide works (agent loop)

Each question runs a small Gemini agent (`server/chat.ts` `runAgent`, tools in `server/agent.ts`):

1. **Plan with tools** – Gemini function calling picks `search_clubs`, `get_club` and `upcoming_events`; the server runs them on the real catalog and returns the results (up to 3 tool rounds).
2. **Answer as actions** – the final answer is structured JSON: reply text plus `focusIds` (focus the map) and `openId` (open a card). Every id is checked against the catalog.
3. **Check and repair** – a validator flags club names that don't exist, sample fees/deadlines stated as fact, and role-play voices from prompt injection; the problems go back to Gemini once as a `[Validator]` message.
4. **Never dies** – student text is fenced in `<student_message>` tags, one retry on 503/timeouts, a warm-up ping on page load, then the offline matcher.

The chat shows the steps it took (e.g. "Searched clubs", "Read Photography Club", "Checked the answer").

## Deploy to Cloud Run

```
gcloud auth login
gcloud config set project <PROJECT_ID>
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
printf '%s' "$GEMINI_API_KEY" | gcloud secrets create gemini-key --data-file=-
gcloud secrets add-iam-policy-binding gemini-key   --member=serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com   --role=roles/secretmanager.secretAccessor
gcloud run deploy apu-campus-graph --source . --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_MODEL=gemini-3.5-flash-lite \
  --set-secrets GEMINI_API_KEY=gemini-key:latest
```
