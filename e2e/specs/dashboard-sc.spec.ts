import { test, expect } from "../fixtures/test-fixtures.js";
import { createAsset } from "../fixtures/seed.js";

const BASE = "http://localhost:3001/api";

async function addUsageOn(assetId: string, daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const used_at = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const res = await fetch(`${BASE}/assets/${assetId}/usage-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ used_at }),
  });
  if (!res.ok) throw new Error(`Add usage failed: ${res.status}`);
}

test.describe("仪表盘二次消费面板", () => {
  test("无资产时隐藏", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("sc-panel")).toHaveCount(0);
  });

  test("消费率与吃灰榜口径正确（disposed 排除、窗口外不计入）", async ({ page }) => {
    const usedToday = await createAsset({ name: "SC今日用", type: "physical", category: "physical.camera" });
    const used100 = await createAsset({ name: "SC百日未用", type: "digital", category: "digital.course" });
    const neverUsed = await createAsset({ name: "SC从未用", type: "physical", category: "physical.other" });
    const disposed = await createAsset({ name: "SC已处置", type: "physical", category: "physical.other" });

    await addUsageOn(usedToday.id, 0);
    await addUsageOn(used100.id, 100);
    await addUsageOn(disposed.id, 0);
    const full = await (await fetch(`${BASE}/assets/${disposed.id}`)).json();
    await fetch(`${BASE}/assets/${disposed.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...full, status: "disposed" }),
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 消费率：3 件在册（排除 disposed），90 天内用过 1 件 → 33%
    await expect(page.getByTestId("sc-rate")).toContainText("33%");
    await expect(page.getByTestId("sc-rate")).toContainText("1/3");

    // 吃灰榜：百日未用的排第一，已处置不出现，从未使用有标注
    const dust = page.getByTestId("sc-dust-item");
    await expect(dust.filter({ hasText: "SC百日未用" }).first()).toContainText("100 天未用");
    await expect(dust.filter({ hasText: "SC从未用" })).toContainText("从未使用");
    await expect(dust.filter({ hasText: "SC已处置" })).toHaveCount(0);
  });

  test("窗口边界：89 天前计入，恰好 90 天前不计入", async ({ page }) => {
    const inWindow = await createAsset({ name: "SC窗口内", type: "physical", category: "physical.other" });
    const onEdge = await createAsset({ name: "SC边界90", type: "physical", category: "physical.other" });
    await addUsageOn(inWindow.id, 89);
    await addUsageOn(onEdge.id, 90);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 89 天前算"近 90 天内"，90 天整不算 → 1/2 = 50%
    await expect(page.getByTestId("sc-rate")).toContainText("50%");
    await expect(page.getByTestId("sc-rate")).toContainText("1/2");
  });
});
