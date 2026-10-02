import { test as base, expect } from "@playwright/test";
import { resetDb } from "./seed.js";

export const test = base.extend({
  page: async ({ page }, use) => {
    // 拦截外部字体请求：模块脚本会等样式表，Google Fonts 网络抖动会挂起整页导航；
    // 应用带本地字体回退栈（PingFang/雅黑），测试断言不受影响
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
    await resetDb();
    await use(page);
  },
});

export { expect };
