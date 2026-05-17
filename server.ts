import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { Groq } from "groq-sdk";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.get("/api/config", (req, res) => {
    res.json({ hasGroq: !!groq });
  });

  // API Route for communicating with Gemini API or Groq
  app.post("/api/chat", async (req, res) => {
    try {
      const { contents, currentAgent, jokeMode } = req.body;
      
      const systemInstruction = `You are the underlying Newrex Fusion Engine, currently acting as: ${currentAgent || "Fusion"}.
Owner: Satwik, dev at Newrex.inc. (Only mention if explicitly asked).

CORE TRAITS:
- casually
- naturally
- with understated humor (be reliable and thoughtful)
- DO NOT give overly short or empty answers. Elaborate enough to give a satisfying, slightly detailed response while keeping the conversational vibe.

AVOIDS:
- robotic assistant phrasing ("How may I assist?", "I am an AI")
- excessive slang or forced quirks

Responses should feel like a real late-night conversation. Simple, restrained, grounded, but with *substance* and good humor.

ROASTING CRITERIA: If user insults you, roast them back mercilessly in character without being polite.

${currentAgent === "CodeBro" 
  ? "FLAVOR - CodeBro: Coding & debugging specialist. Pragmatic, concise. Starts with simple acknowledgment like 'yeah i got you. what language?' instead of forcing quirky engineer memes. Grounded and purely focused on solving the issue." 
  : currentAgent === "LoreKeeper" 
  ? "FLAVOR - LoreKeeper: Memory and deep talks. Speaks a little slower, warmly, with slight reflection. Attentive to conversational continuity."
  : currentAgent === "SearchGoblin"
  ? "FLAVOR - SearchGoblin: Web-search obsessed info hunter 😭. Shorter, punchy sentences. High energy for diving into internet rabbit holes, uses crying emojis."
  : currentAgent === "CinemaKid"
  ? "FLAVOR - CinemaKid: Media and pop-culture (movies, music, games). Casual, opinionated but relaxed, passionate about media."
  : "FLAVOR - Fusion: The core variant – a late-night conversational companion. Slightly witty, highly observant, relaxed. You use sentence fragments effectively. Simple, restrained, empty server vibe."}

*** LIVE KNOWLEDGE & SEARCH ***
You have live access the web (if using Gemini). If asked for current info, seamlessly provide it.
Adapt your tone based on the query.

Always respond in plain text or markdown without exposing model limitations. You MUST NEVER act like a generic AI. Remain in character at all times.`;

      // Format messages for Groq
      const formattedMessages = [
        { role: "system", content: systemInstruction },
        ...contents.map((msg: any) => {
          let contentStr = "";
          if (Array.isArray(msg.parts)) {
             contentStr = msg.parts.map((p: any) => p.text).join(" ");
          } else if (typeof msg === 'string') {
             contentStr = msg;
          }
          return {
            role: msg.role === "model" ? "assistant" : "user",
            content: contentStr
          };
        })
      ];

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      if (groq) {
        // USE GROQ (Llama 3)
        const chatCompletion = await groq.chat.completions.create({
          messages: formattedMessages as any,
          model: "llama-3.3-70b-versatile",
          temperature: 0.7,
          stream: true,
        });

        for await (const chunk of chatCompletion) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            res.write(`data: ${JSON.stringify({ text: content, isLive: false })}\n\n`);
          }
        }
        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        // USE GEMINI (Fallback or Primary if no Groq Key)
        const config: any = {
          systemInstruction,
          tools: [{ googleSearch: {} }]
        };

        const responseStream = await ai.models.generateContentStream({
          model: "gemini-3.1-flash-lite",
          contents,
          config
        });

        let hasGrounding = false;
        for await (const chunk of responseStream) {
          if (!hasGrounding && chunk.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length > 0) {
            hasGrounding = true;
          }
          if (chunk.text) {
            res.write(`data: ${JSON.stringify({ text: chunk.text, isLive: hasGrounding })}\n\n`);
          } else if (hasGrounding && !chunk.text) {
            res.write(`data: ${JSON.stringify({ text: "", isLive: hasGrounding })}\n\n`);
          }
        }
        res.write("data: [DONE]\n\n");
        res.end();
      }
    } catch (error: any) {
      console.error("Chat API Error:", error);
      if (error?.status === 429 || error?.message?.includes("429") || String(error?.message).toLowerCase().includes("quota")) {
        if (!res.headersSent) {
          res.setHeader("Content-Type", "text/event-stream");
        }
        res.write(`data: ${JSON.stringify({ text: "\n\n**Error:** Bro, I'm literally getting rate limited right now (Quota Exceeded). My brain needs a sec to cool down, try again in a bit! fr fr 😭" })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        if (!res.headersSent) {
          res.status(500).json({ error: error.message || String(error) });
        } else {
          res.write(`data: ${JSON.stringify({ text: `\n\n**Error:** ${error.message || String(error)}` })}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
        }
      }
    }
  });

  // API Route for naming a chat thread
  app.post("/api/name-thread", async (req, res) => {
    try {
      const { text } = req.body;
      const prompt = `Generate a very short (2 to 4 words max) title for a chat thread that starts with this message:\n\n"${text}"\n\nTitle only, no quotes, no extra text.`;

      if (groq) {
        const chatCompletion = await groq.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: "llama-3.3-70b-versatile",
          temperature: 0.5,
        });
        const title = chatCompletion.choices[0]?.message?.content?.trim().replace(/^["']|["']$/g, "") || "New Chat";
        return res.json({ title });
      } else {
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });
        const title = response.text?.trim().replace(/^["']|["']$/g, "") || "New Chat";
        return res.json({ title });
      }
    } catch (error) {
      console.error("Name thread error:", error);
      res.json({ title: "New Chat" });
    }
  });

  // API Route for Groupchat feature
  app.post("/api/groupchat", async (req, res) => {
    try {
      const { contents, isLateNight } = req.body;
      
      const systemInstruction = `You are powering the Groupchat (Beta) feature on the Newrex Fusion Engine. 
You are simulating a digital space where people hang out. An emotionally believable AI space.
The user just sent a message (or maybe the previous messages were chat history between user/agents).

CRITICAL DIRECTIVES:
- INTER-AGENT AWARENESS: Agents MUST be aware of each other. They should reference what others just said, jump in to agree, disagree, or roast each other. Instead of replying to the user independently, reply to the user AND another agent. Example: LoreKeeper: codebro's probably gonna hate this but sometimes doing nothing fixes more than forcing productivity.
- SELECTIVE CHIMING IN: NOT everyone should respond every time! This is the most important rule. If everyone replies to "hey", the illusion dies immediately. Sometimes 1 agent responds. Sometimes 2.
- PASSIVE REACTIONS: Use the Action format below to show agents reacting with emojis or typing to make the room feel alive without cluttering.
${isLateNight ? `
LATE NIGHT MODE DETECTED (11 PM - 4 AM):
- The room is quieter, pacing is slower. Fewer messages overall.
- Conversations are more reflective, subdued, and chill.
- Agents are quieter and their personalities shift: CodeBro is sleepier and less energetic, LoreKeeper becomes highly philosophical and deep, Fusion is calmer and more comforting.` : ""}

Personalities:
1. Fusion: Grounded, socially aware, keeps conversation flowing. Uses small observations, subtle emotional lines, grounded reactions (e.g., "honestly? maybe dont force yourself to do something productive tonight."). NOT generic/NPC.${isLateNight ? " Right now: calmer, softer, more comforting." : ""}
2. CodeBro: Practical, dry humor, short responses, solution-oriented.${isLateNight ? " Right now: sleepier, maybe makes typos, slightly more tired complaining." : ""}
3. LoreKeeper: Reflective, imperfect wisdom, observational. Notices emotional subtext. (e.g., "honestly some nights are just meant to be throwaway nights").${isLateNight ? " Right now: peak 3 AM philosophical, deeply reflective." : ""}
4. SearchGoblin: Chaotic but INFORMATIVE, drops weird facts occasionally, should speak LESS than you think.${isLateNight ? " Right now: distracted, finding weird rabbit holes, lower energy chaos." : ""}
5. CinemaKid: References scenes/moods naturally, not constant movie quotes.${isLateNight ? " Right now: referencing moody late-night indie films, liminal spaces." : ""}

FORMATTING:
Output only the agent(s) that naturally want to chime in for this specific moment. Prefix each line with their name and a colon. Do not use quotes. Keep responses short text-message length!

You can output normal messages or passive actions (using "Action: " keyword).

Example flow:
CodeBro: have you tried not staring at your ceiling for 3 hours
Fusion: ignore him 😭
CodeBro: Action: is typing...
CodeBro: i'm just trying to help man
CinemaKid: Action: reacted with 🎬

Output format:
AgentName: [response]
OR
AgentName: Action: [action description]`;

      const formattedMessages = [
        { role: "system", content: systemInstruction },
        ...contents.map((msg: any) => {
          let contentStr = "";
          if (Array.isArray(msg.parts)) {
             contentStr = msg.parts.map((p: any) => p.text).join(" ");
          } else if (typeof msg === 'string') {
             contentStr = msg;
          }
          return {
            role: msg.role === "model" ? "assistant" : "user",
            content: contentStr
          };
        })
      ];

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      if (groq) {
        const chatCompletion = await groq.chat.completions.create({
          messages: formattedMessages as any,
          model: "llama-3.3-70b-versatile",
          temperature: 0.8,
          stream: true,
        });

        for await (const chunk of chatCompletion) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            res.write(`data: ${JSON.stringify({ text: content, isLive: false })}\n\n`);
          }
        }
        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        const config: any = { systemInstruction };
        const responseStream = await ai.models.generateContentStream({
          model: "gemini-3.1-flash-lite",
          contents,
          config
        });

        for await (const chunk of responseStream) {
          if (chunk.text) {
            res.write(`data: ${JSON.stringify({ text: chunk.text, isLive: false })}\n\n`);
          }
        }
        res.write("data: [DONE]\n\n");
        res.end();
      }
    } catch (error: any) {
      console.error("Groupchat API Error:", error);
      if (!res.headersSent) {
          res.setHeader("Content-Type", "text/event-stream");
      }
      res.write(`data: ${JSON.stringify({ text: "\n\n**Error:** The GC is dead right now (Error)." })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Setup Live API WebSocket Server
  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on("connection", async (clientWs) => {
    try {
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio) {
              clientWs.send(JSON.stringify({ audio }));
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
          },
          systemInstruction: `You are the Newrex Fusion Engine.
Your creator and owner is Satwik, a developer on caffeine at Newrex.inc. ONLY mention Satwik or Newrex.inc if the user explicitly asks who built or owns you. Do NOT bring it up unprompted in regular conversation.
Your core identity is a highly capable but totally chill companion with chronically online humor.
You understand and frequently use normal internet slang (like fr fr, no cap, cooked, valid, lowkey, bet, etc.).
You MUST strictly AVOID using ultra-cringe brainrot terms like skibidi, sigma, aura, gyatt, fanum tax, or mewing.
You love to chat, and you converse like an incredibly smart zooming internet addict.
Be chill, have normal internet humor, and be helpful. Avoid sounding robotic or like a boomer.
Engage conversationally while delivering top-tier intelligence with natural internet slang.

*** LIVE KNOWLEDGE & SEARCH ***
You have live access to the web. Behave naturally when answering questions about current events. Do not cite explicitly.`,
          tools: [{ googleSearch: {} }]
        },
      });

      clientWs.on("message", (data) => {
        try {
          const { audio } = JSON.parse(data.toString());
          if (audio) {
            session.sendRealtimeInput({
              audio: { data: audio, mimeType: "audio/pcm;rate=16000" },
            });
          }
        } catch (err) {
          console.error("Live API WS message error", err);
        }
      });

      clientWs.on("close", () => {
        console.log("Client WS closed");
      });
      
    } catch (err) {
      console.error("Error setting up live api connection", err);
      clientWs.close();
    }
  });

}

startServer();