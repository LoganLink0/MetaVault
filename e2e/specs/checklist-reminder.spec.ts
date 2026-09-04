import { test, expect } from "../fixtures/test-fixtures.js";
import { createChecklist, scanNotifications } from "../fixtures/seed.js";

// 本地日期（不能用 toISOString——UTC 会让 UTC+8 早上 8 点前的"明天"算成"今天"）
function daysLaterStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test.describe("清单到期提醒", () => {
  test("到期清单扫描后生成提醒并跳转", async ({ page }) => {
    const tomorrow = daysLaterStr(1);
    await createChecklist({
      title: "到期提醒清单",
      scenario: "business_trip",
      due_date: tomorrow,
      items: [{ content: "办签证" }],
    });

    await scanNotifications();
    await page.goto("/notifications");

    await expect(page.getByText("清单到期")).toBeVisible();
    await expect(page.getByText(/「到期提醒清单」还有 \d+ 天到期/)).toBeVisible();

    // 点击清单标题跳转详情
    await page.getByTestId("notification-checklist-link").click();
    await expect(page.getByText("办签证")).toBeVisible();
  });

  test("未设截止日期的清单不生成提醒", async ({ page }) => {
    await createChecklist({
      title: "无截止日清单",
      scenario: "custom",
      items: [{ content: "随便一项" }],
    });

    await scanNotifications();
    await page.goto("/notifications");

    await expect(page.getByText("清单到期")).not.toBeVisible();
  });
});
