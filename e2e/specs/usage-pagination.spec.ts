import { test, expect } from "../fixtures/test-fixtures.js";
import { createAsset, resetDb } from "../fixtures/seed.js";

const BASE = "http://localhost:3001/api";

// 使用历史分页：单页 200 条，加载更多增量拉取
test.describe("使用历史分页加载", () => {
  test("250 条记录默认显示 200，加载更多补齐", async ({ page }) => {
    await resetDb();
    const asset = await createAsset({ name: "分页大资产", type: "physical", category: "physical.other" });

    // bulk 上限 200/次，分两批补录
    const mk = (n: number, from: number) => Array.from({ length: n }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (from + i));
      return { used_at: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` };
    });
    for (const events of [mk(200, 1), mk(50, 300)]) {
      const res = await fetch(`${BASE}/assets/${asset.id}/usage-events/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
      });
      if (!res.ok) throw new Error(`Bulk failed: ${res.status}`);
    }

    await page.goto(`/assets/${asset.id}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("usage-event-row")).toHaveCount(200);
    await expect(page.getByTestId("usage-load-more")).toContainText("已显示 200 / 共 250 条");

    await page.getByTestId("usage-load-more").click();
    await expect(page.getByTestId("usage-event-row")).toHaveCount(250);
    await expect(page.getByTestId("usage-load-more")).toHaveCount(0); // 没有更多时按钮消失
  });
});
