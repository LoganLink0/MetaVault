import { test, expect } from "../fixtures/test-fixtures.js";
import { createChecklist } from "../fixtures/seed.js";

test.describe("清单功能", () => {
  test("新建清单页面场景按钮与表单", async ({ page }) => {
    await page.goto("/checklists/new");
    await expect(page.locator("h2")).toContainText("新建清单");

    // 5 个场景按钮均可见
    const scenarios = ["business_trip", "travel", "daily_check", "moving", "custom"];
    for (const s of scenarios) {
      await expect(page.getByTestId(`scenario-${s}`)).toBeVisible();
    }
  });

  test("清单详情页显示项和进度", async ({ page }) => {
    const cl = await createChecklist({
      title: "出差测试",
      scenario: "business_trip",
      items: [
        { content: "身份证/护照" },
        { content: "笔记本充电器" },
        { content: "确认机票" },
      ],
    });

    await page.goto(`/checklists/${cl.id}`);
    await expect(page.getByText("出差测试")).toBeVisible();
    await expect(page.getByText("0/3")).toBeVisible();
    await expect(page.getByText("身份证/护照")).toBeVisible();
  });

  test("清单列表显示进度", async ({ page }) => {
    await createChecklist({
      title: "测试旅行清单",
      scenario: "travel",
      items: [
        { content: "带护照" },
        { content: "带充电器" },
        { content: "确认机票" },
      ],
    });

    await page.goto("/checklists");
    await expect(page.getByText("测试旅行清单")).toBeVisible();
    await expect(page.getByText("0/3")).toBeVisible();
  });

  test("勾选清单项更新进度", async ({ page }) => {
    const cl = await createChecklist({
      title: "勾选测试",
      scenario: "daily_check",
      items: [
        { content: "检查项A" },
        { content: "检查项B" },
      ],
    });

    await page.goto(`/checklists/${cl.id}`);
    await expect(page.getByText("检查项A")).toBeVisible();
    await expect(page.getByText("0/2")).toBeVisible();

    await page.getByTestId("toggle-item").first().click();
    await page.waitForTimeout(500);

    await expect(page.getByText("1/2")).toBeVisible();
  });

  test("删除清单", async ({ page }) => {
    await createChecklist({
      title: "待删除清单",
      scenario: "custom",
      items: [{ content: "临时项" }],
    });

    await page.goto("/checklists");
    await expect(page.getByText("待删除清单")).toBeVisible();

    await page.getByTestId("delete-checklist").click();
    await page.waitForTimeout(500);
    await expect(page.getByText("待删除清单")).not.toBeVisible();
  });

  test("场景筛选", async ({ page }) => {
    await createChecklist({ title: "出差清单", scenario: "business_trip", items: [{ content: "项目1" }] });
    await createChecklist({ title: "旅行清单", scenario: "travel", items: [{ content: "项目2" }] });

    await page.goto("/checklists");
    await expect(page.getByText("出差清单")).toBeVisible();
    await expect(page.getByText("旅行清单")).toBeVisible();

    await page.getByRole("button", { name: /出差/ }).first().click();
    await expect(page.getByText("出差清单")).toBeVisible();
    await expect(page.getByText("旅行清单")).not.toBeVisible();
  });

  test("编辑清单基本信息", async ({ page }) => {
    const cl = await createChecklist({
      title: "待编辑清单",
      scenario: "travel",
      items: [{ content: "带护照" }],
    });

    // 详情页进入编辑
    await page.goto(`/checklists/${cl.id}`);
    await page.getByTestId("edit-checklist").click();
    await expect(page.locator("h2")).toContainText("编辑清单");
    await expect(page.getByText("带护照")).toBeVisible();

    // 修改标题并保存
    await page.locator("main form").getByLabel("标题").fill("编辑后的清单");
    await page.getByTestId("submit-checklist").click();

    // 保存后回到详情页，显示新标题
    await expect(page).toHaveURL(new RegExp(`/checklists/[0-9a-f-]+$`));
    await expect(page.getByText("编辑后的清单")).toBeVisible();
    await expect(page.getByText("待编辑清单")).not.toBeVisible();
  });

  test("归档清单与恢复", async ({ page }) => {
    const cl = await createChecklist({
      title: "归档测试清单",
      scenario: "daily_check",
      items: [{ content: "检查项" }],
    });

    // 详情页归档，状态徽章变为已归档（exact 避免匹配到 toast 文案）
    await page.goto(`/checklists/${cl.id}`);
    await page.getByTestId("archive-checklist").click();
    await expect(page.getByText("已归档", { exact: true })).toBeVisible();
    await expect(page.getByTestId("unarchive-checklist")).toBeVisible();

    // 归档筛选下可见
    await page.goto("/checklists?status=archived");
    await expect(page.getByText("归档测试清单")).toBeVisible();

    // 详情页恢复为进行中
    await page.goto(`/checklists/${cl.id}`);
    await page.getByTestId("unarchive-checklist").click();
    await expect(page.getByText("进行中", { exact: true })).toBeVisible();
  });
});