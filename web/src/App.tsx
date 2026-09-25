/**
 * App - ask a question, watch the answer stream in, check the sources.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { askQuestion, fetchPatches } from "./api";
import { RichText } from "./components/RichText";
import { SourceList } from "./components/SourceList";
import { patchOptions, QUICK_QUESTIONS, withPatchScope, type PatchScope } from "./questions";
import type { AnswerEvent, PatchInfo, SourceInfo } from "./types";

type Status = "idle" | "searching" | "thinking" | "writing" | "done" | "error";

const MAX_LENGTH = 300;

export default function App() {
  const [patches, setPatches] = useState<PatchInfo[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState<PatchScope>("all");

  const [asked, setAsked] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [cited, setCited] = useState<number[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSource, setOpenSource] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchPatches()
      .then(setPatches)
      .catch(() =>
        setServerError('Can\'t reach the API server. Start it with "npm run server" in the project folder, then reload.'),
      );
  }, []);

  function handleEvent(event: AnswerEvent) {
    switch (event.type) {
      case "meta":
        setSources(event.sources);
        setStatus(event.sources.length > 0 ? "thinking" : "writing");
        break;
      case "direct":
        setAnswer(event.text);
        setStatus("done");
        break;
      case "thinking":
        setStatus("thinking");
        break;
      case "retry":
        setNotice("The model took too long reasoning, so it's answering directly instead.");
        break;
      case "token":
        setStatus("writing");
        setAnswer((current) => current + event.text);
        break;
      case "done":
        setCited(event.cited);
        setStatus("done");
        break;
      case "empty":
        setError("The model didn't return an answer. Try asking again, or ask a narrower question.");
        setStatus("error");
        break;
      case "error":
        setError(event.message);
        setStatus("error");
        break;
    }
  }

  async function ask(rawQuestion: string) {
    const question = withPatchScope(rawQuestion, scope);
    if (!question) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAsked(question);
    setStatus("searching");
    setAnswer("");
    setSources([]);
    setCited(null);
    setNotice(null);
    setError(null);
    setOpenSource(null);

    try {
      await askQuestion(question, handleEvent, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "The request failed.");
      setStatus("error");
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStatus("done");
    setNotice("Stopped. The answer below may be incomplete.");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (draft.trim()) ask(draft);
  }

  function showSource(number: number) {
    setOpenSource(number);
    requestAnimationFrame(() => {
      const el = document.getElementById(`source-${number}`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      el?.querySelector("summary")?.focus();
    });
  }

  const busy = status === "searching" || status === "thinking" || status === "writing";
  // Show only the sources the answer cited; while it's still being written, show what it's reading
  const shownSources = cited && cited.length > 0 ? sources.filter((s) => cited.includes(s.number)) : sources;
  const validCitations = new Set(sources.map((s) => s.number));

  return (
    <div className="page">
      <header className="masthead">
        <h1>Patch TL;DR</h1>
        <p>Ask about Overwatch balance changes. Every answer is built from the official patch notes and cites them.</p>
      </header>

      <main>
        <form className="ask" onSubmit={onSubmit}>
          <label htmlFor="question" className="visually-hidden">
            Your question
          </label>
          <div className="ask-row">
            <input
              id="question"
              type="text"
              value={draft}
              maxLength={MAX_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What changed for Mauga?"
              autoComplete="off"
              disabled={!!serverError}
            />
            {busy ? (
              <button type="button" className="secondary" onClick={stop}>
                Stop
              </button>
            ) : (
              <button type="submit" disabled={!draft.trim() || !!serverError}>
                Ask
              </button>
            )}
          </div>

          <div className="ask-options">
            <div className="quick" role="group" aria-label="Quick questions">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setDraft(q.question);
                    ask(q.question);
                  }}
                  disabled={busy || !!serverError}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <label className="scope">
              <span>Search</span>
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                {patchOptions(patches).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </form>

        {serverError && (
          <p className="alert" role="alert">
            {serverError}
          </p>
        )}

        {!asked && !serverError && (
          <p className="empty">
            Try a hero ("Did Ana change?"), a role ("Summarize the latest patch for supports"), or Stadium ("What changed
            for Wuyang in Stadium?").
          </p>
        )}

        {asked && (
          <article className="answer" aria-live="polite" aria-busy={busy}>
            <h2 className="answer-question">{asked}</h2>

            {status === "searching" && <p className="status">Searching the patch notes</p>}
            {status === "thinking" && (
              <p className="status status--pulse">
                Reading {sources.length} {sources.length === 1 ? "source" : "sources"}
              </p>
            )}
            {notice && <p className="notice">{notice}</p>}

            {answer && (
              <div className="answer-body">
                <RichText text={answer} validCitations={validCitations} onCite={showSource} />
                {status === "writing" && <span className="caret" aria-hidden="true" />}
              </div>
            )}

            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}
          </article>
        )}

        {asked && (status === "done" || status === "writing") && (
          <SourceList
            sources={shownSources}
            openSource={openSource}
            onToggle={(number, open) => setOpenSource(open ? number : openSource === number ? null : openSource)}
          />
        )}
      </main>

      <footer className="colophon">
        <p>
          Not affiliated with Blizzard Entertainment. Answers can contain mistakes, so check the linked sources for anything
          important.
        </p>
      </footer>
    </div>
  );
}
