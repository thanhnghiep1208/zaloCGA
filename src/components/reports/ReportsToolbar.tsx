"use client";

import type { ReportsTimeRange } from "@/lib/reports/date-utils";
import { reportsTimeRangeLabel } from "@/lib/reports/date-utils";

type ReportsToolbarProps = {
  timeRange: ReportsTimeRange;
  onTimeRangeChange: (range: ReportsTimeRange) => void;
  onRefresh: () => void;
  refreshing: boolean;
  lastRefreshedAt: Date | null;
};

const RANGES: ReportsTimeRange[] = ["today", "7d", "30d"];

function formatRefreshedAt(date: Date): string {
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReportsToolbar({
  timeRange,
  onTimeRangeChange,
  onRefresh,
  refreshing,
  lastRefreshedAt,
}: ReportsToolbarProps) {
  return (
    <div className="clay-card p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Khoảng thời gian">
        {RANGES.map((range) => (
          <button
            key={range}
            type="button"
            onClick={() => onTimeRangeChange(range)}
            className={`px-3 py-1.5 text-sm rounded-[8px] border transition-colors ${
              timeRange === range
                ? "bg-accent/20 border-accent/50 text-foreground font-medium"
                : "bg-surface border-border text-muted hover:text-foreground"
            }`}
          >
            {reportsTimeRangeLabel(range)}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:items-end gap-1">
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="clay-hover-playful px-4 py-2 text-sm font-medium rounded-[8px] border border-border bg-surface disabled:opacity-50"
        >
          {refreshing ? "Đang cập nhật…" : "Cập nhật"}
        </button>
        <p className="text-xs text-muted">
          {lastRefreshedAt
            ? `Cập nhật lúc: ${formatRefreshedAt(lastRefreshedAt)}`
            : "Chưa tải dữ liệu"}
          {" · "}
          Tự động mỗi 6 giờ
        </p>
      </div>
    </div>
  );
}
