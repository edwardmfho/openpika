"use client";

import { ChevronRight, ChevronDown, Brain } from "lucide-react";
import { useAppStore } from "@/store/store";

interface Props {
  messageId: string;
  content: string;
  expanded: boolean;
}

export function ReasoningBlock({ messageId, content, expanded }: Props) {
  const toggle = useAppStore((s) => s.toggleReasoning);

  return (
    <div className="my-2 max-w-2xl">
      <button
        onClick={() => toggle(messageId)}
        className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <Brain className="w-3.5 h-3.5" />
        <span>Thinking…</span>
      </button>
      {expanded && (
        <div className="mt-2 pl-5 border-l-2 border-zinc-200 dark:border-zinc-700 animate-fade-in">
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap font-mono">
            {content}
          </p>
        </div>
      )}
    </div>
  );
}
