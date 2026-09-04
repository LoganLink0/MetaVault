import { test, expect } from "../fixtures/test-fixtures.js";
import { createAsset, createChecklist, resetDb } from "../fixtures/seed.js";

const BASE = "http://localhost:3001/api";

async function getChecklist(id: string) {
  const res = await fetch(`${BASE}/checklists/${id}`);
  if (!res.ok) throw new Error(`Get checklist failed: ${res.status}`);
  return res.json();
}

async function toggleItem(checklistId: string, itemId: string) {
  const res = await fetch(`${BASE}/checklists/${checklistId}/items/${itemId}/toggle`, { method: "PATCH" });
  if (!res.ok) throw new Error(`Toggle failed: ${res.status}`);
  return res.json();
}

async function completeChecklist(checklistId: string) {
  const res = await fetch(`${BASE}/checklists/${checklistId}/complete`, { method: "PATCH" });
  if (!res.ok) throw new Error(`Complete failed: ${res.status}`);
  return res.json();
}

async function usageCount(assetId: string) {
  const res = await fetch(`${BASE}/assets/${assetId}/usage-events`);
  const list = await res.json();
  return list as { total: number; events: Array<{ source: string }> };
}

async function wakeUpViaApi(assetId: string) {
  return fetch(`${BASE}/assets/${assetId}/wake-up`, { method: "POST" });
}

test.describe("唤醒闭环（吃灰 → 清单 → 自动记使用）", () => {
  test("仪表盘吃灰榜一键安排使用，生成唤醒计划清单", async ({ page, request }) => {
    const asset = await createAsset({ name: "唤醒吃灰机", type: "physical", category: "physical.camera" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("sc-wakeup-btn").first().click();
    await expect(page.getByText("已加入「唤醒计划」清单")).toBeVisible();

    // 清单已生成：kind=wake_up，条目关联资产
    const lists = await (await request.get("/api/checklists?search=唤醒计划")).json();
    expect(lists).toHaveLength(1);
    expect(lists[0].kind).toBe("wake_up");
    const detail = await getChecklist(lists[0].id);
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0].asset_id).toBe(asset.id);
    expect(detail.items[0].content).toContain("唤醒吃灰机");
  });

  test("同一资产重复安排不生成重复条目", async ({ request }) => {
    await resetDb();
    const asset = await createAsset({ name: "重复安排机", type: "physical", category: "physical.other" });

    const r1 = await (await wakeUpViaApi(asset.id)).json();
    expect(r1.created).toBe(true);
    const r2 = await (await wakeUpViaApi(asset.id)).json();
    expect(r2.created).toBe(false);
    expect(r2.checklist_id).toBe(r1.checklist_id);

    const detail = await getChecklist(r1.checklist_id);
    expect(detail.items).toHaveLength(1);
  });

  test("勾选清单项自动记使用（0→1 记，取消不回删，再勾再记）", async ({ page, request }) => {
    const asset = await createAsset({ name: "勾选记用机", type: "physical", category: "physical.camera" });
    const r = await (await wakeUpViaApi(asset.id)).json();

    // 通过清单详情页 UI 勾选（toggle 是图标按钮，非原生 checkbox）
    await page.goto(`/checklists/${r.checklist_id}`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("toggle-item").first().click();
    await page.waitForLoadState("networkidle");

    let usage = await usageCount(asset.id);
    expect(usage.total).toBe(1);
    expect(usage.events[0].source).toBe("checklist");

    // 取消勾选不回删，重新勾选再记一条
    const detail = await getChecklist(r.checklist_id);
    await toggleItem(r.checklist_id, detail.items[0].id); // 1→0
    usage = await usageCount(asset.id);
    expect(usage.total).toBe(1);
    await toggleItem(r.checklist_id, detail.items[0].id); // 0→1
    usage = await usageCount(asset.id);
    expect(usage.total).toBe(2);
  });

  test("整体标记完成逐条记使用", async ({ request }) => {
    await resetDb();
    const a1 = await createAsset({ name: "整体完成A", type: "physical", category: "physical.other" });
    const a2 = await createAsset({ name: "整体完成B", type: "digital", category: "digital.course" });
    await wakeUpViaApi(a1.id);
    await wakeUpViaApi(a2.id);

    const lists = await (await request.get("/api/checklists?search=唤醒计划")).json();
    await completeChecklist(lists[0].id);

    expect((await usageCount(a1.id)).total).toBe(1);
    expect((await usageCount(a2.id)).total).toBe(1);
  });

  test("普通场景清单勾选不记使用", async ({ request }) => {
    await resetDb();
    const asset = await createAsset({ name: "出差带电脑", type: "physical", category: "physical.laptop" });
    const cl = await createChecklist({
      title: "出差清单",
      scenario: "business_trip",
      items: [{ content: "带笔记本电脑", asset_id: asset.id }],
    });

    await toggleItem(cl.id, cl.items[0].id);
    const usage = await usageCount(asset.id);
    expect(usage.total).toBe(0);
  });

  test("已处置资产拒绝唤醒", async ({ request }) => {
    await resetDb();
    const asset = await createAsset({ name: "已处置不唤醒", type: "physical", category: "physical.other" });
    const full = await (await request.get(`/api/assets/${asset.id}`)).json();
    await request.put(`/api/assets/${asset.id}`, { data: { ...full, status: "disposed" } });

    const res = await wakeUpViaApi(asset.id);
    expect(res.status).toBe(400); // 全局 fetch 的 Response.status 是属性
  });

  test("已完成/已归档的唤醒清单拒绝再勾选（防误触记使用）", async ({ request }) => {
    await resetDb();
    const asset = await createAsset({ name: "完成后再勾机", type: "physical", category: "physical.other" });
    const r = await (await wakeUpViaApi(asset.id)).json();
    await completeChecklist(r.checklist_id);

    const detail = await getChecklist(r.checklist_id);
    const res = await fetch(`${BASE}/checklists/${r.checklist_id}/items/${detail.items[0].id}/toggle`, { method: "PATCH" });
    expect(res.status).toBe(400);

    // 事件数不因完成后再勾选而增加（complete 时已记 1 条）
    const usage = await usageCount(asset.id);
    expect(usage.total).toBe(1);
  });

  test("UI 勾选后仪表盘二次消费率实时联动（usage_logged 失效链）", async ({ page }) => {
    await resetDb();
    const asset = await createAsset({ name: "联动率机", type: "physical", category: "physical.other" });
    const r = await (await wakeUpViaApi(asset.id)).json();

    // 勾选前：唯一资产 0 次使用 → 0%
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("sc-rate")).toContainText("0%");

    // 清单页 UI 勾选
    await page.goto(`/checklists/${r.checklist_id}`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("toggle-item").first().click();
    await expect(page.getByText("1/1")).toBeVisible();

    // 回仪表盘：消费率应立即变为 100%（缓存已被 usage_logged 失效）
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("sc-rate")).toContainText("100%");
  });
});
