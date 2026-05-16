"use client";

import {
  ResponsiveContainer, LineChart, BarChart, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

interface Props {
  data: Record<string, unknown>;
}

export function ChartWidget({ data }: Props) {
  const title = String(data.title ?? "Chart");
  const chartType = String(data.chartType ?? "bar");
  const chartData = (data.data as Array<Record<string, unknown>>) ?? [];
  const keys = (data.keys as string[]) ?? [];
  const xKey = String(data.xKey ?? "name");

  const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

  if (!chartData.length) return null;

  return (
    <div className="my-3 p-4 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 shadow-sm max-w-3xl animate-slide-up">
      <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-4">{title}</h4>
      <ResponsiveContainer width="100%" height={240}>
        {chartType === "line" ? (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
            <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={{ borderRadius: "0.5rem", fontSize: "0.75rem" }} />
            <Legend />
            {keys.map((k, i) => (
              <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
            ))}
          </LineChart>
        ) : (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
            <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={{ borderRadius: "0.5rem", fontSize: "0.75rem" }} />
            <Legend />
            {keys.map((k, i) => (
              <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
