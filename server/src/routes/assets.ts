import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import multer from "multer";
import path from "path";
import { getDb } from "../db/init.js";
import { isVisionConfigured, recognizeSubscription } from "../services/ocr-service.js";
import { validateAssetInput, validateUsageEventInput, validateUsageEventBulkInput } from "../middleware/validate.js";
import { logUsageEvent, logUsageEventsBulk, type UsageEventRow } from "../services/usage-log.js";

const router: RouterType = Router();

const screenshotUpload = multer({
  dest: "uploads/screenshots/",
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(jpg|jpeg|png|webp|bmp)$/i.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("仅支持图片文件"));
    }
  },
});

// GET /api/assets — 列表（支持筛选；v0.6 起带 usage_count，支持 sort=cpu 单次使用成本排序）
router.get("/", async (req: Request, res: Response) => {
  const db = await getDb();
  const { asset_type, status, category, search, sort } = req.query;

  let sql = "SELECT a.*, COUNT(u.id) AS usage_count FROM assets a LEFT JOIN usage_events u ON u.asset_id = a.id WHERE 1=1";
  const params: unknown[] = [];

  if (asset_type) {
    sql += " AND a.type = ?";
    params.push(asset_type);
  }
  if (status) {
    sql += " AND a.status = ?";
    params.push(status);
  }
  if (category) {
    sql += " AND a.category = ?";
    params.push(category);
  }
  if (search) {
    sql += " AND (a.name LIKE ? OR a.notes LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += " GROUP BY a.id";

  const sortWhitelist: Record<string, string> = {
    name: "a.name",
    price: "a.purchase_price",
    created_at: "a.created_at",
    updated_at: "a.updated_at",
  };

  if (sort === "cpu") {
    // 最不划算排起：从未使用的最前，同次数价高的排前
    sql += " ORDER BY COUNT(u.id) ASC, a.purchase_price DESC";
  } else {
    const sortColumn = sortWhitelist[sort as string] || "a.updated_at";
    sql += ` ORDER BY ${sortColumn} DESC`;
  }

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  const assets = rows.map((row) => ({
    ...row,
    tags: JSON.parse(row.tags as string || "[]"),
    ext: JSON.parse(row.ext as string || "{}"),
  }));

  res.json(assets);
});

// GET /api/assets/:id — 详情（v0.6 起带 usage_count）
router.get("/:id", async (req: Request, res: Response) => {
  const db = await getDb();
  const row = db.prepare(
    "SELECT a.*, (SELECT COUNT(*) FROM usage_events u WHERE u.asset_id = a.id) AS usage_count FROM assets a WHERE a.id = ?"
  ).get(req.params.id) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  res.json({
    ...row,
    tags: JSON.parse(row.tags as string || "[]"),
    ext: JSON.parse(row.ext as string || "{}"),
  });
});

// POST /api/assets — 创建
router.post("/", async (req: Request, res: Response) => {
  const validationError = validateAssetInput(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const db = await getDb();
  const id = crypto.randomUUID();
  const { name, type, category, status, tags, purchase_date, purchase_price, currency, supplier_id, notes, ext } = req.body;

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO assets (id, name, type, category, status, tags, purchase_date, purchase_price, currency, supplier_id, notes, ext, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, name, type, category, status || "active",
    JSON.stringify(tags ?? []), purchase_date ?? null, purchase_price ?? null,
    currency || "CNY", supplier_id ?? null, notes ?? null,
    JSON.stringify(ext ?? {}), now, now
  );

  const row = db.prepare("SELECT * FROM assets WHERE id = ?").get(id) as Record<string, unknown>;
  res.status(201).json({
    ...row,
    tags: JSON.parse(row.tags as string || "[]"),
    ext: JSON.parse(row.ext as string || "{}"),
  });
});

// PUT /api/assets/:id — 更新
router.put("/:id", async (req: Request, res: Response) => {
  const validationError = validateAssetInput(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const db = await getDb();
  const existing = db.prepare("SELECT id FROM assets WHERE id = ?").get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const { name, type, category, status, tags, purchase_date, purchase_price, currency, supplier_id, notes, ext } = req.body;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE assets SET name=?, type=?, category=?, status=?, tags=?, purchase_date=?, purchase_price=?, currency=?, supplier_id=?, notes=?, ext=?, updated_at=?
     WHERE id=?`
  ).run(
    name, type, category, status || "active",
    JSON.stringify(tags ?? []), purchase_date ?? null, purchase_price ?? null,
    currency || "CNY", supplier_id ?? null, notes ?? null,
    JSON.stringify(ext ?? {}), now, req.params.id
  );

  const row = db.prepare("SELECT * FROM assets WHERE id = ?").get(req.params.id) as Record<string, unknown>;
  res.json({
    ...row,
    tags: JSON.parse(row.tags as string || "[]"),
    ext: JSON.parse(row.ext as string || "{}"),
  });
});

// DELETE /api/assets/:id — 删除
router.delete("/:id", async (req: Request, res: Response) => {
  const db = await getDb();
  const result = db.prepare("DELETE FROM assets WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  res.json({ success: true });
});

// 使用日志（v0.6）：三类资产通用。disposed/expired 资产不再记新事件，历史保留可查
function checkUsageWritable(res: Response, status: string): boolean {
  if (status === "disposed" || status === "expired") {
    res.status(400).json({ error: "已处置/已过期资产不再记录新使用" });
    return false;
  }
  return true;
}

// POST /api/assets/:id/usage-events — 记一条使用（used_at 缺省为本地今天，记今天=quick，记过去=backfill）
router.post("/:id/usage-events", async (req: Request, res: Response) => {
  const validationError = validateUsageEventInput(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const db = await getDb();
  const row = db.prepare("SELECT id, status FROM assets WHERE id = ?").get(req.params.id) as
    | { id: string; status: string }
    | undefined;
  if (!row) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  if (!checkUsageWritable(res, row.status)) return;

  const event = logUsageEvent(db, row.id, req.body);
  res.status(201).json(event);
});

// POST /api/assets/:id/usage-events/bulk — 批量补录（1-200 条，日期可不同，单事务）
router.post("/:id/usage-events/bulk", async (req: Request, res: Response) => {
  const validationError = validateUsageEventBulkInput(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const db = await getDb();
  const row = db.prepare("SELECT id, status FROM assets WHERE id = ?").get(req.params.id) as
    | { id: string; status: string }
    | undefined;
  if (!row) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  if (!checkUsageWritable(res, row.status)) return;

  const events = logUsageEventsBulk(db, row.id, req.body.events);
  res.status(201).json({ count: events.length, events });
});

// GET /api/assets/:id/usage-events — 使用历史（used_at 倒序 + 总数，limit/offset 分页）
router.get("/:id/usage-events", async (req: Request, res: Response) => {
  const db = await getDb();
  const asset = db.prepare("SELECT id FROM assets WHERE id = ?").get(req.params.id);
  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 100, 1), 200);
  const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);
  const { id } = req.params;

  const total = (db.prepare("SELECT COUNT(*) AS c FROM usage_events WHERE asset_id = ?").get(id) as { c: number }).c;
  const events = db.prepare(
    // rowid 兜底同秒排序：created_at 是秒级精度，bulk 200 条同 used_at 时保持稳定倒序
    "SELECT * FROM usage_events WHERE asset_id = ? ORDER BY used_at DESC, created_at DESC, rowid DESC LIMIT ? OFFSET ?"
  ).all(id, limit, offset) as UsageEventRow[];

  res.json({ total, events });
});

// PATCH /api/assets/:id/usage — 标记已使用（v0.6 兼容别名：等价于记一条今天的使用事件，放开三类资产）
router.patch("/:id/usage", async (req: Request, res: Response) => {
  const db = await getDb();
  const id = req.params.id as string;

  const row = db.prepare("SELECT id, status FROM assets WHERE id = ?").get(id) as
    | { id: string; status: string }
    | undefined;
  if (!row) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  if (!checkUsageWritable(res, row.status)) return;

  logUsageEvent(db, id, {});

  const updated = db.prepare(
    "SELECT a.*, (SELECT COUNT(*) FROM usage_events u WHERE u.asset_id = a.id) AS usage_count FROM assets a WHERE a.id = ?"
  ).get(id) as Record<string, unknown>;
  res.json({
    ...updated,
    tags: JSON.parse(updated.tags as string || "[]"),
    ext: JSON.parse(updated.ext as string || "{}"),
  });
});

// POST /api/assets/:id/wake-up — 安排使用（v0.6 唤醒闭环）
// 宿主 = 最早创建的进行中唤醒清单（kind='wake_up'），无则创建；同清单未勾选且同资产的条目已存在则去重
router.post("/:id/wake-up", async (req: Request, res: Response) => {
  const db = await getDb();
  const assetId = req.params.id as string;

  const asset = db.prepare("SELECT id, name, status FROM assets WHERE id = ?").get(assetId) as
    | { id: string; name: string; status: string }
    | undefined;
  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  if (asset.status === "disposed" || asset.status === "expired") {
    res.status(400).json({ error: "已处置/已过期资产无需唤醒" });
    return;
  }

  const now = new Date().toISOString();
  let host = db.prepare(
    "SELECT id FROM checklists WHERE kind = 'wake_up' AND status = 'active' ORDER BY created_at LIMIT 1"
  ).get() as { id: string } | undefined;

  if (!host) {
    const checklistId = crypto.randomUUID();
    db.prepare(
      "INSERT INTO checklists (id, title, scenario, status, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(checklistId, "唤醒计划", "custom", "active", "wake_up", now, now);
    host = { id: checklistId };
  }

  const existing = db.prepare(
    "SELECT id FROM checklist_items WHERE checklist_id = ? AND asset_id = ? AND checked = 0"
  ).get(host.id, assetId) as { id: string } | undefined;
  if (existing) {
    res.json({ checklist_id: host.id, item_id: existing.id, created: false });
    return;
  }

  const maxSort = db.prepare("SELECT MAX(sort_order) AS max FROM checklist_items WHERE checklist_id = ?").get(host.id) as { max: number | null };
  const itemId = crypto.randomUUID();
  db.prepare(
    "INSERT INTO checklist_items (id, checklist_id, content, checked, asset_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)"
  ).run(itemId, host.id, `使用一次「${asset.name}」`, assetId, (maxSort.max ?? -1) + 1, now, now);
  db.prepare("UPDATE checklists SET updated_at = ? WHERE id = ?").run(now, host.id);

  res.status(201).json({ checklist_id: host.id, item_id: itemId, created: true });
});

// POST /api/assets/:id/screenshot — 上传订阅截图
router.post("/:id/screenshot", screenshotUpload.single("screenshot"), async (req: Request, res: Response) => {
  const db = await getDb();
  const { id } = req.params;
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "请上传截图文件" });
    return;
  }

  const asset = db.prepare("SELECT ext FROM assets WHERE id = ?").get(id) as Record<string, string> | undefined;
  if (!asset) {
    res.status(404).json({ error: "资产不存在" });
    return;
  }

  const ext = JSON.parse(asset.ext || "{}");
  ext.screenshot_url = `/uploads/screenshots/${file.filename}`;

  db.prepare("UPDATE assets SET ext = ? WHERE id = ?").run(JSON.stringify(ext), id);

  // 同时保存到 screenshots 表
  db.prepare(
    "INSERT INTO screenshots (id, asset_id, file_path, original_name) VALUES (?, ?, ?, ?)"
  ).run(crypto.randomUUID(), id, file.path, file.originalname);

  res.json({ screenshot_url: ext.screenshot_url });
});

// POST /api/assets/ocr — OCR 识别订阅截图（视觉大模型直出结构化字段）
router.post("/ocr", screenshotUpload.single("screenshot"), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "请上传截图文件" });
    return;
  }

  if (!isVisionConfigured()) {
    res.status(503).json({ error: "未配置视觉识别 API（server/.env 中设置 VISION_API_KEY），请手动填写订阅信息" });
    return;
  }

  try {
    const result = await recognizeSubscription(file.path);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "OCR 识别失败: " + err.message });
  }
});

export default router;
