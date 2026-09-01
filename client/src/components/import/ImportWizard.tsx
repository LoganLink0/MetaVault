import { useState } from "react";
import { Upload, ArrowRight, CheckCircle, XCircle, List } from "lucide-react";
import { parseImportFile, executeImport } from "@/lib/api-import";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const fieldOptions = [
  { value: "name", label: "名称" },
  { value: "type", label: "类型" },
  { value: "category", label: "分类" },
  { value: "status", label: "状态" },
  { value: "purchase_date", label: "获取日期" },
  { value: "purchase_price", label: "获取价格" },
  { value: "notes", label: "备注" },
];

function ImportWizard() {
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [preview, setPreview] = useState<{ columns: string[]; rows: Record<string, unknown>[]; totalRows: number; filePath: string } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ imported: number; errors: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function processFile(file: File) {
    setError("");
    try {
      const data = await parseImportFile(file);
      setPreview(data);
      const autoMapping: Record<string, string> = {};
      for (const col of data.columns) {
        const lower = col.toLowerCase();
        if (lower.includes("name") || lower.includes("名")) autoMapping[col] = "name";
        else if (lower.includes("type") || lower.includes("类型")) autoMapping[col] = "type";
        else if (lower.includes("category") || lower.includes("分类")) autoMapping[col] = "category";
        else if (lower.includes("status") || lower.includes("状态")) autoMapping[col] = "status";
        else if (lower.includes("date") || lower.includes("日期")) autoMapping[col] = "purchase_date";
        else if (lower.includes("price") || lower.includes("价") || lower.includes("金额")) autoMapping[col] = "purchase_price";
        else if (lower.includes("note") || lower.includes("备注")) autoMapping[col] = "notes";
      }
      setMapping(autoMapping);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    processFile(file);
  }

  async function handleImport() {
    if (!preview) return;
    setError("");
    try {
      const res = await executeImport(preview.filePath, mapping);
      setResult(res);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    }
  }

  return (
    <div className="space-y-8">
      <h2 className="font-display text-xl font-bold tracking-[2px] uppercase">数据导入</h2>

      {step === "upload" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="font-display text-sm font-semibold tracking-wide text-ink2">选择文件</h3>
            <Separator className="flex-1" />
          </div>
          <div
            className={`flex items-center justify-center border-2 border-dashed rounded-lg p-8 text-muted-foreground transition-colors ${dragging ? "border-phy bg-phy/5" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <label className="flex flex-col items-center gap-2 cursor-pointer">
              <Upload className="h-8 w-8" />
              <span>{dragging ? "松开以上传" : "点击或拖拽 .csv / .xlsx 文件"}</span>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className="hidden" />
            </label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {step === "preview" && preview && (
        <>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="font-display text-sm font-semibold tracking-wide text-ink2">数据预览</h3>
              <Separator className="flex-1" />
            </div>
            <p className="text-sm text-muted-foreground">共 {preview.totalRows} 行，显示前 {preview.rows.length} 行</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border">
                <thead>
                  <tr className="bg-muted">
                    {preview.columns.map((col) => <th key={col} className="px-2 py-1 border text-left">{col}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i}>
                      {preview.columns.map((col) => <td key={col} className="px-2 py-1 border">{String(row[col] ?? "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="font-display text-sm font-semibold tracking-wide text-ink2">字段映射</h3>
              <Separator className="flex-1" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {preview.columns.map((col) => (
                <div key={col} className="flex items-center gap-2 px-3 py-2 rounded-md border border-ink3 bg-pg">
                  <span className="text-sm text-ink truncate min-w-0">{col}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-ink3 shrink-0" />
                  <Select value={mapping[col] || "_skip"} onValueChange={(v) => setMapping((m) => ({ ...m, [col]: v }))}>
                    <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_skip">跳过</SelectItem>
                      {fieldOptions.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleImport}>确认导入</Button>
            <Button variant="outline" onClick={() => setStep("upload")}>返回</Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </>
      )}

      {step === "result" && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="font-display text-sm font-semibold tracking-wide text-ink2">导入结果</h3>
            <Separator className="flex-1" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col items-center px-4 py-3 rounded-lg border border-ink3 bg-pg">
              <CheckCircle className="h-5 w-5 text-phy mb-1" />
              <span className="text-2xl font-mono font-bold text-ink">{result.imported}</span>
              <span className="text-xs text-ink2">成功导入</span>
            </div>
            <div className="flex flex-col items-center px-4 py-3 rounded-lg border border-ink3 bg-pg">
              <XCircle className="h-5 w-5 text-wrn mb-1" />
              <span className="text-2xl font-mono font-bold text-ink">{result.errors}</span>
              <span className="text-xs text-ink2">失败</span>
            </div>
            <div className="flex flex-col items-center px-4 py-3 rounded-lg border border-ink3 bg-pg">
              <List className="h-5 w-5 text-ink3 mb-1" />
              <span className="text-2xl font-mono font-bold text-ink">{result.total}</span>
              <span className="text-xs text-ink2">总计</span>
            </div>
          </div>
          <Button onClick={() => { setStep("upload"); setPreview(null); setResult(null); }}>继续导入</Button>
        </div>
      )}
    </div>
  );
}

export default ImportWizard;