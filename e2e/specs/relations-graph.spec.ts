import { test, expect } from "../fixtures/test-fixtures.js";
import { createAsset, createRelation, resetDb } from "../fixtures/seed.js";

test.describe("关联领地（关联可视化图）", () => {
  test("节点与边渲染、孤儿提示、图例", async ({ page }) => {
    await resetDb();
    const camera = await createAsset({ name: "领地相机", type: "physical", category: "physical.camera" });
    const domain = await createAsset({ name: "领地域名", type: "digital", category: "digital.domain" });
    const laptop = await createAsset({ name: "领地笔记本", type: "physical", category: "physical.laptop" });
    await createAsset({ name: "领地孤儿镜头", type: "physical", category: "physical.other" });
    await createRelation(camera.id, domain.id, "bound_to");
    await createRelation(laptop.id, domain.id, "depends_on");

    await page.goto("/relations");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("relation-node")).toHaveCount(4);
    await expect(page.getByTestId("relation-edge")).toHaveCount(2);
    await expect(page.getByTestId("orphan-hint")).toContainText("1 件暂无关联");
    // N≤24：全部节点带标签（罗盘 N 字母不属节点标签，用专属 testid 计数）
    await expect(page.getByTestId("relation-label")).toHaveCount(4);
    // 图例四种关系（在图例容器内断言，避免宽松定位假阳性）
    const legend = page.getByTestId("graph-legend");
    for (const label of ["依赖", "包含", "绑定", "相关"]) {
      await expect(legend).toContainText(label);
    }
  });

  test("类型过滤：只看物理时数字节点与其相关边隐藏，全部恢复", async ({ page }) => {
    await resetDb();
    const camera = await createAsset({ name: "过滤相机", type: "physical", category: "physical.camera" });
    const domain = await createAsset({ name: "过滤域名", type: "digital", category: "digital.domain" });
    const lens = await createAsset({ name: "过滤镜头", type: "physical", category: "physical.other" });
    await createRelation(camera.id, domain.id, "bound_to");
    await createRelation(camera.id, lens.id, "related_to");

    await page.goto("/relations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("relation-node")).toHaveCount(3);
    await expect(page.getByTestId("relation-edge")).toHaveCount(2);

    await page.getByTestId("filter-physical").click();
    await expect(page.getByTestId("relation-node")).toHaveCount(2);
    await expect(page.getByTestId("relation-edge")).toHaveCount(1);

    await page.getByTestId("filter-all").click();
    await expect(page.getByTestId("relation-node")).toHaveCount(3);
    await expect(page.getByTestId("relation-edge")).toHaveCount(2);
  });

  test("标签缓解：N>24 时仅标注有连接的节点，hover 恢复显示", async ({ page }) => {
    await resetDb();
    const a = await createAsset({ name: "缓解相机", type: "physical", category: "physical.camera" });
    const b = await createAsset({ name: "缓解域名", type: "digital", category: "digital.domain" });
    await createRelation(a.id, b.id, "related_to");
    const orphans: Array<{ id: string }> = [];
    for (let i = 0; i < 24; i++) {
      orphans.push(await createAsset({ name: `缓解孤儿${i}号长名称资产`, type: "physical", category: "physical.other" }));
    }

    await page.goto("/relations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("relation-node")).toHaveCount(26);
    // 26 节点超过阈值：只有 2 个有连接的节点带标签
    await expect(page.getByTestId("relation-label")).toHaveCount(2);

    // hover 一个孤儿节点：其标签出现（截断至 6 字符）
    await page.locator(`[data-node-id="${orphans[0].id}"]`).getByTestId("relation-node-dot").hover();
    await expect(page.getByTestId("relation-label")).toHaveCount(3);
    await expect(page.getByTestId("relation-label").filter({ hasText: "缓解孤儿0" })).toHaveCount(1);
  });

  test("点击节点跳转资产详情", async ({ page }) => {
    await resetDb();
    const asset = await createAsset({ name: "领地跳转机", type: "digital", category: "digital.course" });
    await page.goto("/relations");
    await page.waitForLoadState("networkidle");

    await page.locator(`[data-node-id="${asset.id}"]`).getByTestId("relation-node-dot").click();
    await page.waitForURL(new RegExp(`/assets/${asset.id}$`));
    await expect(page.getByRole("heading", { name: "领地跳转机" })).toBeVisible();
  });

  test("有资产但无关联时显示引导", async ({ page }) => {
    await resetDb();
    await createAsset({ name: "无关联资产", type: "physical", category: "physical.other" });

    await page.goto("/relations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("no-relations-hint")).toBeVisible();
    await expect(page.getByTestId("relation-edge")).toHaveCount(0);
  });

  test("空库空态", async ({ page }) => {
    await resetDb();
    await page.goto("/relations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("暂无资产")).toBeVisible();
  });

  test("移动端底部导航含关联入口", async ({ page }) => {
    await resetDb();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/assets");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "关联" }).click();
    await page.waitForURL("**/relations");
    await expect(page.getByRole("heading", { name: "关联领地" })).toBeVisible();
  });
});
