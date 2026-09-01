import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import multer from "multer";
import path from "path";
import { getDb } from "../db/init.js";
import { isVisionConfigured, recognizeSubscription } from "../services/ocr-service.js";
import { validateAssetInput } from "../middleware/validate.js";

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

// GET /api/assets — 列表（支持筛选）
router.get("/", async (req: Request, res: Response) => {
  const db = await getDb();
  const { asset_type, status, category, search, sort } = req.query;

  let sql = "SELECT * FROM assets WHERE 1=1";
  const params: unknown[] = [];

  if (asset_type) {
    sql += " AND type = ?";
    params.push(asset_type);
  }
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }
  if (search) {
    sql += " AND (name LIKE ? OR notes LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  const sortWhitelist: Record<string, string> = {
    name: "name",
    price: "purchase_price",
    created_at: "created_at",
    updated_at: "updated_at",
  };
  const sortColumn = sortWhitelist[sort as string] || "updated_at";
  sql += ` ORDER BY ${sortColumn} DESC`;

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  const assets = rows.map((row) => ({
    ...row,
    tags: JSON.parse(row.tags as string || "[]"),
    ext: JSON.parse(row.ext as string || "{}"),
  }));

  res.json(assets);
});

// GET /api/assets/:id — 详情
router.get("/:id", async (req: Request, res: Response) => {
  const db = await getDb();
  const row = db.prepare("SELECT * FROM assets WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;

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

// PATCH /api/assets/:id/usage — 标记数字资产已使用
router.patch("/:id/usage", async (req: Request, res: Response) => {
  const db = await getDb();
  const { id } = req.params;

  const row = db.prepare("SELECT type, ext FROM assets WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  if (row.type !== "digital") {
    res.status(400).json({ error: "Only digital assets support usage tracking" });
    return;
  }

  const ext = JSON.parse(row.ext as string || "{}") as Record<string, unknown>;
  const now = new Date().toISOString();
  ext.usage_stats = {
    ...((ext.usage_stats as Record<string, unknown>) ?? {}),
    last_access: now,
  };

  db.prepare("UPDATE assets SET ext = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(ext), now, id
  );

  db.prepare(
    "UPDATE notifications SET is_dismissed = 1 WHERE asset_id = ? AND type = 'usage_stagnation' AND is_dismissed = 0"
  ).run(id);

  const updated = db.prepare("SELECT * FROM assets WHERE id = ?").get(id) as Record<string, unknown>;
  res.json({
    ...updated,
    tags: JSON.parse(updated.tags as string || "[]"),
    ext: JSON.parse(updated.ext as string || "{}"),
  });
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
