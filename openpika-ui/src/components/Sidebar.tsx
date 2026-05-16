"use client";

import {
  MessageSquare, Workflow, Settings, Puzzle, Zap, Plus, X,
  Trash2, Edit2, Check,
} from "lucide-react";
import { useState } from "react";
import { useAppStore } from "@/store/store";
import { cn } from "@/lib/utils";

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { activeView, setActiveView, sessions, activeSessionId, createSession, selectSession, renameSession, deleteSession } = useAppStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const navItems = [
    { id: "chat" as const, label: "Chat", icon: MessageSquare },
    { id: "channels" as const, label: "Channels", icon: Workflow },
    { id: "tools" as const, label: "Tools & Skills", icon: Puzzle },
  ];

  const today = sessions.filter((s) => Date.now() - s.createdAt < 86400_000);
  const older = sessions.filter((s) => Date.now() - s.createdAt >= 86400_000);

  function handleRename(id: string, title: string) {
    setEditingId(id);
    setEditTitle(title);
  }

  function commitRename(id: string) {
    if (editTitle.trim()) renameSession(id, editTitle.trim());
    setEditingId(null);
  }

  function handleNewSession() {
    createSession();
    setActiveView("chat");
    onClose?.();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-zinc-900 dark:text-white">OpenPika</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="md:hidden text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 p-1">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* New Chat */}
      <div className="px-3 mb-2">
        <button
          onClick={handleNewSession}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Session
        </button>
      </div>

      {/* Main nav */}
      <nav className="px-3 space-y-0.5 mb-4">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setActiveView(id); onClose?.(); }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              activeView === id
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {/* Session history */}
      <div className="flex-1 overflow-y-auto px-3 space-y-4">
        {today.length > 0 && (
          <SessionGroup label="Today" sessions={today} activeId={activeSessionId}
            onSelect={(id) => { selectSession(id); setActiveView("chat"); onClose?.(); }}
            onRename={handleRename} onDelete={deleteSession}
            editingId={editingId} editTitle={editTitle}
            onEditChange={setEditTitle} onCommit={commitRename}
          />
        )}
        {older.length > 0 && (
          <SessionGroup label="Earlier" sessions={older} activeId={activeSessionId}
            onSelect={(id) => { selectSession(id); setActiveView("chat"); onClose?.(); }}
            onRename={handleRename} onDelete={deleteSession}
            editingId={editingId} editTitle={editTitle}
            onEditChange={setEditTitle} onCommit={commitRename}
          />
        )}
      </div>

      {/* Settings */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => { setActiveView("settings"); onClose?.(); }}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
            activeView === "settings"
              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          )}
        >
          <Settings className="w-4 h-4" /> Settings
        </button>
      </div>
    </div>
  );
}

function SessionGroup({
  label, sessions, activeId, onSelect, onRename, onDelete,
  editingId, editTitle, onEditChange, onCommit,
}: {
  label: string;
  sessions: Array<{ id: string; title: string }>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  editingId: string | null;
  editTitle: string;
  onEditChange: (v: string) => void;
  onCommit: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-1 px-1">{label}</p>
      <div className="space-y-0.5">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={cn(
              "group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer transition-colors",
              activeId === s.id
                ? "bg-zinc-200 dark:bg-zinc-700"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
            )}
          >
            {editingId === s.id ? (
              <input
                autoFocus
                className="flex-1 text-sm bg-transparent outline-none text-zinc-900 dark:text-white"
                value={editTitle}
                onChange={(e) => onEditChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onCommit(s.id);
                  if (e.key === "Escape") onCommit(s.id);
                }}
              />
            ) : (
              <button
                onClick={() => onSelect(s.id)}
                className="flex-1 text-left text-sm text-zinc-700 dark:text-zinc-300 truncate"
              >
                {s.title}
              </button>
            )}
            <div className="hidden group-hover:flex items-center gap-0.5">
              {editingId === s.id ? (
                <button onClick={() => onCommit(s.id)} className="p-1 text-green-600 hover:text-green-700">
                  <Check className="w-3 h-3" />
                </button>
              ) : (
                <button onClick={() => onRename(s.id, s.title)} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
              <button onClick={() => onDelete(s.id)} className="p-1 text-zinc-400 hover:text-red-500">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
