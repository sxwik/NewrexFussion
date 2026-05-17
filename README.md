<div align="center">

<br />

<img src="public/favicon.svg" width="52" height="52" alt="Fusion logo" />

<br />

# Fusion

**Structured reasoning for complex work.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Powered by Gemini](https://img.shields.io/badge/Powered%20by-Gemini-8E75B2?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
[![Groq](https://img.shields.io/badge/Groq-Llama-F55036?style=flat-square)](https://console.groq.com/)

<br />

</div>

---

Fusion is an experimental AI chat application built around the idea that talking to an AI should feel like a space — not a tool. It ships multiple AI personalities, a group chat where models respond to each other, voice input, and a Late Night mode that shifts the whole vibe after 11 PM.

<br />

## Features

**Multiple Personalities**
Five distinct agents, each with its own system prompt, tone, and expertise — Fusion (default), CodeBro, LoreKeeper, SearchGoblin, and CinemaKid. Switch mid-conversation from the sidebar.

**Groupchat** *(Beta)*
Drop a message and watch all the agents pile in — agreeing, pushing back, riffing off each other. A daily usage limit keeps it from going fully off the rails.

**Live Talk Mode**
Browser-native speech recognition lets you speak directly. Fusion transcribes and responds hands-free.

**Late Night Mode**
After 11 PM the app transitions automatically — darker palette, slower pacing, a more reflective conversational tone.

**Themes**
Three visual themes ship out of the box: Default (dark), Girly Pop, and Pinterest Minimal. First-visit onboarding prompts you to pick one.

**Thread Persistence**
Conversations are saved locally and synced to Firestore when signed in. Full history survives a refresh.

**Firebase Auth**
Google Sign-In for cross-device thread sync and personalization.

<br />

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS v4 |
| Animations | Motion (Framer Motion) |
| Backend | Express + tsx (Node) |
| AI — default | Google Gemini via `@google/genai` |
| AI — fast routing | Groq SDK (Llama models) |
| Auth + DB | Firebase Auth, Firestore |
| Build | Vite 6 |

<br />

## Getting Started

### Prerequisites

- Node.js 18+
- A [Gemini API key](https://aistudio.google.com/app/apikey)
- *(Optional)* A [Groq API key](https://console.groq.com/keys) for fast Llama routing
- *(Optional)* A Firebase project for auth and Firestore sync

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/sxwik/NewrexFussion.git
cd NewrexFussion

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
```

Open `.env` and fill in your keys:

```env
GEMINI_API_KEY="your_gemini_api_key"
GROQ_API_KEY="your_groq_api_key"       # optional — enables fast routing
APP_URL="http://localhost:5173"
```

For Firebase, copy your project config into `src/lib/firebase.ts`.

```bash
# 4. Start the dev server
npm run dev
```

The Express backend and Vite dev server both spin up together. Open `http://localhost:5173`.

<br />

## Project Structure

```
NewrexFussion/
├── src/
│   ├── App.tsx                  # Root component — all views, state, routing
│   ├── index.css                # Design tokens, Tailwind theme, utility classes
│   ├── main.tsx                 # React entry point
│   ├── components/
│   │   ├── MessageComponent.tsx # Message rendering (markdown, code blocks)
│   │   └── LiveChat.tsx         # Voice / live talk mode
│   └── lib/
│       ├── firebase.ts          # Firebase init and auth helpers
│       ├── firestoreInfo.ts     # Firestore error handling
│       └── utils.ts             # cn() and misc utilities
├── server.ts                    # Express API — LLM streaming, key injection
├── public/
│   └── favicon.svg
├── .env.example
└── package.json
```

<br />

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (Express + Vite HMR) |
| `npm run build` | Production build (Vite + esbuild server bundle) |
| `npm run start` | Run the production build |
| `npm run lint` | TypeScript type check |

<br />

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | Default LLM for all agents |
| `GROQ_API_KEY` | Optional | Enables fast Llama routing via Groq |
| `APP_URL` | Optional | Deployment URL (used for callbacks) |

Firebase config lives directly in `src/lib/firebase.ts` — replace the placeholder object with your project's config from the Firebase console.

<br />

## Deployment

Build and serve the production bundle:

```bash
npm run build
npm run start
```

The build step compiles the React frontend with Vite and bundles `server.ts` into `dist/server.cjs` via esbuild. The Express server serves both the static assets and the `/api` routes from a single process.

Works out of the box on **Railway**, **Render**, **Fly.io**, or any Node-capable platform. Set the same env vars in your platform's secrets panel.

<br />

## License

MIT — see [LICENSE](LICENSE) for details.

<br />

---

<div align="center">
<sub>Built by <a href="https://github.com/sxwik">sxwik</a></sub>
</div>
