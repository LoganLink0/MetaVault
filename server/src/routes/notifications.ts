import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { getDb } from "../db/init.js";
import { getVapidPublicKey } from "../services/push-service.js";

const router: RouterType = Router();

// GET /api/notifications — 列表
router.get("/", async (req: Request, res: Response) => {
  const db = await getDb();
  const unreadOnly = req.query.unread_only === "true";

  // 清单提醒无关联资产，需 LEFT JOIN；带出清单标题供前端跳转
  let sql = `
    SELECT n.*, a.name as asset_name, c.title as checklist_title
    FROM notifications n
    LEFT JOIN assets a ON n.asset_id = a.id
    LEFT JOIN checklists c ON n.checklist_id = c.id
    WHERE n.is_dismissed = 0`;
  const params: unknown[] = [];

  if (unreadOnly) {
    sql += " AND n.is_read = 0";
  }

  sql += " ORDER BY n.trigger_date DESC";
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// PATCH /api/notifications/:id/read — 标记已读
router.patch("/:id/read", async (req: Request, res: Response) => {
  const db = await getDb();
  const result = db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json({ success: true });
});

// PATCH /api/notifications/:id/dismiss — 忽略
router.patch("/:id/dismiss", async (req: Request, res: Response) => {
  const db = await getDb();
  const result = db.prepare("UPDATE notifications SET is_dismissed = 1 WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json({ success: true });
});

// GET /api/notifications/vapid-public-key — 获取 VAPID 公钥
router.get("/vapid-public-key", (_req: Request, res: Response) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    res.status(404).json({ error: "VAPID not configured" });
    return;
  }
  res.json({ publicKey });
});

// POST /api/notifications/subscribe — 保存推送订阅
router.post("/subscribe", async (req: Request, res: Response) => {
  const db = await getDb();
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "缺少订阅参数" });
    return;
  }
  db.prepare(
    `INSERT OR REPLACE INTO push_subscriptions (id, endpoint, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(crypto.randomUUID(), endpoint, keys.p256dh, keys.auth);
  res.json({ success: true });
});

// DELETE /api/notifications/subscribe — 删除推送订阅
router.delete("/subscribe", async (req: Request, res: Response) => {
  const db = await getDb();
  const { endpoint } = req.body;
  if (!endpoint) {
    res.status(400).json({ error: "缺少 endpoint" });
    return;
  }
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  res.json({ success: true });
});

// POST /api/notifications/scan — 触发扫描
router.post("/scan", async (_req: Request, res: Response) => {
  const { scanNotifications } = await import("../services/notification-scanner.js");
  const count = await scanNotifications();
  res.json({ scanned: count });
});

export default router;
