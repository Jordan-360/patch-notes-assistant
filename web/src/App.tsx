/**
 * App - ask a question, watch the answer stream in, check the sources.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { askQuestion, fetchHealth, fetchPatches } from "./api";
import { Logo } from "./components/Logo";
import { RichText } from "./components/RichText";
import { SourceList } from "./components/SourceList";
import { EXAMPLE_QUESTIONS, patchOptions, QUICK_QUESTIONS, withPatchScope, type PatchScope } from "./questions";
import type { AnswerEvent, Health, PatchInfo, SourceInfo } from "./types";

type Status = "idle" | "searching" | "thinking" | "writing" | "done" | "error";

const MAX_LENGTH = 300;

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
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
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const connect = useCallback(() => {
    setServerError(null);
    Promise.all([fetchHealth(), fetchPatches()])
      .then(([h, p]) => {
        setHealth(h);
        setPatches(p);
      })
      .catch(() => setServerError('Can\'t reach the API server. Start it with "npm run server" in the project folder.'));
  }, []);

  useEffect(connect, [connect]);

  const busy = status === "searching" || status === "thinking" || status === "writing";

  // Tick a timer while waiting, so a slow model still shows progress
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy, startedAt]);

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
    setStartedAt(Date.now());
    setElapsed(0);
    setCopied(false);

    try {
      await askQuestion(question, handleEvent, controller.signal);
      // The stream ended without a final event, e.g. the server restarted mid-answer
      setStatus((s) => (s === "searching" || s === "thinking" || s === "writing" ? "done" : s));
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "The request failed.");
      setStatus("error");
    }
  }

  function askNow(question: string) {
    setDraft(question);
    ask(question);
  }

  function stop(e: MouseEvent) {
    // Stop and Ask share a spot, so without this the same click could also submit the form
    // and ask the question again
    e.preventDefault();
    abortRef.current?.abort();
    setStatus("done");
    setNotice(answer ? "Stopped. The answer may be incomplete." : "Stopped.");
    inputRef.current?.focus();
  }

  function clearDraft() {
    setDraft("");
    inputRef.current?.focus();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (draft.trim() && !busy) ask(draft);
  }

  function showSource(number: number) {
    setOpenSource(number);
    requestAnimationFrame(() => {
      const el = document.getElementById(`source-${number}`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      el?.querySelector("summary")?.focus();
    });
  }

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked (e.g. on plain http from another device); nothing to do
    }
  }

  // Show only the sources the answer cited; while it's still being written, show what it's reading
  const shownSources = cited && cited.length > 0 ? sources.filter((s) => cited.includes(s.number)) : sources;
  const validCitations = new Set(sources.map((s) => s.number));
  const waitingNote = elapsed >= 3 ? ` · ${elapsed}s` : "";

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/" aria-label="Patch TL;DR home">
            <Logo />
            <span>Patch TL;DR</span>
          </a>
          <p className={`server-status ${serverError ? "is-offline" : health ? "is-online" : ""}`} role="status">
            <span className="dot" aria-hidden="true" />
            {serverError ? (
              "API offline"
            ) : health ? (
              <span>
                {health.patches} {health.patches === 1 ? "patch" : "patches"} indexed
                <span className="server-model"> · {health.model}</span>
              </span>
            ) : (
              "Connecting…"
            )}
          </p>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <h1>What changed in Overwatch?</h1>
          <p>
            Ask about any hero, role, or patch. Answers are built only from the official patch notes, with every claim
            cited and every balance change marked as a buff or a nerf.
          </p>
        </section>

        <form className="ask panel" onSubmit={onSubmit}>
          <label htmlFor="question" className="visually-hidden">
            Your question
          </label>
          <div className="ask-row">
            <div className="ask-field">
              <input
                ref={inputRef}
                id="question"
                type="text"
                value={draft}
                maxLength={MAX_LENGTH}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="What changed for Mauga?"
                autoComplete="off"
                disabled={!!serverError}
              />
              {draft && !busy && (
                <button type="button" className="clear" onClick={clearDraft} aria-label="Clear question">
                  ×
                </button>
              )}
            </div>
            {/* Separate keys so React swaps in a new button rather than turning Stop into a submit button mid-click */}
            {busy ? (
              <button key="stop" type="button" className="button button--secondary" onClick={stop}>
                Stop
              </button>
            ) : (
              <button key="ask" type="submit" className="button" disabled={!draft.trim() || !!serverError}>
                Ask
              </button>
            )}
          </div>

          <div className="ask-options">
            <div className="quick" role="group" aria-label="Quick summaries">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  className="chip"
                  onClick={() => askNow(q.question)}
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
          <div className="alert" role="alert">
            <p>{serverError}</p>
            <button type="button" className="button button--small" onClick={connect}>
              Try again
            </button>
          </div>
        )}

        {!asked && !serverError && (
          <section className="examples" aria-labelledby="examples-heading">
            <h2 id="examples-heading">Try asking</h2>
            <ul>
              {EXAMPLE_QUESTIONS.map((q) => (
                <li key={q}>
                  <button type="button" className="example" onClick={() => askNow(q)} disabled={!health}>
                    {q}
                    <span aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {asked && (
          <article className="answer panel" aria-live="polite" aria-busy={busy}>
            <header className="answer-header">
              <h2 className="answer-question">{asked}</h2>
              {status === "done" && answer && (
                <button type="button" className="button button--ghost button--small" onClick={copyAnswer}>
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
            </header>

            {status === "searching" && (
              <p className="status">
                <span className="spinner" aria-hidden="true" />
                Searching the patch notes{waitingNote}
              </p>
            )}
            {status === "thinking" && (
              <p className="status">
                <span className="spinner" aria-hidden="true" />
                Reading {sources.length} {sources.length === 1 ? "source" : "sources"}
                {waitingNote}
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
