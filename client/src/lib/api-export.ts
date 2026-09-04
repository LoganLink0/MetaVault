export function exportAssets(): Promise<Blob> {
  return fetch("/api/export/assets").then((res) => res.blob());
}

export function exportSuppliers(): Promise<Blob> {
  return fetch("/api/export/suppliers").then((res) => res.blob());
}

export function exportObsidian(): Promise<Blob> {
  return fetch("/api/export/obsidian").then((res) => {
    if (!res.ok) throw new Error("导出失败");
    return res.blob();
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}