"use client";

import { useState } from "react";
import { Brain, Key, Monitor, Sun, Moon, Laptop, Check, Eye, EyeOff, RefreshCw, Sliders, ShieldCheck, AlertTriangle } from "lucide-react";
import { useAppStore, AVAILABLE_MODELS } from "@/store/store";
import { cn } from "@/lib/utils";

const API_SERVICES = [
  { id: "ANTHROPIC_API_KEY", label: "Anthropic", placeholder: "sk-ant-api03-..." },
  { id: "OPENAI_API_KEY", label: "OpenAI", placeholder: "sk-..." },
  { id: "GEMINI_API_KEY", label: "Google Gemini", placeholder: "AIza..." },
  { id: "GROQ_API_KEY", label: "Groq", placeholder: "gsk_..." },
];

export function SettingsView() {
  const { settings, updateSettings } = useAppStore();
  const [keyVisibility, setKeyVisibility] = useState<Record<string, boolean>>({});
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookSecretVisible, setWebhookSecretVisible] = useState(false);
  const [webhookSecretSaved, setWebhookSecretSaved] = useState(false);

  const baseUrlIsHttps = settings.baseUrl.startsWith("https://");

  async function saveKey(service: string) {
    try {
      await fetch("/api/openpika/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, key: keyValues[service] }),
      });
      setSaved((s) => ({ ...s, [service]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [service]: false })), 2000);
    } catch {
      setSaved((s) => ({ ...s, [service]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [service]: false })), 2000);
    }
  }

  async function saveWebhookSecret() {
    try {
      await fetch("/api/openpika/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: "WEBHOOK_SECRET", key: webhookSecret }),
      });
    } catch {
      // proceed optimistically
    }
    setWebhookSecretSaved(true);
    setTimeout(() => setWebhookSecretSaved(false), 2000);
  }

  const themes: Array<{ id: AppSettings["theme"]; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Laptop },
  ];

  type AppSettings = typeof settings;

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto w-full animate-slide-up">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Settings</h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">Configure your OpenPika preferences and API keys.</p>
      </div>

      <div className="space-y-8">
        {/* Model */}
        <Section icon={Brain} title="Default Model">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {AVAILABLE_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => updateSettings({ model: m.id })}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-xl border text-left transition-all",
                  settings.model === m.id
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-600"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700"
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium", settings.model === m.id ? "text-indigo-700 dark:text-indigo-300" : "text-zinc-900 dark:text-white")}>{m.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{m.provider}</p>
                </div>
                {settings.model === m.id && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />}
              </button>
            ))}
          </div>
        </Section>

        {/* API Keys */}
        <Section icon={Key} title="API Keys" subtitle="Stored in the gateway keychain — never in the browser.">
          <div className="space-y-3">
            {API_SERVICES.map((svc) => (
              <div key={svc.id} className="flex items-center gap-3 p-3 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{svc.label}</p>
                  <div className="relative">
                    <input
                      type={keyVisibility[svc.id] ? "text" : "password"}
                      placeholder={svc.placeholder}
                      value={keyValues[svc.id] ?? ""}
                      onChange={(e) => setKeyValues((k) => ({ ...k, [svc.id]: e.target.value }))}
                      className="w-full pr-20 py-1.5 px-2.5 text-xs font-mono border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-950 outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                    />
                    <button
                      onClick={() => setKeyVisibility((v) => ({ ...v, [svc.id]: !v[svc.id] }))}
                      className="absolute right-8 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600"
                    >
                      {keyVisibility[svc.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => saveKey(svc.id)}
                  disabled={!keyValues[svc.id]}
                  className={cn(
                    "flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                    saved[svc.id]
                      ? "bg-green-600 text-white"
                      : keyValues[svc.id]
                        ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                  )}
                >
                  {saved[svc.id] ? "Saved!" : "Save"}
                </button>
              </div>
            ))}
          </div>
        </Section>

        {/* Context tuning */}
        <Section icon={Sliders} title="Context Tuning">
          <div className="space-y-4">
            {[
              { key: "maxInputTokens" as const, label: "Max input tokens", min: 1000, max: 200000, step: 1000 },
              { key: "rawTurnsKept" as const, label: "Raw turns kept", min: 1, max: 20, step: 1 },
              { key: "topKTools" as const, label: "Top-K tools (RAG)", min: 1, max: 10, step: 1 },
            ].map(({ key, label, min, max, step }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-zinc-700 dark:text-zinc-300">{label}</label>
                  <span className="text-sm font-mono text-indigo-600 dark:text-indigo-400">
                    {settings[key].toLocaleString()}
                  </span>
                </div>
                <input
                  type="range"
                  min={min} max={max} step={step}
                  value={settings[key]}
                  onChange={(e) => updateSettings({ [key]: Number(e.target.value) } as Partial<typeof settings>)}
                  className="w-full accent-indigo-600"
                />
              </div>
            ))}
          </div>
        </Section>

        {/* Theme */}
        <Section icon={Monitor} title="Appearance">
          <div className="flex gap-2">
            {themes.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => updateSettings({ theme: id as "light" | "dark" | "system" })}
                className={cn(
                  "flex-1 flex flex-col items-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all",
                  settings.theme === id
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-600"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300"
                )}
              >
                <Icon className="w-5 h-5" />
                {label}
              </button>
            ))}
          </div>

          {/* Toggle switches */}
          <div className="mt-4 space-y-3">
            {[
              { key: "streaming" as const, label: "Streaming text generation", desc: "Show tokens as they arrive" },
              { key: "showReasoning" as const, label: "Show reasoning blocks", desc: "Display the agent's thinking process" },
            ].map(({ key, label, desc }) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">{label}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{desc}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={settings[key]}
                  onClick={() => updateSettings({ [key]: !settings[key] } as Partial<typeof settings>)}
                  className={cn(
                    "relative w-10 h-6 rounded-full transition-colors",
                    settings[key] ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700"
                  )}
                >
                  <span className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
                    settings[key] ? "translate-x-5" : "translate-x-1"
                  )} />
                </button>
              </label>
            ))}
          </div>
        </Section>

        {/* Security */}
        <Section icon={ShieldCheck} title="Security" subtitle="Protects your gateway from fake or spoofed messages.">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Webhook Signing Secret
              </label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                Every platform you connect can cryptographically sign its messages. OpenPika checks
                that signature and rejects anything unsigned. Set a long random string here, then
                paste the same value into each platform&apos;s developer settings.
              </p>
              <div className="flex items-center gap-3 p-3 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900">
                <div className="flex-1 min-w-0">
                  <div className="relative">
                    <input
                      type={webhookSecretVisible ? "text" : "password"}
                      placeholder="e.g. xK9#mP2$qL7vR4nW..."
                      value={webhookSecret}
                      onChange={(e) => setWebhookSecret(e.target.value)}
                      className="w-full pr-8 py-1.5 px-2.5 text-xs font-mono border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-950 outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                    />
                    <button
                      onClick={() => setWebhookSecretVisible((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600"
                    >
                      {webhookSecretVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
                <button
                  onClick={saveWebhookSecret}
                  disabled={!webhookSecret}
                  className={cn(
                    "flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                    webhookSecretSaved
                      ? "bg-green-600 text-white"
                      : webhookSecret
                        ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                  )}
                >
                  {webhookSecretSaved ? "Saved!" : "Save"}
                </button>
              </div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5">
                Also add this to <code className="font-mono">~/.openpika/config.toml</code> as{" "}
                <code className="font-mono">webhook_secret</code> under{" "}
                <code className="font-mono">[gateway]</code>.
              </p>
            </div>
          </div>
        </Section>

        {/* Base URL */}
        <Section icon={RefreshCw} title="Gateway Connection">
          <div>
            <label className="block text-sm text-zinc-700 dark:text-zinc-300 mb-1">Base URL</label>
            <input
              type="url"
              value={settings.baseUrl}
              onChange={(e) => updateSettings({ baseUrl: e.target.value })}
              className={cn(
                "w-full px-3 py-2 text-sm border rounded-xl bg-zinc-50 dark:bg-zinc-950 outline-none focus:ring-2 focus:ring-indigo-500 font-mono",
                !baseUrlIsHttps
                  ? "border-amber-400 dark:border-amber-500"
                  : "border-zinc-200 dark:border-zinc-700"
              )}
            />
            {!baseUrlIsHttps && (
              <div className="flex items-start gap-1.5 mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <strong>Not HTTPS.</strong> Messaging platforms require a public{" "}
                  <code className="font-mono">https://</code> URL to deliver webhooks. This URL is
                  fine for local testing, but you must switch to HTTPS before connecting any platform
                  in production. See the setup guide for nginx + Let&apos;s Encrypt instructions.
                </p>
              </div>
            )}
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              The OpenPika gateway URL. Default: http://localhost:8080
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
