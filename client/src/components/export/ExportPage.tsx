import { useState } from "react";
import { Download, FileSpreadsheet, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { exportAssets, exportSuppliers, exportObsidian, downloadBlob } from "@/lib/api-export";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function ExportPage() {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleExportAssets() {
    setLoading("assets");
    try {
      const blob = await exportAssets();
      downloadBlob(blob, "assets.xlsx");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    }
    setLoading(null);
  }

  async function handleExportSuppliers() {
    setLoading("suppliers");
    try {
      const blob = await exportSuppliers();
      downloadBlob(blob, "suppliers.xlsx");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    }
    setLoading(null);
  }

  async function handleExportObsidian() {
    setLoading("obsidian");
    try {
      const blob = await exportObsidian();
      downloadBlob(blob, "metavault-obsidian.zip");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    }
    setLoading(null);
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold tracking-[2px] uppercase">数据导出</h2>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-sm font-semibold tracking-wide text-ink2">导出选项</h3>
          <Separator className="flex-1" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                资产数据
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                导出所有资产数据为 Excel 文件，包含基本信息和类型扩展字段。
              </p>
              <Button onClick={handleExportAssets} disabled={loading === "assets"}>
                {loading === "assets" ? "导出中..." : (
                  <>
                    <Download className="h-4 w-4 mr-1" /> 导出资产 Excel
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                供应商数据
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                导出所有供应商数据为 Excel 文件，包含评分、标签、联系方式等。
              </p>
              <Button onClick={handleExportSuppliers} disabled={loading === "suppliers"}>
                {loading === "suppliers" ? "导出中..." : (
                  <>
                    <Download className="h-4 w-4 mr-1" /> 导出供应商 Excel
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <NotebookPen className="h-5 w-5" />
                Obsidian Vault
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                导出为 ZIP，每资产一个 Markdown 笔记（frontmatter 字段 + 关联 wikilinks），解压即可放入 Obsidian Vault。可与"Obsidian 导入"往返。
              </p>
              <Button onClick={handleExportObsidian} disabled={loading === "obsidian"}>
                {loading === "obsidian" ? "导出中..." : (
                  <>
                    <Download className="h-4 w-4 mr-1" /> 导出 Obsidian ZIP
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default ExportPage;