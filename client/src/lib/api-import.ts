import { apiFetch } from "./api-client";

export interface ImportPreview {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  filePath: string;
}

export interface ImportResult {
  imported: number;
  errors: number;
  total: number;
}

export function parseImportFile(file: File): Promise<ImportPreview> {
  const formData = new FormData();
  formData.append("file", file);

  return fetch("/api/import/parse", {
    method: "POST",
    body: formData,
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  });
}

export function executeImport(filePath: string, mapping: Record<string, string>): Promise<ImportResult> {
  return apiFetch<ImportResult>("/import/execute", {
    method: "POST",
    body: JSON.stringify({ filePath, mapping }),
  });
}

// v0.7 Obsidian 笔记导入（多文件，dry_run 预览不写库）
export interface ObsidianImportDetail {
  file: string;
  name?: string;
  action: "created" | "updated" | "error" | "would_create" | "would_update";
  error?: string;
}

export interface ObsidianImportResult {
  total: number;
  created: number;
  updated: number;
  errors: number;
  dryRun: boolean;
  details: ObsidianImportDetail[];
}

export function importObsidian(files: File[], dryRun: boolean): Promise<ObsidianImportResult> {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);
  if (dryRun) formData.append("dry_run", "true");

  return fetch("/api/import/obsidian", {
    method: "POST",
    body: formData,
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  });
}
