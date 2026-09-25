/**
 * ask.ts - answers a question in the terminal, with citations.
 * The RAG logic lives in answer.ts; this file just prints its events.
 *
 * Run: npm run ask -- "What changed for Tracer?"
 */

import { answerQuestion, type SourceInfo } from "./answer.js";
import { loadIndex } from "./retrieve.js";

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    throw new Error('Ask a question, e.g. npm run ask -- "What changed for Tracer?"');
  }

  const chunks = await loadIndex();
  let sources: SourceInfo[] = [];
  let thinkingShown = false;

  await answerQuestion(question, chunks, (event) => {
    switch (event.type) {
      case "meta":
        sources = event.sources;
        console.log(`Question: ${event.question}`);
        console.log(`Filter:   ${event.filterNote}\n`);
        if (sources.length > 0) {
          const mode = event.summary ? ", summary mode" : "";
          console.log(`(${event.model} is reading ${sources.length} source(s)${mode}...)\n`);
        }
        break;
      case "direct":
        console.log(event.text);
        break;
      case "thinking":
        process.stdout.write(thinkingShown ? "." : "Thinking.");
        thinkingShown = true;
        break;
      case "retry":
        console.log(`\n\n(Thinking ran too long: ${event.thinkingChars.toLocaleString()} characters. Retrying without thinking...)\n`);
        thinkingShown = false;
        break;
      case "token":
        if (thinkingShown) {
          process.stdout.write("\n\n"); // end the "thinking" dots line before the answer starts
          thinkingShown = false;
        }
        process.stdout.write(event.text);
        break;
      case "empty":
        console.log(`\n\nThe model returned an empty answer (stop reason: ${event.doneReason}).`);
        break;
      case "done": {
        if (event.cited.length === 0) {
          console.log("\n\n(No sources cited.)");
          break;
        }
        console.log("\n\nSources:");
        for (const source of sources.filter((s) => event.cited.includes(s.number))) {
          console.log(`  [${source.number}] ${source.title} - ${source.section}`);
          console.log(`      ${source.url}`);
        }
        // Sources the model was given but didn't use: handy for spotting answers that skipped something
        const unused = sources.filter((s) => !event.cited.includes(s.number));
        if (unused.length > 0) {
          console.log("\nRetrieved but not cited:");
          for (const s of unused) console.log(`  [${s.number}] ${s.section}`);
        }
        break;
      }
    }
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
