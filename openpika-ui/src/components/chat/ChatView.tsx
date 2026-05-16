"use client";

import { useRef, useEffect, useState, useCallback, KeyboardEvent } from "react";
import { Send, Paperclip, Search, AlignLeft, Mail, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useAppStore } from "@/store/store";
import { ToolCallCard } from "@/components/tools/ToolCallCard";
import { ReasoningBlock } from "@/components/genui/ReasoningBlock";
import { StepProgress } from "@/components/genui/StepProgress";
import { GenUIRenderer } from "@/components/genui/GenUIRenderer";
import { SkillPicker } from "./SkillPicker";
import { streamOpenAIToAGUI, buildToolCallState, APPROVAL_REQUIRED_TOOLS } from "@/lib/streaming";
import { EventType } from "@/lib/agui";
import type { AssistantMessage, Skill } from "@/lib/agui";
import { cn } from "@/lib/utils";
import { generateId } from "@/lib/utils";

export function ChatView() {
  const {
    activeSession, settings, skills, pinnedSkills, togglePinSkill,
    isStreaming, setIsStreaming, setAbortController,
    addUserMessage, startAssistantMessage, appendAssistantText,
    finalizeAssistantMessage, upsertToolCall, approveToolCall,
    rejectToolCall, appendReasoning, startStep, finishStep,
    setGenUISnapshot, applyGenUIDelta,
  } = useAppStore();

  const [input, setInput] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerHighlight, setPickerHighlight] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const session = activeSession();
  const messages = session?.messages ?? [];
  const pinnedList = skills.filter((s) => pinnedSkills.includes(s.id));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, messages.at(-1)]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith("/") && val.length < 20 && !val.includes(" ")) {
      setShowPicker(true);
      setPickerQuery(val.slice(1));
      setPickerHighlight(0);
    } else {
      setShowPicker(false);
    }
  };

  const insertSkill = (skill: Skill) => {
    setInput(`/${skill.id} `);
    setShowPicker(false);
    inputRef.current?.focus();
  };

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    // Build the message history for the API
    const openAIMessages = messages.map((m) => ({
      role: m.role,
      content: m.role === "assistant"
        ? (m as AssistantMessage).text
        : (m as { content: string }).content,
    }));

    // Check for skill invocation
    let content = text.trim();
    let skillPayload: unknown = null;
    if (content.startsWith("/")) {
      const parts = content.split(" ");
      const skillId = parts[0].slice(1);
      const skillObj = skills.find((s) => s.id === skillId);
      if (skillObj) {
        skillPayload = { type: "skill_invoke", skill_id: skillId, params: parts.slice(1).join(" ") };
        content = `[Skill: ${skillObj.name}] ${parts.slice(1).join(" ")}`.trim();
      }
    }

    // Add user message to store
    addUserMessage(content);
    setInput("");
    setShowPicker(false);

    // Create assistant placeholder
    const asstMsgId = startAssistantMessage();
    setIsStreaming(true);

    const ac = new AbortController();
    setAbortController(ac);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...openAIMessages, { role: "user", content }],
          model: settings.model,
          stream: settings.streaming,
        }),
        signal: ac.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        appendAssistantText(asstMsgId, `\n\n**Error:** ${errText}`);
        finalizeAssistantMessage(asstMsgId);
        setIsStreaming(false);
        return;
      }

      if (!settings.streaming) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content ?? "";
        appendAssistantText(asstMsgId, text);
        finalizeAssistantMessage(asstMsgId);
        setIsStreaming(false);
        return;
      }

      const threadId = session?.id ?? generateId();
      const runId = generateId();
      const toolCallMsgMap = new Map<string, string>(); // toolCallId → asstMsgId

      for await (const event of streamOpenAIToAGUI(response, threadId, runId)) {
        if (ac.signal.aborted) break;

        switch (event.type) {
          case EventType.TEXT_MESSAGE_CONTENT:
            appendAssistantText(asstMsgId, event.delta);
            break;

          case EventType.TOOL_CALL_START: {
            const requiresApproval = settings.approvalRequiredTools.includes(event.toolName) ||
              APPROVAL_REQUIRED_TOOLS.has(event.toolName);
            const tc = buildToolCallState(
              event.toolCallId,
              event.toolName,
              "",
              requiresApproval ? "pending_approval" : "running",
              undefined,
              requiresApproval,
              asstMsgId
            );
            toolCallMsgMap.set(event.toolCallId, asstMsgId);
            upsertToolCall(asstMsgId, tc);
            break;
          }

          case EventType.TOOL_CALL_ARGS_DELTA: {
            const msgId = toolCallMsgMap.get(event.toolCallId) ?? asstMsgId;
            // Accumulate args on the existing tool call
            const { activeSession: getSession } = useAppStore.getState();
            const currentSession = getSession();
            const msg = currentSession?.messages.find((m) => m.id === msgId) as AssistantMessage | undefined;
            const existing = msg?.toolCalls.find((t) => t.id === event.toolCallId);
            if (existing) {
              upsertToolCall(msgId, {
                ...existing,
                argsText: existing.argsText + event.delta,
              });
            }
            break;
          }

          case EventType.TOOL_CALL_END: {
            const msgId = toolCallMsgMap.get(event.toolCallId) ?? asstMsgId;
            const { activeSession: getSession } = useAppStore.getState();
            const currentSession = getSession();
            const msg = currentSession?.messages.find((m) => m.id === msgId) as AssistantMessage | undefined;
            const existing = msg?.toolCalls.find((t) => t.id === event.toolCallId);
            if (existing && existing.status !== "pending_approval") {
              upsertToolCall(msgId, { ...existing, status: "completed" });
            }
            break;
          }

          case EventType.TOOL_CALL_RESULT: {
            const msgId = toolCallMsgMap.get(event.toolCallId) ?? asstMsgId;
            const { activeSession: getSession } = useAppStore.getState();
            const currentSession = getSession();
            const msg = currentSession?.messages.find((m) => m.id === msgId) as AssistantMessage | undefined;
            const existing = msg?.toolCalls.find((t) => t.id === event.toolCallId);
            if (existing) {
              upsertToolCall(msgId, {
                ...existing,
                result: event.result,
                status: event.isError ? "error" : "completed",
              });
            }
            break;
          }

          case EventType.REASONING_CONTENT:
            appendReasoning(asstMsgId, event.delta);
            break;

          case EventType.STEP_STARTED:
            startStep(asstMsgId, {
              id: event.stepId,
              label: event.label,
              status: "running",
              index: event.index ?? 0,
              total: event.total,
            });
            break;

          case EventType.STEP_FINISHED:
            finishStep(asstMsgId, event.stepId, event.status);
            break;

          case EventType.STATE_SNAPSHOT:
            setGenUISnapshot(event.state);
            break;

          case EventType.STATE_DELTA:
            applyGenUIDelta(event.delta as unknown[]);
            break;

          case EventType.CUSTOM:
            if (event.name === "render" && event.payload) {
              // Generative UI push from agent
            }
            break;
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        appendAssistantText(asstMsgId, `\n\n**Error:** ${String(err)}`);
      }
    } finally {
      finalizeAssistantMessage(asstMsgId);
      setIsStreaming(false);
      setAbortController(null);
    }
  }, [messages, settings, session, skills, isStreaming]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showPicker) {
      const filtered = skills.filter((s) =>
        s.name.toLowerCase().includes(pickerQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(pickerQuery.toLowerCase())
      );
      if (e.key === "ArrowDown") { e.preventDefault(); setPickerHighlight((h) => Math.min(h + 1, filtered.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setPickerHighlight((h) => Math.max(h - 1, 0)); return; }
      if (e.key === "Enter" && filtered[pickerHighlight]) { e.preventDefault(); insertSkill(filtered[pickerHighlight]); return; }
      if (e.key === "Escape") { setShowPicker(false); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <WelcomeScreen onSkill={insertSkill} skills={skills.slice(0, 6)} />
        ) : (
          <div className="max-w-4xl mx-auto px-4 py-8 pb-36 space-y-6">
            {messages.map((msg) => (
              <MessageRow key={msg.id} message={msg as AssistantMessage | { id: string; role: string; content: string; createdAt: number }}
                onApprove={(tcId) => approveToolCall(msg.id, tcId)}
                onReject={(tcId) => rejectToolCall(msg.id, tcId)}
              />
            ))}
            {isStreaming && messages.at(-1)?.role === "assistant" && (
              <div className="flex items-center gap-2 pl-12 text-zinc-400 text-sm">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Thinking…</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-[#0d0d0f] dark:via-[#0d0d0f]/95 pt-8">
        <div className="max-w-4xl mx-auto relative">
          {/* Skill picker popup */}
          {showPicker && (
            <SkillPicker
              skills={skills}
              query={pickerQuery}
              onSelect={insertSkill}
              highlightIndex={pickerHighlight}
            />
          )}

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-lg focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-500/50 dark:focus-within:border-indigo-600/50 transition-all">
            {/* Pinned skills toolbar */}
            {pinnedList.length > 0 && (
              <div className="flex items-center gap-1 px-3 pt-2.5 pb-0 flex-wrap">
                {pinnedList.map((skill) => (
                  <button
                    key={skill.id}
                    onClick={() => insertSkill(skill)}
                    className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    {skill.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 p-3">
              {/* Attachment */}
              <button className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex-shrink-0">
                <Paperclip className="w-4.5 h-4.5" />
              </button>

              {/* Textarea */}
              <textarea
                ref={inputRef}
                id="chat-input"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message or '/' for skills…"
                rows={1}
                className="flex-1 max-h-32 py-1.5 bg-transparent border-none resize-none focus:ring-0 text-[15px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none leading-relaxed"
                style={{ minHeight: "1.75rem" }}
              />

              {/* Send */}
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || isStreaming}
                className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                  input.trim() && !isStreaming
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                )}
              >
                {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <p className="text-center mt-2 text-[11px] text-zinc-400">
            OpenPika v0.1 — {settings.baseUrl}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Message Row ─────────────────────────────────────────────────────────────

interface MessageRowProps {
  message: AssistantMessage | { id: string; role: string; content: string; createdAt: number };
  onApprove: (tcId: string) => void;
  onReject: (tcId: string) => void;
}

function MessageRow({ message, onApprove, onReject }: MessageRowProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end gap-3 group animate-slide-up">
        <div className="max-w-[80%] md:max-w-2xl">
          <div className="bg-indigo-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm text-[15px] leading-relaxed">
            {(message as { content: string }).content}
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-zinc-800 dark:bg-zinc-200 flex items-center justify-center flex-shrink-0 self-start mt-0.5">
          <span className="text-xs font-bold text-white dark:text-zinc-900">U</span>
        </div>
      </div>
    );
  }

  const asstMsg = message as AssistantMessage;

  return (
    <div className="flex gap-3 animate-slide-up">
      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0 self-start mt-0.5">
        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">AI</span>
      </div>
      <div className="flex-1 min-w-0 max-w-2xl">
        {/* Reasoning */}
        {asstMsg.reasoning && (
          <ReasoningBlock
            messageId={asstMsg.id}
            content={asstMsg.reasoning}
            expanded={asstMsg.reasoningExpanded ?? false}
          />
        )}

        {/* Step progress */}
        {asstMsg.steps && asstMsg.steps.length > 0 && (
          <StepProgress steps={asstMsg.steps} />
        )}

        {/* Tool calls */}
        {asstMsg.toolCalls.map((tc) => (
          <ToolCallCard
            key={tc.id}
            tool={tc}
            onApprove={() => onApprove(tc.id)}
            onReject={() => onReject(tc.id)}
          />
        ))}

        {/* Text content */}
        {asstMsg.text && (
          <div className={cn(
            "text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200",
            asstMsg.isStreaming && !asstMsg.text && "streaming-cursor"
          )}>
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:my-2 prose-pre:bg-zinc-900 prose-code:text-indigo-600 dark:prose-code:text-indigo-400">
              <ReactMarkdown
                components={{
                  code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    if (!match) {
                      return (
                        <code className="bg-zinc-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 rounded px-1 py-0.5 text-[0.85em] font-mono">
                          {children}
                        </code>
                      );
                    }
                    return <code className={className} {...props}>{children}</code>;
                  }
                }}
              >
                {asstMsg.text}
              </ReactMarkdown>
            </div>
            {asstMsg.isStreaming && <span className="streaming-cursor" />}
          </div>
        )}

        {/* Generative UI */}
        {asstMsg.genUI && <GenUIRenderer state={asstMsg.genUI} />}
      </div>
    </div>
  );
}

// ─── Welcome Screen ───────────────────────────────────────────────────────────

function WelcomeScreen({ onSkill, skills }: { onSkill: (s: Skill) => void; skills: Skill[] }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-16 animate-fade-in">
      <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/20">
        <span className="text-2xl font-bold text-white">P</span>
      </div>
      <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">How can I help?</h2>
      <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-10 text-center max-w-sm">
        Ask me anything, or pick a skill below to get started.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl w-full">
        {skills.map((skill) => (
          <button
            key={skill.id}
            onClick={() => onSkill(skill)}
            className="text-left p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all group"
          >
            <p className="text-sm font-semibold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 mb-0.5">
              /{skill.id}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
              {skill.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
