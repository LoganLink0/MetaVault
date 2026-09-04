import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import type Database from "better-sqlite3";
import { getDb } from "../db/init.js";
import { validateChecklistInput, validateChecklistItemInput } from "../middleware/validate.js";
import { logUsageEvent } from "../services/usage-log.js";

const router: RouterType = Router();

// 唤醒清单勾选自动记使用：仅 0→1 跳变、仅 wake_up 清单、资产未被处置/过期时生效
function autoLogWakeUpUsage(db: Database.Database, checklistKind: string | undefined, assetId: unknown, transitionedOn: boolean): boolean {
  if (!transitionedOn || checklistKind !== "wake_up" || typeof assetId !== "string") return false;
  const asset = db.prepare("SELECT status FROM assets WHERE id = ?").get(assetId) as { status: string } | undefined;
  if (!asset || asset.status === "disposed" || asset.status === "expired") return false;
  logUsageEvent(db, assetId, {}, "checklist");
  return true;
}

// GET /api/checklists — 列表（含统计）
router.get("/", async (req: Request, res: Response) => {
  const db = await getDb();
  const { scenario, status, search } = req.query;

  let sql = `
    SELECT c.*,
           COUNT(ci.id) as total_items,
           SUM(CASE WHEN ci.checked = 1 THEN 1 ELSE 0 END) as completed_items
    FROM checklists c
    LEFT JOIN checklist_items ci ON c.id = ci.checklist_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (scenario) {
    sql += " AND c.scenario = ?";
    params.push(scenario);
  }
  if (status) {
    sql += " AND c.status = ?";
    params.push(status);
  }
  if (search) {
    sql += " AND (c.title LIKE ? OR c.notes LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += " GROUP BY c.id ORDER BY c.updated_at DESC";

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map((row: any) => ({
    ...row,
    total_items: row.total_items ?? 0,
    completed_items: row.completed_items ?? 0,
  })));
});

// GET /api/checklists/:id — 详情（含清单项）
router.get("/:id", async (req: Request, res: Response) => {
  const db = await getDb();

  const checklist = db.prepare("SELECT * FROM checklists WHERE id = ?").get(req.params.id) as Record<string, any> | undefined;
  if (!checklist) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }

  const items = db.prepare(`
    SELECT ci.*, a.name as asset_name, a.type as asset_type
    FROM checklist_items ci
    LEFT JOIN assets a ON ci.asset_id = a.id
    WHERE ci.checklist_id = ?
    ORDER BY ci.sort_order, ci.created_at
  `).all(req.params.id);

  res.json({
    ...checklist,
    items: items.map((item: any) => ({ ...item, checked: !!item.checked })),
  });
});

// POST /api/checklists — 创建
router.post("/", async (req: Request, res: Response) => {
  const validationError = validateChecklistInput(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const db = await getDb();
  const id = crypto.randomUUID();
  const { title, scenario, status, due_date, notes, items } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO checklists (id, title, scenario, status, due_date, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, scenario, status || "active", due_date ?? null, notes ?? null, now, now);

  if (items && items.length > 0) {
    const insertItem = db.prepare(`
      INSERT INTO checklist_items (id, checklist_id, content, checked, asset_id, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    items.forEach((item: any, index: number) => {
      insertItem.run(
        crypto.randomUUID(),
        id,
        item.content,
        item.checked ? 1 : 0,
        item.asset_id ?? null,
        item.sort_order ?? index,
        now,
        now
      );
    });
  }

  const checklist = db.prepare("SELECT * FROM checklists WHERE id = ?").get(id) as Record<string, any> | undefined;
  const createdItems = db.prepare(`
    SELECT ci.*, a.name as asset_name, a.type as asset_type
    FROM checklist_items ci
    LEFT JOIN assets a ON ci.asset_id = a.id
    WHERE ci.checklist_id = ?
    ORDER BY ci.sort_order
  `).all(id);

  res.status(201).json({
    ...checklist,
    items: createdItems.map((item: any) => ({ ...item, checked: !!item.checked })),
  });
});

// PUT /api/checklists/:id — 更新基本信息
router.put("/:id", async (req: Request, res: Response) => {
  const db = await getDb();
  const { id } = req.params;

  const existing = db.prepare("SELECT * FROM checklists WHERE id = ?").get(id) as Record<string, any> | undefined;
  if (!existing) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }

  const { title, scenario, status, due_date, notes } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE checklists SET title = ?, scenario = ?, status = ?, due_date = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(
    title ?? (existing as any).title,
    scenario ?? (existing as any).scenario,
    status ?? (existing as any).status,
    due_date !== undefined ? due_date : (existing as any).due_date,
    notes !== undefined ? notes : (existing as any).notes,
    now,
    id
  );

  const updated = db.prepare("SELECT * FROM checklists WHERE id = ?").get(id) as Record<string, any> | undefined;
  res.json(updated);
});

// DELETE /api/checklists/:id — 删除
router.delete("/:id", async (req: Request, res: Response) => {
  const db = await getDb();
  const result = db.prepare("DELETE FROM checklists WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }
  res.json({ success: true });
});

// POST /api/checklists/:id/items — 添加清单项
router.post("/:id/items", async (req: Request, res: Response) => {
  const validationError = validateChecklistItemInput(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const db = await getDb();
  const { id } = req.params;

  const checklist = db.prepare("SELECT * FROM checklists WHERE id = ?").get(id) as Record<string, any> | undefined;
  if (!checklist) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }

  const itemId = crypto.randomUUID();
  const { content, asset_id, sort_order } = req.body;
  const now = new Date().toISOString();

  // 获取当前最大 sort_order
  const maxSort = db.prepare("SELECT MAX(sort_order) as max FROM checklist_items WHERE checklist_id = ?").get(id) as any;

  db.prepare(`
    INSERT INTO checklist_items (id, checklist_id, content, checked, asset_id, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?, ?, ?)
  `).run(itemId, id, content, asset_id ?? null, sort_order ?? ((maxSort?.max ?? -1) + 1), now, now);

  db.prepare("UPDATE checklists SET updated_at = ? WHERE id = ?").run(now, id);

  const item = db.prepare(`
    SELECT ci.*, a.name as asset_name, a.type as asset_type
    FROM checklist_items ci
    LEFT JOIN assets a ON ci.asset_id = a.id
    WHERE ci.id = ?
  `).get(itemId) as Record<string, any> | undefined;

  res.status(201).json({ ...item, checked: false });
});

// PUT /api/checklists/:id/items/:itemId — 重命名清单项
router.put("/:id/items/:itemId", async (req: Request, res: Response) => {
  const validationError = validateChecklistItemInput(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const db = await getDb();
  const { id, itemId } = req.params;

  const result = db.prepare(
    "UPDATE checklist_items SET content = ?, updated_at = ? WHERE id = ? AND checklist_id = ?"
  ).run(req.body.content.trim(), new Date().toISOString(), itemId, id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Checklist item not found" });
    return;
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE checklists SET updated_at = ? WHERE id = ?").run(now, id);

  const item = db.prepare(`
    SELECT ci.*, a.name as asset_name, a.type as asset_type
    FROM checklist_items ci
    LEFT JOIN assets a ON ci.asset_id = a.id
    WHERE ci.id = ?
  `).get(itemId) as Record<string, any> | undefined;

  res.json({ ...item, checked: !!(item as any)?.checked });
});

// PATCH /api/checklists/:id/items/:itemId/move — 上移/下移清单项（交换 sort_order）
router.patch("/:id/items/:itemId/move", async (req: Request, res: Response) => {
  const db = await getDb();
  const { id, itemId } = req.params;
  const direction = req.body?.direction;

  if (direction !== "up" && direction !== "down") {
    res.status(400).json({ error: "direction 必须为 up/down" });
    return;
  }

  const items = db.prepare(
    "SELECT id, sort_order FROM checklist_items WHERE checklist_id = ? ORDER BY sort_order, created_at"
  ).all(id) as { id: string; sort_order: number }[];

  const index = items.findIndex((it) => it.id === itemId);
  if (index === -1) {
    res.status(404).json({ error: "Checklist item not found" });
    return;
  }

  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= items.length) {
    res.json({ success: true }); // 已在边界，无需移动
    return;
  }

  const now = new Date().toISOString();
  const swap = db.transaction(() => {
    const update = db.prepare("UPDATE checklist_items SET sort_order = ?, updated_at = ? WHERE id = ?");
    update.run(items[neighborIndex].sort_order, now, items[index].id);
    update.run(items[index].sort_order, now, items[neighborIndex].id);
    db.prepare("UPDATE checklists SET updated_at = ? WHERE id = ?").run(now, id);
  });
  swap();

  res.json({ success: true });
});

// PATCH /api/checklists/:id/items/:itemId/toggle — 切换勾选
router.patch("/:id/items/:itemId/toggle", async (req: Request, res: Response) => {
  const db = await getDb();
  const { id, itemId } = req.params;

  const item = db.prepare(`
    SELECT ci.*, a.name as asset_name, a.type as asset_type
    FROM checklist_items ci
    LEFT JOIN assets a ON ci.asset_id = a.id
    WHERE ci.id = ? AND ci.checklist_id = ?
  `).get(itemId, id) as Record<string, any> | undefined;

  if (!item) {
    res.status(404).json({ error: "Checklist item not found" });
    return;
  }

  const checklist = db.prepare("SELECT kind, status FROM checklists WHERE id = ?").get(id) as
    | { kind: string; status: string }
    | undefined;
  // 唤醒清单完成后/归档后不能再勾选记使用（防误触污染 usage_events）
  if (checklist?.kind === "wake_up" && checklist.status !== "active") {
    res.status(400).json({ error: "唤醒清单已完成或已归档，不能再勾选" });
    return;
  }

  const wasChecked = !!(item as any).checked;
  const newChecked = wasChecked ? 0 : 1;
  const now = new Date().toISOString();

  let usageLogged = false;
  db.transaction(() => {
    db.prepare("UPDATE checklist_items SET checked = ?, updated_at = ? WHERE id = ?").run(newChecked, now, itemId);
    db.prepare("UPDATE checklists SET updated_at = ? WHERE id = ?").run(now, id);
    // 唤醒闭环：0→1 勾选自动记一条使用；取消勾选不回删
    usageLogged = autoLogWakeUpUsage(db, checklist?.kind, (item as any).asset_id, !wasChecked);
  })();

  res.json({ ...item, checked: !!newChecked, updated_at: now, usage_logged: usageLogged, asset_id: (item as any).asset_id });
});

// DELETE /api/checklists/:id/items/:itemId — 删除清单项
router.delete("/:id/items/:itemId", async (req: Request, res: Response) => {
  const db = await getDb();
  const { id, itemId } = req.params;

  const result = db.prepare("DELETE FROM checklist_items WHERE id = ? AND checklist_id = ?").run(itemId, id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Checklist item not found" });
    return;
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE checklists SET updated_at = ? WHERE id = ?").run(now, id);

  res.json({ success: true });
});

// PATCH /api/checklists/:id/complete — 标记清单完成
// 唤醒清单逐条走 0→1 判定（不用一条 SQL 批量置 1），保证"整体标记完成"同样逐条记使用
router.patch("/:id/complete", async (req: Request, res: Response) => {
  const db = await getDb();
  const { id } = req.params;

  const checklist = db.prepare("SELECT * FROM checklists WHERE id = ?").get(id) as Record<string, any> | undefined;
  if (!checklist) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }

  const now = new Date().toISOString();
  const items = db.prepare("SELECT id, checked, asset_id FROM checklist_items WHERE checklist_id = ?").all(id) as
    Array<{ id: string; checked: number; asset_id: string | null }>;

  db.transaction(() => {
    db.prepare("UPDATE checklists SET status = 'completed', updated_at = ? WHERE id = ?").run(now, id);
    const update = db.prepare("UPDATE checklist_items SET checked = 1, updated_at = ? WHERE id = ?");
    for (const item of items) {
      if (!item.checked) {
        update.run(now, item.id);
        autoLogWakeUpUsage(db, checklist.kind, item.asset_id, true);
      }
    }
  })();

  const updated = db.prepare("SELECT * FROM checklists WHERE id = ?").get(id) as Record<string, any> | undefined;
  res.json(updated);
});

// PATCH /api/checklists/:id/archive — 归档清单
router.patch("/:id/archive", async (req: Request, res: Response) => {
  const db = await getDb();

  const checklist = db.prepare("SELECT * FROM checklists WHERE id = ?").get(req.params.id) as Record<string, any> | undefined;
  if (!checklist) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE checklists SET status = 'archived', updated_at = ? WHERE id = ?").run(now, req.params.id);

  const updated = db.prepare("SELECT * FROM checklists WHERE id = ?").get(req.params.id) as Record<string, any> | undefined;
  res.json(updated);
});

// PATCH /api/checklists/:id/unarchive — 恢复为进行中
router.patch("/:id/unarchive", async (req: Request, res: Response) => {
  const db = await getDb();

  const checklist = db.prepare("SELECT * FROM checklists WHERE id = ?").get(req.params.id) as Record<string, any> | undefined;
  if (!checklist) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE checklists SET status = 'active', updated_at = ? WHERE id = ?").run(now, req.params.id);

  const updated = db.prepare("SELECT * FROM checklists WHERE id = ?").get(req.params.id) as Record<string, any> | undefined;
  res.json(updated);
});

export default router;
