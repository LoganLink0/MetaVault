import { useNavigate, useParams } from "react-router-dom";
import { Pencil, Trash2, Star, ArrowLeft } from "lucide-react";
import { useSupplier, useDeleteSupplier, useToggleFavorite } from "@/hooks/useSuppliers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const typeLabels: Record<string, string> = { physical: "物理", digital: "数字", subscription: "订阅", mixed: "混合" };
const assetTypeLabels: Record<string, string> = { physical: "物理资产", digital: "数字资产", subscription: "订阅" };
const statusLabels: Record<string, string> = { active: "使用中", idle: "闲置", expired: "过期", disposed: "已处置" };

const typeBadgeVariant: Record<string, "physical" | "digital" | "subscription" | "secondary"> = {
  physical: "physical",
  digital: "digital",
  subscription: "subscription",
  mixed: "secondary",
};

const statusBadgeStyles: Record<string, string> = {
  active: "bg-grn08 text-grn",
  idle: "bg-sub08 text-sub",
  expired: "bg-phy08 text-wrn",
  disposed: "bg-ink4/50 text-ink2",
};

function SupplierDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { data: supplier, isLoading } = useSupplier(id!);
  const deleteSupplier = useDeleteSupplier();
  const toggleFav = useToggleFavorite();

  if (isLoading) return <Skeleton className="h-64 rounded-lg" />;
  if (!supplier) return <div className="text-muted-foreground">供应商不存在</div>;

  function handleDelete() {
    if (confirm("确定删除此供应商？")) {
      deleteSupplier.mutate(id!, { onSuccess: () => navigate("/suppliers") });
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="rounded-md p-1.5 text-muted-foreground hover:bg-[rgba(44,36,24,0.04)]">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="font-display text-xl font-bold tracking-wide">{supplier.name}</h2>
          <button onClick={() => toggleFav.mutate(id!)} className="text-ink2 hover:text-sub">
            <Star className={`h-5 w-5 ${supplier.is_favorite ? "fill-sub text-sub" : ""}`} />
          </button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/suppliers/${id}/edit`)}>
            <Pencil className="h-4 w-4 mr-1" /> 编辑
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteSupplier.isPending}>
            <Trash2 className="h-4 w-4 mr-1" /> 删除
          </Button>
        </div>
      </div>

      <Separator />

      <Card>
        <CardHeader><CardTitle className="font-display text-sm font-semibold tracking-wide">基本信息</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">类型：</span><Badge variant={typeBadgeVariant[supplier.type] ?? "secondary"}>{typeLabels[supplier.type]}</Badge></div>
          {supplier.rating && <div><span className="text-muted-foreground">评分：</span>{supplier.rating}/5</div>}
          {supplier.contact && <div><span className="text-muted-foreground">联系方式：</span>{supplier.contact}</div>}
          {supplier.website && <div><span className="text-muted-foreground">网址：</span>{supplier.website}</div>}
          {supplier.notes && <div className="md:col-span-2"><span className="text-muted-foreground">备注：</span>{supplier.notes}</div>}
          {supplier.tags?.length > 0 && (
            <div className="md:col-span-2">
              <span className="text-muted-foreground">标签：</span>
              <span className="ml-1 flex gap-1 flex-wrap">
                {supplier.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {supplier.related_assets && supplier.related_assets.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="font-display text-sm font-semibold tracking-wide">关联资产</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {supplier.related_assets.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border border-ink4 px-3 py-2 cursor-pointer hover:bg-[rgba(44,36,24,0.04)]" onClick={() => navigate(`/assets/${a.id}`)}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.name}</span>
                  <Badge variant={typeBadgeVariant[a.type] ?? "secondary"}>{assetTypeLabels[a.type] ?? a.type}</Badge>
                </div>
                <Badge className={statusBadgeStyles[a.status] ?? ""} variant="secondary">{statusLabels[a.status] ?? a.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default SupplierDetail;