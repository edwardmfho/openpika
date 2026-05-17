import { NextRequest } from "next/server";

const OPENPIKA_URL = process.env.OPENPIKA_URL || "http://localhost:8080";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { messages, model, threadId, runId } = body;

  const aguiBody = {
    thread_id: threadId ?? crypto.randomUUID(),
    run_id: runId ?? crypto.randomUUID(),
    state: null,
    messages: (messages ?? []).map((m: { role: string; content: string }) => ({
      id: crypto.randomUUID(),
      role: m.role,
      content: m.content,
    })),
    tools: [],
    context: [],
    ...(model ? { model } : {}),
  };

  let upstream: Response;
  try {
    upstream = await fetch(`${OPENPIKA_URL}/v1/awp/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(aguiBody),
      signal: req.signal,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "OpenPika gateway unreachable", details: String(err) }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(text, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
