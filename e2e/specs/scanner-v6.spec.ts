import { test, expect } from "../fixtures/test-fixtures.js";
import { createAsset, scanNotifications, resetDb } from "../fixtures/seed.js";

const BASE = "http://localhost:3001/api";

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysLaterStr(n: number): string {
  return daysAgoStr(-n);
}

async function logUsage(assetId: string, daysAgo: number) {
  const res = await fetch(`${BASE}/assets/${assetId}/usage-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ used_at: daysAgoStr(daysAgo) }),
  });
  if (!res.ok) throw new Error(`Log usage failed: ${res.status}`);
}

async function notificationsFor(assetId: number | string, type: string) {
  const res = await fetch(`${BASE}/notifications`);
  const all = (await res.json()) as Array<{ asset_id: string | null; type: string }>;
  return all.filter((n) => n.asset_id === assetId && n.type === type);
}

async function dismiss(id: string) {
  await fetch(`${BASE}/notifications/${id}/dismiss`, { method: "PATCH" });
}

async function listRaw() {
  return (await (await fetch(`${BASE}/notifications`)).json()) as Array<{ id: string; asset_id: string | null; type: string }>;
}

test.describe("提醒扫描 v0.6（使用事件驱动）", () => {
  test("停滞提醒覆盖物理资产（purchase_date 起算）", async ({ request }) => {
    await resetDb();
    const asset = await createAsset({
      name: "停滞物理资产", type: "physical", category: "physical.camera",
      purchase_date: daysAgoStr(40),
    });

    await scanNotifications();
    const list = await notificationsFor(asset.id, "usage_stagnation");
    expect(list).toHaveLength(1);
  });

  test("取消建议：曾用后弃用（事件在窗口外、到手满 60 天）→ 建议取消", async () => {
    await resetDb();
    const asset = await createAsset({
      name: "弃用订阅", type: "subscription", category: "subscription.streaming",
      purchase_date: daysAgoStr(90),
      ext: { billing_cycle: "monthly", amount: 25, next_billing_date: daysLaterStr(2) },
    });
    await logUsage(asset.id, 70); // 唯一一次使用在近 60 天窗口之外

    await scanNotifications();
    expect(await notificationsFor(asset.id, "cancellation_suggestion")).toHaveLength(1);
  });

  test("到手未满 30 天的新资产不判停滞", async () => {
    await resetDb();
    const asset = await createAsset({
      name: "新买资产", type: "physical", category: "physical.camera",
      purchase_date: daysAgoStr(5),
    });

    await scanNotifications();
    const list = await notificationsFor(asset.id, "usage_stagnation");
    expect(list).toHaveLength(0);
  });

  test("停滞提醒 dismiss 后不重生（修复换日重生活环），记使用后也不再生成", async () => {
    await resetDb();
    const asset = await createAsset({
      name: "停滞复活资产", type: "physical", category: "physical.other",
      purchase_date: daysAgoStr(60),
    });

    await scanNotifications();
    expect(await notificationsFor(asset.id, "usage_stagnation")).toHaveLength(1);

    // dismiss 后再扫描：不重生（旧实现会换 trigger_date 当天重建，列表重新出现 1 条）。
    // 注意 GET /notifications 始终过滤已忽略通知（历史修复 #16），所以这里断言仍是 0 条
    const raw = await listRaw();
    const stale = raw.find((n) => n.asset_id === asset.id && n.type === "usage_stagnation")!;
    await dismiss(stale.id);
    await scanNotifications();
    const after = await listRaw();
    expect(after.filter((n) => n.asset_id === asset.id && n.type === "usage_stagnation")).toHaveLength(0);

    // 记录今天的使用后再扫描：依旧不重生
    await logUsage(asset.id, 0);
    await scanNotifications();
    const afterUse = await listRaw();
    expect(afterUse.filter((n) => n.asset_id === asset.id && n.type === "usage_stagnation")).toHaveLength(0);
  });

  test("digital 旧 last_access 数据兜底仍生效", async () => {
    await resetDb();
    const asset = await createAsset({
      name: "旧课程资产", type: "digital", category: "digital.course",
      purchase_date: daysAgoStr(90),
      ext: { usage_stats: { last_access: `${daysAgoStr(60)}T10:00:00.000Z` } },
    });

    await scanNotifications();
    expect(await notificationsFor(asset.id, "usage_stagnation")).toHaveLength(1);
  });

  test("取消建议：真实使用数据优先于手动评估", async () => {
    await resetDb();
    // 到手 90 天、从未记录使用 → 自动 rarely → 建议取消
    const unused = await createAsset({
      name: "从未用订阅", type: "subscription", category: "subscription.saas",
      purchase_date: daysAgoStr(90),
      ext: { billing_cycle: "monthly", amount: 30, next_billing_date: daysLaterStr(3) },
    });
    // 到手 90 天、近 60 天有使用 → 不建议取消（即使手动标了 rarely）
    const active = await createAsset({
      name: "还在用订阅", type: "subscription", category: "subscription.saas",
      purchase_date: daysAgoStr(90),
      ext: { billing_cycle: "monthly", amount: 30, next_billing_date: daysLaterStr(3), usage_frequency: "rarely" },
    });
    // 到手仅 10 天、无事件、手动 rarely → 回退手动 → 建议取消
    const young = await createAsset({
      name: "新订阅手动rarely", type: "subscription", category: "subscription.other",
      purchase_date: daysAgoStr(10),
      ext: { billing_cycle: "monthly", amount: 10, next_billing_date: daysLaterStr(3), usage_frequency: "rarely" },
    });
    await logUsage(active.id, 10);

    await scanNotifications();
    expect(await notificationsFor(unused.id, "cancellation_suggestion")).toHaveLength(1);
    expect(await notificationsFor(active.id, "cancellation_suggestion")).toHaveLength(0);
    expect(await notificationsFor(young.id, "cancellation_suggestion")).toHaveLength(1);
  });

  test("取消建议：到手满 60 天但近 60 天有事件 → 不建议", async () => {
    await resetDb();
    const asset = await createAsset({
      name: "老订阅偶尔用", type: "subscription", category: "subscription.membership",
      purchase_date: daysAgoStr(120),
      ext: { billing_cycle: "yearly", amount: 199, next_billing_date: daysLaterStr(5) },
    });
    await logUsage(asset.id, 30); // 30 天前用过 → 近 60 天有事件

    await scanNotifications();
    expect(await notificationsFor(asset.id, "cancellation_suggestion")).toHaveLength(0);
  });
});
