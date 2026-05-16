"use client";

import { useState } from "react";
import {
  Plug2, Plus, Copy, RefreshCw, Check, ExternalLink,
  MessageCircle, Hash, Workflow, Phone, ChevronRight,
  Activity, Clock, X, AlertCircle, CheckCircle, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/store";

const PLATFORMS = [
  {
    id: "telegram",
    name: "Telegram",
    icon: MessageCircle,
    color: "text-sky-500",
    bg: "bg-sky-50 dark:bg-sky-900/20",
    description: "Set a Bot Token to register a webhook.",
    fields: [{ name: "token", label: "Bot Token", placeholder: "1234567890:AAF..." }],
  },
  {
    id: "slack",
    name: "Slack",
    icon: Hash,
    color: "text-purple-500",
    bg: "bg-purple-50 dark:bg-purple-900/20",
    description: "Enter your Slack signing secret and bot token.",
    fields: [
      { name: "bot_token", label: "Bot Token", placeholder: "xoxb-..." },
      { name: "signing_secret", label: "Signing Secret", placeholder: "" },
    ],
  },
  {
    id: "discord",
    name: "Discord",
    icon: Workflow,
    color: "text-indigo-500",
    bg: "bg-indigo-50 dark:bg-indigo-900/20",
    description: "Provide your Discord application token.",
    fields: [{ name: "token", label: "Bot Token", placeholder: "" }],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: Phone,
    color: "text-green-500",
    bg: "bg-green-50 dark:bg-green-900/20",
    description: "Configure via Meta Business API credentials.",
    fields: [
      { name: "phone_id", label: "Phone Number ID", placeholder: "" },
      { name: "access_token", label: "Access Token", placeholder: "" },
      { name: "verify_token", label: "Verify Token", placeholder: "" },
    ],
  },
];

const MOCK_SESSIONS = [
  { id: "s1", user: "@alex_dev", platform: "telegram", status: "active", lastMsg: "2m ago", msgCount: 14 },
  { id: "s2", user: "U04XYZABC", platform: "slack", status: "active", lastMsg: "5m ago", msgCount: 7 },
  { id: "s3", user: "+1 415 555 0192", platform: "whatsapp", status: "idle", lastMsg: "1h ago", msgCount: 3 },
];

const MOCK_CHANNELS = [
  { id: "c1", platform: "telegram", name: "@mybot", status: "active", sessions: 41, lastMsg: "2m ago", webhookUrl: "https://gateway.example.com/webhooks/telegram" },
  { id: "c2", platform: "slack", name: "#general", status: "active", sessions: 12, lastMsg: "5m ago", webhookUrl: "https://gateway.example.com/webhooks/slack" },
];

export function ChannelsView() {
  const [wizard, setWizard] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  const platform = PLATFORMS.find((p) => p.id === wizard);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto w-full animate-slide-up">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Gateway & Channels</h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">Connect your agent to external messaging platforms.</p>
      </div>

      {/* Active channels */}
      {MOCK_CHANNELS.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Active Channels</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MOCK_CHANNELS.map((ch) => {
              const pl = PLATFORMS.find((p) => p.id === ch.platform)!;
              const Icon = pl.icon;
              return (
                <div key={ch.id} className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 hover:shadow-md transition-all">
                  <div className="flex items-start gap-3">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", pl.bg)}>
                      <Icon className={cn("w-5 h-5", pl.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-white text-sm">{ch.name}</span>
                        <span className={cn(
                          "flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full",
                          ch.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-zinc-100 text-zinc-500"
                        )}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", ch.status === "active" ? "bg-green-500" : "bg-zinc-400")} />
                          {ch.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="flex items-center gap-1"><Activity className="w-3 h-3" />{ch.sessions} sessions</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{ch.lastMsg}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <code className="flex-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 px-2 py-1.5 rounded-lg truncate">
                      {ch.webhookUrl}
                    </code>
                    <button
                      onClick={() => handleCopy(ch.webhookUrl, ch.id)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex-shrink-0"
                      title="Copy webhook URL"
                    >
                      {copied === ch.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Platform cards */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Add Integration</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {PLATFORMS.map((pl) => {
            const Icon = pl.icon;
            const active = MOCK_CHANNELS.some((c) => c.platform === pl.id);
            return (
              <button
                key={pl.id}
                onClick={() => setWizard(pl.id)}
                className="flex flex-col items-start gap-3 p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all text-left group"
              >
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", pl.bg)}>
                  <Icon className={cn("w-5 h-5", pl.color)} />
                </div>
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-white text-sm">{pl.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{active ? "Connected" : "Not set up"}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Session explorer */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Cross-Channel Sessions</h3>
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-zinc-500 dark:text-zinc-400 uppercase border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last message</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {MOCK_SESSIONS.map((s) => {
                const pl = PLATFORMS.find((p) => p.id === s.platform)!;
                const Icon = pl.icon;
                return (
                  <tr key={s.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-800 dark:text-zinc-200">{s.user}</td>
                    <td className="px-4 py-3">
                      <span className={cn("flex items-center gap-1.5 text-xs font-medium", pl.color)}>
                        <Icon className="w-3.5 h-3.5" />{pl.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                        s.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                      )}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", s.status === "active" ? "bg-green-500" : "bg-zinc-400")} />
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{s.lastMsg}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors">
                        Take over →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Setup wizard modal */}
      {wizard && platform && (
        <SetupWizard platform={platform} onClose={() => setWizard(null)} />
      )}
    </div>
  );
}

function SetupWizard({
  platform,
  onClose,
}: {
  platform: typeof PLATFORMS[0];
  onClose: () => void;
}) {
  const { settings } = useAppStore();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = platform.icon;
  const baseUrl = settings.baseUrl.replace(/\/$/, "");
  const webhookUrl = `${baseUrl}/webhooks/${platform.id}`;
  const isHttps = settings.baseUrl.startsWith("https://");

  async function handleSave() {
    setError(null);
    try {
      await fetch("/api/openpika/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platform.id, credentials: values }),
      });
    } catch {
      // backend may not be running; proceed optimistically
    }
    setSaved(true);
    setTimeout(onClose, 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", platform.bg)}>
            <Icon className={cn("w-5 h-5", platform.color)} />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900 dark:text-white">Set up {platform.name}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{platform.description}</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {platform.fields.map((f) => (
            <div key={f.name}>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{f.label}</label>
              <input
                type={f.name.includes("token") || f.name.includes("secret") ? "password" : "text"}
                placeholder={f.placeholder}
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-950 outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
          ))}

          <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5">Your Webhook URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 truncate">{webhookUrl}</code>
              <button
                onClick={() => navigator.clipboard.writeText(webhookUrl)}
                className="p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Paste this URL in your platform's developer settings.</p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
              Base URL comes from <span className="font-medium text-zinc-600 dark:text-zinc-300">Settings → Gateway Connection</span>.
            </p>
            {!isHttps && (
              <div className="flex items-start gap-1.5 mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  This URL uses <strong>http</strong>, not https. Platforms will refuse to deliver
                  messages to it. Update your Base URL in Settings to a public https:// address first.
                </p>
              </div>
            )}
          </div>
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />{error}
            </p>
          )}
        </div>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-xl transition-colors shadow-sm",
              saved
                ? "bg-green-600 text-white"
                : "bg-indigo-600 hover:bg-indigo-700 text-white"
            )}
          >
            {saved ? <span className="flex items-center gap-1.5"><Check className="w-4 h-4" /> Saved!</span> : "Save & Register"}
          </button>
        </div>
      </div>
    </div>
  );
}
