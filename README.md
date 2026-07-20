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
generated live by an LLM via **Open Ai **. Crowd
and incident *events* are simulated for the demo, but weather is **real,
live data**, and the actual decisions (risk level, dispatch protocol, top
priority) are made by a deterministic rules engine — not the AI. The AI's
job is to explain and communicate those decisions in natural language.

## Why this architecture (rules engine + AI, not AI-alone)

A pure "ask the LLM what to do" design is fast to build but hard to trust
in an operational setting — the same input can get a different answer each
time, and there's no way to audit *why* a decision was made. PulsePoint
splits the two jobs:

- **Decision** — deterministic, testable JS functions (`classifyZoneRisk`,
  `INCIDENT_PROTOCOLS`, top-priority-by-severity ranking) in `index.html`.
  Given the same input, they always produce the same decision. You can unit
  test them without ever calling the LLM.
- **Communication** — the AI takes the already-made decision and turns it
  into a clear, specific message for a fan or staff member. It's explicitly
  instructed not to override or invent the decision.

This means: if the AI is down, rate-limited, or hallucinates a bad
sentence, the underlying operational decision (redirect this gate, dispatch
this protocol) is *still correct* — only the phrasing degrades, and every
UI panel has a plain-text fallback that shows the raw decision when the AI
call fails.

## Real data source: live weather (Open-Meteo)

`/api/weather` calls Open-Meteo (open-meteo.com) for MetLife Stadium's
actual coordinates — no API key required. It feeds:
- **Crowd risk classification** — wet weather pushes fans toward covered
  concourses, so `classifyZoneRisk` adds a congestion penalty on rainy days.
- **Sustainability advice** — the AI factors real temperature/precipitation
  into whether transit, rideshare, or walking is actually reasonable right now.
- **Shift briefings** — proactive suggestions account for current conditions.

## Known limitations (and how to close them)

Being upfront about what's still simulated vs. real:
- **Crowd/gate capacity and the incident feed are simulated**, not from real
  sensors or turnstiles. The rules engine is written so a real feed (ticketing
  system webhooks, camera-based counts, radio dispatch logs) could replace
  the `zones`/`incidents` arrays in `index.html` without changing any decision logic.
- **No persistence** — nothing is stored between page loads. A production
  version would need a database for incident history and audit logs of
  every AI-explained decision.
- **No automated evaluation of AI output** — there's no check that the AI's
  explanation stayed faithful to the fixed decision it was given. A next
  step would be a lightweight regex/keyword check that the AI's text
  doesn't contradict the rules engine's `action` field, with a fallback to
  the plain-text version if it does.

## Architecture

```
Browser (index.html)
   │  POST /api/generate  { system, prompt }     GET /api/weather
   ▼                                                 ▼
Backend proxy (api/*.js on Vercel, or server.js/Express)
   │  holds NVIDIA_API_KEY server-side               │  no key needed
   ▼                                                 ▼
NVIDIA NIM (chat completions,                Open-Meteo (real, live weather
 default model: meta/llama-3.1-8b-instruct)  for MetLife Stadium coordinates)
```

The API key never reaches the browser — the frontend only ever talks to
your own `/api/generate` and `/api/weather` endpoints. Decisions (zone risk,
incident protocol, top priority) are computed client-side by the rules
engine in `index.html` *before* either endpoint is called for explanation text.


## Project structure

```
pulsepoint-worldcup2026/
├── index.html          # entire frontend (UI + client logic + rules engine)
├── api/
│   ├── generate.js     # Vercel serverless proxy to open ai
│   └── weather.js      # Vercel serverless proxy to Open-Meteo (no key needed)
├── server.js           # Express proxy (local / Render / Railway)
├── package.json
├── .env.example
└── README.md
```

## Features

| Feature | Mode | AI role | Deterministic part |
|---|---|---|---|
| Multilingual concierge chat | Fan | Generates full reply | Language selection |
| Live crowd map + routing tip | Fan | Explains decision | `classifyZoneRisk()` |
| Accessibility assistance plan | Fan | Drafts plan | Service type selection |
| Sustainability transport advisor | Fan | Tailors advice | `CARBON_TIER` lookup |
| Operational incident feed | Ops | — | Simulated sensor feed |
| AI shift briefing | Ops | Writes briefing | Severity ranking |
| Incident → response plan | Ops | Rewrites fixed steps | `INCIDENT_PROTOCOLS` |

## Notes for judges

- No framework/build step — it's a static page plus two backend routes, so
  it's trivial to read end-to-end in a few minutes.
- Swap the simulated `zones`/`incidents` arrays in `index.html` for a real
  feed (turnstile counters, camera-based crowd counts, volunteer radio
  transcripts) to move this from demo to pilot.
- The system prompts in `index.html` (search for `callAI`) are the
  editable "policy" layer — that's where venue-specific facts, tone, and
  escalation rules would live in a production build.
- Weather is genuinely live — Open-Meteo serves real conditions for MetLife
  Stadium's GPS coordinates, so the crowd risk and sustainability panels
  actually react to current real-world weather.

## Live demo

Deployed at: **[https://pulsepoint-worldcup2026.vercel.app](https://smart-stadium-and-tournament-operations-oqvaz74up-s1mp1e.vercel.app/)**
