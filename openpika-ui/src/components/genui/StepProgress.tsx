"use client";

import { Check, X, Loader2, Circle } from "lucide-react";
import type { StepState } from "@/lib/agui";
import { cn } from "@/lib/utils";

interface Props {
  steps: StepState[];
}

const STATUS_ICON = {
  pending: <Circle className="w-3.5 h-3.5 text-zinc-400" />,
  running: <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
  success: <Check className="w-3.5 h-3.5 text-green-500" />,
  error: <X className="w-3.5 h-3.5 text-red-500" />,
  skipped: <Circle className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600" />,
};

export function StepProgress({ steps }: Props) {
  if (!steps.length) return null;

  return (
    <div className="my-3 max-w-2xl space-y-1">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-2.5">
          <div className={cn(
            "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border",
            step.status === "success" ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800" :
            step.status === "running" ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800" :
            step.status === "error" ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800" :
            "bg-zinc-50 border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700"
          )}>
            {STATUS_ICON[step.status]}
          </div>
          <span className={cn(
            "text-sm",
            step.status === "pending" ? "text-zinc-400 dark:text-zinc-500" :
            step.status === "running" ? "text-zinc-800 dark:text-zinc-200 font-medium" :
            step.status === "success" ? "text-zinc-600 dark:text-zinc-300" :
            "text-zinc-500 dark:text-zinc-400"
          )}>
            {step.label}
          </span>
          {step.total && step.index !== undefined && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {step.index + 1}/{step.total}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
