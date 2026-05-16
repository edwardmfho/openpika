// AG-UI protocol event types (RFC-compatible implementation)

export enum EventType {
  RUN_STARTED = "RUN_STARTED",
  RUN_FINISHED = "RUN_FINISHED",
  RUN_ERROR = "RUN_ERROR",
  TEXT_MESSAGE_START = "TEXT_MESSAGE_START",
  TEXT_MESSAGE_CONTENT = "TEXT_MESSAGE_CONTENT",
  TEXT_MESSAGE_END = "TEXT_MESSAGE_END",
  TOOL_CALL_START = "TOOL_CALL_START",
  TOOL_CALL_ARGS_DELTA = "TOOL_CALL_ARGS_DELTA",
  TOOL_CALL_END = "TOOL_CALL_END",
  TOOL_CALL_RESULT = "TOOL_CALL_RESULT",
  STATE_SNAPSHOT = "STATE_SNAPSHOT",
  STATE_DELTA = "STATE_DELTA",
  MESSAGES_SNAPSHOT = "MESSAGES_SNAPSHOT",
  STEP_STARTED = "STEP_STARTED",
  STEP_FINISHED = "STEP_FINISHED",
  REASONING_START = "REASONING_START",
  REASONING_CONTENT = "REASONING_CONTENT",
  REASONING_END = "REASONING_END",
  CUSTOM = "CUSTOM",
}

export interface BaseEvent {
  type: EventType;
  timestamp?: number;
}

export interface RunStartedEvent extends BaseEvent {
  type: EventType.RUN_STARTED;
  threadId: string;
  runId: string;
}

export interface RunFinishedEvent extends BaseEvent {
  type: EventType.RUN_FINISHED;
  threadId: string;
  runId: string;
}

export interface RunErrorEvent extends BaseEvent {
  type: EventType.RUN_ERROR;
  message: string;
  code?: string;
}

export interface TextMessageStartEvent extends BaseEvent {
  type: EventType.TEXT_MESSAGE_START;
  messageId: string;
  role: "assistant";
}

export interface TextMessageContentEvent extends BaseEvent {
  type: EventType.TEXT_MESSAGE_CONTENT;
  messageId: string;
  delta: string;
}

export interface TextMessageEndEvent extends BaseEvent {
  type: EventType.TEXT_MESSAGE_END;
  messageId: string;
}

export interface ToolCallStartEvent extends BaseEvent {
  type: EventType.TOOL_CALL_START;
  toolCallId: string;
  toolName: string;
  parentMessageId?: string;
}

export interface ToolCallArgsDeltaEvent extends BaseEvent {
  type: EventType.TOOL_CALL_ARGS_DELTA;
  toolCallId: string;
  delta: string;
}

export interface ToolCallEndEvent extends BaseEvent {
  type: EventType.TOOL_CALL_END;
  toolCallId: string;
}

export interface ToolCallResultEvent extends BaseEvent {
  type: EventType.TOOL_CALL_RESULT;
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}

export interface StateSnapshotEvent extends BaseEvent {
  type: EventType.STATE_SNAPSHOT;
  state: Record<string, unknown>;
}

export interface StateDeltaEvent extends BaseEvent {
  type: EventType.STATE_DELTA;
  delta: JsonPatchOp[];
}

export interface StepStartedEvent extends BaseEvent {
  type: EventType.STEP_STARTED;
  stepId: string;
  label: string;
  total?: number;
  index?: number;
}

export interface StepFinishedEvent extends BaseEvent {
  type: EventType.STEP_FINISHED;
  stepId: string;
  status: "success" | "error" | "skipped";
}

export interface ReasoningStartEvent extends BaseEvent {
  type: EventType.REASONING_START;
  messageId: string;
}

export interface ReasoningContentEvent extends BaseEvent {
  type: EventType.REASONING_CONTENT;
  messageId: string;
  delta: string;
}

export interface ReasoningEndEvent extends BaseEvent {
  type: EventType.REASONING_END;
  messageId: string;
}

export interface CustomEvent extends BaseEvent {
  type: EventType.CUSTOM;
  name: string;
  payload: Record<string, unknown>;
}

export type AGUIEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsDeltaEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | StepStartedEvent
  | StepFinishedEvent
  | ReasoningStartEvent
  | ReasoningContentEvent
  | ReasoningEndEvent
  | CustomEvent;

// JSON Patch (RFC 6902) operation
export interface JsonPatchOp {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

// Tool call state for the UI
export type ToolCallStatus = "pending_approval" | "running" | "completed" | "error" | "rejected";

export interface ToolCallState {
  id: string;
  name: string;
  argsText: string;
  args: Record<string, unknown> | null;
  result: unknown;
  status: ToolCallStatus;
  requiresApproval: boolean;
  parentMessageId: string;
}

// Message types for our internal store
export type MessageRole = "user" | "assistant" | "system";

export interface BaseMessage {
  id: string;
  role: MessageRole;
  createdAt: number;
}

export interface UserMessage extends BaseMessage {
  role: "user";
  content: string;
  attachments?: FileAttachment[];
}

export interface AssistantMessage extends BaseMessage {
  role: "assistant";
  text: string;
  toolCalls: ToolCallState[];
  reasoning?: string;
  reasoningExpanded?: boolean;
  isStreaming: boolean;
  steps?: StepState[];
  genUI?: GenUIState;
}

export interface StepState {
  id: string;
  label: string;
  status: "pending" | "running" | "success" | "error" | "skipped";
  index: number;
  total?: number;
}

export interface GenUIState {
  type: "table" | "chart" | "form" | "image_grid" | "custom";
  data: Record<string, unknown>;
}

export interface FileAttachment {
  name: string;
  type: string;
  url: string;
}

export type ChatMessage = UserMessage | AssistantMessage;

// Skill definition
export interface Skill {
  id: string;
  name: string;
  description: string;
  icon?: string;
  params?: SkillParam[];
  pinned?: boolean;
}

export interface SkillParam {
  name: string;
  label: string;
  type: "text" | "number" | "select";
  required?: boolean;
  options?: string[];
}
