"use client";

import { useState } from "react";
import { Globe, FileCode, Terminal, Database, Plus, CheckCircle2, Blocks, X, Upload, Code2, Braces, Box } from "lucide-react";
import { cn } from "@/lib/utils";

const BUILT_IN_TOOLS = [
  { id: "web_search", name: "Web Search", provider: "Built-in", description: "Search the internet for real-time information using DuckDuckGo.", installed: true, icon: Globe },
  { id: "read_file", name: "Read File", provider: "Built-in", description: "Read files from the local filesystem with path resolution.", installed: true, icon: FileCode },
  { id: "write_file", name: "Write File", provider: "Built-in", description: "Write content to the filesystem with auto-directory creation.", installed: true, icon: FileCode },
  { id: "terminal", name: "Terminal", provider: "Built-in", description: "Execute shell commands with 30-second timeout.", installed: true, icon: Terminal },
  { id: "github", name: "GitHub", provider: "Community", description: "Create PRs, review code, and manage GitHub issues.", installed: false, icon: Blocks },
  { id: "sql", name: "SQL Database", provider: "Official", description: "Query PostgreSQL and MySQL databases securely.", installed: false, icon: Database },
];

export function ToolsView() {
  const [tools, setTools] = useState(BUILT_IN_TOOLS);
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState<"mcp" | "openapi" | "script">("mcp");

  return (
    <div className="p-8 max-w-5xl mx-auto w-full animate-slide-up">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Tools & Skills Registry</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">Browse and install capabilities for your OpenPika agents.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Custom Tool
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <div key={tool.id} className="flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all">
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-full">
                    {tool.provider}
                  </span>
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-white text-sm mb-1">{tool.name}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-2">{tool.description}</p>
              </div>
              <div className="px-5 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800">
                {tool.installed ? (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-500">
                      <CheckCircle2 className="w-4 h-4" /> Installed
                    </span>
                    {tool.provider !== "Built-in" && (
                      <button onClick={() => setTools((t) => t.map((x) => x.id === tool.id ? { ...x, installed: false } : x))}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                        Uninstall
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setTools((t) => t.map((x) => x.id === tool.id ? { ...x, installed: true } : x))}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Install
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-slide-up">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Add Custom Capability</h3>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex border-b border-zinc-200 dark:border-zinc-800">
              {[
                { id: "mcp" as const, label: "MCP Server", icon: Box },
                { id: "openapi" as const, label: "OpenAPI Spec", icon: Braces },
                { id: "script" as const, label: "Local Script", icon: Code2 },
              ].map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setTab(id)}
                  className={cn(
                    "flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2",
                    tab === id ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400" : "border-transparent text-zinc-500"
                  )}>
                  <Icon className="w-4 h-4" />{label}
                </button>
              ))}
            </div>
            <div className="p-6 min-h-[220px]">
              {tab === "mcp" && (
                <div className="space-y-4 animate-fade-in">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Connect a Model Context Protocol server via <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-xs">npx</code>, <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-xs">uvx</code>, or Docker.</p>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Server Command</label>
                    <input type="text" placeholder="e.g. npx -y @modelcontextprotocol/server-postgres" className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Environment Variables</label>
                    <textarea rows={2} placeholder="DATABASE_URL=postgres://..." className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                  </div>
                </div>
              )}
              {tab === "openapi" && (
                <div className="space-y-4 animate-fade-in">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Provide an OpenAPI schema to auto-generate tools for external REST APIs.</p>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Schema URL</label>
                    <input type="text" placeholder="https://api.example.com/openapi.json" className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <button className="w-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-6 flex flex-col items-center text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <Upload className="w-6 h-6 mb-2" />
                    <span className="text-sm font-medium">Upload .json or .yaml schema</span>
                  </button>
                </div>
              )}
              {tab === "script" && (
                <div className="space-y-4 animate-fade-in">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Upload a standalone JS or Python script exposing a callable function.</p>
                  <button className="w-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-8 flex flex-col items-center text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <Code2 className="w-8 h-8 mb-3 text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-200">Drag & drop your script</span>
                    <span className="text-xs text-zinc-400 mt-1">Supports .js, .ts, .py</span>
                  </button>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Cancel</button>
              <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm">Connect Tool</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
