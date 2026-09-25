/**
 * ollama.ts - talks to the local Ollama server.
 */

// Override with the OLLAMA_URL environment variable if Ollama runs somewhere else
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
export const EMBED_MODEL = "nomic-embed-text";

/**
 * Turns texts into embeddings (one list of numbers per text).
 * nomic-embed-text works best when texts are labeled by role, so callers add
 * "search_query: " to questions and "search_document: " to patch-note chunks.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    throw new Error(
      `Ollama returned ${res.status}. Is Ollama running, and did you run "ollama pull ${EMBED_MODEL}"?`,
    );
  }
  const data = (await res.json()) as { embeddings: number[][] };
  return data.embeddings;
}

/** Cosine similarity: 1.0 = same meaning, near 0 = unrelated. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

   export const CHAT_MODEL = process.env.CHAT_MODEL ?? "qwen3.5:4b";
   
// Thinking models (like Qwen 3.5) reason before answering. Set THINK=false to skip that step.
const THINK = process.env.THINK === undefined ? undefined : process.env.THINK !== "false";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  answer: string;
  thinkingChars: number;  // how much the model "thought" before answering (thinking models only)
  doneReason: string;     // why it stopped: "stop" is normal, "length" means it ran out of room
}

/**
 * Sends a conversation to a chat model and streams the reply back piece by piece,
 * calling onToken for each piece of the answer as it arrives.
 */
export async function chatStream(
  messages: ChatMessage[],
  onToken: (text: string) => void,
  onThinking?: () => void,
): Promise<ChatResult> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      stream: true,
      ...(THINK === undefined ? {} : { think: THINK }),
      options: {
        temperature: 0.2, // low temperature: stick closely to the sources
        num_ctx: 16384,   // context window: room for the sources, the thinking, and the answer
      },
    }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Ollama returned ${res.status} ${detail}. Is Ollama running, and did you run "ollama pull ${CHAT_MODEL}"?`,
    );
  }

  // Ollama streams one JSON object per line, each holding the next piece of the reply.
  // Thinking models send their reasoning in "thinking" and the answer in "content".
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let thinkingChars = 0;
  let doneReason = "unknown";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep any half-received line for the next round
    for (const line of lines) {
      if (!line.trim()) continue;
      const piece = JSON.parse(line) as {
        message?: { content?: string; thinking?: string };
        done?: boolean;
        done_reason?: string;
        error?: string;
      };
      if (piece.error) throw new Error(`Ollama error: ${piece.error}`);
      const thinking = piece.message?.thinking ?? "";
      if (thinking) {
        thinkingChars += thinking.length;
        onThinking?.();
      }
      const text = piece.message?.content ?? "";
      if (text) {
        answer += text;
        onToken(text);
      }
      if (piece.done) doneReason = piece.done_reason ?? "stop";
    }
  }
  return { answer, thinkingChars, doneReason };
}
