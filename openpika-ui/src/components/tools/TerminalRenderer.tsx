"use client";

import { useMemo } from "react";
import { Terminal } from "lucide-react";

interface Props {
  output: string;
  maxLines?: number;
}

export function TerminalRenderer({ output, maxLines }: Props) {
  const lines = output.split("\n");
  const visible = maxLines ? lines.slice(0, maxLines) : lines;
  const truncated = maxLines && lines.length > maxLines;

  // Simple ANSI escape stripping for display (full parsing would use ansi-to-html)
  const clean = visible.join("\n").replace(/\x1B\[[0-9;]*m/g, "");

  return (
    <div className="rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 text-green-400">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900">
        <Terminal className="w-3 h-3 text-zinc-500" />
        <span className="text-xs text-zinc-500 font-mono">terminal output</span>
      </div>
      <pre className="ansi-output p-3 text-[0.8rem] overflow-x-auto">{clean}</pre>
      {truncated && (
        <p className="px-3 pb-2 text-xs text-zinc-500 italic">
          … {lines.length - maxLines!} more lines
        </p>
      )}
    </div>
  );
}
