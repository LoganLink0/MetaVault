import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { getDb } from "../db/init.js";
import { localDateStr } from "../lib/date.js";

const router: RouterType = Router();

// GET /api/dashboard/second-consumption — 二次消费率 + 吃灰榜（v0.6，分子分母均排除 disposed/expired）
router.get("/second-consumption", async (_req: Request, res: Response) => {
  const db = await getDb();
  const today = localDateStr();
  const ninetyDaysAgo = localDateStr(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));

  const total = (db.prepare(
    "SELECT COUNT(*) AS c FROM assets WHERE status NOT IN ('disposed','expired')"
  ).get() as { c: number }).c;

  const consumed = (db.prepare(
    `SELECT COUNT(DISTINCT u.asset_id) AS c
     FROM usage_events u
     JOIN assets a ON a.id = u.asset_id AND a.status NOT IN ('disposed','expired')
     WHERE u.used_at > ? AND u.used_at <= ?`
  ).get(ninetyDaysAgo, today) as { c: number }).c;

  const dustRows = db.prepare(
    `SELECT a.id, a.name, a.type, a.created_at, MAX(u.used_at) AS last_used
     FROM assets a
     LEFT JOIN usage_events u ON u.asset_id = a.id
     WHERE a.status NOT IN ('disposed','expired')
     GROUP BY a.id
     ORDER BY COALESCE(MAX(u.used_at), a.created_at) ASC
     LIMIT 10`
  ).all() as Array<{ id: string; name: string; type: string; created_at: string; last_used: string | null }>;

  const todayMidnight = new Date(`${today}T00:00:00`).getTime();
  const dust_list = dustRows.map((row) => {
    // 兜底用本地日期口径换算（created_at 是 UTC 时间戳，直接 slice(0,10) 会差一天）
    const base = row.last_used ?? localDateStr(new Date(row.created_at));
    const days = Math.round((todayMidnight - new Date(`${base}T00:00:00`).getTime()) / 86400000);
    return { id: row.id, name: row.name, type: row.type, last_used: base, days_since: days, never_used: row.last_used == null };
  });

  res.json({
    window_days: 90,
    consumed,
    total,
    rate: total > 0 ? Math.round((consumed / total) * 100) : 0,
    dust_list,
  });
});

// GET /api/dashboard/overview — 总览统计
router.get("/overview", async (_req: Request, res: Response) => {
  const db = await getDb();

  const totalAssets = (db.prepare("SELECT COUNT(*) as count FROM assets").get() as Record<string, number>).count;
  const totalSuppliers = (db.prepare("SELECT COUNT(*) as count FROM suppliers").get() as Record<string, number>).count;
  const totalValue = (db.prepare("SELECT COALESCE(SUM(purchase_price), 0) as total FROM assets WHERE purchase_price IS NOT NULL").get() as Record<string, number>).total;

  const byType = db.prepare("SELECT type, COUNT(*) as count FROM assets GROUP BY type").all();
  const byStatus = db.prepare("SELECT status, COUNT(*) as count FROM assets GROUP BY status").all();

  res.json({ totalAssets, totalSuppliers, totalValue, byType, byStatus });
});

// GET /api/dashboard/subscriptions — 订阅费用
router.get("/subscriptions", async (_req: Request, res: Response) => {
  const db = await getDb();

  const subscriptions = db.prepare(
    `SELECT id, name, ext FROM assets WHERE type = 'subscription' AND status = 'active'`
  ).all() as Record<string, unknown>[];

  let monthlyTotal = 0;
  let yearlyTotal = 0;
  const items = subscriptions.map((row) => {
    const ext = JSON.parse(row.ext as string || "{}") as Record<string, unknown>;
    const amount = Number(ext.amount ?? 0);
    const cycle = String(ext.billing_cycle ?? "monthly");

    let monthly = 0;
    if (cycle === "monthly") monthly = amount;
    else if (cycle === "yearly") monthly = amount / 12;
    else if (cycle === "lifetime") monthly = 0;

    monthlyTotal += monthly;
    yearlyTotal += monthly * 12;

    return { id: row.id, name: row.name, amount, cycle, monthly };
  });

  res.json({ monthlyTotal: Math.round(monthlyTotal * 100) / 100, yearlyTotal: Math.round(yearlyTotal * 100) / 100, items });
});

// GET /api/dashboard/health — 健康度
router.get("/health", async (_req: Request, res: Response) => {
  const db = await getDb();

  const unreadNotifications = (db.prepare("SELECT COUNT(*) as count FROM notifications WHERE is_read = 0 AND is_dismissed = 0").get() as Record<string, number>).count;
  const expiringAssets = db.prepare(
    `SELECT id, name, type, ext FROM assets WHERE status = 'active'`
  ).all() as Record<string, unknown>[];
  const filtered = expiringAssets.filter((row) => {
    const ext = JSON.parse(row.ext as string || "{}") as Record<string, unknown>;
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (row.type === "physical" && ext.warranty_expiry) {
      return new Date(ext.warranty_expiry as string) <= in30Days;
    }
    if (row.type === "subscription" && ext.next_billing_date) {
      return new Date(ext.next_billing_date as string) <= in30Days;
    }
    if (row.type === "digital" && ext.expiry_date) {
      return new Date(ext.expiry_date as string) <= in30Days;
    }
    return false;
  });

  res.json({ unreadNotifications, expiringAssets: filtered.length, expiringDetails: filtered });
});

// GET /api/dashboard/trends — 近12个月订阅费用趋势
router.get("/trends", async (_req: Request, res: Response) => {
  const db = await getDb();
  const months = Number(_req.query.months) || 12;

  // 取所有活跃订阅资产，在 JS 中计算月费用并按月聚合
  const subs = db.prepare(
    `SELECT ext, created_at FROM assets WHERE type = 'subscription' AND status = 'active'`
  ).all() as Record<string, unknown>[];

  const monthMap = new Map<string, number>();
  for (const row of subs) {
    const ext = JSON.parse(row.ext as string || "{}") as Record<string, unknown>;
    const amount = Number(ext.amount ?? 0);
    const cycle = String(ext.billing_cycle ?? "monthly");
    let monthly = 0;
    if (cycle === "monthly") monthly = amount;
    else if (cycle === "yearly") monthly = amount / 12;

    const month = (row.created_at as string).slice(0, 7);
    monthMap.set(month, (monthMap.get(month) ?? 0) + monthly);
  }

  const result = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-months)
    .map(([month, cost]) => ({ month, monthly_cost: Math.round(cost * 100) / 100 }));

  res.json(result);
});

export default router;
