import { test, expect } from "../fixtures/test-fixtures.js";
import { createAsset } from "../fixtures/seed.js";

const BASE = "http://localhost:3001/api";

async function addUsage(assetId: string, daysAgo: number) {
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

test.describe("单次使用成本 Cost Per Use", () => {
  test("详情页展示 CP/U，随记录使用实时更新", async ({ page }) => {
    const asset = await createAsset({ name: "CPU相机", type: "physical", category: "physical.camera", purchase_price: 3000 });
    await page.goto(`/assets/${asset.id}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("cost-per-use")).toContainText("从未二次消费");

    await page.getByTestId("usage-quick-btn").click();
    await expect(page.getByTestId("cost-per-use")).toContainText("¥3,000");
    await expect(page.getByTestId("cost-per-use")).toContainText("/次");
  });

  test("订阅与无价格资产不展示 CP/U", async ({ page }) => {
    const sub = await createAsset({ name: "CPU订阅", type: "subscription", category: "subscription.saas", purchase_price: 999 });
    const noPrice = await createAsset({ name: "CPU无价格", type: "physical", category: "physical.other" });

    await page.goto(`/assets/${sub.id}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cost-per-use")).toHaveCount(0);

    await page.goto(`/assets/${noPrice.id}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cost-per-use")).toHaveCount(0);
  });

  test("列表 sort=cpu：从未使用的排最前，同次数价高排前", async ({ page }) => {
    const unused = await createAsset({ name: "CPU吃灰机", type: "physical", category: "physical.camera", purchase_price: 600 });
    const used3 = await createAsset({ name: "CPU常用机", type: "physical", category: "physical.other", purchase_price: 3000 });
    const used5 = await createAsset({ name: "CPU高频", type: "digital", category: "digital.course", purchase_price: 100 });
    const tieCheap = await createAsset({ name: "CPU平局低价", type: "physical", category: "physical.other", purchase_price: 100 });
    const tieRich = await createAsset({ name: "CPU平局高价", type: "physical", category: "physical.other", purchase_price: 900 });
    for (let i = 0; i < 3; i++) await addUsage(used3.id, i + 1);
    for (let i = 0; i < 5; i++) await addUsage(used5.id, i + 1);
    for (let i = 0; i < 2; i++) { await addUsage(tieCheap.id, i + 1); await addUsage(tieRich.id, i + 1); }

    await page.goto("/assets?sort=cpu");
    await page.waitForLoadState("networkidle");

    // 0 次 < 2 次（同次数价高在前）< 3 次 < 5 次
    const cards = page.locator("main h3");
    await expect(cards).toHaveText(["CPU吃灰机", "CPU平局高价", "CPU平局低价", "CPU常用机", "CPU高频"]);
    await expect(page.getByTestId("usage-count-badge").first()).toHaveText("从未使用");

    // unused 详情可打开验证（第一条卡片确实是最少使用的）
    await page.getByText("CPU吃灰机").first().click();
    await expect(page.getByTestId("cost-per-use")).toContainText("从未二次消费");
  });
});
