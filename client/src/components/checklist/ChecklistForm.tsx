import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { useCreateChecklist } from "@/hooks/useChecklists";
import { useAssets } from "@/hooks/useAssets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import type { ChecklistScenario } from "@/types/checklist";
import { scenarioLabels } from "@/types/checklist";
import { scenarioTemplates, scenarioColor, generateItemsFromTemplate } from "./templates";

const scenarios: ChecklistScenario[] = ["business_trip", "travel", "daily_check", "moving", "custom"];

function ChecklistForm() {
  const navigate = useNavigate();
  const create = useCreateChecklist();
  const { data: assets } = useAssets();

  const [selectedScenario, setSelectedScenario] = useState<ChecklistScenario | null>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ content: string; asset_id: string | null }[]>([]);
  const [customItem, setCustomItem] = useState("");

  function selectScenario(scenario: ChecklistScenario) {
    setSelectedScenario(scenario);
    if (scenario === "custom") {
      setTitle("自定义清单");
      setItems([]);
      return;
    }
    const template = scenarioTemplates.find((t) => t.scenario === scenario);
    if (template) {
      setTitle(template.title);
      const generated = generateItemsFromTemplate(template, (assets ?? []).map((a) => ({
        id: a.id, type: a.type, category: a.category,
      })));
      setItems(generated);
    }
  }

  function addCustomItem() {
    if (!customItem.trim()) return;
    setItems((prev) => [...prev, { content: customItem.trim(), asset_id: null }]);
    setCustomItem("");
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedScenario) { toast.error("请选择场景"); return; }
    if (!title.trim()) { toast.error("请输入标题"); return; }

    create.mutate({
      title: title.trim(),
      scenario: selectedScenario,
      due_date: dueDate || undefined,
      notes: notes.trim() || undefined,
      items: items.map((item, i) => ({
        content: item.content,
        asset_id: item.asset_id,
        sort_order: i,
      })),
    }, {
      onSuccess: (cl) => navigate(`/checklists/${cl.id}`),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-display text-xl font-bold tracking-[2px] uppercase">新建清单</h2>
      </div>

      {/* 选择场景 */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-sm font-semibold tracking-wide text-ink2">选择场景</h3>
          <Separator className="flex-1" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {scenarios.map((s) => (
            <button
              key={s}
              onClick={() => selectScenario(s)}
              data-testid={`scenario-${s}`}
              className={`rounded-lg border px-4 py-3 text-sm text-center transition-colors ${
                selectedScenario === s
                  ? scenarioColor[s]
                  : "border-ink3 text-ink2 hover:bg-ink/5"
              }`}
            >
              <span className="font-medium">{scenarioLabels[s]}</span>
              {s !== "custom" && scenarioTemplates.find((t) => t.scenario === s) && (
                <p className="text-xs mt-1 opacity-70">{scenarioTemplates.find((t) => t.scenario === s)?.description}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {selectedScenario && (
        <>
          {/* 基本信息 */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="font-display text-sm font-semibold tracking-wide text-ink2">基本信息</h3>
              <Separator className="flex-1" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cl-title">标题</Label>
                <Input id="cl-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>截止日期</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>

          {/* 清单项预览 */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="font-display text-sm font-semibold tracking-wide text-ink2">清单项 ({items.length})</h3>
              <Separator className="flex-1" />
            </div>
            {items.length > 0 ? (
              <div className="space-y-1.5">
                {items.map((item, i) => {
                  const linkedAsset = assets?.find((a) => a.id === item.asset_id);
                  return (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-md border border-ink3 bg-pg">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-ink">{item.content}</span>
                        {linkedAsset && (
                          <span className="text-xs text-ink2">({linkedAsset.name})</span>
                        )}
                      </div>
                      <button onClick={() => removeItem(i)} className="text-ink3 hover:text-wrn shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-ink3 text-center py-4">
                {selectedScenario === "custom" ? "添加自定义清单项" : "当前资产无匹配项，可添加自定义项"}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Input
                value={customItem}
                onChange={(e) => setCustomItem(e.target.value)}
                placeholder="添加自定义清单项"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomItem(); } }}
              />
              <Button type="button" variant="secondary" onClick={addCustomItem} size="sm">
                <Plus className="h-3.5 w-3.5" />
                添加
              </Button>
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={create.isPending} data-testid="submit-checklist">
              {create.isPending ? "创建中..." : "创建清单"}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>取消</Button>
          </div>
        </>
      )}
    </form>
  );
}

export default ChecklistForm;