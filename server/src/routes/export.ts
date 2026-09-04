import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { getDb } from "../db/init.js";
import * as xlsx from "xlsx";
import JSZip from "jszip";
import { assetToNote, sanitizeFilename, type AssetRow } from "../services/obsidian.js";

const router: RouterType = Router();

// GET /api/export/obsidian — 导出 Obsidian Vault ZIP（v0.7，每资产一个 md；v0.8 起含使用历史）
router.get("/obsidian", async (_req: Request, res: Response) => {
  const db = await getDb();
  const rows = db.prepare("SELECT * FROM assets ORDER BY created_at").all() as unknown as AssetRow[];
  const supplierRows = db.prepare("SELECT id, name FROM suppliers").all() as Array<{ id: string; name: string }>;
  const supplierNames = new Map(supplierRows.map((s) => [s.id, s.name]));
  const relationRows = db.prepare(
    `SELECT r.relation, r.source_id, a.name AS other_name
     FROM asset_relations r
     JOIN assets a ON a.id = (CASE WHEN r.source_id = ? THEN r.target_id ELSE r.source_id END)
     WHERE r.source_id = ? OR r.target_id = ?`
  );
  // 单次查询全量事件按资产分组，避免逐资产 N+1
  const eventRows = db.prepare(
    "SELECT asset_id, used_at, duration_minutes, note FROM usage_events ORDER BY used_at, rowid"
  ).all() as Array<{ asset_id: string; used_at: string; duration_minutes: number | null; note: string | null }>;
  const eventsByAsset = new Map<string, Array<{ used_at: string; duration_minutes: number | null; note: string | null }>>();
  for (const ev of eventRows) {
    const list = eventsByAsset.get(ev.asset_id) ?? [];
    list.push({ used_at: ev.used_at, duration_minutes: ev.duration_minutes, note: ev.note });
    eventsByAsset.set(ev.asset_id, list);
  }
  const usedFilenames = new Set<string>();
  const zip = new JSZip();
  const folder = zip.folder("MetaVault")!;

  // 文件名全局唯一：重名追加 id 前 8 位，仍碰撞则加序号，防同名覆盖静默丢资产
  const uniqueFilename = (base: string, id: string): string => {
    let candidate = `${base}.md`;
    if (!usedFilenames.has(candidate)) {
      usedFilenames.add(candidate);
      return candidate;
    }
    candidate = `${base} (${id.slice(0, 8)}).md`;
    if (!usedFilenames.has(candidate)) {
      usedFilenames.add(candidate);
      return candidate;
    }
    let n = 2;
    while (usedFilenames.has(candidate)) {
      candidate = `${base} (${id.slice(0, 8)})-${n}.md`;
      n++;
    }
    usedFilenames.add(candidate);
    return candidate;
  };

  for (const asset of rows) {
    const relations = (relationRows.all(asset.id, asset.id, asset.id) as Array<{ relation: string; source_id: string; other_name: string }>)
      .map((r) => ({
        otherName: r.other_name,
        relation: r.source_id === asset.id ? r.relation : `反向:${r.relation}`,
      }));
    const usageEvents = eventsByAsset.get(asset.id) ?? [];

    const note = assetToNote(
      asset,
      JSON.parse(asset.tags || "[]") as string[],
      JSON.parse(asset.ext || "{}") as Record<string, unknown>,
      asset.supplier_id ? supplierNames.get(asset.supplier_id) ?? null : null,
      relations,
      usageEvents
    );

    const filename = uniqueFilename(sanitizeFilename(asset.name), asset.id);
    folder.file(filename, note, { date: new Date(asset.updated_at || Date.now()) });
  }

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=metavault-obsidian.zip");
  res.send(buf);
});

// GET /api/export/assets — 导出资产为 Excel（v0.8 起含使用次数/最近使用列，仅报表用途）
router.get("/assets", async (_req: Request, res: Response) => {
  const db = await getDb();
  const rows = db.prepare(
    `SELECT a.*, COUNT(u.id) AS usage_count, MAX(u.used_at) AS last_used
     FROM assets a LEFT JOIN usage_events u ON u.asset_id = a.id
     GROUP BY a.id ORDER BY a.updated_at DESC`
  ).all() as Record<string, unknown>[];

  const typeLabels: Record<string, string> = { physical: "物理资产", digital: "数字资产", subscription: "订阅" };
  const statusLabels: Record<string, string> = { active: "使用中", idle: "闲置", expired: "过期", disposed: "已处置" };

  const exportData = rows.map((row) => {
    const ext = JSON.parse(row.ext as string || "{}") as Record<string, unknown>;
    const sourceLabels: Record<string, string> = { purchase: "购入", self_build: "自建", donation: "捐赠", transfer: "调拨" };

    const base: Record<string, unknown> = {
      "资产名称": row.name,
      "资产类型": typeLabels[row.type as string] ?? row.type,
      "分类": row.category,
      "状态": statusLabels[row.status as string] ?? row.status,
      "标签": (JSON.parse(row.tags as string || "[]") as string[]).join(","),
      "获取日期": row.purchase_date,
      "获取价格": row.purchase_price,
      "币种": row.currency,
      "使用次数": Number(row.usage_count ?? 0),
      "最近使用": row.last_used ?? "",
      "备注": row.notes,
      "创建时间": row.created_at,
      "更新时间": row.updated_at,
    };

    if (row.type === "physical") {
      base["规格型号"] = ext.model ?? "";
      base["数量"] = ext.quantity ?? "";
      base["计量单位"] = ext.unit ?? "";
      base["存放位置"] = ext.location ?? "";
      base["用途场景"] = ext.usage ?? "";
      base["归属人"] = ext.owner ?? "";
      base["资产来源"] = sourceLabels[ext.source as string] ?? ext.source ?? "";
      base["保修到期日"] = ext.warranty_expiry ?? "";
      base["序列号"] = ext.serial_number ?? "";
    } else if (row.type === "digital") {
      base["平台"] = ext.platform ?? "";
      base["账号"] = ext.account ?? "";
      base["到期日"] = ext.expiry_date ?? "";
    } else if (row.type === "subscription") {
      base["计费周期"] = ext.billing_cycle ?? "";
      base["每期费用"] = ext.amount ?? "";
      base["下次扣费日"] = ext.next_billing_date ?? "";
      base["试用到期日"] = ext.trial_end ?? "";
    }

    return base;
  });

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(exportData);
  xlsx.utils.book_append_sheet(wb, ws, "资产");

  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=assets.xlsx");
  res.send(buf);
});

// GET /api/export/suppliers — 导出供应商为 Excel
router.get("/suppliers", async (_req: Request, res: Response) => {
  const db = await getDb();
  const rows = db.prepare("SELECT * FROM suppliers ORDER BY updated_at DESC").all() as Record<string, unknown>[];

  const typeLabels: Record<string, string> = { physical: "物理", digital: "数字", subscription: "订阅", mixed: "混合" };

  const exportData = rows.map((row) => ({
    "供应商名称": row.name,
    "类型": typeLabels[row.type as string] ?? row.type,
    "评分": row.rating,
    "标签": (JSON.parse(row.tags as string || "[]") as string[]).join(","),
    "联系方式": row.contact,
    "网址": row.website,
    "备注": row.notes,
    "是否收藏": row.is_favorite ? "是" : "否",
    "创建时间": row.created_at,
    "更新时间": row.updated_at,
  }));

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(exportData);
  xlsx.utils.book_append_sheet(wb, ws, "供应商");

  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=suppliers.xlsx");
  res.send(buf);
});

export default router;