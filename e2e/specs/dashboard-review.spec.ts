import { test, expect } from "../fixtures/test-fixtures.js";
import { createAsset, resetDb } from "../fixtures/seed.js";

const BASE = "http://localhost:3001/api";

// 本月安全锚点：今天必在本月
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 上月安全锚点：上月 15 日（无论今天几号都在上月）
function prevMonthMidStr(): string {
  const d = new Date();
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 15);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-15`;
}

async function logUsage(assetId: string, usedAt: string, durationMinutes?: number) {
  const res = await fetch(`${BASE}/assets/${assetId}/usage-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ used_at: usedAt, duration_minutes: durationMinutes }),
  });
  if (!res.ok) throw new Error(`Log usage failed: ${res.status}`);
}

test.describe("月度回顾", () => {
  test("口径：本月次数/在用资产数/唤醒数/Top 资产（上月使用不污染）", async ({ page }) => {
    await resetDb();
    const a = await createAsset({ name: "回顾高频", type: "physical", category: "physical.camera" });
    const b = await createAsset({ name: "回顾首次", type: "digital", category: "digital.course" });
    const c = await createAsset({ name: "回顾上月", type: "physical", category: "physical.other" });

    await logUsage(a.id, todayStr(), 30);
    await logUsage(a.id, todayStr());
    await logUsage(b.id, todayStr());
    await logUsage(c.id, prevMonthMidStr()); // 上月使用：不计本月，也不算唤醒（首次使用在上月）

    const api = await (await fetch(`${BASE}/dashboard/monthly-review`)).json();
    expect(api.month).toBe(todayStr().slice(0, 7));
    expect(api.total_uses).toBe(3);
    expect(api.used_asset_count).toBe(2);
    expect(api.awakened_count).toBe(2);
    expect(api.top_assets[0].name).toBe("回顾高频");
    expect(api.top_assets[0].uses).toBe(2);

    // 仪表盘卡片渲染
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("review-stats")).toContainText("3");
    await expect(page.getByTestId("review-stats")).toContainText("件被唤醒");
    await expect(page.getByTestId("monthly-review")).toContainText("回顾高频");
  });

  test("往月翻看：上月与本月数据切换，当前月下一页禁用", async ({ page }) => {
    await resetDb();
    const a = await createAsset({ name: "翻月高频", type: "physical", category: "physical.camera" });
    const b = await createAsset({ name: "翻月上月", type: "physical", category: "physical.other" });
    await logUsage(a.id, todayStr());
    await logUsage(b.id, prevMonthMidStr());

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("review-stats")).toContainText("1");

    // 翻到上月：月份标签变化 + 上月事件计数为 1，下一页（回本月）可用
    const prevMonthLabel = `${Number(prevMonthMidStr().slice(5, 7))} 月回顾`;
    await page.getByTestId("review-prev").click();
    await expect(page.getByTestId("monthly-review")).toContainText(prevMonthLabel);
    await expect(page.getByTestId("review-stats")).toContainText("1");
    await expect(page.getByTestId("monthly-review")).toContainText("件被唤醒");
    await expect(page.getByTestId("review-next")).toBeEnabled();

    // 回到本月：下一页禁用
    await page.getByTestId("review-next").click();
    await expect(page.getByTestId("review-next")).toBeDisabled();
  });

  test("无使用记录时显示 0（有资产在册）", async ({ page }) => {
    await resetDb();
    await createAsset({ name: "回顾零记录", type: "physical", category: "physical.other" });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("review-stats")).toContainText("0");
  });
});
