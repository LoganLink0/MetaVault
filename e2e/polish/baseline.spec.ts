// 视觉打磨基线截图：种一套有表现力的数据，截取桌面 + 移动端全页截图
import { test } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://localhost:3999/api";
const OUT = "polish-shots";

// 拦截外部字体请求，避免网络抖动导致导航挂起（截图走本地字体回退，不影响布局断言）
test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
});

function d(offsetDays: number): string {
  const t = new Date();
  t.setDate(t.getDate() + offsetDays);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

test("capture baseline", async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await api("/test/reset", "POST");

  // 供应商
  const apple = await api("/suppliers", "POST", { name: "Apple Store", type: "physical", rating: 5, tags: ["靠谱", "售后好"], website: "https://apple.com", is_favorite: true, notes: "官方渠道" });
  const namec = await api("/suppliers", "POST", { name: "Namesilo", type: "digital", rating: 4, tags: ["性价比"], website: "https://namesilo.com", is_favorite: true });

  // 资产
  const mac = await api("/assets", "POST", { name: "MacBook Pro 14", type: "physical", category: "physical.laptop", purchase_date: d(-500), purchase_price: 14999, tags: ["主力设备"], notes: "主力开发机，键盘手感一流", supplier_id: apple.id, ext: { model: "M3 Pro 36G", location: "书房", quantity: 1, unit: "台", warranty_expiry: d(200), current_value: 11000 } });
  const cam = await api("/assets", "POST", { name: "富士 X100VI", type: "physical", category: "physical.camera", purchase_date: d(-120), purchase_price: 11390, tags: ["摄影"], ext: { location: "防潮箱", serial_number: "FX-2024-881" } });
  const lens = await api("/assets", "POST", { name: "WCL-X100 广角镜", type: "physical", category: "physical.other", purchase_date: d(-90), purchase_price: 3290, notes: "吃灰重灾区" });
  const domain = await api("/assets", "POST", { name: "logan.art", type: "digital", category: "digital.domain", purchase_date: d(-800), purchase_price: 288, supplier_id: namec.id, ext: { platform: "Namesilo", expiry_date: d(25) } });
  const course = await api("/assets", "POST", { name: "Blender 全面建模课", type: "digital", category: "digital.course", purchase_date: d(-200), purchase_price: 599, ext: { platform: "Udemy" } });
  const glm = await api("/assets", "POST", { name: "GLM Coding Plan", type: "subscription", category: "subscription.saas", purchase_date: d(-100), purchase_price: 40, ext: { billing_cycle: "monthly", amount: 40, next_billing_date: d(5), usage_frequency: "daily" } });
  const netflix = await api("/assets", "POST", { name: "Netflix 标准档", type: "subscription", category: "subscription.streaming", purchase_date: d(-400), purchase_price: 65, ext: { billing_cycle: "monthly", amount: 65, next_billing_date: d(3), usage_frequency: "rarely" } });
  await api("/assets", "POST", { name: "Figma 专业版", type: "subscription", category: "subscription.saas", purchase_date: d(-300), purchase_price: 90, ext: { billing_cycle: "yearly", amount: 1080, next_billing_date: d(60) } });

  // 使用事件（跨月：本月多次 + 上月若干 + 一次很久前）
  const uses: Array<[string, number, number | undefined, string?]> = [
    [mac.id, 0, 180, "重构了数据库层"], [mac.id, 0, 95], [mac.id, -1, 240], [mac.id, -2, 300], [mac.id, -35, 420], [mac.id, -70, 360],
    [cam.id, -2, 90, "城市夜景扫街"], [cam.id, -40, 60, "公园人像"],
    [course.id, -3, 75, "硬表面建模章节"], [course.id, -33, 120],
    [glm.id, 0, 60], [glm.id, -1, 45], [glm.id, -5, 90],
    [domain.id, -20, 10, "续费配置"],
  ];
  for (const [assetId, off, dur, note] of uses) {
    await api(`/assets/${assetId}/usage-events`, "POST", { used_at: d(off), duration_minutes: dur, note });
  }

  // 关联
  await api("/relations", "POST", { source_id: cam.id, target_id: lens.id, relation: "related_to" });
  await api("/relations", "POST", { source_id: mac.id, target_id: glm.id, relation: "depends_on" });
  await api("/relations", "POST", { source_id: domain.id, target_id: namec.id ? namec.id : domain.id, relation: "related_to" }).catch(() => {});
  await api("/relations", "POST", { source_id: cam.id, target_id: course.id, relation: "related_to" });
  await api("/relations", "POST", { source_id: mac.id, target_id: domain.id, relation: "depends_on" });

  // 唤醒清单
  const wake = await api("/checklists", "POST", { title: "唤醒计划", scenario: "custom", items: [{ content: "使用一次「WCL-X100 广角镜」", asset_id: lens.id }, { content: "使用一次「Blender 全面建模课」", asset_id: course.id }] });
  const trip = await api("/checklists", "POST", { title: "日本出差 · 12月", scenario: "business_trip", due_date: d(18), items: [{ content: "带 MacBook + 充电器", asset_id: mac.id }, { content: "相机 + 广角镜", asset_id: cam.id }, { content: "护照检查" }] });

  // 通知
  await api("/notifications/scan", "POST");

  const shot = async (name: string, path: string, mobile = false) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    else await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  };

  await shot("desktop-dashboard", "/");
  await shot("desktop-assets", "/assets");
  await shot("desktop-asset-detail", `/assets/${mac.id}`);
  await shot("desktop-cpu-sort", "/assets?sort=cpu");
  await shot("desktop-relations", "/relations");
  await shot("desktop-checklists", "/checklists");
  await shot("desktop-checklist-detail", `/checklists/${trip.id}`);
  await shot("desktop-notifications", "/notifications");
  await shot("desktop-suppliers", "/suppliers");
  await shot("desktop-export", "/export");
  await shot("desktop-import", "/import");
  await shot("mobile-dashboard", "/", true);
  await shot("mobile-assets", "/assets", true);
  await shot("mobile-relations", "/relations", true);
  await shot("mobile-asset-detail", `/assets/${cam.id}`, true);
});
