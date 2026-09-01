import { readFileSync } from "fs";

interface OcrResult {
  service_name?: string;
  amount?: number;
  currency?: string;
  billing_cycle?: string;
  next_billing_date?: string;
  confidence?: "high" | "medium" | "low";
  raw_text?: string;
}

// 视觉大模型直出结构化 JSON（OpenAI 兼容接口，默认智谱 GLM）。
// 相比旧版 tesseract.js + 正则管道：中文截图识别和字段抽取一步完成，
// 新版式无需再维护抽取规则
const API_BASE = process.env.VISION_API_BASE || "https://open.bigmodel.cn/api/paas/v4";
const MODEL = process.env.VISION_MODEL || "glm-5.3-flash";

const PROMPT = `你是订阅信息抽取助手。从这张订阅/支付截图（中文 App 截图为主）中提取以下字段，严格输出 JSON，不要输出任何其他内容：
{
  "service_name": string | null,
  "amount": number | null,
  "currency": "CNY" | "USD" | null,
  "billing_cycle": "monthly" | "yearly" | "weekly" | null,
  "next_billing_date": "YYYY-MM-DD" | null,
  "confidence": "high" | "medium" | "low"
}
字段含义：service_name 是服务/商品名（如 iCloud+、腾讯视频VIP）；amount 是金额数字不带符号；
currency 按 ¥/人民币→CNY、$/美元→USD；billing_cycle 按月付/年付/周付；
next_billing_date 是下次扣费或到期日期；confidence 是整体提取把握。
无法确定的字段输出 null，不要猜测。`;

export function isVisionConfigured(): boolean {
  return !!process.env.VISION_API_KEY;
}

// 容错解析：剥掉 markdown 围栏，取首尾大括号之间的 JSON
function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

export async function recognizeSubscription(imagePath: string): Promise<OcrResult> {
  const apiKey = process.env.VISION_API_KEY;
  if (!apiKey) throw new Error("未配置 VISION_API_KEY");

  const base64 = readFileSync(imagePath).toString("base64");

  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`视觉 API 返回 ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";

  const parsed = extractJson(content);
  if (!parsed) {
    // 模型未按格式输出时保留原文，前端提示手动填写
    return { raw_text: content };
  }

  const result: OcrResult = {};
  if (typeof parsed.service_name === "string" && parsed.service_name.trim()) {
    result.service_name = parsed.service_name.trim().slice(0, 50);
  }
  if (typeof parsed.amount === "number" && isFinite(parsed.amount) && parsed.amount >= 0) {
    result.amount = parsed.amount;
  }
  if (parsed.currency === "CNY" || parsed.currency === "USD") {
    result.currency = parsed.currency;
  }
  if (parsed.billing_cycle === "monthly" || parsed.billing_cycle === "yearly" || parsed.billing_cycle === "weekly") {
    result.billing_cycle = parsed.billing_cycle;
  }
  const date = normalizeDate(parsed.next_billing_date);
  if (date) result.next_billing_date = date;
  if (parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low") {
    result.confidence = parsed.confidence;
  }
  result.raw_text = content;
  return result;
}
