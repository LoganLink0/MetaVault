import { useNavigate, useParams } from "react-router-dom";
import { Pencil, Trash2, ArrowLeft, Star } from "lucide-react";
import { useAsset, useDeleteAsset } from "@/hooks/useAssets";
import { useRelations } from "@/hooks/useRelations";
import { useSupplier } from "@/hooks/useSuppliers";
import { useQuery } from "@tanstack/react-query";
import { fetchSuppliers } from "@/lib/api-suppliers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { AssetType, AssetStatus, PhysicalExt, DigitalExt, SubscriptionExt } from "@/types/asset";
import { categoryLabels } from "@/types/asset";
import RelationManager from "@/components/relation/RelationManager";
import UsageLog from "@/components/asset/UsageLog";

const typeLabels: Record<AssetType, string> = { physical: "物理资产", digital: "数字资产", subscription: "订阅" };
const statusLabels: Record<AssetStatus, string> = { active: "使用中", idle: "闲置", expired: "过期", disposed: "已处置" };
const sourceLabels: Record<string, string> = { purchase: "购入", self_build: "自建", donation: "捐赠", transfer: "调拨" };
const usageFreqLabels: Record<string, string> = { daily: "每天", weekly: "每周", monthly: "每月", rarely: "很少" };

const typeBadgeVariant: Record<AssetType, "physical" | "digital" | "subscription"> = {
  physical: "physical",
  digital: "digital",
  subscription: "subscription",
};

const statusBadgeStyles: Record<AssetStatus, string> = {
  active: "bg-[#4a9e6e]/10 text-[#4a9e6e]",
  idle: "bg-sub08 text-sub",
  expired: "bg-phy08 text-wrn",
  disposed: "bg-ink4/50 text-ink2",
};

function ReplacementSuppliers({ navigate }: { navigate: (path: string) => void }) {
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", { type: "physical", favorite: true }],
    queryFn: () => fetchSuppliers({ type: "physical", favorite: true }),
  });

  if (!suppliers?.length) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="font-display text-sm font-semibold tracking-wide">推荐替换供应商</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {suppliers.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-md border border-ink4 px-3 py-2 cursor-pointer hover:bg-[rgba(44,36,24,0.04)]"
            onClick={() => navigate(`/suppliers/${s.id}`)}
          >
            <div className="flex items-center gap-2">
              <Star className={`h-4 w-4 ${s.is_favorite ? "fill-sub text-sub" : ""}`} />
              <span className="font-medium">{s.name}</span>
            </div>
            <Badge variant="outline">{s.type === "mixed" ? "混合" : "物理"}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AssetDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { data: asset, isLoading } = useAsset(id!);
  const { data: relations } = useRelations(id!);
  const deleteAsset = useDeleteAsset();
  const { data: supplier } = useSupplier(asset?.supplier_id ?? "");

  if (isLoading) return <Skeleton className="h-64 rounded-lg" />;
  if (!asset) return <div className="text-muted-foreground">资产不存在</div>;

  const pExt = asset.type === "physical" ? (asset.ext as PhysicalExt) : null;
  const dExt = asset.type === "digital" ? (asset.ext as DigitalExt) : null;
  const sExt = asset.type === "subscription" ? (asset.ext as SubscriptionExt) : null;

  function handleDelete() {
    const relCount = relations?.length ?? 0;
    let message = "确定删除此资产？";
    if (relCount > 0) {
      const names = relations!.slice(0, 3).map((r) =>
        r.source_id === id ? r.target_name : r.source_name
      );
      const suffix = relCount > 3 ? `等 ${relCount} 个` : `${relCount} 个`;
      message = `此资产有 ${suffix}关联关系（${names.join("、")}）。删除后这些关系将一并移除。确定删除？`;
    }
    if (confirm(message)) {
      deleteAsset.mutate(id!, { onSuccess: () => navigate("/assets") });
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* 头部 */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="rounded-md p-1.5 text-muted-foreground hover:bg-[rgba(44,36,24,0.04)]">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="font-display text-xl font-bold tracking-wide">{asset.name}</h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={typeBadgeVariant[asset.type]}>{typeLabels[asset.type]}</Badge>
              <Badge className={statusBadgeStyles[asset.status]} variant="secondary">{statusLabels[asset.status]}</Badge>
              <span>{categoryLabels[asset.category] ?? asset.category}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/assets/${id}/edit`)}>
            <Pencil className="h-4 w-4 mr-1" /> 编辑
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteAsset.isPending}>
            <Trash2 className="h-4 w-4 mr-1" /> 删除
          </Button>
        </div>
      </div>

      <Separator />

      {/* 基本信息 */}
      <Card>
        <CardHeader><CardTitle className="font-display text-sm font-semibold tracking-wide">基本信息</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {asset.purchase_date && <div><span className="text-muted-foreground">获取日期：</span>{asset.purchase_date}</div>}
          {asset.purchase_price != null && <div><span className="text-muted-foreground">获取价格：</span><span className="font-mono">¥{asset.purchase_price.toLocaleString()}</span></div>}
          <div><span className="text-muted-foreground">币种：</span>{asset.currency}</div>
          {asset.supplier_id && supplier && (
            <div><span className="text-muted-foreground">供应商：</span>
              <span className="cursor-pointer hover:underline text-phy" onClick={() => navigate(`/suppliers/${asset.supplier_id}`)}>
                {supplier.is_favorite && <Star className="h-3 w-3 fill-sub text-sub inline mr-0.5" />}
                {supplier.name}
              </span>
            </div>
          )}
          {asset.notes && <div className="md:col-span-2"><span className="text-muted-foreground">备注：</span>{asset.notes}</div>}
          {asset.tags?.length > 0 && (
            <div className="md:col-span-2">
              <span className="text-muted-foreground">标签：</span>
              <span className="ml-1 flex gap-1 flex-wrap">
                {asset.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 扩展信息 */}
      <Card>
        <CardHeader><CardTitle className="font-display text-sm font-semibold tracking-wide">类型详情</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {pExt && (
            <>
              {pExt.model && <div><span className="text-muted-foreground">规格型号：</span>{pExt.model}</div>}
              {pExt.quantity != null && <div><span className="text-muted-foreground">数量：</span>{pExt.quantity}{pExt.unit ? ` ${pExt.unit}` : ""}</div>}
              {pExt.location && <div><span className="text-muted-foreground">存放位置：</span>{pExt.location}</div>}
              {pExt.usage && <div><span className="text-muted-foreground">用途场景：</span>{pExt.usage}</div>}
              {pExt.owner && <div><span className="text-muted-foreground">归属人：</span>{pExt.owner}</div>}
              {pExt.source && <div><span className="text-muted-foreground">资产来源：</span>{sourceLabels[pExt.source] ?? pExt.source}</div>}
              {pExt.warranty_expiry && <div><span className="text-muted-foreground">保修到期：</span>{pExt.warranty_expiry}</div>}
              {pExt.serial_number && <div><span className="text-muted-foreground">序列号：</span><span className="font-mono">{pExt.serial_number}</span></div>}
              {pExt.current_value != null && (
                <div>
                  <span className="text-muted-foreground">当前估值：</span>
                  <span className="font-mono">¥{Number(pExt.current_value).toLocaleString()}</span>
                </div>
              )}
              {pExt.current_value != null && asset.purchase_price != null && asset.purchase_price > 0 && (
                <div className="md:col-span-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-ink4">
                      <div className="h-2 rounded-full bg-phy transition-all" style={{ width: `${Math.min(100, (Number(pExt.current_value) / Number(asset.purchase_price)) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                      残值 {Math.round((Number(pExt.current_value) / Number(asset.purchase_price)) * 100)}%
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
          {dExt && (
            <>
              {dExt.platform && <div><span className="text-muted-foreground">平台：</span>{dExt.platform}</div>}
              {dExt.account && <div><span className="text-muted-foreground">账号：</span>{dExt.account}</div>}
              {dExt.expiry_date && <div><span className="text-muted-foreground">到期日：</span>{dExt.expiry_date}</div>}
              {dExt.usage_stats?.last_access && (
                <div><span className="text-muted-foreground">上次使用：</span>{new Date(dExt.usage_stats.last_access).toLocaleString("zh-CN")}</div>
              )}
            </>
          )}
          {sExt && (
            <>
              {sExt.billing_cycle && <div><span className="text-muted-foreground">计费周期：</span>{sExt.billing_cycle}</div>}
              {sExt.amount != null && <div><span className="text-muted-foreground">每期费用：</span><span className="font-mono">¥{Number(sExt.amount).toLocaleString()}</span></div>}
              {sExt.next_billing_date && <div><span className="text-muted-foreground">下次扣费：</span>{sExt.next_billing_date}</div>}
              {sExt.trial_end && <div><span className="text-muted-foreground">试用到期：</span>{sExt.trial_end}</div>}
              {sExt.usage_frequency && <div><span className="text-muted-foreground">使用频率：</span>{usageFreqLabels[sExt.usage_frequency] ?? sExt.usage_frequency}</div>}
              {sExt.screenshot_url && (
                <div className="md:col-span-2">
                  <span className="text-muted-foreground">订阅截图：</span>
                  <img src={sExt.screenshot_url} alt="订阅截图" className="mt-1 max-w-xs rounded-md border border-ink4" />
                </div>
              )}
            </>
          )}
          {!pExt && !dExt && !sExt && <div className="text-muted-foreground">无扩展信息</div>}
        </CardContent>
      </Card>

      {/* 使用记录（v0.6 二次消费：三类资产通用） */}
      <UsageLog asset={asset} />

      {/* 推荐替换供应商（折旧物理资产） */}
      {asset.type === "physical" && pExt?.current_value != null && asset.purchase_price != null && Number(pExt.current_value) <= Number(asset.purchase_price) * 0.1 && (
        <ReplacementSuppliers navigate={navigate} />
      )}

      {/* 关联资产 */}
      <Card>
        <CardContent className="pt-4">
          <RelationManager assetId={asset.id} />
        </CardContent>
      </Card>
    </div>
  );
}

export default AssetDetail;