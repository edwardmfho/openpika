"use client";

import { useState } from "react";
import {
  Globe, FileCode, Terminal, ChevronRight, ChevronDown,
  Check, X, Loader2, AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";
import type { ToolCallState } from "@/lib/agui";
import { TerminalRenderer } from "./TerminalRenderer";
import { FileRenderer } from "./FileRenderer";
import { WebSearchRenderer } from "./WebSearchRenderer";
import { cn } from "@/lib/utils";

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  web_search: Globe,
  read_file: FileCode,
  write_file: FileCode,
  terminal: Terminal,
};

const STATUS_CONFIG = {
  pending_approval: { label: "Awaiting approval", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20", dot: "bg-amber-500" },
  running: { label: "Running…", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20", dot: "bg-blue-500" },
  completed: { label: "Completed", color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20", dot: "bg-green-500" },
  error: { label: "Error", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20", dot: "bg-red-500" },
  rejected: { label: "Rejected", color: "text-zinc-500 dark:text-zinc-400", bg: "bg-zinc-50 dark:bg-zinc-800", dot: "bg-zinc-400" },
};

interface Props {
  tool: ToolCallState;
  onApprove?: () => void;
  onReject?: () => void;
}

export function ToolCallCard({ tool, onApprove, onReject }: Props) {
  const [expanded, setExpanded] = useState(tool.status === "pending_approval");
  const [resultExpanded, setResultExpanded] = useState(false);

  const Icon = TOOL_ICONS[tool.name] ?? Terminal;
  const status = STATUS_CONFIG[tool.status];

  const resultStr = tool.result
    ? typeof tool.result === "string"
      ? tool.result
      : JSON.stringify(tool.result, null, 2)
    : null;
  const truncatedResult = resultStr && resultStr.length > 400 ? resultStr.slice(0, 400) + "\n…" : resultStr;

  return (
    <div className={cn(
      "my-2 border rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm max-w-2xl",
      "border-zinc-200 dark:border-zinc-700",
      tool.status === "pending_approval" && "border-amber-300 dark:border-amber-700 shadow-amber-100 dark:shadow-amber-900/20 shadow-md"
    )}>
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={cn("p-1.5 rounded-lg flex-shrink-0", status.bg)}>
          {tool.status === "running" ? (
            <Loader2 className={cn("w-4 h-4 animate-spin", status.color)} />
          ) : (
            <Icon className={cn("w-4 h-4", status.color)} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 font-mono">{tool.name}</span>
            <span className={cn("flex items-center gap-1 text-[11px] font-medium", status.color)}>
              <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", status.dot)} />
              {status.label}
            </span>
          </div>
          {!expanded && tool.args && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5 font-mono">
              {Object.entries(tool.args).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")}
            </p>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800">
          {/* Args section */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950/50">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Arguments</p>
            <ArgsDisplay toolName={tool.name} argsText={tool.argsText} args={tool.args} />
          </div>

          {/* Result section */}
          {tool.result !== undefined && resultStr && (
            <div className="p-3 border-t border-zinc-100 dark:border-zinc-800">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Result</p>
              <ResultDisplay toolName={tool.name} result={tool.result} resultStr={resultStr}
                truncatedResult={truncatedResult!} expanded={resultExpanded} onToggle={() => setResultExpanded(!resultExpanded)} />
            </div>
          )}
        </div>
      )}

      {/* Approval actions */}
      {tool.status === "pending_approval" && (
        <div className="p-3 border-t border-amber-200 dark:border-amber-800 flex gap-2 bg-amber-50/50 dark:bg-amber-900/10">
          <p className="text-xs text-amber-700 dark:text-amber-400 flex-1 self-center">
            This tool requires your approval before running.
          </p>
          <button
            onClick={onReject}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <XCircle className="w-4 h-4" /> Reject
          </button>
          <button
            onClick={onApprove}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" /> Approve
          </button>
        </div>
      )}
    </div>
  );
}

function ArgsDisplay({ toolName, argsText, args }: { toolName: string; argsText: string; args: Record<string, unknown> | null }) {
  if (!argsText && !args) return <p className="text-xs text-zinc-400 italic">No arguments</p>;

  if (toolName === "write_file" && args?.filename) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
          <span className="text-zinc-400">filename: </span>{String(args.filename)}
        </p>
        {args.content != null && (
          <FileRenderer filename={String(args.filename)} content={String(args.content as string)} maxLines={8} />
        )}
      </div>
    );
  }

  return (
    <pre className="text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap overflow-x-auto">
      {args ? JSON.stringify(args, null, 2) : argsText}
    </pre>
  );
}

function ResultDisplay({ toolName, result, resultStr, truncatedResult, expanded, onToggle }: {
  toolName: string; result: unknown; resultStr: string;
  truncatedResult: string; expanded: boolean; onToggle: () => void;
}) {
  if (toolName === "terminal") {
    return <TerminalRenderer output={resultStr} maxLines={expanded ? undefined : 20} />;
  }

  if (toolName === "read_file" && typeof result === "object" && (result as Record<string, unknown>)?.content) {
    return <FileRenderer
      filename={String((result as Record<string, unknown>).filename ?? "file")}
      content={String((result as Record<string, unknown>).content)}
      maxLines={expanded ? undefined : 20}
    />;
  }

  if (toolName === "web_search" && Array.isArray(result)) {
    return <WebSearchRenderer results={result as Array<{ title: string; url: string; snippet: string }>} />;
  }

  return (
    <div>
      <pre className="text-xs font-mono text-green-700 dark:text-green-400 whitespace-pre-wrap overflow-x-auto">
        {expanded ? resultStr : truncatedResult}
      </pre>
      {resultStr.length > 400 && (
        <button onClick={onToggle} className="text-xs text-indigo-500 hover:text-indigo-600 mt-1">
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
