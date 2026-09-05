import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAssets, fetchAsset, createAsset, updateAsset, deleteAsset,
  fetchUsageEvents, createUsageEvent, bulkCreateUsageEvents, deleteUsageEvent,
  wakeUpAsset,
} from "@/lib/api-assets";
import type { AssetInput, AssetFilters, UsageEventInput } from "@/types/asset";

// 记使用类 mutation 的公共失效清单：漏掉 dashboard 会出现"记了使用仪表盘不动"
function invalidateAfterUsageChange(qc: ReturnType<typeof useQueryClient>, assetId: string) {
  qc.invalidateQueries({ queryKey: ["assets"] });
  qc.invalidateQueries({ queryKey: ["assets", assetId] });
  qc.invalidateQueries({ queryKey: ["usage-events", assetId] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["notifications"] });
}

export function useAssets(filters?: AssetFilters) {
  return useQuery({
    queryKey: ["assets", filters],
    queryFn: () => fetchAssets(filters),
  });
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: ["assets", id],
    queryFn: () => fetchAsset(id),
    enabled: !!id,
  });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AssetInput) => createAsset(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["relations", "graph"] });
    },
  });
}

export function useUpdateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AssetInput }) => updateAsset(id, input),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["assets", id] });
      // 状态改为 disposed/expired 会改变二次消费面板口径，一并失效
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["relations", "graph"] });
    },
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAsset(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["relations"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// v0.9 使用历史分页加载（单页 200 条，加载更多增量拉取；失效链靠 ["usage-events", assetId] 前缀匹配）
export function useUsageEvents(assetId: string, limit = 200) {
  return useInfiniteQuery({
    queryKey: ["usage-events", assetId, limit],
    queryFn: ({ pageParam }) => fetchUsageEvents(assetId, limit, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.events.length, 0);
      return fetched < lastPage.total ? fetched : undefined;
    },
    enabled: !!assetId,
  });
}

export function useCreateUsageEvent(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UsageEventInput) => createUsageEvent(assetId, input),
    onSuccess: () => invalidateAfterUsageChange(qc, assetId),
  });
}

export function useBulkCreateUsageEvents(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (events: UsageEventInput[]) => bulkCreateUsageEvents(assetId, events),
    onSuccess: () => invalidateAfterUsageChange(qc, assetId),
  });
}

export function useDeleteUsageEvent(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => deleteUsageEvent(eventId),
    onSuccess: () => invalidateAfterUsageChange(qc, assetId),
  });
}

export function useWakeUpAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => wakeUpAsset(assetId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklists"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["usage-events"] });
    },
  });
}