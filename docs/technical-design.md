# MetaVault 技术设计 v0.5

## 1. 数据库设计

### 1.1 设计原则

- 统一资产表 + 类型扩展字段用JSON存储，避免无限列扩展
- 关联关系独立表，支持双向查询
- 供应商独立表，与资产通过外键关联
- 提醒独立表，支持批量扫描

### 1.2 ER关系

```
assets ──< asset_relations >── assets
  │
  └──< suppliers (通过 supplier_id)
  │
  └──< notifications (通过 asset_id)
```

### 1.3 表结构

#### assets（资产主表）

```sql
CREATE TABLE assets (
  id            TEXT PRIMARY KEY,          -- UUID
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK(type IN ('physical','digital','subscription')),
  category      TEXT NOT NULL,             -- 如 'physical.laptop', 'digital.course'
  status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','idle','expired','disposed')),
  tags          TEXT DEFAULT '[]',         -- JSON数组
  purchase_date TEXT,                      -- ISO 8601日期
  purchase_price REAL,
  currency      TEXT DEFAULT 'CNY',
  supplier_id   TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  notes         TEXT,
  -- 类型扩展字段（JSON，结构由type+category决定）
  ext           TEXT DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_assets_type ON assets(type);
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_category ON assets(category);
CREATE INDEX idx_assets_supplier ON assets(supplier_id);
```

**ext字段结构约定：**

physical:
```json
{
  "model": "MacBook Pro 14 M3 Pro",
  "quantity": 1,
  "unit": "台",
  "location": "书房",
  "usage": "日常办公",
  "owner": "LoganLink",
  "source": "purchase",
  "warranty_expiry": "2026-12-01",
  "warranty_info": "AppleCare+",
  "depreciation_rate": 0.2,
  "current_value": 8000,
  "serial_number": "XXX",
  "condition": "good"
}
```

digital:
```json
{
  "access_url": "https://...",
  "expiry_date": "2026-12-01",
  "platform": "Udemy",
  "usage_stats": { "progress": 0.6, "last_study": "2026-05-01", "total_hours": 12 },
  "file_size": null,
  "file_format": null
}
```

subscription:
```json
{
  "billing_cycle": "yearly",
  "next_billing_date": "2026-12-01",
  "amount": 99,
  "auto_renew": true,
  "usage_frequency": "weekly",
  "cancellation_url": "https://...",
  "trial_end": null,
  "screenshots": ["path/to/screenshot1.png"]
}
```

#### suppliers（供应商表）

```sql
CREATE TABLE suppliers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK(type IN ('physical','digital','subscription','mixed')),
  rating      INTEGER CHECK(rating BETWEEN 1 AND 5),
  tags        TEXT DEFAULT '[]',
  contact     TEXT,
  website     TEXT,
  notes       TEXT,
  is_favorite INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### asset_relations（资产关联表）

```sql
CREATE TABLE asset_relations (
  id          TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  relation    TEXT NOT NULL CHECK(relation IN ('depends_on','contains','bound_to','related_to')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_id, target_id, relation)
);

CREATE INDEX idx_relations_source ON asset_relations(source_id);
CREATE INDEX idx_relations_target ON asset_relations(target_id);
```

#### notifications（提醒表）

```sql
CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  asset_id    TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK(type IN ('warranty_expiry','subscription_renewal','digital_expiry','trial_expiry','usage_stagnation','deprecation','cancellation_suggestion','replacement_suggestion')),
  message     TEXT NOT NULL,
  trigger_date TEXT NOT NULL,              -- 提醒触发日期
  is_read     INTEGER DEFAULT 0,
  is_dismissed INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_asset ON notifications(asset_id);
CREATE INDEX idx_notifications_trigger ON notifications(trigger_date);
CREATE INDEX idx_notifications_unread ON notifications(is_read, is_dismissed);
```

#### screenshots（截图表）— 已实现

```sql
CREATE TABLE IF NOT EXISTS screenshots (
  id          TEXT PRIMARY KEY,
  asset_id    TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  original_name TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_screenshots_asset ON screenshots(asset_id);
```

#### push_subscriptions（推送订阅表）— 已实现

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id        TEXT PRIMARY KEY,
  endpoint  TEXT NOT NULL UNIQUE,
  p256dh    TEXT NOT NULL,
  auth      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 2. 前端架构

### 2.1 目录结构

```
client/src/
├── main.tsx                    # 入口（QueryClientProvider + BrowserRouter）
├── App.tsx                     # 路由定义
├── lib/
│   ├── api-client.ts           # fetch 基础封装
│   ├── api-assets.ts           # 资产 API
│   ├── api-suppliers.ts        # 供应商 API
│   ├── api-relations.ts        # 关联 API
│   ├── api-notifications.ts    # 提醒 API
│   ├── api-import.ts           # 导入 API
│   ├── api-export.ts           # 导出 API
│   ├── api-dashboard.ts        # 仪表盘 API
│   └── utils.ts                # shadcn/ui cn() 工具
├── hooks/
│   ├── useAssets.ts            # 资产 CRUD hooks
│   ├── useSuppliers.ts         # 供应商 CRUD hooks
│   ├── useRelations.ts         # 关联 CRUD hooks
│   ├── useNotifications.ts     # 提醒 hooks
│   └── useDashboard.ts         # 仪表盘统计 hooks
├── components/
│   ├── ui/                     # shadcn/ui 组件（Card/CardColorBar, Badge含类型variant）
│   ├── layout/
│   │   ├── Sidebar.tsx         # 侧边导航（>=768px 显示）
│   │   ├── BottomNav.tsx       # 底部 Tab 导航（<768px 显示）
│   │   ├── Header.tsx          # 顶部栏（搜索+通知面板）
│   │   └── AppLayout.tsx       # 布局容器
│   ├── asset/
│   │   ├── AssetList.tsx       # 资产列表（快速筛选标签栏 + Select 下拉 + 卡片网格）
│   │   ├── AssetDetail.tsx     # 资产详情（含物理资产当前估值+折旧条）
│   │   └── AssetForm.tsx       # 资产创建/编辑表单
│   ├── supplier/
│   │   ├── SupplierList.tsx    # 供应商列表
│   │   ├── SupplierDetail.tsx  # 供应商详情
│   │   └── SupplierForm.tsx    # 供应商表单
│   ├── dashboard/
│   │   ├── Dashboard.tsx       # 仪表盘主组件（6格统计条+类型分布条+甘特+日历+提醒）
│   │   ├── GanttTimeline.tsx   # 到期热力条（近60天，SVG制图学风格，条可点击跳转资产详情）
│   │   ├── MiniCalendar.tsx    # 日历组件（年月跳转+类型色点标记）
│   │   └── [内联] ReminderPanel / TypeDistribution / MonthlyExpirySummary
│   ├── import/
│   │   └── ImportWizard.tsx    # 导入向导（拖拽上传→预览→映射→导入）
│   ├── export/
│   │   └── ExportPage.tsx      # 数据导出（资产/供应商Excel导出）
│   ├── notification/
│   │   └── NotificationPage.tsx # 通知页面（未读/全部+批量操作）
│   ├── relation/
│   │   └── RelationManager.tsx  # 关联管理（搜索+添加+移除）
│   ├── ErrorBoundary.tsx        # 全局错误边界
├── types/
│   └── asset.ts                # 资产类型定义
└── index.css                   # Tailwind v4 @theme inline + 时空融合 v2 色系（暖纸色+墨色+类型三色）
```

### 2.2 路由结构

```
/                     → DashboardPage        仪表盘
/assets               → AssetListPage        资产列表（支持 URL 筛选参数：?type=&status=&sort=&q=）
/assets/:id           → AssetDetailPage      资产详情
/assets/new           → AssetForm（新建模式）
/assets/:id/edit      → AssetForm（编辑模式）
/suppliers            → SupplierListPage     供应商列表
/suppliers/:id        → SupplierDetailPage   供应商详情
/suppliers/new        → SupplierForm（新建）
/suppliers/:id/edit   → SupplierForm（编辑）
/import               → ImportPage           数据导入
/export               → ExportPage           数据导出
/notifications        → NotificationPage     通知页面
```

资产列表 URL 参数：`type`（physical/digital/subscription）、`status`（active/idle/expired/disposed）、`sort`（name/price/created_at/updated_at）、`q`（搜索）

### 2.3 页面布局

**桌面端（>=768px）：**
```
┌──────────────────────────────────────────────┐
│  Header [搜索框]                    [通知铃铛]  │
├────────┬─────────────────────────────────────┤
│        │                                     │
│  侧边栏  │           主内容区                  │
│        │                                     │
│  仪表盘  │                                     │
│  资产   │                                     │
│  供应商  │                                     │
│  导入   │                                     │
│  导出   │                                     │
│        │                                     │
└────────┴─────────────────────────────────────┘
```

**移动端（<768px）：**
```
┌──────────────────────┐
│  Header [🔍] [🔔]    │
├──────────────────────┤
│                      │
│     主内容区          │
│                      │
├──────────────────────┤
│ 仪表盘│资产│供应商│导入 │  ← 底部 Tab
└──────────────────────┘
```

侧边栏桌面常驻，手机端隐藏。手机端搜索变为图标点击展开，底部 Tab 导航替代侧边栏。使用 `100dvh` 视口单位 + `safe-area-inset-bottom` 适配 iPhone。

---

## 3. 前后端交互架构

### 3.1 通信方式

```
前端 (React)  ←→  HTTP REST API  ←→  Express 后端  ←→  SQLite
```

- **数据操作：** 前端通过 `fetch()` 调用 `/api/*` REST 端点
- **文件上传：** 数据导入通过 `multipart/form-data` 上传
- **开发代理：** Vite dev server 将 `/api` 请求代理到 `localhost:3001`

### 3.2 REST API 设计

| 路径 | 方法 | 功能 |
|------|------|------|
| `/api/assets` | GET/POST | 列表（带筛选+排序）/创建 |
| `/api/assets/:id` | GET/PUT/DELETE | 详情/更新/删除 |
| `/api/suppliers` | GET | 列表（支持 type/favorite 过滤） |
| `/api/suppliers/:id` | GET/PUT/DELETE | 详情/更新/删除 |
| `/api/suppliers/:id/favorite` | PATCH | 切换收藏 |
| `/api/relations/:assetId` | GET | 获取关联 |
| `/api/relations` | POST | 添加关联 |
| `/api/relations/:id` | DELETE | 删除关联 |
| `/api/notifications` | GET | 列表 |
| `/api/notifications/:id/read` | PATCH | 标记已读 |
| `/api/notifications/:id/dismiss` | PATCH | 忽略 |
| `/api/notifications/scan` | POST | 触发扫描 |
| `/api/notifications/vapid-public-key` | GET | 获取 VAPID 公钥 |
| `/api/notifications/subscribe` | POST | 保存推送订阅 |
| `/api/notifications/subscribe` | DELETE | 删除推送订阅 |
| `/api/import/parse` | POST | 上传+解析预览 |
| `/api/import/execute` | POST | 确认导入 |
| `/api/export/assets` | GET | 导出资产Excel |
| `/api/export/suppliers` | GET | 导出供应商Excel |
| `/api/dashboard/overview` | GET | 总览统计 |
| `/api/dashboard/subscriptions` | GET | 订阅费用 |
| `/api/dashboard/health` | GET | 健康度 |
| `/api/dashboard/trends` | GET | 订阅月费用趋势 |
| `/api/assets/:id/usage` | PATCH | 标记数字资产已使用 |
| `/api/assets/:id/screenshot` | POST | 上传订阅截图 |
| `/api/assets/ocr` | POST | OCR 识别订阅截图 |

**安全：** 全部使用参数化查询防 SQL 注入。POST/PUT 端点通过 `middleware/validate.ts` 校验必填字段、枚举值、UUID 格式等，非法输入返回 400。文件路径用 `path.resolve + startsWith` 防路径穿越。

### 3.3 数据流

```
用户操作 → React组件 → hook调用 → fetch(REST API) → SQL执行 → 返回JSON → hook更新状态 → 组件重渲染
```

不引入全局状态管理库（Redux/Zustand等），个人应用规模不需要。数据获取和缓存通过React Query处理：
- 自动缓存 + 后台刷新（staleTime 5分钟）
- 创建/编辑后 invalidateQueries 刷新列表
- 失败自动重试（retry 1）

---

## 4. 提醒系统设计

### 4.1 扫描策略

应用启动时 + 每小时定时扫描一次，检查以下条件：

| 提醒类型 | 扫描逻辑 |
|---------|---------|
| warranty_expiry | physical.ext → warranty_expiry - 30天 <= 今天 |
| subscription_renewal | subscription.ext → next_billing_date - 7天 <= 今天 |
| digital_expiry | digital.ext → expiry_date - 30天 <= 今天 |
| trial_expiry | subscription.ext → trial_end - 3天 <= 今天 |
| usage_stagnation | digital.ext → usage_stats.last_access + 30天 <= 今天 |
| deprecation | physical.ext → current_value <= purchase_price * 0.1 |
| cancellation_suggestion | subscription.ext → usage_frequency="rarely" + next_billing_date - 7天 <= 今天 |
| replacement_suggestion | physical.ext → current_value <= purchase_price * 0.1 + 有收藏的 physical/mixed 供应商 |

### 4.2 去重

同一资产 + 同一提醒类型 + 同一触发日期，只生成一条提醒。已dismiss的不重复生成。

---

## 5. 数据导入设计

### 5.1 通用流程

```
选择文件 → 解析 → 预览前10行 → 用户映射列 → 确认 → 批量插入 → 显示结果
```

### 5.2 Notion导入预设

Notion导出CSV的常见列名自动映射：
- Name → name
- Type → category
- Status → status
- Price → purchase_price
- Date → purchase_date
- URL → ext.access_url

用户可在此基础上调整映射。

---

## 6. E2E 测试架构

### 6.1 技术选型

- **Playwright** — 浏览器自动化测试框架
- **生产构建测试** — 测试运行在 `pnpm build` 后的生产构建上，而非 dev server
- **API 种子数据** — 通过 REST API 创建测试数据，不直接操作数据库

### 6.2 目录结构

```
e2e/
├── playwright.config.ts       # Playwright 配置（自动启动生产服务器）
├── fixtures/
│   ├── test-fixtures.ts       # 自定义 test fixture（每个测试前重置 DB）
│   ├── seed.ts                # API 种子函数（resetDb, createAsset, createSupplier, scanNotifications）
│   └── test-data.ts           # 测试数据常量
├── helpers/
│   └── common.ts              # 通用测试辅助函数
└── specs/
    ├── dashboard.spec.ts      # 仪表盘（空态 / 有数据 / 图表渲染）
    ├── asset-crud.spec.ts     # 资产查看 / 删除 / 表单创建物理/数字 / 编辑（5 个测试）
    ├── asset-list.spec.ts     # 资产列表筛选 / 搜索 / 排序 / 批量操作（7 个测试）
    ├── supplier-crud.spec.ts  # 供应商查看 / 删除 / 创建 / 编辑 / 收藏切换（5 个测试）
    ├── cross-nav.spec.ts      # 跨页面导航（资产→供应商）
    ├── import-export.spec.ts  # 数据导出（资产/供应商 Excel）
    ├── import.spec.ts         # CSV 导入流程 / 非 CSV 文件拒绝
    ├── notifications.spec.ts  # 通知查看 / 忽略 / 批量已读 / 批量忽略（4 个测试）
    ├── relation.spec.ts       # 关联添加 / 删除 / 影响提示（3 个测试）
    ├── ocr.spec.ts            # 订阅截图上传
    ├── mobile.spec.ts         # 移动端底部导航
    └── debug-dashboard.spec.ts # 调试用仪表盘截图
```

### 6.3 测试隔离

- 每个测试前通过 `POST /api/test/reset` 清空所有表
- `DB_PATH` 环境变量指向独立测试数据库 `data/metavault-test.db`
- `NODE_ENV=test` 启用测试专用 reset 端点
- 自定义 fixture 自动处理重置：

```typescript
export const test = base.extend({
  page: async ({ page }, use) => {
    await resetDb();
    await use(page);
  },
});
```

### 6.4 表单测试与 React 19

Playwright 的 `fill()` 在当前版本可以正确触发 React 19 的 onChange 事件（2026-05-28 验证通过）。推荐直接使用 `fill()` 而非 `evaluate` + `nativeInputValueSetter` 方式，后者仅为备用方案。

shadcn/ui 的 Radix Select 组件在 DOM 中表现为 `combobox` role（不是 `button`），选择器需用 `page.locator("main form").getByRole("combobox")` 限定在表单内。

关键注意事项：
- **Radix Select 类型切换**：切换资产类型时，分类 Select 的选项列表变化，当前值不在新列表中会触发 `onValueChange("")`。AssetForm 已在分类 Select 的 onValueChange 中忽略空值，防止 category 被覆盖。
- **表单定位器**：Header 搜索框也在 `<form>` 内，`page.locator("form input")` 会匹配搜索框。需用 `page.locator("main form input")` 排除。
- **收藏验证**：SQLite 存储 `is_favorite` 为 `1`/`0` 不是 `true`/`false`，断言用 `toBeTruthy()` 不是 `toBe(true)`。
- **waitForURL 匹配**：`**/assets/*` 会匹配 `/assets/new`，跳转验证需用正则 `/\/assets\/[0-9a-f-]+$/` 排除新建页面路径。

### 6.5 运行命令

```bash
pnpm e2e          # 构建并运行全部 E2E 测试
pnpm e2e:headed   # 有头模式，可视化调试
```

---

## 7. 设计风格探索

### 7.1 目录结构

```
docs/design-exploration/
├── index.html                    # 画廊索引页（缩略图+跳转）
├── screenshots/                  # 21 张全页截图（PNG）
├── 01-minimal-luxury.html        # 极简高级风
├── 02-apple-product.html         # Apple 产品官网风
├── 03-swiss-international.html   # 瑞士国际主义风
├── 04-bento-grid.html            # Bento 卡片风
├── 05-dark-saas.html             # 深色科技 SaaS 风
├── 06-design-system.html         # 设计系统风
├── 07-glassmorphism.html         # 玻璃拟态风
├── 08-3d-immersive.html          # 3D 沉浸风
├── 09-data-viz.html              # 数据可视化风
├── 10-magazine-editorial.html    # 杂志编辑风
├── 11-dynamic-typography.html    # 动态排版风
├── 12-fullscreen-visual.html     # 全屏视觉风
├── 13-neo-brutalism.html         # 新野兽派
├── 14-retro-futurism.html        # 复古未来主义
├── 15-y2k-digital.html           # Y2K 数字风
├── 16-illustration-brand.html    # 插画品牌风
├── 17-handwritten-graffiti.html  # 手写涂鸦风
├── 18-organic-nature.html        # 有机自然风
├── 19-financial-terminal.html    # 金融终端风
├── 20-timeline.html              # 日历时间线风
├── 21-territory-map.html         # 地图空间风
├── 22-space-time-fusion.html     # 时空融合风（地图+时间线，双页路由：总览/关联关系）
└── 23-space-time-v2.html        # 时空融合 v2（总览=22风格，关联关系=严格复制21号领地地图）
```

每个文件为完整独立 HTML（仅依赖 Google Fonts CDN），包含仪表盘全部数据区域。双击即可在浏览器中查看。
