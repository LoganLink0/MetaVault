import { test, expect } from "../fixtures/test-fixtures.js";
import { createAsset, createRelation } from "../fixtures/seed.js";

test.describe("关联管理", () => {
  test("添加关联", async ({ page }) => {
    const a1 = await createAsset({ name: "关联源资产", type: "physical", category: "physical.laptop" });
    const a2 = await createAsset({ name: "关联目标资产", type: "digital", category: "digital.domain" });

    await page.goto(`/assets/${a1.id}`);
    await page.waitForLoadState("networkidle");

    // 点击关联区块的添加按钮
    await page.locator("section, div").filter({ hasText: "关联资产" }).getByRole("button", { name: "添加" }).click();

    // 搜索目标资产
    const searchInput = page.locator("main input[placeholder='搜索资产...']");
    await searchInput.fill("关联目标");
    await page.getByRole("button", { name: "搜索" }).click();
    await page.waitForLoadState("networkidle");

    // 选择搜索结果
    await page.getByText("关联目标资产").first().click();

    // 确认关联
    await page.getByRole("button", { name: "确认关联" }).click();
    await page.waitForLoadState("networkidle");

    // 验证关联显示
    await expect(page.locator("text=关联目标资产").first()).toBeVisible();
  });

  test("删除关联", async ({ page }) => {
    const a1 = await createAsset({ name: "删除关联源", type: "physical", category: "physical.laptop" });
    const a2 = await createAsset({ name: "删除关联目标", type: "digital", category: "digital.domain" });
    await createRelation(a1.id, a2.id, "related_to");

    await page.goto(`/assets/${a1.id}`);
    await page.waitForLoadState("networkidle");

    // 点击移除关联按钮
    await page.locator("button[title='移除关联']").click();
    await page.waitForLoadState("networkidle");

    // 验证关联已移除
    await expect(page.getByText("暂无关联")).toBeVisible();
  });

  test("关联影响提示", async ({ page }) => {
    const a1 = await createAsset({ name: "被依赖资产", type: "physical", category: "physical.laptop" });
    const a2 = await createAsset({ name: "依赖方资产", type: "digital", category: "digital.domain" });
    await createRelation(a2.id, a1.id, "depends_on");

    // 删除被依赖的资产
    await page.goto(`/assets/${a1.id}`);
    await page.waitForLoadState("networkidle");

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "删除" }).click();
    await page.waitForURL("**/assets");
  });
});
