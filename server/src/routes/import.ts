import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { getDb } from "../db/init.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as xlsx from "xlsx";
import { validateUsageEventInput } from "../middleware/validate.js";
import { parseFrontmatter, noteToAssetFields, parseUsageSection, type ParsedAsset, type UsageEventLine } from "../services/obsidian.js";

const upload = multer({ dest: "uploads/" });
const obsidianUpload = multer({
  dest: "uploads/",
  limits: { fileSize: 2 * 1024 * 1024, files: 200 },
});

const router: RouterType = Router();

// POST /api/import/parse — 上传+解析预览
router.post("/parse", upload.single("file"), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const filePath = req.file.path;
  const ext = req.file.originalname.split(".").pop()?.toLowerCase();

  let rows: Record<string, unknown>[] = [];

  if (ext === "csv") {
    const wb = xlsx.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = xlsx.utils.sheet_to_json(ws);
  } else if (ext === "xlsx" || ext === "xls") {
    const wb = xlsx.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = xlsx.utils.sheet_to_json(ws);
  } else {
    res.status(400).json({ error: "Unsupported file format. Use .csv, .xlsx, or .xls" });
    return;
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  res.json({ columns, rows: rows.slice(0, 10), totalRows: rows.length, filePath });
});

// POST /api/import/execute — 确认导入
router.post("/execute", async (req: Request, res: Response) => {
  const db = await getDb();
  const { filePath, mapping } = req.body as { filePath: string; mapping: Record<string, string> };

  if (!filePath || !mapping) {
    res.status(400).json({ error: "filePath and mapping are required" });
    return;
  }

  const wb = xlsx.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(ws);

  const insert = db.prepare(
    `INSERT INTO assets (id, name, type, category, status, tags, purchase_date, purchase_price, currency, notes, ext, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let imported = 0;
  let errors = 0;
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    for (const row of rows) {
      try {
        const name = String(row[mapping.name] ?? "");
        if (!name) { errors++; continue; }

        const type = String(row[mapping.type] ?? "physical");
        const category = String(row[mapping.category] ?? type);
        const status = String(row[mapping.status] ?? "active");
        const purchase_date = row[mapping.purchase_date] ? String(row[mapping.purchase_date]) : null;
        const purchase_price = row[mapping.purchase_price] ? Number(row[mapping.purchase_price]) : null;
        const notes = row[mapping.notes] ? String(row[mapping.notes]) : null;

        insert.run(
          crypto.randomUUID(), name, type, category, status,
          "[]", purchase_date, purchase_price, "CNY", notes, "{}", now, now
        );
        imported++;
      } catch {
        errors++;
      }
    }
  });

  transaction();
  res.json({ imported, errors, total: rows.length });
});

// POST /api/import/obsidian — 导入 Obsidian 笔记（v0.7）
// dry_run=true 仅解析返回预览；正式导入按 frontmatter.id upsert（存在则整体覆盖更新，否则新建），幂等
router.post("/obsidian", (req: Request, res: Response, next: (err?: unknown) => void) => {
  obsidianUpload.array("files", 200)(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      // 超限是客户端输入问题，映射为 4xx 而非默认的 500
      const status = err.code === "LIMIT_FILE_SIZE" || err.code === "LIMIT_FILE_COUNT" ? 413 : 400;
      res.status(status).json({ error: err.code === "LIMIT_FILE_SIZE" ? "单个文件超过 2MB 上限" : err.code === "LIMIT_FILE_COUNT" ? "单次最多 200 个文件" : err.message });
      return;
    }
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "上传失败" });
      return;
    }
    next();
  });
}, async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    res.status(400).json({ error: "请上传 .md 文件" });
    return;
  }
  const dryRun = req.body.dry_run === "true";

  const db = await getDb();
  const supplierRows = db.prepare("SELECT id, name FROM suppliers").all() as Array<{ id: string; name: string }>;
  const supplierByName = new Map(supplierRows.map((s) => [s.name, s.id]));

  // 逐文件解析（内容读入内存后立即清理临时文件）
  const parsed: Array<{ file: string; asset: ParsedAsset; events: UsageEventLine[]; skippedEvents: number }> = [];
  const details: Array<{ file: string; name?: string; action: string; error?: string; events?: number; skipped_events?: number }> = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file.path, "utf-8");
      fs.unlink(file.path, () => {});
      const fm = parseFrontmatter(content);
      if (!fm) {
        details.push({ file: file.originalname, action: "error", error: "不是有效的 Obsidian 笔记（缺少 --- frontmatter）" });
        continue;
      }
      const asset = noteToAssetFields(fm.fields);
      if (typeof asset === "string") {
        details.push({ file: file.originalname, action: "error", error: asset });
        continue;
      }
      // 事件与 API 记使用同一套校验：非法行（假日期/未来日期/超界时长/超长备注）跳过并计数，
      // 绝不入事务——否则 CHECK 约束会把整批导入炸成 500
      const rawEvents = parseUsageSection(fm.body);
      const events = rawEvents.filter((ev) => validateUsageEventInput(ev as unknown as Record<string, unknown>) === null);
      parsed.push({ file: file.originalname, asset, events, skippedEvents: rawEvents.length - events.length });
    } catch (err) {
      fs.unlink(file.path, () => {});
      details.push({ file: file.originalname, action: "error", error: err instanceof Error ? err.message : "文件读取失败" });
    }
  }

  if (dryRun) {
    // 批内同 id 的第二个文件起按"将更新"预览，与实际执行结果一致
    const seenIds = new Set<string>();
    for (const { file, asset, events, skippedEvents } of parsed) {
      const exists = asset.id ? (db.prepare("SELECT id FROM assets WHERE id = ?").get(asset.id) || seenIds.has(asset.id)) : false;
      if (asset.id) seenIds.add(asset.id);
      details.push({ file, name: asset.name, action: exists ? "would_update" : "would_create", events: events.length, skipped_events: skippedEvents });
    }
    res.json({ total: files.length, created: 0, updated: 0, errors: details.filter((d) => d.action === "error").length, usage_events: 0, dryRun: true, details });
    return;
  }

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO assets (id, name, type, category, status, tags, purchase_date, purchase_price, currency, supplier_id, notes, ext, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const update = db.prepare(
    `UPDATE assets SET name=?, type=?, category=?, status=?, tags=?, purchase_date=?, purchase_price=?, currency=?, supplier_id=?, notes=?, ext=?, updated_at=?
     WHERE id=?`
  );

  let created = 0;
  let updated = 0;
  let errors = details.filter((d) => d.action === "error").length;
  let usageEventsImported = 0;

  const findEvent = db.prepare(
    `SELECT id FROM usage_events WHERE asset_id = ? AND used_at = ?
     AND COALESCE(duration_minutes, -1) = COALESCE(?, -1) AND COALESCE(note, '') = COALESCE(?, '')`
  );
  const insertEvent = db.prepare(
    `INSERT INTO usage_events (id, asset_id, used_at, duration_minutes, note, source) VALUES (?, ?, ?, ?, ?, 'backfill')`
  );

  // 回读使用事件：按（资产+日期+时长+备注）去重合并——只增不删，保留导入期间新产生的记录，幂等
  try {
    db.transaction(() => {
      for (const { file, asset, events, skippedEvents } of parsed) {
        const supplierId = asset.supplier ? supplierByName.get(asset.supplier) ?? null : null;
        const tags = JSON.stringify(asset.tags);
        const ext = JSON.stringify(asset.ext);

        const exists = asset.id ? db.prepare("SELECT id FROM assets WHERE id = ?").get(asset.id) as { id: string } | undefined : undefined;
        const assetId = exists ? exists.id : (asset.id ?? crypto.randomUUID());
        if (exists) {
          update.run(asset.name, asset.type, asset.category, asset.status, tags, asset.purchase_date, asset.purchase_price, asset.currency, supplierId, asset.notes, ext, now, exists.id);
          updated++;
          details.push({ file, name: asset.name, action: "updated", events: events.length, skipped_events: skippedEvents });
        } else {
          insert.run(assetId, asset.name, asset.type, asset.category, asset.status, tags, asset.purchase_date, asset.purchase_price, asset.currency, supplierId, asset.notes, ext, now, now);
          created++;
          details.push({ file, name: asset.name, action: "created", events: events.length, skipped_events: skippedEvents });
        }

        for (const ev of events) {
          const dup = findEvent.get(assetId, ev.used_at, ev.duration_minutes ?? null, ev.note ?? null);
          if (dup) continue;
          insertEvent.run(crypto.randomUUID(), assetId, ev.used_at, ev.duration_minutes ?? null, ev.note ?? null);
          usageEventsImported++;
        }
      }
    })();
  } catch (err) {
    // 事件已预校验，剩余失败属异常情况：整批回滚后以 400 报告，而非裸 500
    res.status(400).json({ error: "导入失败：" + (err instanceof Error ? err.message : "未知错误") });
    return;
  }

  res.json({ total: files.length, created, updated, errors, usage_events: usageEventsImported, dryRun: false, details });
});

export default router;
