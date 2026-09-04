import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchChecklists,
  fetchChecklist,
  createChecklist,
  updateChecklist,
  deleteChecklist,
  addChecklistItem,
  updateChecklistItem,
  moveChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  completeChecklist,
  archiveChecklist,
  unarchiveChecklist,
} from "@/lib/api-checklists";
import type { ChecklistInput, ChecklistItemInput } from "@/types/checklist";

export function useChecklists(filters?: { scenario?: string; status?: string; search?: string }) {
  return useQuery({
    queryKey: ["checklists", filters],
    queryFn: () => fetchChecklists(filters),
  });
}

export function useChecklist(id: string) {
  return useQuery({
    queryKey: ["checklists", id],
    queryFn: () => fetchChecklist(id),
    enabled: !!id,
  });
}

export function useCreateChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChecklistInput) => createChecklist(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklists"] }),
  });
}

export function useUpdateChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ChecklistInput> }) => updateChecklist(id, input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["checklists"] });
      qc.invalidateQueries({ queryKey: ["checklists", vars.id] });
    },
  });
}

export function useDeleteChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteChecklist(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklists"] }),
  });
}

export function useAddChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ checklistId, input }: { checklistId: string; input: ChecklistItemInput }) => addChecklistItem(checklistId, input),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["checklists", vars.checklistId] }),
  });
}

export function useUpdateChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ checklistId, itemId, content }: { checklistId: string; itemId: string; content: string }) =>
      updateChecklistItem(checklistId, itemId, { content }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["checklists", vars.checklistId] }),
  });
}

export function useMoveChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ checklistId, itemId, direction }: { checklistId: string; itemId: string; direction: "up" | "down" }) =>
      moveChecklistItem(checklistId, itemId, direction),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["checklists", vars.checklistId] }),
  });
}

export function useToggleChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ checklistId, itemId }: { checklistId: string; itemId: string }) => toggleChecklistItem(checklistId, itemId),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["checklists", vars.checklistId] });
      qc.invalidateQueries({ queryKey: ["checklists"] });
      // 唤醒清单勾选会自动记使用 → 资产计数与二次消费面板联动
      if (data?.usage_logged && data.asset_id) {
        qc.invalidateQueries({ queryKey: ["assets"] });
        qc.invalidateQueries({ queryKey: ["assets", data.asset_id] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        qc.invalidateQueries({ queryKey: ["notifications"] });
      }
    },
  });
}

export function useDeleteChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ checklistId, itemId }: { checklistId: string; itemId: string }) => deleteChecklistItem(checklistId, itemId),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["checklists", vars.checklistId] }),
  });
}

export function useCompleteChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => completeChecklist(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["checklists"] });
      qc.invalidateQueries({ queryKey: ["checklists", id] });
      // 唤醒清单整体完成会逐条记使用（记今天会 dismiss 停滞提醒），资产/面板/通知一并刷新
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useArchiveChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveChecklist(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["checklists"] });
      qc.invalidateQueries({ queryKey: ["checklists", id] });
    },
  });
}

export function useUnarchiveChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unarchiveChecklist(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["checklists"] });
      qc.invalidateQueries({ queryKey: ["checklists", id] });
    },
  });
}
