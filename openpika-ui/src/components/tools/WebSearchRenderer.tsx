"use client";

import { ExternalLink } from "lucide-react";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export function WebSearchRenderer({ results }: { results: SearchResult[] }) {
  if (!results?.length) return <p className="text-xs text-zinc-500 italic">No results found.</p>;

  return (
    <div className="space-y-2">
      {results.map((r, i) => (
        <a
          key={i}
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all group"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                {r.title}
              </p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{r.url}</p>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-0.5" />
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">{r.snippet}</p>
        </a>
      ))}
    </div>
  );
}
