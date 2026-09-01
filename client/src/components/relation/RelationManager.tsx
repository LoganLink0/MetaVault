import { useState } from "react";
import { Plus, X, Link2 } from "lucide-react";
import { useRelations, useAddRelation, useRemoveRelation } from "@/hooks/useRelations";
import { fetchAssets } from "@/lib/api-assets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Asset } from "@/types/asset";

const relationLabels: Record<string, string> = {
  depends_on: "依赖",
  contains: "包含",
  bound_to: "绑定",
  related_to: "关联",
};

const relationBadgeVariant: Record<string, "physical" | "digital" | "subscription" | "secondary"> = {
  depends_on: "physical",
  contains: "digital",
  bound_to: "subscription",
  related_to: "secondary",
};

interface Props {
  assetId: string;
}

function RelationManager({ assetId }: Props) {
  const { data: relations, isLoading } = useRelations(assetId);
  const addRelation = useAddRelation();
  const deleteRelation = useRemoveRelation();
  const [adding, setAdding] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [relationType, setRelationType] = useState<string>("related_to");

  async function handleSearch() {
    if (!searchText.trim()) return;
    const results = await fetchAssets({ search: searchText.trim() });
    setSearchResults(results.filter((a) => a.id !== assetId));
  }

  function handleAdd() {
    if (!selectedAsset) return;
    addRelation.mutate(
      {
        sourceId: assetId,
        targetId: selectedAsset.id,
        relation: relationType,
      },
      {
        onSuccess: () => {
          setAdding(false);
          setSelectedAsset(null);
          setSearchText("");
          setSearchResults([]);
        },
      }
    );
  }

  function handleDelete(relationId: string) {
    deleteRelation.mutate(relationId);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold tracking-wide flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          关联资产
        </h3>
        <Button variant="outline" size="sm" onClick={() => setAdding(!adding)}>
          <Plus className="h-4 w-4 mr-1" />
          {adding ? "取消" : "添加"}
        </Button>
      </div>

      {adding && (
        <div className="space-y-2 p-3 border border-ink4 rounded-md bg-muted/30">
          <div className="flex gap-2">
            <Input
              placeholder="搜索资产..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1"
            />
            <Button size="sm" onClick={handleSearch}>
              搜索
            </Button>
          </div>

          {searchResults.length > 0 && !selectedAsset && (
            <div className="max-h-32 overflow-y-auto border border-ink4 rounded-md">
              {searchResults.map((asset) => (
                <button
                  key={asset.id}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-[rgba(44,36,24,0.04)] truncate"
                  onClick={() => setSelectedAsset(asset)}
                >
                  {asset.name}
                  <span className="ml-2 text-muted-foreground text-xs">
                    {asset.category}
                  </span>
                </button>
              ))}
            </div>
          )}

          {selectedAsset && (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{selectedAsset.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => setSelectedAsset(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Select value={relationType} onValueChange={setRelationType}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(relationLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!selectedAsset}
            >
              确认关联
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">加载中...</p>
      ) : !relations?.length ? (
        <p className="text-sm text-muted-foreground">暂无关联</p>
      ) : (
        <>
          {relations.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {Object.entries(
                relations.reduce((acc: Record<string, number>, r: any) => {
                  const label = relationLabels[r.relation] ?? r.relation;
                  acc[label] = (acc[label] || 0) + 1;
                  return acc;
                }, {})
              ).map(([label, count]) => `${count} ${label}`).join(" · ")}
            </p>
          )}
          <div className="space-y-1">
          {relations.map((r: any) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 p-2 border border-ink4 rounded-md text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant={relationBadgeVariant[r.relation] ?? "secondary"}>
                  {relationLabels[r.relation] ?? r.relation}
                </Badge>
                <span className="truncate">{r.target_name ?? r.target_id}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => handleDelete(r.id)}
                title="移除关联"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}

export default RelationManager;