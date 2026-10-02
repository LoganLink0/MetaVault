# MetaVault - 资产管理工具

## 项目概述
统一管理物理资产、数字资产、产品订阅的 Web 应用。核心价值：数据打通、关联追踪、智能提醒。移动端适配。

## 技术栈
- 后端：Node.js + Express 5 + better-sqlite3
- 前端：React 19 + TypeScript + Vite + Tailwind CSS v4
- UI：shadcn/ui + sonner（toast 通知）
- 设计风格：时空融合 v2（暖纸色+墨色+制图学纹理，源自 23-space-time-v2.html）
- 字体：Space Grotesk（标题）+ DM Sans（正文）+ JetBrains Mono（数字）+ Cinzel（关联页）
- 色系：物理蓝 #3B6B8A / 数字紫 #9B8EC4 / 订阅金 #D4A843 / 警告红 #E74C3C
- 数据获取：React Query v5
- 路由：React Router v7
- 包管理：pnpm workspace monorepo

## 目录结构
```
/client       - React前端（Vite + Tailwind + shadcn/ui）
  src/
    components/   UI 组件（asset / supplier / dashboard / checklist / import / export / notification / relation / layout）
    hooks/        React Query hooks
    lib/          API 封装（api-client + api-*）
    types/        TypeScript 类型
    components/dashboard/  仪表盘子组件（GanttTimeline + MiniCalendar + ReminderPanel + TypeDistribution + MonthlyExpirySummary）
    components/checklist/  清单组件（ChecklistList + ChecklistDetail + ChecklistForm + templates 场景模板）
/server       - Node.js后端（Express + better-sqlite3）
  src/
    db/           数据库初始化（init.sql + init.ts）
    routes/       REST API 路由（assets / suppliers / relations / notifications / checklists / import / dashboard / export）
    services/     提醒扫描 + OCR识别 + Web Push服务
    middleware/    输入校验 + 错误处理
/e2e          - Playwright E2E 测试
  fixtures/      测试夹具（DB重置 + 种子数据 + 测试数据常量）
  helpers/       测试辅助工具
  specs/         测试用例（13 个 spec 文件，47 个测试）
/docs         - 产品文档（PRD / 技术设计 / 设计风格探索）
```

## 设计风格

已采用 `docs/design-exploration/23-space-time-v2.html` 的时空融合 v2 方案作为项目视觉设计。核心特征：

- 暖纸色背景 `#F5F0EB` + 墨色主文本 `#2c2418` + 制图学纹理（body::before 径向渐变+细线网格）
- 三色类型体系：物理蓝 `#3B6B8A` / 数字紫 `#9B8EC4` / 订阅金 `#D4A843`，8% 透明度淡色背景
- 6格统计网格（stats-strip）+ 卡片左侧色条（CardColorBar）+ 导航虚线装饰 + 脉冲动画
- 全局通过 CSS 变量驱动（index.css @theme inline），类型颜色注册为 `--color-phy/dig/sub/wrn/ink/pg` 等

`docs/design-exploration/` 保留 23 个设计稿供参考（01~23），`index.html` 为画廊索引页。

### v0.9.2 视觉工艺层（Awwards 级打磨）

- **文字安全色阶：** 三色原值对纸底对比度不足 3:1，凡用作文字/小图标一律切换 strong 档（`--color-dig-strong #6B5F9E / sub-strong #8D6810 / wrn-strong #C0392B / grn #2E7351`，均 ≥4.5:1）；原色仅用于色点/淡底/装饰
- **字体栈：** 显式中日韩回退（PingFang SC → HarmonyOS Sans SC → Microsoft YaHei UI → Noto Sans SC）；全局 `tabular-nums` 等宽数字
- **动效系统（index.css）：** `page-enter` 路由淡入上浮 320ms / `rise-item` 卡片交错入场 / `pop-item` SVG 节点弹性（transform-box: fill-box）/ `edge-in` 连线交错淡入 / `.shimmer` 骨架光泽 / `.card-lift` 悬停抬升；曲线统一 ease-out 家族，入场 ≤600ms、交互 ≤200ms，`prefers-reduced-motion` 全局降级
- **全局工艺：** focus-visible 墨色焦点环、纸质滚动条、墨蓝选区、Header/底部导航毛玻璃、按钮点按 scale 0.98、勾选图标弹性落章 + aria-pressed、移动端底部导航活动指示点
- **签名元素：** 关联领地中心罗盘（24 刻度环 + Cinzel 北标）与两圈虚线测绘环；仪表盘 Survey 眉题日期戳
- **量化审计：** `e2e/polish.config.ts` + `e2e/polish/audit.spec.ts` 用计算样式断言工艺层真实生效（对比度/动画名/终值/焦点环/降级）；`baseline.spec.ts` 可重生成 `polish-shots/` 截图（已 gitignore）
- **测试稳定性：** 共享 fixture 拦截 Google Fonts 请求（模块脚本等样式表，字体 CDN 抖动会挂起整页导航）

## 开发命令
- `pnpm dev` — 同时启动前后端
- `pnpm dev:client` — 仅前端（localhost:5174）
- `pnpm dev:server` — 仅后端（localhost:3001）
- `pnpm build` — 构建前后端
- `pnpm e2e` — 构建并运行 E2E 测试
- `pnpm e2e:headed` — 构建并运行 E2E 测试（有头模式）

## 环境变量
- `PORT` — 服务端口（默认 3001）
- `DB_PATH` — SQLite 数据库路径（默认 ./data/metavault.db，E2E 测试用独立路径）
- `NODE_ENV` — 设为 `test` 时启用 `/api/test/reset` 端点
- `VISION_API_KEY` — 视觉识别 API 密钥（订阅截图 OCR，OpenAI 兼容接口，默认智谱；未配置时 OCR 接口 503）
- `VISION_MODEL` — 视觉模型名（默认 glm-5.3-flash，可换 glm-4.6v-flashx 等）
- `VISION_API_BASE` — 可选，切换视觉 API 服务地址

## 功能清单
- 资产 CRUD（物理/数字/订阅三类，扩展字段 JSON 存储）
- 资产批量操作（批量修改状态、批量删除）
- 场景化检查清单（出差/旅行/日常检查/搬家/自定义，模板+持有资产自动生成清单项，勾选进度/整体完成/归档，条目可关联资产）
- 优秀供应商管理（CRUD + 收藏 + 关联资产展示）
- 资产关联（depends_on / contains / bound_to / related_to，详情页可添加/移除）
- 提醒系统（9 种类型，含清单到期，启动时 + 每小时自动扫描）
- Web Push 通知（VAPID，浏览器推送）
- 统计仪表盘（6格统计条 + 类型分布条 + 到期热力条甘特 + 日历 + 提醒/建议区域，甘特条可点击跳转资产详情）
- 数据导入（CSV / Excel，字段映射 + 预览，拖拽上传）
- 数据导出（Excel 格式导出资产和供应商数据）
- 全局搜索（Header 搜索栏驱动资产列表筛选）
- 通知页面（未读/全部筛选，批量已读/忽略，资产名可点击跳转详情）
- 订阅截图上传 + OCR 识别（视觉大模型 GLM 直出 JSON，VISION_API_KEY 未配置时返回 503 提示手动填写）
- 资产列表排序（名称/价格/创建时间/更新时间）+ URL 筛选参数驱动（?type=&status=&sort=&q=）
- 移动端适配（<768px 底部 Tab，>=768px 侧边栏）
- 前端错误边界（ErrorBoundary 包裹路由，页面崩溃不卸载整个应用）
- 删除资产关联影响提示
- 使用日志/二次消费记录（v0.6：usage_events 表，三类资产通用，一键记今天/补录过去日期+次数/历史倒序+删除；PATCH /usage 升级为兼容别名；disposed/expired 拒绝记新事件）
- 单次使用成本 CP/U（v0.6：purchase_price ÷ 使用次数，详情页展示 + 列表 sort=cpu 最少使用优先（同次数价高排前）；订阅不参与展示；资产列表/详情带 usage_count）
- 仪表盘二次消费面板（v0.6：二次消费率（近90天有使用资产占比，排除已处置/过期）+ 吃灰榜最久未用 Top10，点击跳详情）
- 唤醒闭环（v0.6：checklists.kind=wake_up 唤醒计划清单；吃灰榜/详情页一键安排使用，同清单同资产未勾选去重；勾选 0→1 自动记使用 source=checklist（complete 逐条判定），取消不回删；普通清单勾选不记使用）
- 提醒扫描 v0.6 升级（使用停滞覆盖三类资产以 usage_events 为准；取消建议改真实使用数据驱动（近60天0次且到手满60天），手动频率仅回退；停滞提醒 dismiss 后停滞窗口内不重生）
- Obsidian 使用历史往返（v0.8：导出正文「## 使用记录」+ frontmatter 派生键 usage_count/last_used；导入按 日期+时长+备注 去重合并只增不删；Excel 资产导出加使用次数/最近使用列）
- 月度回顾（v0.8：仪表盘卡片，本月二次消费次数/在用资产/唤醒件数（首次使用落本月）+ 最常用 Top3；v0.9 往月翻看）
- 关联领地类型过滤（v0.9：物理/数字/订阅筛选可见节点与关联边）
- 使用历史分页加载（v0.9：单页 200 条增量拉取）+ 金额符号按币种显示（currencySymbol 工具）
- 物理资产详情页当前估值+折旧条（current_value → purchase_price 百分比）
- 资产列表快速筛选标签栏（类型+状态，URL 参数驱动）
- 关联资产摘要行（按关系类型分组计数）
- 关联领地可视化图（v0.9：/relations 手绘 SVG 环形图，节点=资产类型色点、边=四种关系线色/线型，hover 高亮、点击跳详情，孤儿提示；侧边栏+底部第 5 Tab 入口）
- 采购建议（收藏供应商推荐、续费决策、折旧替换建议）

## 移动端适配
- < 768px：底部 Tab 导航，搜索图标点击展开
- >= 768px：侧边栏常驻，搜索框常显
- 使用 100dvh 视口单位 + safe-area-inset-bottom

## 开发规范
- 文档先行：产品变更先改文档，再改代码
- 中文写文档和注释，代码标识符用英文
- 提交信息格式：`type(scope): description`，type包括 feat/fix/docs/refactor
- 币种默认CNY，MVP不存敏感凭证
- 全部使用参数化查询防SQL注入
- 服务端输入校验（validate.ts 中间件，字段类型/枚举/范围校验）
- Import 路径遍历防护（filePath 限制在 uploads/ 目录内）
- 历史问题与教训记录：见 `~/.claude/projects/E--AIPROJECT-GLM-MetaVault/memory/question.md`