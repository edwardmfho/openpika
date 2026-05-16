import { NextRequest } from "next/server";

const OPENPIKA_URL = process.env.OPENPIKA_URL || "http://localhost:8080";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const { messages, model, system, stream = true } = body;

  const openAIMessages = [
    ...(system ? [{ role: "system", content: system }] : []),
    ...messages,
  ];

  let upstream: Response;
  try {
    upstream = await fetch(`${OPENPIKA_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-local",
      },
      body: JSON.stringify({
        ...(model ? { model } : {}),
        messages: openAIMessages,
        stream,
      }),
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
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!stream) {
    return new Response(upstream.body, {
      headers: { "Content-Type": "application/json" },
    });
  }

  const upstreamType = upstream.headers.get("Content-Type") || "";

  // Backend returned real SSE — pass through
  if (upstreamType.includes("text/event-stream")) {
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // Backend returned plain JSON — wrap as a single SSE chunk so the client's
  // streamOpenAIToAGUI parser can extract the text content.
  const json = await upstream.json() as {
    id?: string;
    created?: number;
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  const chunkBase = {
    id: json.id ?? `chatcmpl-${Date.now()}`,
    object: "chat.completion.chunk",
    created: json.created ?? Math.floor(Date.now() / 1000),
    model: json.model ?? model ?? "",
  };
  const dataChunk = JSON.stringify({ ...chunkBase, choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] });
  const doneChunk = JSON.stringify({ ...chunkBase, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
  const sseBody = `data: ${dataChunk}\n\ndata: ${doneChunk}\n\ndata: [DONE]\n\n`;
  return new Response(sseBody, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
