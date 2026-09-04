import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchRelations, addRelation, removeRelation, fetchRelationGraph } from "@/lib/api-relations";

export function useRelationGraph() {
  return useQuery({
    queryKey: ["relations", "graph"],
    queryFn: fetchRelationGraph,
  });
}

export function useRelations(assetId: string) {
  return useQuery({
    queryKey: ["relations", assetId],
    queryFn: () => fetchRelations(assetId),
    enabled: !!assetId,
  });
}

export function useAddRelation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceId, targetId, relation }: { sourceId: string; targetId: string; relation: string }) =>
      addRelation(sourceId, targetId, relation),
    // 失效整个 relations 前缀：详情列表 + 关联领地图（["relations","graph"]）一并刷新
    onSuccess: () => qc.invalidateQueries({ queryKey: ["relations"] }),
  });
}

export function useRemoveRelation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeRelation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["relations"] }),
  });
}