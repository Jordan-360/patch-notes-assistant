# RAG-Powered Patch Notes Assistant

Ask questions about Overwatch patch notes in plain English and get short answers that cite the official notes. Built as a retrieval-augmented generation (RAG) app that runs entirely on a local GPU.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-local%20LLMs-000000)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

![Patch TL;DR answering "What changed for Mauga?"](assets/screenshot.png)

Patch notes are long, and most players only care about a few heroes. Instead of reading every patch, you can ask things like:

- "What changed for Mauga?" (across every patch)
- "Summarize the latest patch for tank players"
- "What changed for Wuyang in Stadium?"
- "Did Hazard change in the latest patch?"

Every claim in an answer links to the patch-note excerpt it came from, and every balance change is marked as a buff or a nerf.

## Features

- **Cited answers.** The model may only use the retrieved patch-note excerpts, and every claim cites its source. The UI shows only the sources the answer actually used.
- **Buff and nerf labels from a rules engine, not the model.** Code decides whether a change is a buff or a nerf (for example, a lower cooldown is a buff, lower armor is a nerf). It's covered by unit tests.
- **Structure-aware chunking.** Patch notes are split by hero, role, section, and map, so each chunk is about exactly one thing.
- **Smart filters.** Questions are filtered by hero, role, patch ("the latest patch", "the September 8 patch", "in August"), and Stadium mode before semantic search runs.
- **Answers from the data when possible.** If a hero has no changes, or a patch isn't indexed, the app answers directly without calling the model, so it can't hallucinate.
- **Streaming.** Answers appear as they're written, over a streaming NDJSON API.
- **Runs locally.** Embeddings and answers both come from models running in Ollama on a consumer GPU (RTX 3070 Ti, 8GB).

## How it works

```
                    INGEST (once per new patch)
 patch notes (.txt) ──> chunk by hero/section ──> embed ──> data/index.json
                                                  (nomic-embed-text)

                    ASK (every question)
 question ──> filters (hero, role, patch, Stadium)
          ──> semantic search over matching chunks (cosine similarity)
          ──> buff/nerf rules tag each change
          ──> LLM writes a cited answer from those chunks only (qwen3.5:4b)
          ──> streamed to the browser
```

| Part | What it does |
|---|---|
| `src/chunk.ts` | Parses patch files and splits them into hero, section, and map chunks, tagging Stadium-only content |
| `src/ingest.ts` | Embeds every chunk and saves the index |
| `src/retrieve.ts`, `src/patches.ts` | Filters by hero, role, patch, and mode, then ranks by similarity |
| `src/labels.ts` | Rules engine that labels changes as buffs or nerfs |
| `src/answer.ts` | The RAG loop: retrieve, prompt, stream, and track citations |
| `src/server.ts` | Express API: `/api/health`, `/api/patches`, `/api/ask` (streaming) |
| `web/` | React + TypeScript + Vite front end |

### Project structure

```
patch-notes-assistant/
├── src/
│   ├── chunk.ts         # patch parsing and structure-aware chunking
│   ├── heroes.ts        # hero roster and name matching
│   ├── ingest.ts        # builds the embedding index
│   ├── retrieve.ts      # filtering and semantic search
│   ├── patches.ts       # "latest patch", dates, and months in questions
│   ├── labels.ts        # buff/nerf rules engine
│   ├── labels.test.ts   # unit tests for the rules
│   ├── answer.ts        # the RAG loop (shared by the CLI and the API)
│   ├── ollama.ts        # embedding and streaming chat client
│   ├── server.ts        # Express API
│   └── ask.ts, search.ts, inspect.ts   # command-line tools
├── web/                 # React front end
│   └── src/
│       ├── App.tsx
│       ├── api.ts       # streaming NDJSON client
│       └── components/  # answer renderer, source list
└── data/
    ├── sample-patch.txt # example patch file format
    └── patches/         # your patch files (not committed)
```

## Tech stack

TypeScript, Node.js, Express, React, Vite, Ollama (`nomic-embed-text` for embeddings, `qwen3.5:4b` for answers), Node's built-in test runner.

## Running it

Requires Node.js 20+ and [Ollama](https://ollama.com).

```bash
# 1. Models
ollama pull nomic-embed-text
ollama pull qwen3.5:4b

# 2. Clone and install
git clone https://github.com/Jordan-360/patch-notes-assistant.git
cd patch-notes-assistant
npm install
cd web && npm install && cd ..

# 3. Add patch notes: one .txt file per patch in data/patches/ (see data/sample-patch.txt for the format)
npm run ingest

# 4. Start the API (terminal 1) and the web app (terminal 2)
npm run server
cd web && npm run dev
```

Then open http://localhost:5173.

Other commands:

```bash
npm run inspect -- data/patches/2026-09-08.txt   # preview how a patch file gets chunked
npm run search -- "What changed for Mauga?"      # see which chunks a question retrieves
npm run ask -- "What changed for Mauga?"         # get an answer in the terminal
npm test                                          # run the buff/nerf rule tests
```

Patch-note text belongs to Blizzard Entertainment, so patch files are kept out of this repository. Only a made-up sample is included.

## What I learned

- **Retrieval can be right while generation is wrong.** With Llama 3.2 (3B), the right patch notes reached the model, but it skipped citations, mixed up items, and once claimed tanks had no changes when six did. Moving to Qwen 3.5 (4B) fixed most of it.
- **Embeddings match structure, not just meaning.** "Ana: Sleep Dart reduced from X to Y" scored closer to a Reinhardt line with the same format than to a related support change. Filtering by hero and role before searching fixed it.
- **Use code for anything that must be exactly right.** The model repeatedly labeled a spread reduction as a nerf because "the number went down," and it spent tens of thousands of characters overthinking the labels. A small tested rules engine made the labels correct and the answers faster.
- **Plan for the model failing.** Thinking models sometimes filled their whole context window without answering, so the app retries once without thinking.
- **Different questions need different retrieval.** Specific questions want the closest few chunks; summaries need every matching chunk, or heroes get left out.

## Next steps

- [ ] Automatically fetch new patches instead of pasting them in
- [ ] Move the index from a JSON file to PostgreSQL with pgvector
- [ ] Add an evaluation set of questions with known answers to measure accuracy
- [ ] Deploy it with a hosted model API and a spending limit

## License

MIT. See [LICENSE](LICENSE).

## Disclaimer

Not affiliated with Blizzard Entertainment. Overwatch is a trademark of Blizzard Entertainment. Answers can contain mistakes, so check the linked sources for anything important.
