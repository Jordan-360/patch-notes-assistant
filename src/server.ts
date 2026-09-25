/**
 * server.ts - the web API for the patch notes assistant.
 *
 *   GET  /api/health   is the server up, how much is indexed, which model
 *   GET  /api/patches  every indexed patch, newest first (for a patch picker)
 *   POST /api/ask      { "question": "..." } -> the answer, streamed as it's written
 *
 * /api/ask streams "NDJSON": one JSON event per line (sources found, answer pieces, done...),
 * the same events the terminal prints. The browser reads them as they arrive.
 *
 * Run: npm run server   (then open http://localhost:3001/api/health)
 */

import express from "express";
import { answerQuestion } from "./answer.js";
import type { IndexedChunk } from "./ingest.js";
import { CHAT_MODEL } from "./ollama.js";
import { loadIndex } from "./retrieve.js";

const PORT = Number(process.env.PORT ?? 3001);
const MAX_QUESTION_LENGTH = 300;

async function main() {
  // Load the index once at startup. After running "npm run ingest", restart the server.
  const chunks: IndexedChunk[] = await loadIndex();

  const app = express();
  app.use(express.json({ limit: "10kb" }));

  app.get("/api/health", (_req, res) => {
    const patches = new Set(chunks.map((c) => c.patch.date)).size;
    res.json({ ok: true, chunks: chunks.length, patches, model: CHAT_MODEL });
  });

  app.get("/api/patches", (_req, res) => {
    const byDate = new Map<string, { date: string; title: string; url: string }>();
    for (const { patch } of chunks) byDate.set(patch.date, patch);
    res.json([...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)));
  });

  app.post("/api/ask", async (req, res) => {
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (!question) {
      res.status(400).json({ error: 'Send JSON like { "question": "What changed for Tracer?" }' });
      return;
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      res.status(400).json({ error: `Questions must be under ${MAX_QUESTION_LENGTH} characters.` });
      return;
    }

    // Stream one JSON event per line as the answer is produced
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    // If the browser disconnects mid-answer, stop sending
    let closed = false;
    res.on("close", () => {
      closed = true;
    });

    try {
      await answerQuestion(question, chunks, (event) => {
        if (!closed) res.write(JSON.stringify(event) + "\n");
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      console.error(`Error answering "${question}":`, message);
      if (!closed) res.write(JSON.stringify({ type: "error", message }) + "\n");
    }
    res.end();
  });

  app.listen(PORT, () => {
    console.log(`Patch notes API running at http://localhost:${PORT}`);
    console.log(`Indexed ${chunks.length} chunks. Chat model: ${CHAT_MODEL}`);
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
