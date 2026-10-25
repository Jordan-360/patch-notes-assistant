/**
 * api.ts - talks to the API server.
 */

import type { AnswerEvent, Health, PatchInfo } from "./types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The server returned ${res.status}.`);
  return res.json();
}

export const fetchHealth = () => getJson<Health>("/api/health");
export const fetchPatches = () => getJson<PatchInfo[]>("/api/patches");

/**
 * Asks a question and calls onEvent for each event as it streams in.
 * The server sends NDJSON: one JSON event per line.
 */
export async function askQuestion(
  question: string,
  onEvent: (event: AnswerEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `The server returned ${res.status}.`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep a half-received line for the next chunk
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as AnswerEvent);
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as AnswerEvent);
}
