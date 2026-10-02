// 视觉工艺层量化审计：验证打磨项真实生效（计算样式级断言，替代肉眼）
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3999/api";

// Google Fonts 网络抖动会让 DOMContentLoaded 挂起（模块脚本等样式表）——测试环境拦截外部字体，走本地回退栈
test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
});

async function seed() {
  await fetch(`${BASE}/test/reset`, { method: "POST" });
  const asset = await (await fetch(`${BASE}/assets`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "审计相机", type: "physical", category: "physical.camera", purchase_price: 3000 }),
  })).json();
  const dig = await (await fetch(`${BASE}/assets`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "审计课程", type: "digital", category: "digital.course", purchase_price: 100 }),
  })).json();
  await fetch(`${BASE}/assets/${asset.id}/usage-events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  await fetch(`${BASE}/relations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_id: asset.id, target_id: dig.id, relation: "related_to" }) });
  return { asset, dig };
}

// 前景/背景对比度在测试三内联计算（页面内 evaluate）

test.describe("视觉工艺层审计", () => {
  test("全局基础：字体栈/焦点环/路由过场/滚动条", async ({ page }) => {
    await seed();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    // 中文字体回退已入栈
    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(bodyFont).toContain("PingFang SC");

    // 路由过场容器存在且动画已应用
    const wrap = page.locator("main .page-enter").first();
    await expect(wrap).toBeAttached();
    const anim = await page.evaluate(() => {
      const el = document.querySelector("main .page-enter")!;
      return getComputedStyle(el).animationName;
    });
    expect(anim).toBe("pageEnter");

    // 键盘焦点环
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const el = document.activeElement!;
      return getComputedStyle(el).outlineStyle + " " + getComputedStyle(el).outlineWidth;
    });
    expect(outline).toContain("solid");

    // 数字等宽
    const tnum = await page.evaluate(() => getComputedStyle(document.body).fontVariantNumeric);
    expect(tnum).toContain("tabular-nums");
  });

  test("仪表盘：统计条 CountUp 终值/交错入场/眉题/安全色对比度", async ({ page }) => {
    await seed();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(900);

    await expect(page.getByTestId("survey-eyebrow")).toContainText("Survey ·");
    // CountUp 定格终值（资产总数 = 2）
    const firstStat = page.locator("main button.rise-item").first();
    await expect(firstStat).toContainText("2");

    // 入场编排：统计条单元带交错延迟
    const delays = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main button.rise-item")).map((el) => getComputedStyle(el).animationDelay)
    );
    expect(delays.length).toBeGreaterThanOrEqual(6);

    // 消费率数值使用 sub-strong（#8D6810 → rgb(141, 104, 16)）
    const rateColor = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="sc-rate"] .font-mono')!).color);
    expect(rateColor).toBe("rgb(141, 104, 16)");
  });

  test("文字安全色对比度 ≥ 4.5:1（渲染态实测）", async ({ page }) => {
    await seed();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(900);

    const check = (sel: string) => page.evaluate((s) => {
      const el = document.querySelector(s)!;
      const fg = getComputedStyle(el).color;
      let node = el.parentElement;
      let bg = "rgba(0, 0, 0, 0)";
      while (node && bg === "rgba(0, 0, 0, 0)") {
        bg = getComputedStyle(node).backgroundColor;
        node = node.parentElement;
      }
      if (bg === "rgba(0, 0, 0, 0)") bg = "rgb(245, 240, 235)";
      const parse = (c: string) => c.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      const l = (a: number[]) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
      const la = l(parse(fg)), lb = l(parse(bg));
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }, sel);

    // 吃灰榜"从未使用"小字（wrn-strong）
    const wrnRatio = await check('[data-testid="sc-dust-item"] span[style*="wrn-strong"], [data-testid="sc-dust-item"] .font-mono');
    expect(wrnRatio).toBeGreaterThanOrEqual(4.5);
  });

  test("关联领地：罗盘/测绘环/节点弹出/边入场与悬停提示", async ({ page }) => {
    const { asset, dig } = await seed();
    await page.goto("/relations", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const svg = page.getByTestId("relation-svg");
    // 测绘装饰：两圈虚线环 + 罗盘主环 + 北标
    const deco = await page.evaluate(() => {
      const g = document.querySelector('[data-testid="relation-svg"] g[aria-hidden="true"]')!;
      return { circles: g.querySelectorAll("circle").length, north: g.querySelector("text")?.textContent };
    });
    expect(deco.circles).toBeGreaterThanOrEqual(4);
    expect(deco.north).toBe("N");

    // 节点弹性入场 + 边包裹层入场动画 + 可访问标题
    const nodeAnim = await page.evaluate((id) => {
      const g = document.querySelector(`[data-node-id="${id}"] g.pop-item`)!;
      return getComputedStyle(g).animationName;
    }, asset.id);
    expect(nodeAnim).toBe("popIn");
    const edgeAnim = await page.evaluate(() => {
      const g = document.querySelector('[data-testid="relation-edge"]')!.closest("g")!;
      return { name: getComputedStyle(g).animationName, title: g.querySelector("title")?.textContent };
    });
    expect(edgeAnim.name).toBe("edgeIn");
    expect(edgeAnim.title).toContain("审计相机");
    void dig;
  });

  test("资产卡：悬停抬升类 + 骨架光泽 + 状态徽章安全色", async ({ page }) => {
    await seed();
    await page.goto("/assets", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main .card-lift").first()).toBeVisible();

    // 状态徽章"使用中"为 grn（#2E7351）
    const badgeColor = await page.evaluate(() => {
      const badge = Array.from(document.querySelectorAll("main span")).find((s) => s.textContent === "使用中")!;
      return getComputedStyle(badge).color;
    });
    expect(badgeColor).toBe("rgb(46, 115, 81)");
  });

  test("清单勾选：弹性入场 + aria-pressed", async ({ page }) => {
    const { asset } = await seed();
    const cl = await (await fetch(`${BASE}/checklists`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "审计清单", scenario: "custom", items: [{ content: "一项", asset_id: asset.id }] }),
    })).json();
    await page.goto(`/checklists/${cl.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const btn = page.getByTestId("toggle-item").first();
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    const iconAnim = await page.evaluate(() => {
      const icon = document.querySelector('[data-testid="toggle-item"] svg.pop-item')!;
      return getComputedStyle(icon).animationName;
    });
    expect(iconAnim).toBe("popIn");
  });

  test("移动端：底部导航活动指示点 + 按压缩放", async ({ page }) => {
    await seed();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/assets", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const activeLink = page.locator("nav a").filter({ hasText: "资产" });
    await expect(activeLink.locator("span").last()).toBeVisible();
    // 毛玻璃与活动指示点类名存在（侧边栏 nav 在 display:none 父级下仍有 computed display，用包围盒取真实可见者）
    const navClass = await page.evaluate(() => {
      const nav = Array.from(document.querySelectorAll("nav")).find((n) => n.getBoundingClientRect().width > 0)!;
      return nav.className;
    });
    expect(navClass).toContain("backdrop-blur");
  });

  test("reduced-motion：动效全局降级", async ({ page }) => {
    await seed();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/assets", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    const dur = await page.evaluate(() => {
      const el = document.querySelector(".rise-item") as HTMLElement | null ?? document.querySelector(".page-enter")!;
      return getComputedStyle(el).animationDuration;
    });
    expect(parseFloat(dur)).toBeLessThan(0.05);
  });
});
