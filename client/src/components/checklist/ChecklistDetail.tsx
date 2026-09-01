import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2, Plus, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { useChecklist, useDeleteChecklist, useToggleChecklistItem, useAddChecklistItem, useDeleteChecklistItem, useCompleteChecklist } from "@/hooks/useChecklists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { scenarioLabels, statusLabels } from "@/types/checklist";
import { scenarioColor } from "./templates";

function ChecklistDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { data: checklist, isLoading } = useChecklist(id!);
  const deleteCl = useDeleteChecklist();
  const toggleItem = useToggleChecklistItem();
  const addItem = useAddChecklistItem();
  const deleteItem = useDeleteChecklistItem();
  const completeCl = useCompleteChecklist();
  const [customItem, setCustomItem] = useState("");

  if (isLoading) return <div className="text-center py-8 text-ink3">加载中...</div>;
  if (!checklist) return <div className="text-center py-8 text-ink3">清单不存在</div>;

  const items = checklist.items ?? [];
  const total = items.length;
  const done = items.filter((i) => i.checked).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  function handleToggle(itemId: string) {
    toggleItem.mutate({ checklistId: id!, itemId });
  }

  function handleAddCustomItem() {
    if (!customItem.trim()) return;
    addItem.mutate(
      { checklistId: id!, input: { content: customItem.trim() } },
      { onSuccess: () => setCustomItem("") }
    );
  }

  function handleDeleteItem(itemId: string) {
    deleteItem.mutate({ checklistId: id!, itemId });
  }

  function handleComplete() {
    completeCl.mutate(id!, { onSuccess: () => toast.success("清单已标记完成") });
  }

  function handleDelete() {
    deleteCl.mutate(id!, { onSuccess: () => navigate("/checklists") });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/checklists")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-display text-xl font-bold tracking-[2px] uppercase">{checklist.title}</h2>
        <Badge variant="outline" className={scenarioColor[checklist.scenario]}>
          {scenarioLabels[checklist.scenario]}
        </Badge>
        <Badge variant="outline" className={
          checklist.status === "completed" ? "bg-[#4a9e6e]/10 text-[#4a9e6e] border-[#4a9e6e]/30"
          : checklist.status === "archived" ? "bg-ink4/50 text-ink3 border-ink4"
          : "bg-sub08 text-sub border-sub/30"
        }>
          {statusLabels[checklist.status]}
        </Badge>
      </div>

      {checklist.due_date && (
        <p className="text-sm text-ink2">截止日期：{checklist.due_date}</p>
      )}
      {checklist.notes && (
        <p className="text-sm text-ink2">{checklist.notes}</p>
      )}

      {/* 进度条 */}
      {total > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-ink2">
            <span>{done}/{total} 已完成</span>
            <span className="font-mono">{pct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-ink4 overflow-hidden">
            <div
              className="h-full rounded-full bg-phy transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* 清单项列表 */}
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md border border-ink3 transition-colors ${
              item.checked ? "bg-pg/50" : "bg-pg hover:bg-[rgba(44,36,24,.04)]"
            }`}
          >
            <button
              onClick={() => handleToggle(item.id)}
              className="shrink-0"
              data-testid="toggle-item"
            >
              {item.checked ? (
                <CheckSquare className="h-4 w-4 text-phy" />
              ) : (
                <Square className="h-4 w-4 text-ink3" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <span className={`text-sm ${item.checked ? "line-through text-ink3" : "text-ink"}`}>
                {item.content}
              </span>
              {item.asset_name && (
                <span className={`text-xs ml-1.5 ${item.checked ? "text-ink4" : "text-ink2"}`}>
                  ({item.asset_name})
                </span>
              )}
            </div>
            <button onClick={() => handleDeleteItem(item.id)} className="text-ink3 hover:text-wrn shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* 添加清单项 */}
      {checklist.status === "active" && (
        <div className="flex items-center gap-2">
          <Input
            value={customItem}
            onChange={(e) => setCustomItem(e.target.value)}
            placeholder="添加清单项"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCustomItem(); } }}
          />
          <Button variant="secondary" onClick={handleAddCustomItem} size="sm">
            <Plus className="h-3.5 w-3.5" />
            添加
          </Button>
        </div>
      )}

      {/* 操作按钮 */}
      <Separator />
      <div className="flex flex-wrap gap-2">
        {checklist.status === "active" && done > 0 && (
          <Button variant="outline" onClick={handleComplete}>
            <CheckSquare className="h-4 w-4" />
            标记全部完成
          </Button>
        )}
        <Button variant="outline" onClick={handleDelete} className="text-wrn hover:bg-wrn/10">
          <Trash2 className="h-4 w-4" />
          删除清单
        </Button>
      </div>
    </div>
  );
}

export default ChecklistDetail;