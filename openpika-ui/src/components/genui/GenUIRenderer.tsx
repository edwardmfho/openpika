"use client";

import type { GenUIState } from "@/lib/agui";
import { DataTable } from "./DataTable";
import { ChartWidget } from "./ChartWidget";

interface Props {
  state: GenUIState;
}

export function GenUIRenderer({ state }: Props) {
  if (!state) return null;

  switch (state.type) {
    case "table":
      return <DataTable data={state.data} />;
    case "chart":
      return <ChartWidget data={state.data} />;
    case "form":
      return <DynamicForm data={state.data} />;
    default:
      return (
        <div className="my-3 p-3 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-900 text-xs font-mono text-zinc-600 dark:text-zinc-400">
          <pre>{JSON.stringify(state.data, null, 2)}</pre>
        </div>
      );
  }
}

function DynamicForm({ data }: { data: Record<string, unknown> }) {
  const fields = (data.fields as Array<{ name: string; label: string; type: string }>) ?? [];

  return (
    <div className="my-3 p-4 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 max-w-2xl shadow-sm">
      <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4">
        {String(data.title ?? "Form")}
      </h4>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.name}>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">{f.label}</label>
            <input
              type={f.type ?? "text"}
              className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-950 outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
            />
          </div>
        ))}
      </div>
      <button className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
        {String(data.submitLabel ?? "Submit")}
      </button>
    </div>
  );
}
