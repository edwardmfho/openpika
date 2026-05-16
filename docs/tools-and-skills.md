# OpenPika — Tool Use & Skill Use

> Reference for developers and end-users on how tools and skills work inside OpenPika, how they are dispatched through the AG-UI event protocol, and how to add your own.

---

## 1. Tool Use

Tools are executable functions that the agent can call during a conversation to interact with the outside world. They are defined on the **server side** and run inside the OpenPika Python brain (pydantic-ai).

### 1.1 Built-in Tools

| Tool | Trigger phrase | Description |
|------|---------------|-------------|
| `web_search` | Search, look up, find | DuckDuckGo Instant Answer; configurable `max_results` (default 5) |
| `read_file` | Read, open, show file | Reads a path; supports `~/`, relative, and absolute |
| `write_file` | Write, save, create file | Writes content; auto-creates parent directories |
| `terminal` | Run, execute, shell | Executes shell commands; 30-second timeout; returns stdout + stderr + exit code |

### 1.2 Tool Lifecycle & AG-UI Events

Every tool invocation emits a sequence of AG-UI protocol events that the UI consumes:

```
TOOL_CALL_START        ← agent decides to call a tool
  TOOL_CALL_ARGS_DELTA ← arguments stream in (partial JSON)
  TOOL_CALL_ARGS_DELTA ← …
TOOL_CALL_END          ← all arguments received
  (human approval gate if configured)
TOOL_CALL_RESULT       ← tool result arrives (success or error)
```

The UI renders a **collapsible ToolCallCard** inline in the message thread for each tool call, showing:
- Tool name + status badge (`running`, `completed`, `error`, `pending_approval`)
- Arguments (streaming as `TOOL_CALL_ARGS_DELTA` events arrive)
- Result with tool-specific rendering (see §1.4)

### 1.3 Human-in-the-Loop (HITL) Approval

Some tools require the user to approve before execution. This is controlled per-tool in **Settings → Context Tuning → Approval-required tools**.

Default approval-required tools: `write_file`, `terminal`

**Flow:**

```
TOOL_CALL_START
  ↓ UI shows approval card  (status: pending_approval)
  ↓ User clicks Approve or Reject
Approve → tool runs → TOOL_CALL_RESULT
Reject  → tool is skipped; agent notified
```

The approval/rejection is sent back via a **Custom AG-UI event**:
```json
{
  "type": "CUSTOM",
  "name": "tool_approval",
  "payload": {
    "tool_call_id": "call_abc123",
    "decision": "approve"
  }
}
```

### 1.4 Tool-Specific UI Rendering

| Tool | UI Component | Notes |
|------|-------------|-------|
| `terminal` | `TerminalRenderer` | Monospace block with ANSI colour stripping |
| `read_file` / `write_file` | `FileRenderer` | Syntax-highlighted code viewer (Prism), language auto-detected from extension |
| `web_search` | `WebSearchRenderer` | Card list — title + snippet + clickable URL |
| All others | Raw JSON | Args + result in a `<pre>` block |

### 1.5 Adding a Custom Tool

**Python side** (`openpika-python/src/openpika/tools/`):

```python
from pydantic_ai import Agent

agent = Agent(model="anthropic:claude-sonnet-4-6")

@agent.tool
async def my_tool(ctx, param: str) -> str:
    """Short description — the agent reads this to decide when to call it."""
    result = await do_something(param)
    return result
```

**UI side** — register a custom renderer in `ToolCallCard.tsx`:

```tsx
// src/components/tools/ToolCallCard.tsx
const TOOL_ICONS = {
  my_tool: MyIcon,
  // ...
};

// In ResultDisplay, add a case:
if (toolName === "my_tool") {
  return <MyToolRenderer result={result} />;
}
```

**Approval** — add the tool name to the approval list in Settings or the config default:

```ts
// src/store/store.ts  DEFAULT_SETTINGS
approvalRequiredTools: ["write_file", "terminal", "my_tool"]
```

---

## 2. Skill Use

Skills are **pre-built prompt templates** the user can invoke with a slash command (`/skill_id`) or from the pinned toolbar. They run as regular chat messages — the skill template is expanded into a system-prompt injection before the message reaches the model.

### 2.1 Built-in Skills

| Skill ID | Name | Description |
|----------|------|-------------|
| `research` | Research | Deep dive into a topic using web search and synthesis |
| `summarize` | Summarize | Condense long text or files into key bullet points |
| `draft_email` | Draft Email | Write a professional email on a given topic |
| `explain_code` | Explain Code | Analyze and explain a piece of code clearly |
| `write_file` | Write File | Create or update a file with given content |
| `search_web` | Search Web | Search the web for current information |
| `translate` | Translate | Translate text between languages |
| `code_review` | Code Review | Review code for bugs and style issues |

### 2.2 Skill Invocation — Three Ways

**1. Slash command** — type `/` in the composer:

```
/research latest transformer architectures
/summarize <paste long text here>
/draft_email meeting reschedule
```

The skill picker opens as you type, filtered to matching skill IDs. Use `↑↓` to navigate, `Enter` to select.

**2. Pinned toolbar** — click any pinned chip above the composer input.

**3. Welcome screen** — click a skill card on the empty-session welcome screen.

### 2.3 AG-UI Dispatch

When a skill is invoked, a `Custom` AG-UI event is sent alongside the user message:

```json
{
  "type": "CUSTOM",
  "name": "skill_invoke",
  "payload": {
    "skill_id": "research",
    "params": "latest transformer architectures"
  }
}
```

The backend reads this event, looks up the skill's system prompt template, and prepends it before calling the model.

### 2.4 Full Skill Flow

```
User types "/research quantum computing"
  │
  ├─ SkillPicker filters → highlights "research"
  ├─ Enter → input set to "/research quantum computing"
  └─ Send pressed
        │
        ├─ CUSTOM(skill_invoke) event queued
        ├─ User message added to thread
        └─ POST /api/chat with:
              messages: [...history, { role: "user", content: "..." }]
              custom_events: [{ name: "skill_invoke", payload: {...} }]
                    │
                    ↓ OpenPika backend
                    ├─ skill template loaded
                    ├─ system prompt injected
                    └─ agent runs → SSE stream:
                          TEXT_MESSAGE_START
                          TEXT_MESSAGE_CONTENT  ← tokens stream
                          TOOL_CALL_START       ← if web_search used
                          ...
                          TEXT_MESSAGE_END
                          RUN_FINISHED
```

### 2.5 Pinning Skills

In the slash-command picker, each skill shows a **pin icon** (★) on hover. Click it to pin the skill to the toolbar above the input. Pinned skills persist in local settings across sessions.

- Toggle pin: `useAppStore().togglePinSkill(id)`
- Default pinned: `research`, `summarize`

### 2.6 Defining a Server-Side Skill

Skills are served from `GET /v1/skills`. Each skill entry:

```json
{
  "id": "research",
  "name": "Research",
  "description": "Deep dive into a topic using web search and synthesis.",
  "icon": "Search",
  "system_prompt": "You are a research assistant. Use web_search to find accurate, up-to-date information. Synthesize results into a clear summary with citations.",
  "params": [
    { "name": "topic", "label": "Topic", "type": "text", "required": true }
  ]
}
```

To add a skill, append to `config.toml`:

```toml
[[skills]]
id            = "my_skill"
name          = "My Skill"
description   = "Does something awesome."
icon          = "Zap"
system_prompt = "You are a specialist in X. Always verify facts with web_search."
```

Or POST to `/v1/skills` (admin only).

### 2.7 Skill Parameter Forms

Skills with `params` defined will show a form modal in the UI before dispatch *(coming in v1.1)*. Currently, free-text params are appended to the slash command:

```
/draft_email project status update for the CTO
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                    Becomes the "topic" param
```

---

## 3. Protocol Reference

### Full AG-UI Run Sequence

```
RUN_STARTED          { threadId, runId }

# Optional: agent reasoning (shown as collapsible block)
REASONING_START      { messageId }
REASONING_CONTENT    { messageId, delta }
REASONING_END        { messageId }

# Optional: step-by-step progress tracker
STEP_STARTED         { stepId, label, index, total }
STEP_FINISHED        { stepId, status: "success"|"error"|"skipped" }

# Tool call (repeats per tool invocation)
TOOL_CALL_START      { toolCallId, toolName, parentMessageId }
TOOL_CALL_ARGS_DELTA { toolCallId, delta }   ← streaming JSON args
TOOL_CALL_END        { toolCallId }
TOOL_CALL_RESULT     { toolCallId, result, isError? }

# Text response
TEXT_MESSAGE_START   { messageId, role: "assistant" }
TEXT_MESSAGE_CONTENT { messageId, delta }    ← streaming tokens
TEXT_MESSAGE_END     { messageId }

# Generative UI state push (optional)
STATE_SNAPSHOT       { state: { type, data } }
STATE_DELTA          { delta: [RFC-6902 JSON Patch ops] }

RUN_FINISHED         { threadId, runId }
```

### Skill Invocation Event

Sent **before** the user message:

```json
{ "type": "CUSTOM", "name": "skill_invoke",
  "payload": { "skill_id": "string", "params": "string | object" } }
```

### Tool Approval Event

Sent by the UI **after** the user acts on an approval card:

```json
{ "type": "CUSTOM", "name": "tool_approval",
  "payload": { "tool_call_id": "string", "decision": "approve | reject" } }
```

### Generative UI State Types

```ts
type GenUIState =
  | { type: "table";  data: { title: string; columns: string[]; rows: unknown[][] } }
  | { type: "chart";  data: { title: string; chartType: "bar"|"line"; xKey: string; keys: string[]; data: object[] } }
  | { type: "form";   data: { title: string; fields: { name: string; label: string; type: string }[]; submitLabel: string } }
  | { type: "custom"; data: Record<string, unknown> }
```

---

## 4. Configuration Quick Reference

| Setting | Config key | Default | Description |
|---------|-----------|---------|-------------|
| HITL approval list | `approvalRequiredTools` | `["write_file","terminal"]` | Tools paused for human review |
| Top-K tools (RAG) | `topKTools` | `3` | Max tools injected per request |
| Max input tokens | `maxInputTokens` | `100 000` | Gateway hard limit |
| Streaming | `streaming` | `true` | Disable for copy-paste workflow |
| Show reasoning | `showReasoning` | `true` | Surface `REASONING_*` blocks |
