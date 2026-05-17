"use client";

import { useState } from "react";
import { Menu, PanelRight, ChevronDown, Square } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { ChatView } from "./chat/ChatView";
import { ChannelsView } from "./channels/ChannelsView";
import { SettingsView } from "./settings/SettingsView";
import { ToolsView } from "./tools/ToolsView";
import { useAppStore } from "@/store/store";
import { cn } from "@/lib/utils";

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { activeView, rightPanelOpen, setRightPanelOpen, settings, isStreaming, stopStreaming, activeSession } = useAppStore();
  const session = activeSession();

  return (
    <div className="flex h-screen w-full bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <div className={cn(
        "fixed md:relative z-30 h-full w-64 flex-shrink-0",
        "bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800",
        "transition-transform duration-300 ease-in-out",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#0d0d0f]">
        {/* Header */}
        <header className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Menu className="w-5 h-5" />
            </button>

            {activeView === "chat" && session && (
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
                <span className="truncate max-w-[200px]" suppressHydrationWarning>{session.title}</span>
              </div>
            )}

            {activeView !== "chat" && (
              <h1 className="text-sm font-semibold text-zinc-900 dark:text-white capitalize">
                {activeView === "tools" ? "Tools & Skills" : activeView.charAt(0).toUpperCase() + activeView.slice(1)}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Model indicator */}
            {activeView === "chat" && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                {settings.model}
              </div>
            )}

            {/* Stop streaming */}
            {isStreaming && (
              <button
                onClick={stopStreaming}
                className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 px-3 py-1.5 rounded-full transition-colors"
              >
                <Square className="w-3 h-3 fill-current" /> Stop
              </button>
            )}

            {/* Right panel toggle */}
            {activeView === "chat" && (
              <button
                onClick={() => setRightPanelOpen(!rightPanelOpen)}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  rightPanelOpen
                    ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white"
                )}
                title="Toggle context panel"
              >
                <PanelRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>

        {/* Main view */}
        <main className="flex-1 flex min-h-0">
          <div className="flex-1 min-w-0">
            {activeView === "chat" && <ChatView />}
            {activeView === "channels" && <ChannelsView />}
            {activeView === "settings" && <SettingsView />}
            {activeView === "tools" && <ToolsView />}
          </div>

          {/* Right panel */}
          {activeView === "chat" && rightPanelOpen && <RightPanel />}
        </main>
      </div>
    </div>
  );
}

function RightPanel() {
  const session = useAppStore((s) => s.activeSession());
  const settings = useAppStore((s) => s.settings);

  const activeToolCalls = session?.messages.flatMap((m) =>
    m.role === "assistant" ? m.toolCalls : []
  ) ?? [];

  return (
    <div className="w-72 flex-shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col animate-slide-right">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Session Context</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <section>
          <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Model</h4>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{settings.model}</p>
        </section>
        <section>
          <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Context Window</h4>
          <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
            <div className="flex justify-between">
              <span>Max input tokens</span>
              <span className="font-mono">{settings.maxInputTokens.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Turns kept raw</span>
              <span className="font-mono">{settings.rawTurnsKept}</span>
            </div>
            <div className="flex justify-between">
              <span>Top-K tools</span>
              <span className="font-mono">{settings.topKTools}</span>
            </div>
          </div>
        </section>
        {activeToolCalls.length > 0 && (
          <section>
            <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Tools Used</h4>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set(activeToolCalls.map((t) => t.name))].map((name) => (
                <span key={name} className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-full font-mono">
                  {name}
                </span>
              ))}
            </div>
          </section>
        )}
        <section>
          <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">System</h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed bg-zinc-50 dark:bg-zinc-800 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
            You are OpenPika, a helpful AI agent with access to web search, file system, and terminal tools. Use tools when needed to give accurate, up-to-date answers.
          </p>
        </section>
      </div>
    </div>
  );
}
