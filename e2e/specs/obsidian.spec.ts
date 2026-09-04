import { test, expect } from "../fixtures/test-fixtures.js";
import { createAsset, createSupplier, createRelation, resetDb } from "../fixtures/seed.js";
import JSZip from "jszip";

const BASE = "http://localhost:3001/api";

async function exportVault(): Promise<JSZip> {
  const res = await fetch(`${BASE}/export/obsidian`);
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  expect(buf.subarray(0, 2).toString()).toBe("PK"); // ZIP 魔数
  return JSZip.loadAsync(buf);
}

async function importNotes(notes: Array<{ filename: string; content: string }>, dryRun: boolean) {
  const fd = new FormData();
  if (dryRun) fd.append("dry_run", "true");
  for (const n of notes) {
    fd.append("files", new Blob([n.content], { type: "text/markdown" }), n.filename);
  }
  const res = await fetch(`${BASE}/import/obsidian`, { method: "POST", body: fd });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Import failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return res.json() as Promise<{
    total: number; created: number; updated: number; errors: number; dryRun: boolean;
    details: Array<{ file: string; name?: string; action: string; error?: string }>;
  }>;
}

async function allAssets() {
  return (await (await fetch(`${BASE}/assets`)).json()) as Array<Record<string, unknown>>;
}

test.describe("Obsidian 导入导出", () => {
  test("导出 ZIP：每资产一个 md，frontmatter 与关联 wikilink 完整", async () => {
    await resetDb();
    const supplier = await createSupplier({ name: "OB 供应商", type: "physical" });
    const a1 = await createAsset({
      name: "OB相机", type: "physical", category: "physical.camera",
      purchase_date: "2025-01-15", purchase_price: 3000, supplier_id: supplier.id,
      tags: ["摄影"], notes: "主力机", ext: { location: "书房", warranty_expiry: "2027-01-15" },
    });
    const a2 = await createAsset({ name: "OB域名", type: "digital", category: "digital.domain" });
    await createRelation(a1.id, a2.id, "bound_to");

    const zip = await exportVault();
    const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
    expect(paths).toHaveLength(2);
    expect(paths.some((p) => p === "MetaVault/OB相机.md")).toBe(true);

    const note = await zip.file("MetaVault/OB相机.md")!.async("string");
    expect(note).toMatch(/^---\n/);
    expect(note).toContain(`id: ${a1.id}`);
    expect(note).toContain("name: OB相机");
    expect(note).toContain("tags: [摄影]");
    expect(note).toContain("purchase_price: 3000");
    expect(note).toContain("supplier: OB 供应商");
    expect(note).toContain("location: 书房");
    expect(note).toContain("- [[OB域名]] (bound_to)");

    // 重名资产：第二个文件名带 id 前缀
    const dup = await createAsset({ name: "OB相机", type: "physical", category: "physical.other" });
    const zip2 = await exportVault();
    const paths2 = Object.keys(zip2.files).filter((p) => !zip2.files[p].dir);
    expect(paths2.some((p) => p.includes(`(${dup.id.slice(0, 8)})`))).toBe(true);
  });

  test("往返闭环：导出 → 清库 → 导入恢复字段，dry_run 不写库", async () => {
    const supplier = await createSupplier({ name: "往返供应商", type: "physical" });
    const a1 = await createAsset({
      name: "往返资产", type: "physical", category: "physical.camera",
      purchase_date: "2024-06-01", purchase_price: 5999, supplier_id: supplier.id,
      tags: ["设备", "主力"], notes: "往返测试", ext: { location: "书房", serial_number: "SN-001" },
    });

    const zip = await exportVault();
    const note = await zip.file("MetaVault/往返资产.md")!.async("string");
    await resetDb();

    // dry_run：只预览不写库
    const preview = await importNotes([{ filename: "往返资产.md", content: note }], true);
    expect(preview.dryRun).toBe(true);
    expect(preview.details[0].action).toBe("would_create");
    expect(await allAssets()).toHaveLength(0);

    // 正式导入：字段恢复
    const result = await importNotes([{ filename: "往返资产.md", content: note }], false);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.errors).toBe(0);

    const assets = await allAssets();
    expect(assets).toHaveLength(1);
    const restored = assets[0];
    expect(restored.id).toBe(a1.id); // frontmatter id 保持，往返稳定
    expect(restored.name).toBe("往返资产");
    expect(restored.purchase_price).toBe(5999);
    expect(restored.purchase_date).toBe("2024-06-01");
    expect(restored.tags).toEqual(["设备", "主力"]);
    expect((restored.ext as Record<string, unknown>).location).toBe("书房");
    expect((restored.ext as Record<string, unknown>).serial_number).toBe("SN-001");
    expect(restored.supplier_id).toBeNull(); // 供应商已被清库，名字匹配不到 → 置空
  });

  test("幂等：重复导入同一批文件只更新不新建", async () => {
    const asset = await createAsset({ name: "幂等资产", type: "digital", category: "digital.course" });
    const zip = await exportVault();
    const note = await zip.file("MetaVault/幂等资产.md")!.async("string");
    await resetDb();

    const first = await importNotes([{ filename: "幂等资产.md", content: note }], false);
    expect(first.created).toBe(1);
    const second = await importNotes([{ filename: "幂等资产.md", content: note }], false);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect((await allAssets()).find((a) => a.id === asset.id)).toBeTruthy();
  });

  test("坏文件：无 frontmatter / 缺 name / 非法 type 都计入 errors", async () => {
    await resetDb();
    const result = await importNotes([
      { filename: "无frontmatter.md", content: "# 只有正文\n没有 frontmatter" },
      { filename: "缺name.md", content: "---\ntype: physical\n---\n正文" },
      { filename: "坏type.md", content: "---\nname: 坏类型\ntype: vehicle\n---\n" },
    ], false);

    expect(result.total).toBe(3);
    expect(result.created).toBe(0);
    expect(result.errors).toBe(3);
    expect(result.details.every((d) => d.action === "error")).toBe(true);
    expect(await allAssets()).toHaveLength(0);
  });

  test("手写笔记无 id：新建资产并生成 id", async () => {
    const result = await importNotes([
      { filename: "手写.md", content: '---\nname: 手写资产\ntype: subscription\ncategory: subscription.saas\ntags: [订阅, "AI 工具"]\namount: 20\nbilling_cycle: monthly\n---\n\n我的手写笔记' },
    ], false);

    expect(result.created).toBe(1);
    const assets = await allAssets();
    const asset = assets[0];
    expect(asset.name).toBe("手写资产");
    expect(asset.type).toBe("subscription");
    expect(asset.tags).toEqual(["订阅", "AI 工具"]);
    expect((asset.ext as Record<string, unknown>).amount).toBe(20);
  });

  test("往返鲁棒性：多行 notes / CRLF / 含逗号 tag / 数字型字符串", async () => {
    const asset = await createAsset({
      name: "鲁棒资产", type: "physical", category: "physical.camera",
      tags: ["含,逗号", "普通"], notes: "第一行\nCRLF第二行\r\n第三行含---分隔线", purchase_price: 1,
      ext: { serial_number: "00123", model: "12345", source: "007" },
    });

    const zip = await exportVault();
    const note = await zip.file("MetaVault/鲁棒资产.md")!.async("string");
    // 多行 notes（含 CRLF）被转义为单行带转义的引号字符串，frontmatter 结构不被破坏
    expect(note).toContain('notes: "第一行\\nCRLF第二行\\r\\n第三行含---分隔线"');

    const result = await importNotes([{ filename: "鲁棒资产.md", content: note }], false);
    expect(result.updated).toBe(1);

    const restored = (await allAssets()).find((a) => a.id === asset.id);
    expect(restored).toBeTruthy();
    expect(restored!.notes).toBe("第一行\nCRLF第二行\r\n第三行含---分隔线");
    expect(restored!.tags).toEqual(["含,逗号", "普通"]);
    const ext = restored!.ext as Record<string, unknown>;
    expect(ext.serial_number).toBe("00123"); // 数字型字符串保类型往返
    expect(ext.model).toBe("12345");
    expect(ext.source).toBe("007");
  });

  test("导出文件名碰撞：三个同名资产导出 3 个文件不丢失", async () => {
    await resetDb();
    const a = await createAsset({ name: "碰撞", type: "physical", category: "physical.other" });
    const b = await createAsset({ name: "碰撞", type: "physical", category: "physical.other" });
    // c 的名字构造为必然命中 b 的去重后缀（确定性触发碰撞分支，守护 uniqueFilename 修复）
    const c = await createAsset({ name: `碰撞 (${b.id.slice(0, 8)})`, type: "physical", category: "physical.other" });

    const zip = await exportVault();
    const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
    expect(paths).toHaveLength(3);
    // 三份笔记的 id 各自可找回（无静默覆盖）
    const contents = await Promise.all(paths.map((p) => zip.files[p].async("string")));
    const ids = contents.map((c) => c.match(/id: ([0-9a-f-]{36})/)![1]);
    expect(new Set(ids)).toEqual(new Set([a.id, b.id, c.id]));
  });
});
