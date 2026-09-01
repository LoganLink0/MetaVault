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
