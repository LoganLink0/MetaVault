import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchChecklists,
  fetchChecklist,
  createChecklist,
  updateChecklist,
  deleteChecklist,
  addChecklistItem,
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

export function useToggleChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ checklistId, itemId }: { checklistId: string; itemId: string }) => toggleChecklistItem(checklistId, itemId),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["checklists", vars.checklistId] }),
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
