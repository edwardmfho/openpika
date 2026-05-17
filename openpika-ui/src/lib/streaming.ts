"use client";

import type { AGUIEvent, ToolCallState } from "./agui";
import { EventType } from "./agui";

// Reads a native AG-UI SSE stream and yields parsed events directly
export async function* streamAGUIEvents(response: Response): AsyncGenerator<AGUIEvent> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      let event: AGUIEvent;
      try {
        event = JSON.parse(data) as AGUIEvent;
      } catch {
        continue;
      }
      yield event;
    }
  }
}

// Converts OpenAI SSE stream chunks into AG-UI events
export async function* streamOpenAIToAGUI(
  response: Response,
  threadId: string,
  runId: string
): AsyncGenerator<AGUIEvent> {
  yield { type: EventType.RUN_STARTED, threadId, runId };

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let currentMessageId: string | null = null;
  // track active tool calls by index
  const toolCallsByIndex = new Map<
    number,
    { id: string; name: string; argsAccum: string }
  >();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;

      let chunk: {
        id?: string;
        choices?: Array<{
          delta?: {
            role?: string;
            content?: string | null;
            tool_calls?: Array<{
              index: number;
              id?: string;
              type?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason?: string | null;
        }>;
      };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }

      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta;
      if (!delta) continue;

      // Text content
      if (delta.content) {
        if (!currentMessageId) {
          currentMessageId = chunk.id ?? crypto.randomUUID();
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: currentMessageId,
            role: "assistant",
          };
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: currentMessageId,
          delta: delta.content,
        };
      }

      // Tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;

          if (tc.id && tc.function?.name) {
            // New tool call starting
            const tcId = tc.id;
            toolCallsByIndex.set(idx, { id: tcId, name: tc.function.name, argsAccum: "" });
            yield {
              type: EventType.TOOL_CALL_START,
              toolCallId: tcId,
              toolName: tc.function.name,
              parentMessageId: currentMessageId ?? undefined,
            };
          }

          if (tc.function?.arguments) {
            const existing = toolCallsByIndex.get(idx);
            if (existing) {
              existing.argsAccum += tc.function.arguments;
              yield {
                type: EventType.TOOL_CALL_ARGS_DELTA,
                toolCallId: existing.id,
                delta: tc.function.arguments,
              };
            }
          }
        }
      }

      // Finish
      if (choice.finish_reason === "tool_calls") {
        for (const [, tc] of toolCallsByIndex) {
          yield { type: EventType.TOOL_CALL_END, toolCallId: tc.id };
        }
        toolCallsByIndex.clear();
      }

      if (choice.finish_reason === "stop" || choice.finish_reason === "length") {
        if (currentMessageId) {
          yield { type: EventType.TEXT_MESSAGE_END, messageId: currentMessageId };
          currentMessageId = null;
        }
      }
    }
  }

  // Close any open message
  if (currentMessageId) {
    yield { type: EventType.TEXT_MESSAGE_END, messageId: currentMessageId };
  }

  yield { type: EventType.RUN_FINISHED, threadId, runId };
}

// Parse args text to JSON safely
export function parseArgs(argsText: string): Record<string, unknown> | null {
  try {
    return JSON.parse(argsText);
  } catch {
    return null;
  }
}

// Try to pretty-print partial JSON (for streaming display)
export function formatPartialJson(text: string): string {
  if (!text.trim()) return "{}";
  // Show raw text for streaming args since JSON may be incomplete
  return text;
}

// Build a ToolCallState from streaming data
export function buildToolCallState(
  id: string,
  name: string,
  argsText: string,
  status: ToolCallState["status"],
  result?: unknown,
  requiresApproval = false,
  parentMessageId = ""
): ToolCallState {
  return {
    id,
    name,
    argsText,
    args: parseArgs(argsText),
    result,
    status,
    requiresApproval,
    parentMessageId,
  };
}

// Tools that require human approval by default
export const APPROVAL_REQUIRED_TOOLS = new Set([
  "write_file",
  "terminal",
]);
