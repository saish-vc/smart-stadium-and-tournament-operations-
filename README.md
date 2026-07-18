# PulsePoint — GenAI Stadium Intelligence for FIFA World Cup 2026

**PromptWars Hackathon Submission**

PulsePoint is a GenAI-enabled platform that improves stadium operations and the
fan experience during the FIFA World Cup 2026. It has two modes:

- **Fan Mode** — multilingual AI concierge chat, live crowd-density map with
  AI routing tips, an AI-drafted accessibility assistance plan, and a
  sustainability advisor for transport choices.
- **Ops Mode** — a live incident feed, an AI-generated shift-handoff
  briefing, and an AI decision-support tool that turns any incident into a
  structured response plan.

All AI content (chat replies, routing tips, briefings, response plans) is
generated live by an LLM via **NVIDIA NIM** (free, no credit card). Crowd,
incident, and attendance figures are simulated for the demo — the point is
to prove the sense → summarize → recommend → act loop works end to end.

## Getting a free API key

1. Go to **build.nvidia.com** and sign in with a free account.
2. Open any model card, e.g. **Llama 3.3 70B Instruct**.
3. Click **Get API Key** — it starts with `nvapi-`.
4. You get free inference credits and a 40 requests/minute rate limit, no
   credit card and no GPU required. Plenty for a hackathon demo.

Note: NVIDIA's free tier is for development, testing, and evaluation —
not for production traffic with real end users. That's exactly what a
hackathon demo is, so you're covered.

## Architecture

```
Browser (index.html)
   │  POST /api/generate  { system, prompt }
   ▼
Backend proxy (api/generate.js on Vercel, or server.js/Express)
   │  holds NVIDIA_API_KEY server-side, calls NIM's chat completions
   ▼
NVIDIA NIM (integrate.api.nvidia.com/v1/chat/completions — OpenAI-compatible,
   default model: meta/llama-3.3-70b-instruct)
```

The API key never reaches the browser — the frontend only ever talks to
your own `/api/generate` endpoint.

## Option A — Deploy to Vercel (recommended, ~2 minutes)

1. Push this folder to a GitHub repo (or drag-and-drop it in the Vercel
   dashboard).
2. Go to vercel.com → **New Project** → import the repo.
3. In **Settings → Environment Variables**, add:
   - `NVIDIA_API_KEY` = your key from build.nvidia.com (starts with `nvapi-`)
   - optionally `NIM_MODEL` = a different model ID from build.nvidia.com/models
4. Deploy. Vercel auto-detects `index.html` as the static site and
   `api/generate.js` as a serverless function — no config file needed.
5. Open the deployed URL. Done.

CLI alternative:
```bash
npm i -g vercel
vercel login
vercel --prod
# then set the env var:
vercel env add NVIDIA_API_KEY
```

## Option B — Deploy to Render / Railway / any Node host

These use `server.js` (plain Express) instead of the `api/` serverless
function.

1. Set the start command to `npm start` (runs `node server.js`).
2. Set the environment variable `NVIDIA_API_KEY` in the host's dashboard.
3. Deploy. The app serves `index.html` and `/api/generate` from the same
   process.

## Option C — Run locally

```bash
npm install
cp .env.example .env
# edit .env and paste your NVIDIA_API_KEY
npm start
# open http://localhost:3000
```

## Project structure

```
pulsepoint-worldcup2026/
├── index.html          # entire frontend (UI + client logic)
├── api/
│   └── generate.js      # Vercel serverless proxy to Anthropic
├── server.js            # Express proxy (local / Render / Railway)
├── package.json
├── .env.example
└── README.md
```

## Notes for judges

- No framework/build step — it's a static page plus one backend route, so
  it's trivial to read end-to-end in a few minutes.
- Swap the simulated `zones`/`incidents` arrays in `index.html` for a real
  feed (turnstile counters, camera-based crowd counts, volunteer radio
  transcripts) to move this from demo to pilot.
- The system prompts in `index.html` (search for `callClaude`) are the
  editable "policy" layer — that's where venue-specific facts, tone, and
  escalation rules would live in a production build.
