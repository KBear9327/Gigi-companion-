import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // AWS Polly Client
  const polly = new PollyClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  });

  // API Routes
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages } = req.body;
      const openRouterKey = process.env.OPENROUTER_API_KEY;

      if (!openRouterKey) {
        return res.status(500).json({ error: { message: "OpenRouter API Key not configured" } });
      }

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterKey}`,
          "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
          "X-Title": "Gigi AI Companion",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.3-70b-instruct:free",
          messages,
        }),
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      console.error("OpenRouter Proxy Error:", error);
      res.status(500).json({ error: { message: "Failed to connect to OpenRouter" } });
    }
  });

  app.post("/api/tts", async (req, res) => {
    try {
      const { text, voiceId = "Justin", engine = "neural" } = req.body;

      if (!process.env.AWS_ACCESS_KEY_ID) {
        return res.status(500).json({ error: "AWS Credentials not configured" });
      }

      const command = new SynthesizeSpeechCommand({
        Text: text,
        OutputFormat: "mp3",
        VoiceId: voiceId as any,
        Engine: engine as any,
      });

      const response = await polly.send(command);
      
      if (response.AudioStream) {
        res.setHeader("Content-Type", "audio/mpeg");
        // Convert stream to buffer and send
        const stream = response.AudioStream as any;
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        res.send(buffer);
      } else {
        res.status(500).json({ error: "No audio stream returned" });
      }
    } catch (error) {
      console.error("Polly Error:", error);
      res.status(500).json({ error: "Failed to generate TTS" });
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
