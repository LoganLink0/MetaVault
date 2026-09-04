import { apiFetch } from "./api-client";
import type { Checklist, ChecklistInput, ChecklistItem, ChecklistItemInput } from "@/types/checklist";

export function fetchChecklists(filters?: { scenario?: string; status?: string; search?: string }): Promise<Checklist[]> {
  const params = new URLSearchParams();
  if (filters?.scenario) params.set("scenario", filters.scenario);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.search) params.set("search", filters.search);
  const qs = params.toString();
  return apiFetch<Checklist[]>(`/checklists${qs ? `?${qs}` : ""}`);
}

export function fetchChecklist(id: string): Promise<Checklist> {
  return apiFetch<Checklist>(`/checklists/${id}`);
}

export function createChecklist(input: ChecklistInput): Promise<Checklist> {
  return apiFetch<Checklist>("/checklists", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateChecklist(id: string, input: Partial<ChecklistInput>): Promise<Checklist> {
  return apiFetch<Checklist>(`/checklists/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteChecklist(id: string): Promise<void> {
  return apiFetch(`/checklists/${id}`, { method: "DELETE" });
}

export function addChecklistItem(checklistId: string, input: ChecklistItemInput): Promise<ChecklistItem> {
  return apiFetch<ChecklistItem>(`/checklists/${checklistId}/items`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateChecklistItem(checklistId: string, itemId: string, input: { content: string }): Promise<ChecklistItem> {
  return apiFetch<ChecklistItem>(`/checklists/${checklistId}/items/${itemId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function moveChecklistItem(checklistId: string, itemId: string, direction: "up" | "down"): Promise<void> {
  return apiFetch(`/checklists/${checklistId}/items/${itemId}/move`, {
    method: "PATCH",
    body: JSON.stringify({ direction }),
  });
}

// 唤醒清单勾选自动记使用时返回 usage_logged=true（联动失效资产/仪表盘缓存）
export function toggleChecklistItem(checklistId: string, itemId: string): Promise<ChecklistItem & { usage_logged?: boolean }> {
  return apiFetch<ChecklistItem & { usage_logged?: boolean }>(`/checklists/${checklistId}/items/${itemId}/toggle`, {
    method: "PATCH",
  });
}

export function deleteChecklistItem(checklistId: string, itemId: string): Promise<void> {
  return apiFetch(`/checklists/${checklistId}/items/${itemId}`, { method: "DELETE" });
}

export function completeChecklist(id: string): Promise<Checklist> {
  return apiFetch<Checklist>(`/checklists/${id}/complete`, { method: "PATCH" });
}

export function archiveChecklist(id: string): Promise<Checklist> {
  return apiFetch<Checklist>(`/checklists/${id}/archive`, { method: "PATCH" });
}

export function unarchiveChecklist(id: string): Promise<Checklist> {
  return apiFetch<Checklist>(`/checklists/${id}/unarchive`, { method: "PATCH" });
}
