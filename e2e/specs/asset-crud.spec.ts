import { test, expect } from "../fixtures/test-fixtures.js";
import { createAsset } from "../fixtures/seed.js";

test.describe("资产 CRUD", () => {
  test("查看物理资产详情", async ({ page }) => {
    const asset = await createAsset({
      name: "测试 MacBook Pro",
      type: "physical",
      category: "physical.laptop",
      status: "active",
      tags: ["办公设备"],
      purchase_date: "2025-06-01",
      purchase_price: 14999,
      currency: "CNY",
      notes: "主力开发机",
      ext: {
        model: "MacBook Pro 14 M3 Pro",
        quantity: 1,
        unit: "台",
        location: "书房",
        usage: "日常办公",
        owner: "LoganLink",
        source: "purchase",
        warranty_expiry: "2028-06-01",
        serial_number: "TEST-SN-001",
      },
    });

    await page.goto(`/assets/${asset.id}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("测试 MacBook Pro")).toBeVisible();
    await expect(page.getByText("MacBook Pro 14 M3 Pro")).toBeVisible();
    await expect(page.getByText("书房")).toBeVisible();
  });

  test("删除资产", async ({ page }) => {
    const asset = await createAsset({
      name: "删除测试资产",
      type: "physical",
      category: "physical.other",
    });

    await page.goto(`/assets/${asset.id}`);
    await page.waitForLoadState("networkidle");

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除" }).click();

    await page.waitForURL("**/assets");
  });

  test("通过表单创建物理资产", async ({ page }) => {
    await page.goto("/assets/new");
    await page.waitForLoadState("networkidle");

    // 填写名称
    const nameInput = page.locator("main form input").first();
    await nameInput.click();
    await nameInput.fill("TestLaptop");

    // 分类改为手机
    const categorySelect = page.locator("main form").getByRole("combobox").nth(1);
    await categorySelect.click();
    await page.getByRole("option", { name: "手机" }).click();

    // 填写获取价格
    const priceInput = page.locator("main form input[type='number']").first();
    await priceInput.click();
    await priceInput.fill("5999");

    // 提交表单
    await page.getByRole("button", { name: "保存" }).click();

    // 验证跳转到详情页
    await page.waitForURL(/\/assets\/[0-9a-f-]+$/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("TestLaptop")).toBeVisible();
  });

  test("通过表单创建数字资产", async ({ page }) => {
    await page.goto("/assets/new");
    await page.waitForLoadState("networkidle");

    // 填写名称
    const nameInput = page.locator("main form input").first();
    await nameInput.click();
    await nameInput.fill("TestDigital");

    // 切换类型为数字资产
    const typeSelect = page.locator("main form").getByRole("combobox").first();
    await typeSelect.click();
    await page.getByRole("option", { name: "数字资产" }).click();
    await page.waitForTimeout(500);

    // 填写平台
    const platformInput = page.locator("main form input[placeholder='平台']");
    await platformInput.click();
    await platformInput.fill("Steam");

    // 提交表单
    await page.getByRole("button", { name: "保存" }).click();

    // 验证跳转到详情页
    await page.waitForURL(/\/assets\/[0-9a-f-]+$/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("TestDigital")).toBeVisible();
  });

  test("编辑资产名称", async ({ page }) => {
    const asset = await createAsset({
      name: "编辑测试资产",
      type: "physical",
      category: "physical.other",
    });
    await page.goto(`/assets/${asset.id}`);
    await page.waitForLoadState("networkidle");

    // 点击编辑按钮
    await page.getByRole("button", { name: "编辑" }).click();
    await page.waitForLoadState("networkidle");

    // 修改名称
    const nameInput = page.locator("main form input").first();
    await nameInput.evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      )?.set;
      setter?.call(el, "UpdatedAsset");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // 提交
    await page.getByRole("button", { name: "保存" }).click();
    await page.waitForURL(/\/assets\/[^/]+$/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    // 验证名称已更新
    await expect(page.getByText("UpdatedAsset")).toBeVisible({ timeout: 5000 });
  });
});