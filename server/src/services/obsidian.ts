// Obsidian 导入导出（v0.7）：Markdown 笔记 + YAML frontmatter（扁平键，兼容 Properties 面板）
// 导入导出共用同一套键，构成往返闭环；正文（body）仅展示不回读

export interface RelationshipRow {
  otherName: string;
  relation: string;
}

export interface AssetRow {
  id: string;
  name: string;
  type: string;
  category: string;
  status: string;
  tags: string;
  purchase_date: string | null;
  purchase_price: number | null;
  currency: string;
  supplier_id: string | null;
  notes: string | null;
  ext: string;
  created_at: string;
  updated_at: string;
}

// 需要转义为双引号字符串的值：YAML 特殊语义字符、首尾空格、以 - 开头（列表标记）、
// 可被误读为数字的字符串（保类型往返，如序列号 "00123"）、含换行的多行文本
function yamlScalar(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  const s = String(value);
  const looksNumeric = s !== "" && !Number.isNaN(Number(s));
  if (/[:#\[\]{}&*!|>'"%@`,]/.test(s) || s !== s.trim() || s === "" || s.startsWith("-") || looksNumeric || s.includes("\n")) {
    return `"${escapeYaml(s)}"`;
  }
  return s;
}

// 转义顺序不可换：先反斜杠，再引号，最后各类行终止符（\r/\n/\u2028/\u2029 在 JS 正则里都不被 . 匹配，必须显式转义）
function escapeYaml(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// 与 escapeYaml 严格互逆：用占位符保护已转义的反斜杠，避免 "\\n" 被误还原为换行
function unescapeYaml(s: string): string {
  return s
    .replace(/\\\\/g, "\u0000")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\u2028/g, "\u2028")
    .replace(/\\u2029/g, "\u2029")
    .replace(/\\"/g, '"')
    .replace(/\u0000/g, "\\");
}

function inlineArray(items: string[]): string {
  if (items.length === 0) return "[]";
  return `[${items.map((t) => yamlScalar(t)).join(", ")}]`;
}

// 按引号感知的方式切分 inline array（元素含逗号时不能裸 split）
function splitInlineArray(inner: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuote: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inQuote) {
      if (ch === "\\" && inner[i + 1]) { current += ch + inner[i + 1]; i++; continue; }
      if (ch === inQuote) inQuote = null;
      current += ch;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
      current += ch;
    } else if (ch === ",") {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") parts.push(current.trim());
  return parts;
}

// 各类型 ext 扁平导出键（与 parseNoteToFields 的白名单一致）
const EXT_KEYS: Record<string, string[]> = {
  physical: ["model", "quantity", "unit", "location", "usage", "owner", "source", "warranty_expiry", "warranty_info", "depreciation_rate", "current_value", "serial_number", "condition"],
  digital: ["platform", "account", "access_url", "expiry_date"],
  subscription: ["billing_cycle", "amount", "next_billing_date", "auto_renew", "usage_frequency", "cancellation_url", "trial_end"],
};

export function assetToNote(
  asset: AssetRow,
  tags: string[],
  ext: Record<string, unknown>,
  supplierName: string | null,
  relations: RelationshipRow[]
): string {
  const lines: string[] = ["---"];
  lines.push(`id: ${asset.id}`);
  lines.push(`name: ${yamlScalar(asset.name)}`);
  lines.push(`type: ${asset.type}`);
  lines.push(`category: ${yamlScalar(asset.category)}`);
  lines.push(`status: ${asset.status}`);
  lines.push(`tags: ${inlineArray(tags)}`);
  if (asset.purchase_date) lines.push(`purchase_date: ${asset.purchase_date}`);
  if (asset.purchase_price != null) lines.push(`purchase_price: ${asset.purchase_price}`);
  lines.push(`currency: ${asset.currency}`);
  if (supplierName) lines.push(`supplier: ${yamlScalar(supplierName)}`);
  if (asset.notes) lines.push(`notes: ${yamlScalar(asset.notes)}`);
  for (const key of EXT_KEYS[asset.type] ?? []) {
    const value = ext[key];
    if (value == null || value === "") continue;
    lines.push(`${key}: ${typeof value === "object" ? inlineArray(Object.values(value).map(String)) : yamlScalar(value)}`);
  }
  lines.push("---", "");

  if (asset.notes) lines.push(asset.notes, "");
  if (relations.length > 0) {
    lines.push("## 关联", "");
    for (const rel of relations) {
      lines.push(`- [[${rel.otherName}]] (${rel.relation})`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// 解析 frontmatter：`---` 围栏内的扁平 key: value。
// 宽容策略：支持双引号字符串、inline array [a, b]、数字/布尔推断；不认识的键保留原样由白名单过滤
export function parseFrontmatter(content: string): { fields: Record<string, string | string[] | number | boolean>; body: string } | null {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---")) return null;
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) return null;

  const block = normalized.slice(4, end);
  const fields: Record<string, string | string[] | number | boolean> = {};
  // 数字/布尔推断仅限明确的数值与布尔键（防止序列号 "00123"、日期 "20240101" 被改写类型）
  const NUMERIC_KEYS = new Set(["purchase_price", "amount", "current_value", "quantity", "depreciation_rate"]);
  const BOOLEAN_KEYS = new Set(["auto_renew"]);
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();

    // inline array [a, b, "c"]（引号感知切分，元素可含逗号）
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      fields[key] = inner === "" ? [] : splitInlineArray(inner).map((part) => unquote(part.trim())).filter((s) => s !== "");
      continue;
    }
    // 带引号字符串（反转义）
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) {
      value = unquote(value);
      fields[key] = value;
      continue;
    }
    if (BOOLEAN_KEYS.has(key) && (value === "true" || value === "false")) {
      fields[key] = value === "true";
      continue;
    }
    if (NUMERIC_KEYS.has(key) && value !== "" && !Number.isNaN(Number(value))) {
      fields[key] = Number(value);
      continue;
    }
    fields[key] = value;
  }
  return { fields, body: normalized.slice(end + 4).trim() };
}

function unquote(s: string): string {
  if (/^".*"$/.test(s) || /^'.*'$/.test(s)) {
    const inner = s.slice(1, -1);
    return inner.indexOf("\\") === -1 ? inner : unescapeYaml(inner);
  }
  return s;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASSET_TYPES = ["physical", "digital", "subscription"];
const ASSET_STATUSES = ["active", "idle", "expired", "disposed"];

export interface ParsedAsset {
  id: string | null;          // 合法 UUID 才用于 upsert 匹配，否则导入时生成新 id
  name: string;
  type: string;
  category: string;
  status: string;
  tags: string[];
  purchase_date: string | null;
  purchase_price: number | null;
  currency: string;
  supplier: string | null;
  notes: string | null;
  ext: Record<string, unknown>;
}

// frontmatter 字段 → 资产字段。返回 string 表示该文件的错误原因
export function noteToAssetFields(fields: Record<string, unknown>): ParsedAsset | string {
  const name = typeof fields.name === "string" ? fields.name.trim() : "";
  if (!name) return "frontmatter 缺少 name";
  const type = typeof fields.type === "string" ? fields.type : "";
  if (!ASSET_TYPES.includes(type)) return `type 无效：${type || "(缺失)"}`;
  const status = typeof fields.status === "string" && ASSET_STATUSES.includes(fields.status) ? fields.status : "active";

  const id = typeof fields.id === "string" && UUID_RE.test(fields.id) ? fields.id.toLowerCase() : null;
  const tags = Array.isArray(fields.tags) ? fields.tags.map(String) : [];
  const str = (key: string): string | null => (typeof fields[key] === "string" && (fields[key] as string).trim() !== "" ? (fields[key] as string).trim() : null);
  const num = (key: string): number | null => (typeof fields[key] === "number" ? fields[key] : null);

  const ext: Record<string, unknown> = {};
  for (const key of EXT_KEYS[type] ?? []) {
    const value = fields[key];
    if (value == null || value === "") continue;
    ext[key] = value;
  }

  return {
    id,
    name,
    type,
    category: str("category") ?? `${type}.other`,
    status,
    tags,
    purchase_date: str("purchase_date"),
    purchase_price: num("purchase_price"),
    currency: str("currency") ?? "CNY",
    supplier: str("supplier"),
    // notes 不 trim：首尾空白属于内容，往返闭环中不得丢失（其他键 trim 是宽容解析的一部分）
    notes: typeof fields.notes === "string" ? fields.notes : null,
    ext,
  };
}

// 文件名安全化：去掉路径分隔符与 Obsidian/Windows 非法字符
export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|#^\[\]]/g, " ").trim();
  return cleaned || "未命名";
}
