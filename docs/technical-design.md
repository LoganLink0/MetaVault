# MetaVault 技术设计 v0.9

## 1. 数据库设计

### 1.1 设计原则

- 统一资产表 + 类型扩展字段用JSON存储，避免无限列扩展
- 关联关系独立表，支持双向查询
- 供应商独立表，与资产通过外键关联
- 提醒独立表，支持批量扫描
- 使用事件独立表（usage_events），一次使用一行，不在资产表上加计数列——计数永远实时聚合，避免双写不一致

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

#### notifications（提醒表）— v2

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  asset_id    TEXT REFERENCES assets(id) ON DELETE CASCADE,      -- 可空：清单提醒无关联资产
  checklist_id TEXT REFERENCES checklists(id) ON DELETE CASCADE, -- 可空：资产提醒无关联清单
  type        TEXT NOT NULL CHECK(type IN ('warranty_expiry','subscription_renewal','digital_expiry','trial_expiry','usage_stagnation','deprecation','cancellation_suggestion','replacement_suggestion','checklist_due')),
  message     TEXT NOT NULL,
  trigger_date TEXT NOT NULL,              -- 提醒触发日期
  is_read     INTEGER DEFAULT 0,
  is_dismissed INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_asset ON notifications(asset_id);
CREATE INDEX IF NOT EXISTS idx_notifications_checklist ON notifications(checklist_id);
CREATE INDEX IF NOT EXISTS idx_notifications_trigger ON notifications(trigger_date);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read, is_dismissed);
```

**v2 自动迁移：** 旧库的 notifications 表为 8 种类型 + asset_id NOT NULL，`CREATE TABLE IF NOT EXISTS` 不会更新已存在的表。`init.ts` 在加载 init.sql 后检查 `sqlite_master` 中的建表语句，未包含 `checklist_due` 时执行表重建迁移（关闭外键 → 建 notifications_new → 复制数据 → 换名 → 重建索引 → 开启外键），保留全部历史提醒数据。

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

#### checklists（检查清单表）— 已实现

```sql
CREATE TABLE IF NOT EXISTS checklists (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  scenario    TEXT NOT NULL CHECK(scenario IN ('business_trip','travel','daily_check','moving','custom')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','archived')),
  due_date    TEXT,
  notes       TEXT,
  kind        TEXT NOT NULL DEFAULT 'normal' CHECK(kind IN ('normal','wake_up')),  -- v0.6 第四期：唤醒计划机器标记
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_checklists_scenario ON checklists(scenario);
CREATE INDEX IF NOT EXISTS idx_checklists_status ON checklists(status);
```

> **kind 列迁移：** 旧库无此列，`init.ts` 启动时用 `PRAGMA table_info(checklists)` 检测，缺失则 `ALTER TABLE checklists ADD COLUMN kind TEXT NOT NULL DEFAULT 'normal'`（SQLite 加带默认值的列不需要重建表）。

#### checklist_items（清单项表）— 已实现

```sql
CREATE TABLE IF NOT EXISTS checklist_items (
  id            TEXT PRIMARY KEY,
  checklist_id  TEXT NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  checked       INTEGER DEFAULT 0,
  asset_id      TEXT REFERENCES assets(id) ON DELETE SET NULL,
  sort_order    INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_checklist ON checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_asset ON checklist_items(asset_id);
```

**清单模块说明：** 按场景（出差/旅行/日常检查/搬家/自定义）创建清单，可基于场景模板 + 用户持有的资产自动生成清单项（asset_id 关联资产，资产删除时置空保留条目）。状态流转：active → completed（整体标记完成时所有条目自动勾选）/ archived（归档，不再出现在默认列表）。

#### usage_events（使用日志表）— v0.6 新增

```sql
CREATE TABLE IF NOT EXISTS usage_events (
  id               TEXT PRIMARY KEY,
  asset_id         TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  used_at          TEXT NOT NULL,             -- 本地日期 YYYY-MM-DD，允许补录过去，禁止未来
  duration_minutes INTEGER CHECK(duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440),
  note             TEXT,
  source           TEXT NOT NULL DEFAULT 'quick' CHECK(source IN ('quick','backfill','checklist')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usage_events_asset ON usage_events(asset_id, used_at);
```

**设计决策：**
- **一次使用一行，无 count 列。** 计数用 `COUNT(*)` 实时聚合，杜绝"计数列与明细不一致"的双写问题；单用户 SQLite 场景下性能无忧（个人资产量级 < 万条）
- **`used_at` 日期口径：** 统一存本地时区 `YYYY-MM-DD`（不含时刻），"今天"取服务器本地日期（禁止沿用 `toISOString()`——UTC 会在中国时区早上 8 点前把"今天"记成昨天）；全链路日期格式统一后字符串比较即日期比较，吃灰榜 `MAX(used_at)` 排序不乱。格式与"禁未来"由校验层挡（见 3.2.1），**不能依赖 CHECK 约束**——TEXT 列写入脏格式或违反 CHECK 在 better-sqlite3 抛 SqliteError 会走 errorHandler 变 500，且表非 STRICT 时 `"abc"` 写入 INTEGER 列不会报错而是存成 TEXT
- **source 枚举一次性收全**（含第四期才用到的 `checklist`），避免 SQLite 带 CHECK 约束的列后期改枚举要重建表
- **不回填历史。** 旧"标记已使用"写入的 `ext.usage_stats.last_access` 不换算成事件，历史不可考，从上线起记录
- **last_access 同步规则：** 只有"记今天"（quick）才刷新 digital 资产 `ext.usage_stats.last_access`（完整 ISO、只前进不回退）并 dismiss usage_stagnation 通知——`last_access` 是停滞扫描的活跃度通道而非历史档案，补录过去日期若合成旧时间戳写入会立即触发停滞提醒（第 5 期起停滞去重含已 dismissed、停滞窗口内不复活；dismiss 保留为手动清除入口）
- **disposed/expired 资产拒绝记新事件（400）**，历史事件保留

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
│   ├── api-checklists.ts       # 清单 API
│   └── utils.ts                # shadcn/ui cn() 工具
├── hooks/
│   ├── useAssets.ts            # 资产 CRUD hooks
│   ├── useSuppliers.ts         # 供应商 CRUD hooks
│   ├── useRelations.ts         # 关联 CRUD hooks
│   ├── useNotifications.ts     # 提醒 hooks
│   ├── useDashboard.ts         # 仪表盘统计 hooks
│   └── useChecklists.ts        # 清单 CRUD hooks
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
│   ├── checklist/
│   │   ├── ChecklistList.tsx    # 清单列表（场景/状态筛选标签 + 进度条卡片）
│   │   ├── ChecklistDetail.tsx  # 清单详情（勾选/进度条/添加项/标记完成/归档）
│   │   ├── ChecklistForm.tsx    # 清单创建/编辑表单（场景选择→模板生成→可增删项）
│   │   └── templates.ts         # 4 个场景模板 + generateItemsFromTemplate 按持有资产预填
│   ├── import/
│   │   └── ImportWizard.tsx    # 导入向导（拖拽上传→预览→映射→导入）
│   ├── export/
│   │   └── ExportPage.tsx      # 数据导出（资产/供应商Excel导出）
│   ├── notification/
│   │   └── NotificationPage.tsx # 通知页面（未读/全部+批量操作）
│   ├── relation/
│   │   ├── RelationManager.tsx  # 关联管理（搜索+添加+移除）
│   │   └── RelationsGraph.tsx   # 关联领地页（v0.9：手绘 SVG 环形图，无图库依赖）
│   │                            #   已知取舍：N>30 或长名时环外标签可能重叠，个人量级可接受；后续可做标签显隐阈值/双环布局
│   ├── ErrorBoundary.tsx        # 全局错误边界
├── types/
│   ├── asset.ts                # 资产类型定义
│   └── checklist.ts            # 清单类型定义（含场景/状态中文标签映射）
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
/checklists           → ChecklistListPage    检查清单列表（?scenario=&status= 筛选）
/checklists/new       → ChecklistForm        清单创建（选场景后按模板+持有资产生成清单项）
/checklists/:id       → ChecklistDetailPage  清单详情（勾选/进度/添加项）
/checklists/:id/edit  → ChecklistForm        清单编辑（基本信息：标题/截止日/备注）
/relations            → RelationsGraph       关联领地（v0.9：SVG 环形关联图，点击节点跳详情）
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
| `/api/relations/graph` | GET | v0.9：全局关联图（nodes=全部资产 id/name/type/status，edges=全部关联） |
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
| `/api/export/assets` | GET | 导出资产Excel（v0.8 起含使用次数/最近使用列，仅报表） |
| `/api/export/suppliers` | GET | 导出供应商Excel |
| `/api/export/obsidian` | GET | v0.7：导出 Obsidian Vault ZIP（每资产一个 md） |
| `/api/import/obsidian` | POST | v0.7：导入 Obsidian 笔记（多文件 upsert，dry_run 预览） |
| `/api/dashboard/overview` | GET | 总览统计 |
| `/api/dashboard/subscriptions` | GET | 订阅费用 |
| `/api/dashboard/health` | GET | 健康度 |
| `/api/dashboard/trends` | GET | 订阅月费用趋势 |
| `/api/checklists` | GET/POST | 清单列表（scenario/status/search 筛选，含完成统计）/创建（含批量清单项） |
| `/api/checklists/:id` | GET/PUT/DELETE | 详情（清单项带出关联资产名/类型）/更新基本信息/删除 |
| `/api/checklists/:id/items` | POST | 添加清单项 |
| `/api/checklists/:id/items/:itemId` | PUT | 重命名清单项（content） |
| `/api/checklists/:id/items/:itemId/move` | PATCH | 上移/下移清单项（direction: up/down，交换 sort_order） |
| `/api/checklists/:id/items/:itemId/toggle` | PATCH | 切换清单项勾选 |
| `/api/checklists/:id/items/:itemId` | DELETE | 删除清单项 |
| `/api/checklists/:id/complete` | PATCH | 整体标记完成（所有条目自动勾选） |
| `/api/checklists/:id/archive` | PATCH | 归档清单（status → archived） |
| `/api/assets/:id/usage` | PATCH | 标记已使用（v0.6 起放开三类资产，内部转发为记一条今天的事件，兼容别名，见 3.2.1） |
| `/api/assets/:id/usage-events` | POST/GET | 记一条使用（used_at 默认本地今天，禁未来）/ 历史（倒序 + 总数，limit/offset 分页） |
| `/api/assets/:id/usage-events/bulk` | POST | 批量补录 `{ events: [{used_at, duration_minutes?, note?}] }`，1–200 条、日期可不同，单事务写入 |
| `/api/usage-events/:id` | DELETE | 删除误记的使用记录 |
| `/api/assets/:id/wake-up` | POST | 第四期：安排使用（解析/创建唤醒清单 + 追加条目 + 去重，见 3.2.1） |
| `/api/assets/:id/screenshot` | POST | 上传订阅截图 |
| `/api/assets/ocr` | POST | OCR 识别订阅截图 |
| `/api/dashboard/second-consumption` | GET | 第三期：二次消费率 + 吃灰榜（见 3.2.1） |
| `/api/dashboard/monthly-review` | GET | v0.8：月度回顾（?month=YYYY-MM 缺省本月） |
| `/api/assets?sort=cpu` | GET | 第二期：按单次使用成本排序（见 3.2.1） |

#### 3.2.1 二次消费功能规格（v0.6）

**校验规格（validate.ts 新增校验器，全部返回 400，绝不依赖 SQL CHECK）：**
- `used_at`：匹配 `^\d{4}-\d{2}-\d{2}$` 且是真实日期（如拒绝 2026-02-30）且 ≤ 本地今天；缺省时服务端填本地今天
- `duration_minutes`：整数 1–1440 或缺省
- `note`：字符串 ≤ 500 字
- bulk：`events` 数组长度 1–200，逐条走上述校验

**PATCH `/api/assets/:id/usage` 兼容别名语义：** 放开三类资产（移除 digital-only 400）；内部转发为"记一条今天的事件（source=quick）"；返回体保持完整 Asset JSON（与现有前端 `markAssetUsed` 的返回类型约定一致）+ 200。前端统一切到 `POST /usage-events`，PATCH 仅为外部兼容保留。

**记事件副作用（POST 与 PATCH 一致）：** 仅"记今天"的事件（source=quick）刷新 digital 资产 `ext.usage_stats.last_access`（完整 ISO、只前进不回退）并 dismiss 该资产未处理的 usage_stagnation 通知；补录过去日期（backfill）只写事件、不动活跃度通道。

**第二期 CP/U：** 详情 `GET /api/assets/:id` 附加 `usage_count`；列表排序 `sort=cpu` 用一次 LEFT JOIN 聚合，**不做逐资产子查询**。实现形态：`SELECT a.*, COUNT(u.id) AS usage_count FROM assets a LEFT JOIN usage_events u ON u.asset_id = a.id ... GROUP BY a.id ORDER BY COUNT(u.id) ASC, a.purchase_price DESC`（与技术设计初期版本的"聚合子查询 + COALESCE"实测语义等价，以本形态为准）。口径说明：**订阅参与 cpu 排序但 UI 不展示其计数**（排序是代理指标"最少使用优先"，非严格 CP/U 降序）；CP/U 数值本身由前端用 `purchase_price / usage_count` 计算（次数为 0 显示"从未二次消费"）；金额符号统一走 `lib/currency.ts` 的 `currencySymbol()`（CNY/USD/EUR/JPY/GBP 映射，未知币种回退为"代码+空格"，空/缺省回退 ¥；单资产金额——CP/U、列表卡片、详情页获取价格/估值/每期费用——均适用；仪表盘资产总值与订阅月费为跨币种聚合，暂按 CNY 符号显示，多币种并存时另议口径）。

**第三期仪表盘 `GET /api/dashboard/second-consumption`：** 一次请求返回 `{ rate, dust_list }`（内部 3 条 SQL）——`rate` = 近 90 天有事件的非 disposed/expired 资产数 ÷ 非 disposed/expired 资产总数（窗口 `[today-89, today]`，双端本地日期）；`dust_list` = 非 disposed/expired 按 `MAX(used_at)` 最旧排序 Top 10（无事件用 created_at 换算本地日期兜底），复合索引 `(asset_id, used_at)` 使每资产 MAX 走索引。

**第四期唤醒闭环：**
- `checklists` 表新增机器标记列 `kind TEXT NOT NULL DEFAULT 'normal'`（CHECK kind IN ('normal','wake_up')），init.ts 用 `PRAGMA table_info` 检测缺失后 `ALTER TABLE ADD COLUMN`（加列不需重建表）
- `POST /api/assets/:id/wake-up`：找 `kind='wake_up' AND status='active'` 最早清单为宿主，无则创建（title="唤醒计划"，scenario='custom'，kind='wake_up'）；宿主内存在"未勾选且 asset_id 相同"的条目则跳过，否则追加条目；返回清单 id
- **自动记使用契约：** 仅 `kind='wake_up'` 清单条目触发；toggle 路由先读旧值，仅 0→1 跳变时写一条 `source='checklist'` 事件，1→0 不回删；`PATCH /:id/complete` 改为逐条走同一 0→1 判定（废弃一条 SQL 批量置 1 的写法），保证"整体标记完成"同样逐条记使用；普通场景清单（kind='normal'）勾选不记使用
- 前端记使用类 mutation 的 React Query 失效清单：`['asset', id]`、`['assets']`、`['dashboard']`、`['notifications']`、使用历史 key——漏掉 dashboard 会出现"记了使用仪表盘不动"

**第五期订阅判定守卫：** "近 60 天 0 事件 → rarely"仅当 `assets.created_at` 距今 ≥ 60 天才适用（上线初期的新订阅不误判）；"无事件数据回退手动 usage_frequency"中的"无数据"定义为**该资产从未记录过任何事件**（而非窗口内为 0）；顺带修复 scanner 去重缺陷——现 exists 查询带 `is_dismissed=0`，被 dismiss 的提醒次日换 trigger_date 会重新生成，五期把 stagnation 去重改为"同资产+同类型+同一停滞窗口内不重生"。
- `/api/test/reset` 端点显式清空 `usage_events`（现靠 assets CASCADE 兜底，显式更稳）

**安全：** 全部使用参数化查询防 SQL 注入。POST/PUT 端点通过 `middleware/validate.ts` 校验必填字段、枚举值、UUID 格式等，非法输入返回 400。文件路径用 `path.resolve + startsWith` 防路径穿越。

**OCR：** 订阅截图识别走视觉大模型（OpenAI 兼容接口，默认智谱 `glm-5.3-flash`，`VISION_MODEL` 可切换），一次调用直出结构化 JSON（服务名/金额/币种/计费周期/下次扣费日 + 置信度），服务端做字段白名单校验与日期归一化，解析失败保留原文供人工核对。未配置 `VISION_API_KEY` 时接口返回 503，前端提示手动填写。

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

应用启动时 + 每小时定时扫描一次。**扫描范围仅 `status='active'` 的资产**（idle/expired/disposed 不产生提醒，含停滞与取消建议）。检查以下条件：

| 提醒类型 | 扫描逻辑 |
|---------|---------|
| warranty_expiry | physical.ext → warranty_expiry - 30天 <= 今天 |
| subscription_renewal | subscription.ext → next_billing_date - 7天 <= 今天 |
| digital_expiry | digital.ext → expiry_date - 30天 <= 今天 |
| trial_expiry | subscription.ext → trial_end - 3天 <= 今天 |
| usage_stagnation | v0.6：三类资产通用，以使用事件为准——最近活跃 = MAX(usage_events.used_at) ?? digital 旧 last_access ?? purchase_date ?? created_at，+30天 <= 今天；到手（purchase_date ?? created_at）未满 30 天不判 |
| cancellation_suggestion | v0.6：近 60 天事件数=0 且到手满 60 天 → rarely；从未记录事件且未满 60 天 → 回退手动 usage_frequency；+ next_billing_date - 7天 <= 今天 |
| deprecation | physical.ext → current_value <= purchase_price * 0.1 |
| replacement_suggestion | physical.ext → current_value <= purchase_price * 0.1 + 有收藏的 physical/mixed 供应商 |
| checklist_due | checklists → status='active' 且 due_date - 3天 <= 今天 |

### 4.2 去重

同一资产 + 同一提醒类型 + 同一触发日期，只生成一条提醒。已dismiss的不重复生成。

### 4.3 v0.6 与使用日志的关系（已实现）

- **第一~四期：** `usage_stagnation` 扫描仍读 digital `ext.usage_stats.last_access`；"记今天"的使用事件写入时同步刷新该字段，两条数据通道并存
- **第五期（当前）：** `usage_stagnation` 升级为读 `usage_events`（覆盖三类资产）；`cancellation_suggestion` 的 rarely 判定优先用真实事件统计（近 60 天 0 次且到手满 60 天），从未记录事件且未满 60 天时回退手动 `usage_frequency`
- **去重修复：** `usage_stagnation` 的去重改为"同资产 + 同类型 + 停滞窗口（30 天）内不重生"（含已 dismissed 的），修复 dismiss 后换 trigger_date 当天重生的循环
- **导入场景：** 无 purchase_date 的导入资产自导入日（created_at）起 30 天后才开始停滞提醒（到手守卫兜底到 created_at）
- "记今天"的事件仍 dismiss 该资产未处理的 usage_stagnation 通知

---

## 5. 数据导入设计

### 5.1 通用流程

```
选择文件 → 解析 → 预览前10行 → 用户映射列 → 确认 → 批量插入 → 显示结果
```

### 5.2 Obsidian 导入（v0.7）

`POST /api/import/obsidian`（multipart，多文件上限 200、单文件 ≤2MB）：解析 Obsidian Markdown 笔记的 YAML frontmatter 为资产。`dry_run=true` 仅解析返回预览不写库。v0.8 起回读正文「## 使用记录」区块（格式 `- YYYY-MM-DD | Nmin或- | 备注`，备注可含 `|`，取最后段），事件先过与 API 记使用同一套校验（真实日期/禁未来/时长 1-1440/备注≤500），非法行跳过并在 detail 计 `skipped_events`，绝不入事务；其余按（资产+日期+时长+备注）去重插入（source=backfill，不触碰 last_access），保留导入期间新产生的记录，保证幂等。**口径说明：** 恢复（空库）场景全部事件归为 backfill，原 quick/checklist 来源标记丢失；disposed/expired 资产的历史事件照常导入（备份优先，与 API 记新使用的 400 守卫是两回事）。

**frontmatter 格式（扁平键，与 Obsidian Properties 面板兼容）：** 基础字段 `id/name/type/category/status/tags(inline array)/purchase_date/purchase_price/currency/supplier/notes` + 类型扩展字段扁平展开（physical: model/quantity/unit/location/usage/owner/source/warranty_expiry/serial_number/current_value/condition 等；digital: platform/account/access_url/expiry_date；subscription: billing_cycle/amount/next_billing_date/auto_renew/usage_frequency/trial_end 等）。`usage_stats`/截图等运行态数据不导出不回读；正文仅「## 使用记录」区块回读（v0.8），其余不回读。frontmatter 另有派生键 `usage_count`/`last_used`（供 Obsidian Dataview 查询，导入时忽略）。

**upsert 语义：** frontmatter.id 为合法 UUID 且库中存在 → 更新该资产；否则新建（id 合法则沿用，保持往返稳定）。supplier 按**名字精确匹配**解析，匹配不到置空。导入幂等：重复导入同一批文件不产生重复资产。

**解析器：** 服务端手写宽容解析（`key: value` + 双引号字符串 + inline array + 数字/布尔推断），只覆盖导出格式与常见手写变体，不引入 YAML 依赖。

### 5.3 Obsidian 导出（v0.7）

`GET /api/export/obsidian`：返回 ZIP（jszip），内含 `MetaVault/` 文件夹，每资产一个 `.md`：frontmatter 由基础+扩展字段扁平序列化（特殊字符双引号转义）+ 派生键 `usage_count`/`last_used`，正文含备注、"## 关联"wikilink 列表与"## 使用记录"清单（`- YYYY-MM-DD | Nmin或- | 备注`，回读见 5.2）。重名文件追加 ` (id前8位)`。与 5.2 构成含使用历史的往返闭环。

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
    ├── asset-list.spec.ts     # 资产列表筛选 / 搜索 / 排序 / 批量操作（9 个测试）
    ├── supplier-crud.spec.ts  # 供应商查看 / 删除 / 创建 / 编辑 / 收藏切换（5 个测试）
    ├── checklist.spec.ts      # 清单场景按钮 / 详情进度 / 列表进度 / 勾选 / 删除 / 场景筛选（6 个测试）
    ├── cross-nav.spec.ts      # 跨页面导航（资产→供应商）
    ├── import-export.spec.ts  # 数据导出（资产/供应商 Excel）
    ├── import.spec.ts         # CSV 导入流程 / 非 CSV 文件拒绝
    ├── notifications.spec.ts  # 通知查看 / 忽略 / 批量已读 / 批量忽略（4 个测试）
    ├── relation.spec.ts       # 关联添加 / 删除 / 影响提示（3 个测试）
    ├── ocr.spec.ts            # 订阅截图上传
    ├── usage-log.spec.ts      # 使用日志（记录/补录/删除/校验/别名/分页，10 个测试）
    ├── cpu.spec.ts            # 单次使用成本（详情展示/隐藏/排序含平局，3 个测试）
    ├── dashboard-sc.spec.ts   # 仪表盘二次消费面板（隐藏/口径/窗口边界，3 个测试）
    ├── wake-up.spec.ts        # 唤醒闭环（安排/去重/自动记使用/状态守卫/联动，8 个测试）
    ├── scanner-v6.spec.ts     # 提醒扫描 v0.6（三类停滞/豁免/不重生/取消建议，7 个测试）
    ├── obsidian.spec.ts       # Obsidian 导入导出（导出/往返/幂等/dry_run/坏文件）
    └── relations-graph.spec.ts # 关联领地（节点/边渲染/孤儿提示/点击跳转/空态）
    └── mobile.spec.ts         # 移动端底部导航
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
