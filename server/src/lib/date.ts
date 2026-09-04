// 本地日期工具：使用日志的 used_at 全链路统一为本地时区 YYYY-MM-DD，
// 不能用 toISOString()（UTC 会让中国时区早上 8 点前的"今天"变成昨天）
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function localTodayStr(): string {
  return localDateStr(new Date());
}

// 格式正确（YYYY-MM-DD）且是真实存在的日期（拒绝 2026-02-30 这类）
export function isRealDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}
