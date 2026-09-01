import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { getDb } from "../db/init.js";
import { validateChecklistInput, validateChecklistItemInput } from "../middleware/validate.js";

const router: RouterType = Router();

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

  const newChecked = (item as any).checked ? 0 : 1;
  const now = new Date().toISOString();

  db.prepare("UPDATE checklist_items SET checked = ?, updated_at = ? WHERE id = ?").run(newChecked, now, itemId);
  db.prepare("UPDATE checklists SET updated_at = ? WHERE id = ?").run(now, id);

  res.json({ ...item, checked: !!newChecked, updated_at: now });
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
router.patch("/:id/complete", async (req: Request, res: Response) => {
  const db = await getDb();
  const { id } = req.params;

  const checklist = db.prepare("SELECT * FROM checklists WHERE id = ?").get(id) as Record<string, any> | undefined;
  if (!checklist) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE checklists SET status = 'completed', updated_at = ? WHERE id = ?").run(now, id);
  db.prepare("UPDATE checklist_items SET checked = 1, updated_at = ? WHERE checklist_id = ?").run(now, id);

  const updated = db.prepare("SELECT * FROM checklists WHERE id = ?").get(id) as Record<string, any> | undefined;
  res.json(updated);
});

export default router;
