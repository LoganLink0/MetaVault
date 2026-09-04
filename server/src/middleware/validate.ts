import { isRealDateStr, localTodayStr } from "../lib/date.js";

const ASSET_TYPES = ["physical", "digital", "subscription"] as const;
const ASSET_STATUSES = ["active", "idle", "expired", "disposed"] as const;
const RELATION_TYPES = ["depends_on", "contains", "bound_to", "related_to"] as const;
const CHECKLIST_SCENARIOS = ["business_trip", "travel", "daily_check", "moving", "custom"] as const;
const CHECKLIST_STATUSES = ["active", "completed", "archived"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateAssetInput(body: Record<string, unknown>): string | null {
  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0 || body.name.length > 200)
    return "name 必填，1-200 字符";
  if (!ASSET_TYPES.includes(body.type as typeof ASSET_TYPES[number]))
    return "type 必须为 physical/digital/subscription";
  if (!body.category || typeof body.category !== "string")
    return "category 必填";
  if (body.status && !ASSET_STATUSES.includes(body.status as typeof ASSET_STATUSES[number]))
    return "status 无效";
  if (body.purchase_price != null && (typeof body.purchase_price !== "number" || body.purchase_price < 0))
    return "purchase_price 无效";
  // purchase_date 参与停滞提醒/取消建议的"到手"判定，空串会让判定静默失效，格式必须校验
  if (body.purchase_date != null && body.purchase_date !== "" && (typeof body.purchase_date !== "string" || !isRealDateStr(body.purchase_date)))
    return "purchase_date 必须为 YYYY-MM-DD 格式的真实日期";
  return null;
}

export function validateSupplierInput(body: Record<string, unknown>): string | null {
  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0 || body.name.length > 200)
    return "name 必填，1-200 字符";
  if (body.contact_email && typeof body.contact_email === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contact_email))
    return "contact_email 格式无效";
  return null;
}

export function validateRelationInput(body: Record<string, unknown>): string | null {
  if (!body.source_id || typeof body.source_id !== "string" || !UUID_RE.test(body.source_id))
    return "source_id 无效";
  if (!body.target_id || typeof body.target_id !== "string" || !UUID_RE.test(body.target_id))
    return "target_id 无效";
  if (body.source_id === body.target_id)
    return "不能关联自身";
  if (!RELATION_TYPES.includes(body.relation as typeof RELATION_TYPES[number]))
    return "relation 必须为 depends_on/contains/bound_to/related_to";
  return null;
}

export function validateChecklistInput(body: Record<string, unknown>): string | null {
  if (!body.title || typeof body.title !== "string" || body.title.trim().length === 0 || body.title.length > 200)
    return "title 必填，1-200 字符";
  if (!CHECKLIST_SCENARIOS.includes(body.scenario as typeof CHECKLIST_SCENARIOS[number]))
    return "scenario 必须为 business_trip/travel/daily_check/moving/custom";
  if (body.status && !CHECKLIST_STATUSES.includes(body.status as typeof CHECKLIST_STATUSES[number]))
    return "status 无效";
  if (body.items && !Array.isArray(body.items))
    return "items 必须为数组";
  return null;
}

export function validateChecklistItemInput(body: Record<string, unknown>): string | null {
  if (!body.content || typeof body.content !== "string" || body.content.trim().length === 0 || body.content.length > 500)
    return "content 必填，1-500 字符";
  return null;
}

// 使用日志输入校验：used_at 只接受本地 YYYY-MM-DD 且不允许未来，绝不依赖 SQL CHECK（会变 500）
export function validateUsageEventInput(body: Record<string, unknown>): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return "请求体必须为 JSON 对象";
  if (body.used_at != null) {
    if (typeof body.used_at !== "string" || !isRealDateStr(body.used_at))
      return "used_at 必须为 YYYY-MM-DD 格式的真实日期";
    if (body.used_at > localTodayStr())
      return "used_at 不允许是未来日期";
  }
  if (body.duration_minutes != null) {
    if (typeof body.duration_minutes !== "number" || !Number.isInteger(body.duration_minutes) || body.duration_minutes < 1 || body.duration_minutes > 1440)
      return "duration_minutes 必须为 1-1440 的整数分钟";
  }
  if (body.note != null) {
    if (typeof body.note !== "string" || body.note.length > 500)
      return "note 最长 500 字符";
  }
  return null;
}

// 批量补录：events 数组 1-200 条，逐条走单条校验（元素必须为对象，防 null 崩 500 / 字符串静默造数据）
export function validateUsageEventBulkInput(body: Record<string, unknown>): string | null {
  if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 200)
    return "events 必须为 1-200 条的数组";
  for (let i = 0; i < body.events.length; i++) {
    const ev = body.events[i];
    if (!ev || typeof ev !== "object" || Array.isArray(ev))
      return `events[${i}] 必须为对象`;
    const err = validateUsageEventInput(ev as Record<string, unknown>);
    if (err) return `events[${i}]: ${err}`;
  }
  return null;
}
