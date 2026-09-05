import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, Trash2, CheckSquare, Square, X } from "lucide-react";
import { useAssets, useDeleteAsset, useUpdateAsset } from "@/hooks/useAssets";
import { fetchRelations } from "@/lib/api-relations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardColorBar } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AssetType, AssetStatus, AssetFilters } from "@/types/asset";
import { categoryLabels } from "@/types/asset";
import { currencySymbol } from "@/lib/currency";

const typeLabels: Record<AssetType, string> = {
  physical: "物理资产",
  digital: "数字资产",
  subscription: "订阅",
};

const statusLabels: Record<AssetStatus, string> = {
  active: "使用中",
  idle: "闲置",
  expired: "过期",
  disposed: "已处置",
};

const typeColorMap: Record<AssetType, string> = {
  physical: "var(--color-phy)",
  digital: "var(--color-dig)",
  subscription: "var(--color-sub)",
};

const statusBadgeStyles: Record<AssetStatus, string> = {
  active: "bg-[#4a9e6e]/10 text-[#4a9e6e]",
  idle: "bg-sub08 text-sub",
  expired: "bg-phy08 text-wrn",
  disposed: "bg-ink4/50 text-ink2",
};

function AssetList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState<AssetStatus | "">("");

  const assetType = searchParams.get("type") as AssetType | null;
  const status = searchParams.get("status") as AssetStatus | null;
  const sort = (searchParams.get("sort") as AssetFilters["sort"]) || "updated_at";
  const search = searchParams.get("q") ?? "";

  const filters: AssetFilters = {
    asset_type: assetType ?? undefined,
    status: status ?? undefined,
    sort,
  };

  const { data: assets, isLoading } = useAssets({
    ...filters,
    search: search || undefined,
  });
  const deleteAsset = useDeleteAsset();
  const updateAsset = useUpdateAsset();

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!assets) return;
    if (selected.size === assets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(assets.map((a) => a.id)));
    }
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
    setBatchStatus("");
  }

  async function batchDelete() {
    let message = `确定删除 ${selected.size} 个资产？`;
    try {
      const allRelations = await Promise.all(
        [...selected].map((id) => fetchRelations(id))
      );
      const uniqueIds = new Set<string>();
      let total = 0;
      for (const rels of allRelations) {
        for (const r of rels) {
          if (!uniqueIds.has(r.id)) {
            uniqueIds.add(r.id);
            total++;
          }
        }
      }
      if (total > 0) {
        message = `删除 ${selected.size} 个资产？将同时移除 ${total} 个关联关系。`;
      }
    } catch {}
    if (!confirm(message)) return;
    selected.forEach((id) => deleteAsset.mutate(id));
    exitSelectMode();
  }

  function batchUpdateStatus() {
    if (!batchStatus) return;
    selected.forEach((id) =>
      updateAsset.mutate({ id, input: { status: batchStatus } as any })
    );
    exitSelectMode();
  }

  return (
    <div className="space-y-4">
      {/* 快速筛选标签栏 */}
      <div className="flex flex-wrap gap-2">
        {(["all", "physical", "digital", "subscription"] as const).map((t) => {
          const isActive = t === "all" ? !assetType : assetType === t;
          const label = t === "all" ? "全部" : typeLabels[t];
          return (
            <button
              key={t}
              onClick={() => {
                const p = new URLSearchParams(searchParams);
                if (t === "all") p.delete("type"); else p.set("type", t);
                setSearchParams(p);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                isActive ? "bg-ink text-pg" : "text-ink2 hover:bg-[rgba(44,36,24,.04)]"
              }`}
            >
              {t !== "all" && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: typeColorMap[t as AssetType] }} />}
              {label}
            </button>
          );
        })}
        <span className="text-ink3 self-center">|</span>
        {(["all", "active", "idle", "expired", "disposed"] as const).map((s) => {
          const isActive = s === "all" ? !status : status === s;
          const label = s === "all" ? "全部" : statusLabels[s];
          return (
            <button
              key={s}
              onClick={() => {
                const p = new URLSearchParams(searchParams);
                if (s === "all") p.delete("status"); else p.set("status", s);
                setSearchParams(p);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                isActive ? "bg-ink text-pg" : "text-ink2 hover:bg-[rgba(44,36,24,.04)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={assetType || "all"}
            onValueChange={(v) => {
              const p = new URLSearchParams(searchParams);
              if (v === "all") p.delete("type"); else p.set("type", v);
              setSearchParams(p);
            }}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="资产类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="physical">物理资产</SelectItem>
              <SelectItem value="digital">数字资产</SelectItem>
              <SelectItem value="subscription">订阅</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={status || "all"}
            onValueChange={(v) => {
              const p = new URLSearchParams(searchParams);
              if (v === "all") p.delete("status"); else p.set("status", v);
              setSearchParams(p);
            }}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">使用中</SelectItem>
              <SelectItem value="idle">闲置</SelectItem>
              <SelectItem value="expired">过期</SelectItem>
              <SelectItem value="disposed">已处置</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sort}
            onValueChange={(v) => {
              const p = new URLSearchParams(searchParams);
              p.set("sort", v);
              setSearchParams(p);
            }}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="排序" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated_at">最近更新</SelectItem>
              <SelectItem value="created_at">最近创建</SelectItem>
              <SelectItem value="name">按名称</SelectItem>
              <SelectItem value="price">按价格</SelectItem>
              <SelectItem value="cpu">最少使用优先</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative hidden md:block w-48">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索..."
              value={search}
              onChange={(e) => {
                const p = new URLSearchParams(searchParams);
                if (e.target.value) p.set("q", e.target.value); else p.delete("q");
                setSearchParams(p);
              }}
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectMode ? (
            <>
              <span className="text-sm text-muted-foreground">已选 {selected.size} 项</span>
              <Button variant="outline" size="sm" onClick={toggleAll}>
                {assets && selected.size === assets.length ? "取消全选" : "全选"}
              </Button>
              <Select value={batchStatus} onValueChange={(v) => setBatchStatus(v as AssetStatus)}>
                <SelectTrigger className="w-[100px] h-8">
                  <SelectValue placeholder="改状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">使用中</SelectItem>
                  <SelectItem value="idle">闲置</SelectItem>
                  <SelectItem value="expired">过期</SelectItem>
                  <SelectItem value="disposed">已处置</SelectItem>
                </SelectContent>
              </Select>
              {batchStatus && (
                <Button variant="outline" size="sm" onClick={batchUpdateStatus}>
                  确认修改
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={batchDelete} disabled={selected.size === 0}>
                <Trash2 className="h-4 w-4 mr-1" /> 删除
              </Button>
              <Button variant="ghost" size="icon" onClick={exitSelectMode} title="退出批量模式">
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
                批量操作
              </Button>
              <Button onClick={() => navigate("/assets/new")} className="hidden md:inline-flex">
                <Plus className="h-4 w-4 mr-1" /> 新建资产
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 资产网格 */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : !assets?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          暂无资产，点击右上角新建
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {assets.map((asset) => (
            <Card
              key={asset.id}
              className={`cursor-pointer transition-shadow hover:shadow-md ${selected.has(asset.id) ? "ring-2 ring-ink" : ""}`}
              onClick={() => {
                if (selectMode) {
                  toggleSelect(asset.id);
                } else {
                  navigate(`/assets/${asset.id}`);
                }
              }}
            >
              <div className="flex">
                <CardColorBar color={typeColorMap[asset.type]} />
                <CardContent className="p-4 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {selectMode && (
                        <span className="mt-0.5">
                          {selected.has(asset.id) ? (
                            <CheckSquare className="h-4 w-4 text-ink" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-medium truncate">{asset.name}</h3>
                        <p className="text-sm text-muted-foreground">{categoryLabels[asset.category] ?? asset.category}</p>
                      </div>
                    </div>
                    <Badge className={statusBadgeStyles[asset.status]} variant="secondary">
                      {statusLabels[asset.status]}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={asset.type}>{typeLabels[asset.type]}</Badge>
                    {asset.purchase_price != null && (
                      <span className="font-mono">{currencySymbol(asset.currency)}{asset.purchase_price.toLocaleString()}</span>
                    )}
                    {asset.type !== "subscription" && asset.usage_count != null && (
                      <span className="font-mono" data-testid="usage-count-badge">{asset.usage_count === 0 ? "从未使用" : `已用 ${asset.usage_count} 次`}</span>
                    )}
                    {asset.tags?.length > 0 && (
                      <span className="truncate">
                        {asset.tags.slice(0, 2).join("、")}
                      </span>
                    )}
                  </div>
                </CardContent>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 手机端 FAB */}
      {!selectMode && (
        <button
          onClick={() => navigate("/assets/new")}
          className="fixed bottom-20 right-4 md:hidden h-12 w-12 rounded-full bg-ink text-pg shadow-lg flex items-center justify-center"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}

export default AssetList;