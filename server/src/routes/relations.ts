import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { getDb } from "../db/init.js";
import { validateRelationInput } from "../middleware/validate.js";

const router: RouterType = Router();

// GET /api/relations/graph — 全局关联图（v0.9 关联领地）
// 必须声明在 GET /:assetId 之前，否则 "graph" 会被当作资产 id 静默返回空数组
router.get("/graph", async (_req: Request, res: Response) => {
  const db = await getDb();
  const nodes = db.prepare(
    "SELECT id, name, type, status FROM assets ORDER BY type, name"
  ).all();
  const edges = db.prepare(
    "SELECT id, source_id, target_id, relation FROM asset_relations ORDER BY created_at"
  ).all();
  res.json({ nodes, edges });
});

// GET /api/relations/:assetId — 获取某资产的所有关联
router.get("/:assetId", async (req: Request, res: Response) => {
  const db = await getDb();
  const rows = db.prepare(
    `SELECT r.*, a.name as source_name, b.name as target_name
     FROM asset_relations r
     JOIN assets a ON r.source_id = a.id
     JOIN assets b ON r.target_id = b.id
     WHERE r.source_id = ? OR r.target_id = ?
     ORDER BY r.created_at DESC`
  ).all(req.params.assetId, req.params.assetId);
  res.json(rows);
});

// POST /api/relations — 添加关联
router.post("/", async (req: Request, res: Response) => {
  const validationError = validateRelationInput(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const db = await getDb();
  const id = crypto.randomUUID();
  const { source_id, target_id, relation } = req.body;
  const now = new Date().toISOString();

  try {
    db.prepare(
      "INSERT INTO asset_relations (id, source_id, target_id, relation, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(id, source_id, target_id, relation, now);

    const row = db.prepare(
      `SELECT r.*, a.name as source_name, b.name as target_name
       FROM asset_relations r
       JOIN assets a ON r.source_id = a.id
       JOIN assets b ON r.target_id = b.id
       WHERE r.id = ?`
    ).get(id);
    res.status(201).json(row);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE constraint")) {
      res.status(409).json({ error: "Relation already exists" });
      return;
    }
    throw err;
  }
});

// DELETE /api/relations/:id — 删除关联
router.delete("/:id", async (req: Request, res: Response) => {
  const db = await getDb();
  const result = db.prepare("DELETE FROM asset_relations WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Relation not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
