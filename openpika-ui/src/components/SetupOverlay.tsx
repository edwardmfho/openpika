"use client";

import { useState } from "react";
import { Key, ChevronRight, Eye, EyeOff, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PROVIDERS = [
  {
    id: "anthropic",
    name: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    placeholder: "sk-ant-api03-...",
    models: [
      { id: "anthropic:claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
      { id: "anthropic:claude-opus-4-7", name: "Claude Opus 4.7" },
      { id: "anthropic:claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    ],
  },
  {
    id: "google",
    name: "Google",
    envVar: "GOOGLE_API_KEY",
    placeholder: "AIza...",
    models: [
      { id: "google-gla:gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "google-gla:gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    envVar: "OPENAI_API_KEY",
    placeholder: "sk-...",
    models: [
      { id: "openai:gpt-4o", name: "GPT-4o" },
      { id: "openai:gpt-4o-mini", name: "GPT-4o Mini" },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    envVar: "GROQ_API_KEY",
    placeholder: "gsk_...",
    models: [
      { id: "groq:llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
    ],
  },
];

export function SetupOverlay({ onComplete }: { onComplete: (model: string) => void }) {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provider = PROVIDERS.find((p) => p.id === selectedProvider);

  function selectProvider(id: string) {
    const p = PROVIDERS.find((p) => p.id === id)!;
    setSelectedProvider(id);
    setSelectedModel(p.models[0].id);
    setApiKey("");
    setError(null);
  }

  async function handleSave() {
    if (!selectedModel || !apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/openpika/v1/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel, api_key: apiKey.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Failed to save — check that the backend is running.");
        return;
      }
      onComplete(selectedModel);
    } catch (e) {
      setError(`Could not reach the backend: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const canSave = Boolean(selectedModel && apiKey.trim() && !saving);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
              <Key className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Welcome to OpenPika</h2>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 ml-11">
            Choose a provider and enter your API key to get started.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6">

          {/* Step 1: Provider */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2.5">
              1 — Provider
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectProvider(p.id)}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-xl border text-left transition-all",
                    selectedProvider === p.id
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                      : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-950"
                  )}
                >
                  <span className={cn(
                    "text-sm font-medium flex-1",
                    selectedProvider === p.id ? "text-indigo-700 dark:text-indigo-300" : "text-zinc-800 dark:text-zinc-200"
                  )}>
                    {p.name}
                  </span>
                  {selectedProvider === p.id && <Check className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Model */}
          {provider && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2.5">
                2 — Model
              </p>
              <div className="space-y-1.5">
                {provider.models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedModel(m.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm text-left transition-all",
                      selectedModel === m.id
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                        : "border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-950"
                    )}
                  >
                    <span className="flex-1">{m.name}</span>
                    {selectedModel === m.id && <Check className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: API Key */}
          {provider && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2.5">
                3 — API Key
              </p>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  placeholder={provider.placeholder}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canSave && handleSave()}
                  autoFocus
                  className="w-full pr-9 py-2.5 px-3 text-sm font-mono border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-950 outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5">
                Saved to{" "}
                <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-zinc-600 dark:text-zinc-300">
                  {provider.envVar}
                </code>{" "}
                — never exposed to the browser.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 rounded-xl">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            You can change this later in Settings.
          </p>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all",
              canSave
                ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
            )}
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : <><ChevronRight className="w-4 h-4" /> Get Started</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
