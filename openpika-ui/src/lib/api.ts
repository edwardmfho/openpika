// OpenPika REST API client

const BASE = "/api/openpika";

export interface Session {
  id: string;
  title: string;
  source: "cli" | "api" | "telegram" | "whatsapp" | "slack" | "discord";
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "summary";
  content: string;
  createdAt: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  prefix: string;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "Anthropic", prefix: "anthropic:" },
  { id: "claude-opus-4-7", name: "Claude Opus 4.7", provider: "Anthropic", prefix: "anthropic:" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", provider: "Anthropic", prefix: "anthropic:" },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", prefix: "openai:" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", prefix: "openai:" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", prefix: "google-gla:" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "Google", prefix: "google-gla:" },
  { id: "local", name: "Local (Ollama)", provider: "Local", prefix: "" },
];

export async function fetchSessions(limit = 50): Promise<Session[]> {
  const res = await fetch(`${BASE}/sessions?limit=${limit}`);
  if (!res.ok) throw new Error(`Sessions fetch failed: ${res.status}`);
  const data = await res.json();
  return data.sessions ?? [];
}

export async function fetchSession(id: string): Promise<Session> {
  const res = await fetch(`${BASE}/sessions/${id}`);
  if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchSessionMessages(id: string): Promise<SessionMessage[]> {
  const res = await fetch(`${BASE}/sessions/${id}/messages`);
  if (!res.ok) throw new Error(`Messages fetch failed: ${res.status}`);
  const data = await res.json();
  return data.messages ?? [];
}

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) return { status: "error" };
  return res.json();
}

export interface SetupStatus {
  ready: boolean;
  model: string;
  provider: string;
  env_var: string;
}

export async function fetchSetupStatus(): Promise<SetupStatus | null> {
  try {
    const res = await fetch(`${BASE}/v1/setup-status`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchBackendConfig(): Promise<{ model: string } | null> {
  try {
    const res = await fetch(`${BASE}/v1/config`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function setApiKey(service: string, key: string): Promise<void> {
  const res = await fetch(`${BASE}/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service, key }),
  });
  if (!res.ok) throw new Error("Failed to store API key");
}

export interface ChannelConfig {
  platform: "telegram" | "slack" | "discord" | "whatsapp";
  name: string;
  token: string;
  webhookSecret?: string;
}

export async function registerChannel(config: ChannelConfig): Promise<{ webhookUrl: string }> {
  const res = await fetch(`${BASE}/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Failed to register channel");
  return res.json();
}
