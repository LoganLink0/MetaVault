import { apiFetch } from "./api-client";
import type { Asset, AssetInput, AssetFilters, UsageEvent, UsageEventInput, UsageEventList } from "@/types/asset";

export function fetchAssets(filters?: AssetFilters): Promise<Asset[]> {
  const params = new URLSearchParams();
  if (filters?.asset_type) params.set("asset_type", filters.asset_type);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.category) params.set("category", filters.category);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.sort) params.set("sort", filters.sort);

  const qs = params.toString();
  return apiFetch<Asset[]>(`/assets${qs ? `?${qs}` : ""}`);
}

export function fetchAsset(id: string): Promise<Asset> {
  return apiFetch<Asset>(`/assets/${id}`);
}

export function createAsset(input: AssetInput): Promise<Asset> {
  return apiFetch<Asset>("/assets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAsset(id: string, input: AssetInput): Promise<Asset> {
  return apiFetch<Asset>(`/assets/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteAsset(id: string): Promise<void> {
  return apiFetch(`/assets/${id}`, { method: "DELETE" });
}

// v0.6 使用日志（旧 PATCH /usage 接口仅为外部兼容保留，前端不再使用）
export function fetchUsageEvents(assetId: string, limit = 200, offset = 0): Promise<UsageEventList> {
  return apiFetch<UsageEventList>(`/assets/${assetId}/usage-events?limit=${limit}&offset=${offset}`);
}

export function createUsageEvent(assetId: string, input: UsageEventInput): Promise<UsageEvent> {
  return apiFetch<UsageEvent>(`/assets/${assetId}/usage-events`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function bulkCreateUsageEvents(assetId: string, events: UsageEventInput[]): Promise<{ count: number; events: UsageEvent[] }> {
  return apiFetch(`/assets/${assetId}/usage-events/bulk`, {
    method: "POST",
    body: JSON.stringify({ events }),
  });
}

export function deleteUsageEvent(eventId: string): Promise<void> {
  return apiFetch(`/usage-events/${eventId}`, { method: "DELETE" });
}

// v0.6 唤醒闭环：加入"唤醒计划"清单（已存在未勾选的同资产条目时 created=false）
export function wakeUpAsset(assetId: string): Promise<{ checklist_id: string; item_id: string; created: boolean }> {
  return apiFetch(`/assets/${assetId}/wake-up`, { method: "POST" });
}

export async function uploadScreenshot(assetId: string, file: File): Promise<{ screenshot_url: string }> {
  const formData = new FormData();
  formData.append("screenshot", file);
  const res = await fetch(`/api/assets/${assetId}/screenshot`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("截图上传失败");
  return res.json();
}

export interface OcrResult {
  service_name?: string;
  amount?: number;
  currency?: string;
  billing_cycle?: string;
  next_billing_date?: string;
  confidence?: "high" | "medium" | "low";
  raw_text?: string;
}

export async function ocrRecognize(file: File): Promise<OcrResult> {
  const formData = new FormData();
  formData.append("screenshot", file);
  const res = await fetch("/api/assets/ocr", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    // 透传后端提示（如未配置 VISION_API_KEY 的 503 信息）
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || "OCR 识别失败");
  }
  return res.json();
}
