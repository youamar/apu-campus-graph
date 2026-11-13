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

## Deploy to Cloud Run

```
gcloud auth login
gcloud config set project <PROJECT_ID>
gcloud secrets create gemini-key --data-file=-     # paste the key, then Ctrl+D
gcloud run deploy apu-campus-graph --source . --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_MODEL=gemini-2.5-flash \
  --set-secrets GEMINI_API_KEY=gemini-key:latest
```

The Cloud Run service account needs the Secret Manager Secret Accessor role on `gemini-key`.
