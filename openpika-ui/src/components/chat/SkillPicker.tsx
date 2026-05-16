"use client";

import { Search, AlignLeft, Mail, Code2, FileText, Globe, Languages, GitPullRequest } from "lucide-react";
import type { Skill } from "@/lib/agui";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Search, AlignLeft, Mail, Code2, FileText, Globe, Languages, GitPullRequest,
};

interface Props {
  skills: Skill[];
  query: string;
  onSelect: (skill: Skill) => void;
  highlightIndex: number;
}

export function SkillPicker({ skills, query, onSelect, highlightIndex }: Props) {
  const filtered = skills.filter((s) =>
    s.name.toLowerCase().includes(query.toLowerCase()) ||
    s.id.toLowerCase().includes(query.toLowerCase())
  );

  if (!filtered.length) return null;

  return (
    <div className="absolute bottom-full mb-2 left-0 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden animate-slide-up z-10">
      <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Skills</p>
      </div>
      <div className="max-h-52 overflow-y-auto py-1">
        {filtered.map((skill, i) => {
          const Icon = ICON_MAP[skill.icon ?? "Search"] ?? Search;
          return (
            <button
              key={skill.id}
              onClick={() => onSelect(skill)}
              className={cn(
                "w-full text-left px-3 py-2 flex items-start gap-3 transition-colors",
                i === highlightIndex
                  ? "bg-indigo-50 dark:bg-indigo-900/30"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
              )}
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">/{skill.id}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{skill.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
