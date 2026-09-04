import type Database from "better-sqlite3";
import { localTodayStr } from "../lib/date.js";

export interface UsageEventInput {
  used_at?: string;
  duration_minutes?: number;
  note?: string;
}

export interface UsageEventRow {
  id: string;
  asset_id: string;
  used_at: string;
  duration_minutes: number | null;
  note: string | null;
  source: "quick" | "backfill" | "checklist";
  created_at: string;
}

// source 由服务端按行为推导：记今天 = quick，记过去 = backfill（清单自动记为 checklist，第四期接入）
export function deriveSource(usedAt: string): "quick" | "backfill" {
  return usedAt === localTodayStr() ? "quick" : "backfill";
}

// 写一条使用事件，单事务。
// last_access 是"使用停滞"扫描的活跃度通道而非历史档案：只有记今天（quick）才刷新它并
// dismiss 停滞提醒——补录过去日期若合成旧时间戳写入，会立即触发"长期未使用"提醒。
// （第 5 期起停滞去重含已 dismissed、停滞窗口内不重生；dismiss 保留为用户手动清除入口）
export function logUsageEvent(
  db: Database.Database,
  assetId: string,
  input: UsageEventInput,
  sourceOverride?: "quick" | "backfill" | "checklist"
): UsageEventRow {
  const asset = db.prepare("SELECT type, ext FROM assets WHERE id = ?").get(assetId) as
    | { type: string; ext: string }
    | undefined;
  if (!asset) throw new Error("Asset not found");

  const usedAt = input.used_at ?? localTodayStr();
  const source = sourceOverride ?? deriveSource(usedAt);
  const eventId = crypto.randomUUID();
  const isToday = usedAt === localTodayStr();

  const insert = db.transaction((): UsageEventRow => {
    db.prepare(
      `INSERT INTO usage_events (id, asset_id, used_at, duration_minutes, note, source)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(eventId, assetId, usedAt, input.duration_minutes ?? null, input.note ?? null, source);

    if (isToday && asset.type === "digital") {
      const ext = JSON.parse(asset.ext || "{}") as Record<string, unknown>;
      const stats = (ext.usage_stats as Record<string, unknown> | undefined) ?? {};
      const newAccess = new Date().toISOString();
      const prev = typeof stats.last_access === "string" ? stats.last_access : null;
      if (!prev || newAccess > prev) {
        ext.usage_stats = { ...stats, last_access: newAccess };
        db.prepare("UPDATE assets SET ext = ?, updated_at = ? WHERE id = ?").run(
          JSON.stringify(ext), newAccess, assetId
        );
      }
    }

    if (isToday) {
      db.prepare(
        "UPDATE notifications SET is_dismissed = 1 WHERE asset_id = ? AND type = 'usage_stagnation' AND is_dismissed = 0"
      ).run(assetId);
    }

    return db.prepare("SELECT * FROM usage_events WHERE id = ?").get(eventId) as UsageEventRow;
  });

  return insert();
}

// 批量补录：单事务写入 N 条，last_access/dismiss 只做一次
export function logUsageEventsBulk(
  db: Database.Database,
  assetId: string,
  events: UsageEventInput[]
): UsageEventRow[] {
  return db.transaction(() => events.map((e) => logUsageEvent(db, assetId, e)))();
}
