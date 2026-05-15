# Tools & Skills

OpenPika has two ways to extend what the agent can do:

- **Tools** — executable capabilities (functions or external servers) the LLM can call mid-conversation
- **Skills** — prompt templates users can invoke from the UI without typing a full instruction

Both are persisted in the database and manageable at runtime via the REST API.

---

## Tools

### Concepts

| Kind | What it is | Configured by |
|---|---|---|
| `native` | Python function built into `tools.py` | Seeded at startup — enable/disable only |
| `mcp_stdio` | External MCP server launched as a subprocess | API / UI |
| `mcp_http` | External MCP server reached over HTTP/SSE | API / UI |

### Built-in native tools

| ID | Name | What it does |
|---|---|---|
| `web_search` | Web Search | DuckDuckGo search, returns top N results |
| `read_file` | Read File | Read any file from the filesystem |
| `write_file` | Write File | Write / overwrite a file |
| `terminal` | Terminal | Execute a shell command (30 s timeout) |

Native tools are seeded automatically on first `init_db()`. They cannot be created or deleted via the API — only enabled or disabled.

### Enabling / disabling a tool globally

```bash
# Disable the terminal tool for all sessions
curl -X PATCH http://localhost:8080/v1/tools/terminal \
  -H 'Content-Type: application/json' \
  -d '{"enabled": false}'
```

### Registering an MCP stdio server

```bash
curl -X POST http://localhost:8080/v1/tools \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Filesystem MCP",
    "kind": "mcp_stdio",
    "description": "Browse and edit files via MCP",
    "config": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"],
      "env": {},
      "cwd": null
    }
  }'
```

### Registering an MCP HTTP/SSE server

```bash
curl -X POST http://localhost:8080/v1/tools \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "My Remote MCP",
    "kind": "mcp_http",
    "description": "Company internal MCP server",
    "config": {
      "url": "http://mcp.internal:8090/sse",
      "headers": {"Authorization": "Bearer <token>"}
    }
  }'
```

### Per-session tool overrides

A session can flip any tool on or off independently of the global setting. This is what the UI's tool toggle panel writes.

```bash
# Disable web_search just for session abc-123
curl -X PUT http://localhost:8080/v1/sessions/abc-123/tools/web_search \
  -H 'Content-Type: application/json' \
  -d '{"enabled": false}'

# Revert to global default
curl -X DELETE http://localhost:8080/v1/sessions/abc-123/tools/web_search
```

### Tool REST API reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/tools` | List all tool configs (native + MCP) |
| `POST` | `/v1/tools` | Register a new MCP tool |
| `PATCH` | `/v1/tools/{id}` | Update name, description, enabled, config |
| `DELETE` | `/v1/tools/{id}` | Delete an MCP tool (native: 400) |
| `GET` | `/v1/sessions/{id}/tools/{tool_id}` | Get effective state for a session |
| `PUT` | `/v1/sessions/{id}/tools/{tool_id}` | Set session override `{"enabled": bool}` |
| `DELETE` | `/v1/sessions/{id}/tools/{tool_id}` | Clear session override |

### `tool_configs` schema

```json
{
  "id":          "web_search",
  "name":        "Web Search",
  "kind":        "native",
  "description": "Search the web using DuckDuckGo",
  "config":      {},
  "enabled":     true,
  "sort_order":  0
}
```

**`config` for `mcp_stdio`:**
```json
{
  "command": "npx",
  "args":    ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  "env":     {"MY_VAR": "value"},
  "cwd":     "/optional/working/dir"
}
```

**`config` for `mcp_http`:**
```json
{
  "url":     "http://localhost:8090/sse",
  "headers": {"Authorization": "Bearer token"}
}
```

### How it wires into the agent

At request time, `registry.get_tools_for_session(session_id)` queries the DB, applies session overrides, and returns two lists:

- **`native_tools`** — `pydantic_ai.tools.Tool` objects wrapping the Python functions
- **`mcp_servers`** — `MCPServerStdio` / `MCPServerHTTP` objects passed as `toolsets=` to the `Agent`

MCP servers are started via `async with agent:` (pydantic-ai 1.96+) and shut down when the context exits. No server is started if the session has no enabled MCP tools.

---

## Skills

### Concepts

A skill is a **named prompt template** with an optional parameter form. Users invoke them from the UI via a slash-command (`/summarise`, `/draft_email`, …). The agent receives the rendered template as its user message and responds normally, streaming back through the chat thread.

Skills are purely a UX layer — they produce a prompt, not code. The agent uses whichever tools are enabled for that session alongside the skill.

### Built-in skills

| ID | Name | Icon | Parameters |
|---|---|---|---|
| `summarise` | Summarise | 📝 | `text` |
| `draft_email` | Draft Email | ✉️ | `subject`, `context`, `tone` |
| `explain_code` | Explain Code | 💻 | `code`, `language` |
| `search_web` | Search Web | 🔍 | `query` |
| `write_file_skill` | Write File | 📁 | `path`, `content` |

Built-in skills cannot be deleted, but their `prompt_template`, `icon`, `pinned`, and `sort_order` can be updated.

### `prompt_template` syntax

Templates use `{{param_name}}` placeholders. The UI renders a form based on `params_schema`, collects values, substitutes them, and sends the result to the agent.

```
Please summarise the following text concisely:

{{text}}
```

### `params_schema` format

Each key is a parameter name; the value describes how the UI should render the input field:

```json
{
  "text": {
    "type":      "string",
    "label":     "Text to summarise",
    "required":  true,
    "multiline": true
  },
  "tone": {
    "type":    "string",
    "label":   "Tone",
    "default": "professional"
  }
}
```

Supported field properties:

| Property | Type | Description |
|---|---|---|
| `type` | `"string"` | Field type (only `string` for now) |
| `label` | string | Display label shown in the UI form |
| `required` | bool | Whether the field must be filled |
| `multiline` | bool | Render as a textarea instead of single-line input |
| `default` | string | Pre-filled value |

### Creating a custom skill

```bash
curl -X POST http://localhost:8080/v1/skills \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Code Review",
    "icon": "🔎",
    "description": "Review a code snippet for bugs and style",
    "prompt_template": "Review the following {{language}} code for bugs, security issues, and style:\n\n```{{language}}\n{{code}}\n```\n\nFocus: {{focus}}",
    "params_schema": {
      "code":     {"type": "string", "label": "Code to review", "required": true, "multiline": true},
      "language": {"type": "string", "label": "Language", "default": "python"},
      "focus":    {"type": "string", "label": "What to focus on", "default": "bugs and security"}
    },
    "pinned": false,
    "sort_order": 10
  }'
```

### Pinning a skill

Pinned skills appear in a quick-access toolbar in the UI (UI requirement 2.5).

```bash
curl -X PATCH http://localhost:8080/v1/skills/summarise \
  -H 'Content-Type: application/json' \
  -d '{"pinned": true}'
```

### Skills REST API reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/skills` | List all skills (built-in + custom), sorted by `sort_order` |
| `POST` | `/v1/skills` | Create a custom skill |
| `PATCH` | `/v1/skills/{id}` | Update name, description, icon, prompt_template, params_schema, pinned, sort_order |
| `DELETE` | `/v1/skills/{id}` | Delete a custom skill (built-ins: 400) |

### `skills` schema

```json
{
  "id":              "summarise",
  "name":            "Summarise",
  "description":     "Condense a block of text into key points",
  "icon":            "📝",
  "prompt_template": "Please summarise the following text concisely:\n\n{{text}}",
  "params_schema":   {"text": {"type": "string", "label": "Text to summarise", "required": true, "multiline": true}},
  "is_builtin":      true,
  "pinned":          false,
  "sort_order":      0
}
```

---

## How the UI invokes a skill (AG-UI flow)

1. User types `/summarise` — UI shows the slash-command picker
2. User fills the parameter form and hits Send
3. UI renders the template with the filled params and sends it as a normal user message (or as a `Custom` AG-UI event with `{"type": "skill_invoke", "skill_id": "summarise", "params": {...}}`)
4. Agent receives the rendered prompt and responds normally
5. The response streams back through the chat thread as `TextMessageContent` events

The skill itself does not change the agent's tool availability — whatever tools are enabled for the session are still available.

---

## Adding a new native tool (code path)

If you want a new Python function available as a tool (not via MCP), add it to `tools.py` and insert a seed row in `db.py`:

**`tools.py`:**
```python
async def fetch_url(ctx: RunContext[dict], url: Annotated[str, "URL to fetch"]) -> str:
    """Fetch the content of a URL via HTTP GET."""
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, follow_redirects=True, timeout=15)
        return resp.text[:8000]
```

**`db.py` — `_BUILTIN_TOOLS`:**
```python
{"id": "fetch_url", "name": "Fetch URL", "kind": "native",
 "description": "Fetch the content of a URL", "sort_order": 4},
```

**`registry.py` — `NATIVE_FN_MAP`:**
```python
"fetch_url": _native.fetch_url,
```

The tool will be seeded on next `init_db()` and available immediately.
