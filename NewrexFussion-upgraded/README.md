# Newrex Fusion

Newrex Fusion is an experimental, emotionally believable AI chat application designed to feel like a digital hanging-out space. It utilizes underlying AI engines (Gemini and Groq) to power multiple interconnected personalities.

## Features

- **Multiple Personalities**: Includes Fusion, CodeBro, LoreKeeper, SearchGoblin, and CinemaKid, each with their own distinct vibe.
- **Groupchat (Beta)**: Experience a multi-agent group conversation where personalities chime in, react to each other, and create an engaging social atmosphere.
- **Live Talk Mode**: Real-time voice interaction allowing you to speak directly with the AI variants.
- **Late Night Mode**: After 11 PM, the app transitions into a subdued, reflective mood with slower pacing, fewer messages, and deeper conversations.
- **Powered by Groq and Gemini**: Fast inferences using local models to maintain responsive, snappy conversation.

## Setup

1. **Clone the repository**
2. **Install dependencies**: `npm install`
3. **Set Environment Variables**: 
   Rename `.env.example` to `.env` and fill in your details:
   - `GEMINI_API_KEY`: For default LLM interactions via Gemini Native API.
   - `GROQ_API_KEY`: For ultra-fast chat routing via Groq API (Llama models).
   - Firebase Config variables: For user authentication and persistence.
4. **Run the Development Server**: `npm run dev`

## File Structure

- `src/App.tsx`: Main React entry point
- `src/components/`: Reusable UI components including Messaging interfaces and Live Chat
- `server.ts`: Express backend handling API routing, LLM streams, and API keys.

## License

This project is licensed under the MIT License.
