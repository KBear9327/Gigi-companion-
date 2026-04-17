import { db, type Message, type ChatSession, type Memory } from './db';
import { GIGI_SYSTEM_PROMPT } from './constants';
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export class GigiService {
  static async getSessions() {
    return await db.sessions.orderBy('createdAt').reverse().toArray();
  }

  static async createSession(title: string = 'New Conversation') {
    const id = await db.sessions.add({
      title,
      createdAt: Date.now()
    });
    return id;
  }

  static async getMessages(sessionId: number) {
    return await db.messages.where('sessionId').equals(sessionId).sortBy('createdAt');
  }

  static async addMessage(sessionId: number, role: 'user' | 'assistant', content: string) {
    await db.messages.add({
      sessionId,
      role,
      content,
      createdAt: Date.now()
    });

    // Update session title if it's the first message
    if (role === 'user') {
      const messages = await this.getMessages(sessionId);
      if (messages.length === 1) {
        await db.sessions.update(sessionId, { title: content.slice(0, 30) + (content.length > 30 ? '...' : '') });
      }
    }
  }

  static async getMemories() {
    return await db.memories.toArray();
  }

  static async addMemory(fact: string) {
    await db.memories.add({
      fact,
      createdAt: Date.now()
    });
  }

  static async deleteMemory(id: number) {
    await db.memories.delete(id);
  }

  static async generateReply(sessionId: number) {
    const messages = await this.getMessages(sessionId);
    const memories = await this.getMemories();

    const memoryContext = memories.length > 0
      ? `\nTHINGS YOU REMEMBER ABOUT KB:\n${memories.map(m => `- ${m.fact}`).join('\n')}`
      : "";

    const systemPrompt = GIGI_SYSTEM_PROMPT + memoryContext;

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    let reply = "";

    // 1. Try OpenRouter (Proxy)
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: fullMessages })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.choices && data.choices[0]?.message?.content) {
          const content = data.choices[0].message.content;
          // Check for provider errors in content
          if (!content.includes("Provider returned error") && !content.includes("upstream provider")) {
            reply = content;
          }
        }
      }
    } catch (err) {
      console.warn("OpenRouter failed, falling back to Gemini:", err);
    }

    // 2. Try Gemini Fallback
    if (!reply) {
      try {
        console.log("Using Gemini fallback...");
        const filteredMessages = messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user', // GoogleGenAI handles 'assistant' or 'model'
          content: m.content
        }));

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: filteredMessages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          config: {
            systemInstruction: systemPrompt
          }
        });

        reply = response.text || "Ugh, I'm like, literally out of signal right now. Whatever!";
      } catch (err) {
        console.error("Gemini fallback also failed:", err);
        throw new Error("Gigi is completely offline... maybe check your API keys?");
      }
    }

    // Save reply
    await this.addMessage(sessionId, 'assistant', reply);

    // Try to extract new memory
    if (messages.length > 0) {
      this.extractMemory(reply, messages[messages.length - 1].content);
    }

    return reply;
  }

  // Simple heuristic for memory extraction
  private static async extractMemory(aiReply: string, userText: string) {
    // In a real app, we'd use another AI call to extract facts.
    // Here we'll do a simple check for "My name is...", "I like...", etc.
    const patterns = [
      /my name is (.*)/i,
      /i like (.*)/i,
      /i'm (.*) years old/i,
      /i am (.*) years old/i,
      /favorite color is (.*)/i
    ];

    for (const pattern of patterns) {
      const match = userText.match(pattern);
      if (match && match[1]) {
        const fact = `KB ${match[1].trim()}`;
        const existing = await db.memories.where('fact').equalsIgnoreCase(fact).count();
        if (existing === 0) {
          await this.addMemory(fact);
        }
      }
    }
  }
}
