import { test, expect } from "../fixtures/test-fixtures.js";
import { createAsset } from "../fixtures/seed.js";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test.describe("使用日志（二次消费）", () => {
  test("一键记录今天的使用", async ({ page }) => {
    const asset = await createAsset({ name: "记录使用相机", type: "physical", category: "physical.camera", purchase_price: 3000 });
    await page.goto(`/assets/${asset.id}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("usage-empty")).toBeVisible();

    await page.getByTestId("usage-quick-btn").click();
    await expect(page.getByTestId("usage-event-row")).toHaveCount(1);
    await expect(page.getByTestId("usage-event-row").first()).toContainText(localToday());
    await expect(page.getByTestId("usage-event-row").first()).toContainText("一键");
    await expect(page.getByText("使用记录")).toContainText("1 次");
  });

  test("补录过去日期（含次数与备注）", async ({ page }) => {
    const asset = await createAsset({ name: "补录使用课程", type: "digital", category: "digital.course" });
    await page.goto(`/assets/${asset.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByTestId("usage-backfill-toggle").click();
    await page.getByTestId("usage-date-input").fill(daysAgoStr(7));
    await page.getByTestId("usage-count-input").fill("3");
    await page.getByTestId("usage-note-input").fill("看完第二章");
    await page.getByTestId("usage-submit-btn").click();

    await expect(page.getByTestId("usage-event-row")).toHaveCount(3);
    await expect(page.getByTestId("usage-event-row").first()).toContainText(daysAgoStr(7));
    await expect(page.getByTestId("usage-event-row").first()).toContainText("补录");
    await expect(page.getByTestId("usage-event-row").first()).toContainText("看完第二章");
  });

  test("历史按日期倒序，可删除单条", async ({ page }) => {
    const asset = await createAsset({ name: "排序使用耳机", type: "physical", category: "physical.other" });
    await page.goto(`/assets/${asset.id}`);
    await page.waitForLoadState("networkidle");

    // 先补录 10 天前，再记今天 → 今天排最前
    await page.getByTestId("usage-backfill-toggle").click();
    await page.getByTestId("usage-date-input").fill(daysAgoStr(10));
    await page.getByTestId("usage-submit-btn").click();
    await expect(page.getByTestId("usage-event-row")).toHaveCount(1);
    await page.getByTestId("usage-quick-btn").click();
    await expect(page.getByTestId("usage-event-row")).toHaveCount(2);

    const rows = page.getByTestId("usage-event-row");
    await expect(rows.first()).toContainText(localToday());
    await expect(rows.nth(1)).toContainText(daysAgoStr(10));

    // 删除今天这条
    page.once("dialog", (dialog) => dialog.accept());
    await rows.first().getByTestId("usage-delete-btn").click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(daysAgoStr(10));
  });

  test("物理/订阅资产也能记录（三类通用）", async ({ page }) => {
    const asset = await createAsset({ name: "通用记录订阅", type: "subscription", category: "subscription.saas" });
    await page.goto(`/assets/${asset.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByTestId("usage-quick-btn").click();
    await expect(page.getByTestId("usage-event-row")).toHaveCount(1);
  });

  test("PATCH /usage 兼容别名对三类资产生效", async ({ page, request }) => {
    const physical = await createAsset({ name: "别名物理", type: "physical", category: "physical.camera" });
    const subscription = await createAsset({ name: "别名订阅", type: "subscription", category: "subscription.saas" });

    const r1 = await request.patch(`/api/assets/${physical.id}/usage`);
    expect(r1.status()).toBe(200);
    const r2 = await request.patch(`/api/assets/${subscription.id}/usage`);
    expect(r2.status()).toBe(200);

    const list = await (await request.get(`/api/assets/${physical.id}/usage-events`)).json();
    expect(list.total).toBe(1);
    expect(list.events[0].used_at).toBe(localToday());
  });

  test("校验：未来日期与非法格式被拒绝", async ({ page, request }) => {
    const asset = await createAsset({ name: "校验使用资产", type: "physical", category: "physical.other" });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

    const r1 = await request.post(`/api/assets/${asset.id}/usage-events`, { data: { used_at: tomorrowStr } });
    expect(r1.status()).toBe(400);
    const r2 = await request.post(`/api/assets/${asset.id}/usage-events`, { data: { used_at: "2026/09/01" } });
    expect(r2.status()).toBe(400);
    const r3 = await request.post(`/api/assets/${asset.id}/usage-events`, { data: { duration_minutes: 2000 } });
    expect(r3.status()).toBe(400);

    const list = await (await request.get(`/api/assets/${asset.id}/usage-events`)).json();
    expect(list.total).toBe(0);
  });

  test("已处置资产拒绝记新使用，历史保留", async ({ page, request }) => {
    const asset = await createAsset({ name: "处置使用资产", type: "physical", category: "physical.other" });
    await request.post(`/api/assets/${asset.id}/usage-events`, { data: { used_at: daysAgoStr(3) } });

    // PUT 更新为 disposed（PUT 需要完整字段，先取详情）
    const full = await (await request.get(`/api/assets/${asset.id}`)).json();
    await request.put(`/api/assets/${asset.id}`, { data: { ...full, status: "disposed" } });

    const r = await request.post(`/api/assets/${asset.id}/usage-events`, { data: {} });
    expect(r.status()).toBe(400);

    // 历史仍可查
    const list = await (await request.get(`/api/assets/${asset.id}/usage-events`)).json();
    expect(list.total).toBe(1);
  });

  test("bulk 非对象元素被拒绝（不造数据、不 500）", async ({ page, request }) => {
    const asset = await createAsset({ name: "bulk守卫资产", type: "physical", category: "physical.other" });

    const r1 = await request.post(`/api/assets/${asset.id}/usage-events/bulk`, { data: { events: [null] } });
    expect(r1.status()).toBe(400);
    const r2 = await request.post(`/api/assets/${asset.id}/usage-events/bulk`, { data: { events: ["abc"] } });
    expect(r2.status()).toBe(400);

    const list = await (await request.get(`/api/assets/${asset.id}/usage-events`)).json();
    expect(list.total).toBe(0);
  });

  test("分页：limit/offset 生效", async ({ page, request }) => {
    const asset = await createAsset({ name: "分页使用资产", type: "physical", category: "physical.other" });
    const events = [1, 2, 3, 4, 5].map((n) => ({ used_at: daysAgoStr(n), note: `第${n}天` }));
    const bulk = await (await request.post(`/api/assets/${asset.id}/usage-events/bulk`, { data: { events } })).json();
    expect(bulk.count).toBe(5);

    const page1 = await (await request.get(`/api/assets/${asset.id}/usage-events?limit=2&offset=0`)).json();
    expect(page1.total).toBe(5);
    expect(page1.events).toHaveLength(2);
    expect(page1.events[0].used_at).toBe(daysAgoStr(1));

    const page2 = await (await request.get(`/api/assets/${asset.id}/usage-events?limit=2&offset=2`)).json();
    expect(page2.events).toHaveLength(2);
    expect(page2.events[0].used_at).toBe(daysAgoStr(3));
  });

  test("补录过去日期不改写 last_access（活跃度通道只归记今天管）", async ({ page, request }) => {
    const asset = await createAsset({
      name: "补录last_access资产", type: "digital", category: "digital.course",
      ext: { usage_stats: { last_access: new Date().toISOString() } },
    });
    const before = await (await request.get(`/api/assets/${asset.id}`)).json();
    const prevAccess = before.ext.usage_stats.last_access;

    await request.post(`/api/assets/${asset.id}/usage-events`, { data: { used_at: daysAgoStr(60) } });

    const after = await (await request.get(`/api/assets/${asset.id}`)).json();
    expect(after.ext.usage_stats.last_access).toBe(prevAccess);
  });
});
