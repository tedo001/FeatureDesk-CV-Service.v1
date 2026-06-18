# Integrating the CV Service into the Feature Desk client (without touching existing code)

The CV service is an **independent Python backend**. The React app talks to it
over HTTP. Nothing in the existing `src/` needs to change — you only **add** a
connector file, two env vars, and (optionally) one component.

## Architecture

```
Feature Desk frontend (React/Vite, Netlify)        FeatureDesk CV Service (Python)
  src/ ........................ UNCHANGED            ai-cv-service/ ... separate process
  src/lib/featuredeskCv.ts .... NEW connector  --->  POST /api/v1/analysis/live
  .env ........................ +2 vars              (uvicorn on :8000, or Render)
```

The Vite/Netlify build only bundles `src/`. A Python folder placed at the repo
root is **never** part of the frontend build, so it cannot affect the app.

## Option A — recommended: run the CV service separately

Keep this repo as its own deployment (local `uvicorn`, or Render free tier).
The frontend just needs its URL. Nothing is copied into the client repo except
the connector below.

## Option B — your idea: vendor it into the client repo as a module

Copy this whole service folder into the client repo **next to `src/`**, e.g.:

```
Feature-Desk-AI/
  src/                     <- existing app, untouched
  ai-cv-service/           <- this service (Python), runs on its own
  package.json, vite.config.ts, ...
```

Add `ai-cv-service/` to the frontend tooling ignore lists so it’s never built or
linted with the app (it’s Python, so Vite ignores it anyway):

- `.gitignore` for the Python venv/models: `ai-cv-service/.venv/`, `ai-cv-service/models/`
- `.eslintignore` (if present): `ai-cv-service/`
- Netlify only runs `vite build`, which only reads `src/` — no change needed.

Run it independently:

```bash
cd ai-cv-service
python -m venv .venv && .venv\Scripts\activate      # (Windows)
pip install -r requirements.txt
python download_models.py
uvicorn app:app --port 8000
```

## Frontend steps (identical for A or B) — all additive

1. **Add the connector:** copy `client-integration/featuredeskCv.ts` to
   `src/lib/featuredeskCv.ts`. (Self-contained, imports nothing from the app.)

2. **Add env vars** to the client `.env`:
   ```
   VITE_CV_SERVICE_URL=http://localhost:8000
   VITE_CV_API_KEY=change-me-in-production
   ```
   (Must match the service's `API_KEY`. For production set
   `VITE_CV_SERVICE_URL` to the deployed service URL.)

3. **Use it** where you already render the exam webcam — see
   `client-integration/EXAMPLE_usage.tsx`. Minimal form:
   ```ts
   import { FeatureDeskCV } from "../lib/featuredeskCv";
   const cv = new FeatureDeskCV({
     baseUrl: import.meta.env.VITE_CV_SERVICE_URL,
     apiKey: import.meta.env.VITE_CV_API_KEY,
     studentId: "S001",
     onResult: (r) => { /* r.status, r.attention, r.phone, r.faces */ },
   });
   await cv.start();   // opens webcam and streams frames
   // cv.stop();        // ends session + finalises report
   ```

4. **Render it** on the Teacher/Admin dashboard by storing `r` (the JSON) in
   your existing Supabase/state — exactly the shape they already expect:
   ```json
   { "student_id": "S001", "status": "Focused", "attention": 94, "phone": false, "faces": 1 }
   ```

## Removing the feature
Delete `src/lib/featuredeskCv.ts` (and the component that uses it) and the two
env vars. The app returns to its original state. Nothing else was touched.

## CORS
The service already allows `https://featuredeskx.netlify.app` and
`http://localhost:5173`. Add any other frontend origin via the service's
`CORS_ORIGINS` env var.
