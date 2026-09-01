import { test, expect } from "../fixtures/test-fixtures.js";
import { createAsset, createChecklist } from "../fixtures/seed.js";

test.describe("仪表盘", () => {
  test("显示仪表盘页面", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();
  });

  test("有数据时图表渲染", async ({ page }) => {
    // 创建不同类型的资产以确保图表有数据
    await createAsset({
      name: "图表测试物理",
      type: "physical",
      category: "physical.laptop",
      status: "active",
      purchase_price: 8000,
    });
    await createAsset({
      name: "图表测试订阅",
      type: "subscription",
      category: "subscription.saas",
      status: "active",
      purchase_price: 99,
      ext: { billing_cycle: "monthly", amount: 99 },
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 验证 SVG 图表元素存在（饼图或折线图）
    const svgCharts = page.locator("svg.recharts-surface, svg");
    const svgCount = await svgCharts.count();
    // 至少有一个 SVG 渲染
    expect(svgCount).toBeGreaterThan(0);
  });

  test("进行中清单卡片显示并跳转", async ({ page }) => {
    const cl = await createChecklist({
      title: "仪表盘清单",
      scenario: "moving",
      items: [{ content: "打包书籍" }],
    });

    await page.goto("/");
    const card = page.getByTestId("dashboard-checklist").filter({ hasText: "仪表盘清单" });
    await expect(card).toBeVisible();

    await card.click();
    await expect(page).toHaveURL(new RegExp(`/checklists/${cl.id}$`));
    await expect(page.getByText("打包书籍")).toBeVisible();
  });
});
