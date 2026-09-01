# MetaVault PRD v0.5

## 1. 产品定位

**一句话：** 打通物理资产、数字资产、产品订阅的全生命周期管理工具。

**核心价值：**
- 数据打通：三类资产在同一系统，关联关系不丢失
- 智能提醒：到期、续费、保修、使用停滞，不再靠人记
- 优秀供应商管理：收藏优质供应商，采购时有据可查

**不是什么：** 不是记账App、不是ERP、不是密码管理器。

---

## 2. 用户画像

**主要用户：** 个人知识工作者/数字游民
- 拥有物理设备（电脑、外设、家具等）
- 拥有数字资产（域名、课程、文件、软件许可、加密货币等）
- 订阅多个SaaS/会员服务
- 痛点：资产散落各处，关联关系丢失，到期靠人记

**演进路径：** 先自用验证 → 后期开放给同类用户

---

## 3. 资产模型

### 3.1 统一资产模型

所有资产共享基础字段，通过类型区分差异化属性：

| 基础字段 | 说明 |
|---------|------|
| id | 唯一标识 |
| name | 资产名称 |
| type | physical / digital / subscription |
| category | 细分类（如 physical.laptop, digital.course, subscription.saas） |
| status | active / idle / expired / disposed |
| tags | 自定义标签 |
| purchase_date | 获取日期 |
| purchase_price | 获取价格 |
| currency | 币种（默认CNY） |
| supplier_id | 关联供应商 |
| notes | 备注 |
| related_assets | 关联的其他资产ID列表 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

### 3.2 物理资产（type=physical）

| 扩展字段 | 说明 |
|---------|------|
| model | 规格型号 |
| quantity | 数量 |
| unit | 计量单位（个/台/套等） |
| location | 存放位置 |
| usage | 用途场景 |
| owner | 归属人 |
| source | 资产来源：purchase / self_build / donation / transfer |
| warranty_expiry | 保修到期日 |
| warranty_info | 保修信息（条款、联系方式） |
| depreciation_rate | 折旧率（年） |
| current_value | 当前估值 |
| serial_number | 序列号 |
| condition | 成色：new / good / fair / poor |

**细分类举例：** laptop, phone, tablet, monitor, furniture, camera, book, collectible, other

### 3.3 数字资产（type=digital）

| 扩展字段 | 说明 |
|---------|------|
| access_url | 访问地址 |
| expiry_date | 到期日（域名、证书等） |
| platform | 所属平台 |
| usage_stats | 使用情况（结构化，各子类型不同） |
| file_size | 文件大小（文件类） |
| file_format | 文件格式（文件类） |

**细分类举例：**
- **权益类：** domain, ssl_cert, crypto_wallet, software_license
- **内容类：** course, ebook, template, media
- **文件类：** document, design_file, code_repo
- **账号类：** account, api_key

**使用情况追踪（usage_stats）：**
- 课程：进度百分比、最后学习日期、总学习时长
- 文件：最后访问日期、访问次数
- 域名/证书：到期倒计时、DNS状态
- 账号：最后登录日期、活跃状态

### 3.4 产品订阅（type=subscription）

| 扩展字段 | 说明 |
|---------|------|
| billing_cycle | 计费周期：monthly / yearly / lifetime |
| next_billing_date | 下次扣费日 |
| amount | 每期费用 |
| auto_renew | 是否自动续费 |
| usage_frequency | 使用频率评估：daily / weekly / monthly / rarely |
| cancellation_url | 取消订阅链接 |
| trial_end | 试用到期日 |
| screenshots | 订阅截图（用于OCR识别到期时间） |

**细分类举例：** saas, membership, cloud_service, streaming, insurance, other

**截图追踪流程：**
1. 用户上传订阅页面截图
2. 系统通过OCR提取关键信息（服务名、到期时间、金额）
3. 用户确认/修正后保存
4. 后期目标：API对接各平台自动同步

---

## 4. 优秀供应商模型

| 字段 | 说明 |
|------|------|
| id | 唯一标识 |
| name | 供应商名称 |
| type | 资源类型：physical / digital / subscription / mixed |
| rating | 评分 1-5 |
| tags | 标签（如"靠谱"、"性价比高"、"售后好"） |
| contact | 联系方式 |
| website | 网址 |
| notes | 评价/备注 |
| is_favorite | 是否收藏 |
| related_assets | 关联的资产ID列表 |

---

## 5. 关联关系

资产之间可以建立关联，表达真实世界的依赖和归属：

| 关联类型 | 说明 | 举例 |
|---------|------|------|
| depends_on | 依赖 | 域名 depends_on DNS服务 |
| contains | 包含 | MacBook contains AppleCare |
| bound_to | 绑定 | 软件许可 bound_to 设备 |
| related_to | 相关 | 课程 related_to 认证考试 |

关联是双向的，从任一端可查到另一端。

---

## 6. 核心功能

### 6.1 资产管理
- CRUD：创建、查看、编辑、归档/删除资产
- 列表视图：支持按类型、分类、状态、标签筛选和排序
- 详情视图：展示资产完整信息 + 关联资产 + 关联供应商
- 批量操作：批量修改状态、批量删除
- 通知页面：未读/全部筛选，批量已读/忽略

### 6.2 优秀供应商管理
- CRUD：创建、查看、编辑供应商
- 收藏：标记优质供应商，采购时优先参考
- 按供应商查看所有关联资产

### 6.3 关联管理
- 在资产详情页添加/移除关联
- 可视化关联图（MVP阶段可简化为列表）
- 删除资产时提示关联影响

### 6.4 提醒系统
| 提醒类型 | 触发条件 | 默认提前量 |
|---------|---------|-----------|
| 保修到期 | warranty_expiry 临近 | 30天 |
| 订阅续费 | next_billing_date 临近 | 7天 |
| 域名/证书到期 | expiry_date 临近 | 30天 |
| 试用到期 | trial_end 临近 | 3天 |
| 使用停滞 | 课程/文件长期未访问 | 30天未访问 |
| 折旧提醒 | current_value 低于阈值 | 低于原价10% |
| 取消建议 | 订阅使用频率低且即将续费 | rarely + 7天 |
| 替换建议 | 物理资产折旧严重 | 低于原价10% + 有收藏供应商 |
| 清单到期 | 检查清单 due_date 临近（仅进行中清单） | 3天 |

提醒方式：应用内通知 + Web Push 浏览器推送（已实现）。

### 6.5 采购建议
- 基于收藏供应商推荐：新增同类资产时，优先展示收藏供应商
- 续费决策辅助：订阅使用频率低时，提醒考虑取消
- 替换建议：物理资产折旧严重时，推荐同类收藏供应商

### 6.6 统计仪表盘
- 资产总览：按类型/分类的数量和金额分布
- 订阅费用：月度/年度订阅支出汇总
- 资产健康度：即将到期、使用停滞的资产数量
- 供应商分布：资产按供应商聚合

### 6.7 数据迁移
- **Excel导入：** 解析 .xlsx 文件，按列映射到资产字段，支持预览和字段匹配
- **Notion导入：** 导出Notion数据库为CSV后导入，提供Notion模板映射预设
- **CSV导入：** 通用CSV解析，自定义列映射
- 导入流程：选择文件 → 预览数据 → 映射字段 → 确认导入 → 查看导入结果

### 6.8 数据导出
- **Excel导出：** 将资产或供应商数据导出为 .xlsx 文件
- 资产导出：包含基础字段 + 类型扩展字段（扩展字段展开为独立列）
- 供应商导出：全部字段（评分、标签、联系方式等）
- 导出流程：选择导出类型 → 点击导出 → 自动下载 Excel 文件

### 6.9 场景化检查清单
- **场景模板：** 出差/旅行/日常检查/搬家/自定义，选择场景后基于模板 + 用户持有的资产自动生成清单项（如持有笔记本则自动加入并关联）
- **清单项管理：** 增删、重命名、勾选、上移/下移排序，条目可关联资产（资产删除时保留条目、置空关联）
- **进度与状态：** 勾选进度条、截止日期、整体标记完成（所有条目自动勾选）、归档/恢复
- **到期提醒：** 进行中清单的截止日期临近时生成"清单到期"提醒（并入 6.4 提醒系统）
- **仪表盘集成：** 进行中清单卡片（进度 + 跳转）

---

## 7. 数据存储

**方案：** SQLite 文件数据库
- 单文件，易备份/迁移
- 无需额外服务
- 性能足够个人使用场景
- 后续多用户版本可迁移至 PostgreSQL

---

## 8. 技术方案

**架构：** Web 应用（Node.js 后端 + React 前端 + SQLite）

| 层 | 技术选型 | 理由 |
|---|---------|------|
| 后端 | Node.js + Express 5 + better-sqlite3 | 前后端同语言，同步 API 更简洁 |
| 前端 | React 19 + TypeScript + Vite | 生态成熟，组件库丰富 |
| UI组件 | shadcn/ui + Tailwind CSS v4 | 可定制、轻量，简约留白风格 |
| 数据获取 | React Query v5 | 自动缓存、后台刷新 |
| 路由 | React Router v7 | SPA 路由 |
| 数据库 | SQLite（服务端文件） | 单文件，易备份，零配置 |
| 包管理 | pnpm workspace monorepo | client/ + server/ 分包管理 |

**部署方式：** Express 同时提供前端静态文件 + API，单端口部署。

**数据目录：** SQLite 文件存放在 `./data/metavault.db`，WAL 模式启用。

---

## 9. MVP范围

**MVP包含：**
- [x] 统一资产模型（三类资产CRUD）
- [x] 优秀供应商管理（CRUD + 收藏）
- [x] 关联管理（添加/查看/删除关联）
- [x] 提醒系统（应用内通知，8种提醒类型）
- [x] 统计仪表盘（基础4个视图）
- [x] 数据导入（CSV + Excel + Notion迁移工具）
- [x] 数据导出（Excel 格式导出资产和供应商数据）
- [x] 订阅截图上传 + OCR识别（基础版）

**MVP不包含：**
- [ ] 关联可视化图
- [ ] 多用户/权限
- [ ] 数据云同步
- [ ] API开放
- [ ] 平台API自动同步订阅状态

**已实现（超出原MVP范围）：**
- [x] 移动端适配（底部 Tab 导航 + 响应式布局）
- [x] Web Push 浏览器推送通知
- [x] 仪表盘数据可视化（Recharts 饼图 + 折线图）
- [x] 通知页面（未读/全部筛选，批量操作）
- [x] 资产批量操作（批量修改状态、批量删除）
- [x] 采购建议（收藏供应商推荐、续费决策、折旧替换建议）
- [x] 删除资产关联影响提示

---

## 10. 开放问题

1. ~~**技术栈选择**~~ — 已定：Node.js + Express + React + TypeScript + SQLite（从 Tauri 重构为 Web 应用）
2. ~~**数字资产的使用追踪**~~ — 已定：MVP手动+截图OCR，后期API自动同步
3. ~~**加密凭证存储**~~ — 已定：MVP不存敏感凭证，后期再考虑
4. ~~**数据导入**~~ — 已定：MVP包含Excel/Notion/CSV迁移工具
5. ~~**币种处理**~~ — 已定：单币种（CNY），无需汇率处理
6. ~~**UI组件库**~~ — 已定：shadcn/ui + Tailwind，简约留白风格
