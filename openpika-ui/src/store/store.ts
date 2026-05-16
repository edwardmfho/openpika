import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { ChatMessage, AssistantMessage, ToolCallState, Skill, GenUIState, StepState } from "@/lib/agui";
import { generateId } from "@/lib/utils";

export { AVAILABLE_MODELS } from "@/lib/api";

// ─── Settings ────────────────────────────────────────────────────────────────

export interface AppSettings {
  model: string;
  theme: "light" | "dark" | "system";
  streaming: boolean;
  showReasoning: boolean;
  maxInputTokens: number;
  rawTurnsKept: number;
  topKTools: number;
  baseUrl: string;
  approvalRequiredTools: string[];
}

const DEFAULT_SETTINGS: AppSettings = {
  model: "",
  theme: "dark",
  streaming: true,
  showReasoning: true,
  maxInputTokens: 100000,
  rawTurnsKept: 3,
  topKTools: 3,
  baseUrl: "http://localhost:8080",
  approvalRequiredTools: ["write_file", "terminal"],
};

// ─── Session ─────────────────────────────────────────────────────────────────

export interface SessionRecord {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface AppState {
  // Navigation
  activeView: "chat" | "channels" | "settings" | "tools";
  setActiveView: (v: AppState["activeView"]) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;

  // Sessions
  sessions: SessionRecord[];
  activeSessionId: string | null;
  activeSession: () => SessionRecord | null;
  createSession: () => string;
  selectSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;

  // Messages (within active session)
  addUserMessage: (content: string) => string;
  startAssistantMessage: () => string;
  appendAssistantText: (msgId: string, delta: string) => void;
  finalizeAssistantMessage: (msgId: string) => void;

  // Tool calls
  upsertToolCall: (msgId: string, tc: ToolCallState) => void;
  approveToolCall: (msgId: string, tcId: string) => void;
  rejectToolCall: (msgId: string, tcId: string) => void;
  resolveToolCall: (msgId: string, tcId: string, result: unknown, isError?: boolean) => void;

  // Reasoning
  appendReasoning: (msgId: string, delta: string) => void;
  toggleReasoning: (msgId: string) => void;

  // Steps
  startStep: (msgId: string, step: StepState) => void;
  finishStep: (msgId: string, stepId: string, status: StepState["status"]) => void;

  // GenUI state (shared across session)
  genUIState: Record<string, unknown>;
  setGenUISnapshot: (state: Record<string, unknown>) => void;
  applyGenUIDelta: (delta: unknown[]) => void;

  // Skills
  skills: Skill[];
  pinnedSkills: string[];
  togglePinSkill: (id: string) => void;

  // Streaming status
  isStreaming: boolean;
  setIsStreaming: (v: boolean) => void;
  abortController: AbortController | null;
  setAbortController: (c: AbortController | null) => void;
  stopStreaming: () => void;

  // Right panel
  rightPanelOpen: boolean;
  setRightPanelOpen: (v: boolean) => void;
}

function getOrCreateDefaultSession(sessions: SessionRecord[]): SessionRecord {
  if (sessions.length > 0) return sessions[0];
  return {
    id: generateId(),
    title: "New Session",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const DEFAULT_SKILLS: Skill[] = [
  { id: "research", name: "Research", description: "Deep dive into a topic using web search and synthesis.", icon: "Search" },
  { id: "summarize", name: "Summarize", description: "Condense long text or files into key bullet points.", icon: "AlignLeft" },
  { id: "draft_email", name: "Draft Email", description: "Write a professional email on a given topic.", icon: "Mail" },
  { id: "explain_code", name: "Explain Code", description: "Analyze and explain a piece of code.", icon: "Code2" },
  { id: "write_file", name: "Write File", description: "Create or update a file with given content.", icon: "FileText" },
  { id: "search_web", name: "Search Web", description: "Search the web for current information.", icon: "Globe" },
  { id: "translate", name: "Translate", description: "Translate text between languages.", icon: "Languages" },
  { id: "code_review", name: "Code Review", description: "Review code for bugs and style issues.", icon: "GitPullRequest" },
];

export const useAppStore = create<AppState>()(
  persist(
    immer((set, get) => ({
      activeView: "chat",
      setActiveView: (v) => set((s) => { s.activeView = v; }),

      settings: DEFAULT_SETTINGS,
      updateSettings: (patch) => set((s) => { Object.assign(s.settings, patch); }),

      sessions: [getOrCreateDefaultSession([])],
      activeSessionId: null,

      activeSession: () => {
        const { sessions, activeSessionId } = get();
        if (!activeSessionId) return sessions[0] ?? null;
        return sessions.find((s) => s.id === activeSessionId) ?? null;
      },

      createSession: () => {
        const id = generateId();
        set((s) => {
          s.sessions.unshift({
            id,
            title: "New Session",
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          s.activeSessionId = id;
        });
        return id;
      },

      selectSession: (id) => set((s) => { s.activeSessionId = id; }),

      renameSession: (id, title) => set((s) => {
        const session = s.sessions.find((x) => x.id === id);
        if (session) session.title = title;
      }),

      deleteSession: (id) => set((s) => {
        s.sessions = s.sessions.filter((x) => x.id !== id);
        if (s.activeSessionId === id) s.activeSessionId = s.sessions[0]?.id ?? null;
      }),

      addUserMessage: (content) => {
        const id = generateId();
        set((s) => {
          const session = s.sessions.find((x) => x.id === (s.activeSessionId ?? s.sessions[0]?.id));
          if (session) {
            session.messages.push({ id, role: "user", content, createdAt: Date.now() });
            session.updatedAt = Date.now();
            if (session.title === "New Session" && content.length > 0) {
              session.title = content.slice(0, 40) + (content.length > 40 ? "…" : "");
            }
          }
        });
        return id;
      },

      startAssistantMessage: () => {
        const id = generateId();
        set((s) => {
          const session = s.sessions.find((x) => x.id === (s.activeSessionId ?? s.sessions[0]?.id));
          if (session) {
            const msg: AssistantMessage = {
              id,
              role: "assistant",
              text: "",
              toolCalls: [],
              isStreaming: true,
              createdAt: Date.now(),
            };
            session.messages.push(msg);
            session.updatedAt = Date.now();
          }
        });
        return id;
      },

      appendAssistantText: (msgId, delta) => set((s) => {
        const session = s.sessions.find((x) => x.id === (s.activeSessionId ?? s.sessions[0]?.id));
        const msg = session?.messages.find((m) => m.id === msgId) as AssistantMessage | undefined;
        if (msg) msg.text += delta;
      }),

      finalizeAssistantMessage: (msgId) => set((s) => {
        const session = s.sessions.find((x) => x.id === (s.activeSessionId ?? s.sessions[0]?.id));
        const msg = session?.messages.find((m) => m.id === msgId) as AssistantMessage | undefined;
        if (msg) msg.isStreaming = false;
      }),

      upsertToolCall: (msgId, tc) => set((s) => {
        const session = s.sessions.find((x) => x.id === (s.activeSessionId ?? s.sessions[0]?.id));
        const msg = session?.messages.find((m) => m.id === msgId) as AssistantMessage | undefined;
        if (!msg) return;
        const idx = msg.toolCalls.findIndex((t) => t.id === tc.id);
        if (idx >= 0) {
          Object.assign(msg.toolCalls[idx], tc);
        } else {
          msg.toolCalls.push(tc);
        }
      }),

      approveToolCall: (msgId, tcId) => set((s) => {
        const session = s.sessions.find((x) => x.id === (s.activeSessionId ?? s.sessions[0]?.id));
        const msg = session?.messages.find((m) => m.id === msgId) as AssistantMessage | undefined;
        const tc = msg?.toolCalls.find((t) => t.id === tcId);
        if (tc) tc.status = "running";
      }),

      rejectToolCall: (msgId, tcId) => set((s) => {
        const session = s.sessions.find((x) => x.id === (s.activeSessionId ?? s.sessions[0]?.id));
        const msg = session?.messages.find((m) => m.id === msgId) as AssistantMessage | undefined;
        const tc = msg?.toolCalls.find((t) => t.id === tcId);
        if (tc) tc.status = "rejected";
      }),

      resolveToolCall: (msgId, tcId, result, isError = false) => set((s) => {
        const session = s.sessions.find((x) => x.id === (s.activeSessionId ?? s.sessions[0]?.id));
        const msg = session?.messages.find((m) => m.id === msgId) as AssistantMessage | undefined;
        const tc = msg?.toolCalls.find((t) => t.id === tcId);
        if (tc) {
          tc.result = result;
          tc.status = isError ? "error" : "completed";
        }
      }),

      appendReasoning: (msgId, delta) => set((s) => {
        const session = s.sessions.find((x) => x.id === (s.activeSessionId ?? s.sessions[0]?.id));
        const msg = session?.messages.find((m) => m.id === msgId) as AssistantMessage | undefined;
        if (msg) msg.reasoning = (msg.reasoning ?? "") + delta;
      }),

      toggleReasoning: (msgId) => set((s) => {
        const session = s.sessions.find((x) => x.id === (s.activeSessionId ?? s.sessions[0]?.id));
        const msg = session?.messages.find((m) => m.id === msgId) as AssistantMessage | undefined;
        if (msg) msg.reasoningExpanded = !msg.reasoningExpanded;
      }),

      startStep: (msgId, step) => set((s) => {
        const session = s.sessions.find((x) => x.id === (s.activeSessionId ?? s.sessions[0]?.id));
        const msg = session?.messages.find((m) => m.id === msgId) as AssistantMessage | undefined;
        if (!msg) return;
        if (!msg.steps) msg.steps = [];
        msg.steps.push(step);
      }),

      finishStep: (msgId, stepId, status) => set((s) => {
        const session = s.sessions.find((x) => x.id === (s.activeSessionId ?? s.sessions[0]?.id));
        const msg = session?.messages.find((m) => m.id === msgId) as AssistantMessage | undefined;
        const step = msg?.steps?.find((st) => st.id === stepId);
        if (step) step.status = status;
      }),

      genUIState: {},
      setGenUISnapshot: (state) => set((s) => { s.genUIState = state; }),
      applyGenUIDelta: (delta) => set((s) => {
        // Simple JSON Patch application
        for (const op of delta as Array<{ op: string; path: string; value?: unknown }>) {
          const parts = op.path.split("/").filter(Boolean);
          if (op.op === "replace" || op.op === "add") {
            let obj: Record<string, unknown> = s.genUIState;
            for (let i = 0; i < parts.length - 1; i++) {
              obj = (obj[parts[i]] as Record<string, unknown>) ?? {};
            }
            if (parts.length > 0) obj[parts[parts.length - 1]] = op.value;
          }
        }
      }),

      skills: DEFAULT_SKILLS,
      pinnedSkills: ["research", "summarize"],
      togglePinSkill: (id) => set((s) => {
        const idx = s.pinnedSkills.indexOf(id);
        if (idx >= 0) s.pinnedSkills.splice(idx, 1);
        else s.pinnedSkills.push(id);
      }),

      isStreaming: false,
      setIsStreaming: (v) => set((s) => { s.isStreaming = v; }),
      abortController: null,
      setAbortController: (c) => set((s) => { s.abortController = c; }),
      stopStreaming: () => {
        get().abortController?.abort();
        set((s) => {
          s.isStreaming = false;
          s.abortController = null;
          // Finalize any streaming messages
          const session = s.sessions.find((x) => x.id === (s.activeSessionId ?? s.sessions[0]?.id));
          if (session) {
            for (const msg of session.messages) {
              if ((msg as AssistantMessage).isStreaming) {
                (msg as AssistantMessage).isStreaming = false;
              }
            }
          }
        });
      },

      rightPanelOpen: false,
      setRightPanelOpen: (v) => set((s) => { s.rightPanelOpen = v; }),
    })),
    {
      name: "openpika-ui-state",
      partialize: (s) => ({
        settings: s.settings,
        sessions: s.sessions,
        activeSessionId: s.activeSessionId,
        pinnedSkills: s.pinnedSkills,
      }),
    }
  )
);
