import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Trash2, ChevronRight, Archive, ArchiveRestore } from "lucide-react";
import { useChecklists, useDeleteChecklist, useArchiveChecklist, useUnarchiveChecklist } from "@/hooks/useChecklists";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { scenarioLabels, statusLabels } from "@/types/checklist";
import type { ChecklistScenario, ChecklistStatus } from "@/types/checklist";
import { scenarioColor } from "./templates";

const SCENARIOS: ChecklistScenario[] = ["business_trip", "travel", "daily_check", "moving", "custom"];
const STATUSES: ChecklistStatus[] = ["active", "completed", "archived"];

function ChecklistList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: checklists, isLoading } = useChecklists({
    scenario: searchParams.get("scenario") || undefined,
    status: searchParams.get("status") || undefined,
  });
  const deleteCl = useDeleteChecklist();
  const archiveCl = useArchiveChecklist();
  const unarchiveCl = useUnarchiveChecklist();

  const activeScenario = searchParams.get("scenario") as ChecklistScenario | null;
  const activeStatus = searchParams.get("status") as ChecklistStatus | null;

  function setFilter(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  if (isLoading) return <div className="text-center py-8 text-ink3">加载中...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold tracking-[2px] uppercase">检查清单</h2>
        <Button onClick={() => navigate("/checklists/new")} size="sm">
          <Plus className="h-4 w-4" />
          新建清单
        </Button>
      </div>

      {/* 快速筛选 */}
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter("scenario", activeScenario === s ? null : s)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
              activeScenario === s
                ? scenarioColor[s]
                : "border-ink3 text-ink2 hover:bg-ink/5"
            }`}
          >
            {scenarioLabels[s]}
          </button>
        ))}
        <span className="border-l border-ink3 mx-1" />
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter("status", activeStatus === s ? null : s)}
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs transition-colors ${
              activeStatus === s
                ? "bg-ink text-pg border-ink"
                : "border-ink3 text-ink2 hover:bg-ink/5"
            }`}
          >
            {statusLabels[s]}
          </button>
        ))}
      </div>

      {/* 清单卡片列表 */}
      {checklists && checklists.length > 0 ? (
        <div className="grid gap-3">
          {checklists.map((cl) => {
            const total = cl.total_items ?? 0;
            const done = cl.completed_items ?? 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;

            return (
              <button
                key={cl.id}
                onClick={() => navigate(`/checklists/${cl.id}`)}
                className="w-full flex items-center gap-4 bg-pg border border-ink3 rounded-lg px-4 py-3 hover:bg-[rgba(44,36,24,.04)] transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-ink truncate">{cl.title}</span>
                    <Badge variant="outline" className={scenarioColor[cl.scenario]}>
                      {scenarioLabels[cl.scenario]}
                    </Badge>
                    <Badge variant="outline" className={
                      cl.status === "completed" ? "bg-grn08 text-grn border-grn/30"
                      : cl.status === "archived" ? "bg-ink4/50 text-ink3 border-ink4"
                      : "bg-sub08 text-sub border-sub/30"
                    }>
                      {statusLabels[cl.status]}
                    </Badge>
                  </div>
                  {cl.due_date && (
                    <p className="text-xs text-ink3">截止：{cl.due_date}</p>
                  )}
                  {total > 0 && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-2 rounded-full bg-ink4 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-phy transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-ink2">{done}/{total}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {cl.status !== "archived" ? (
                    <Archive
                      className="h-3.5 w-3.5 text-ink3 hover:text-ink cursor-pointer shrink-0"
                      data-testid="archive-checklist"
                      onClick={(e) => {
                        e.stopPropagation();
                        archiveCl.mutate(cl.id);
                      }}
                    />
                  ) : (
                    <ArchiveRestore
                      className="h-3.5 w-3.5 text-ink3 hover:text-ink cursor-pointer shrink-0"
                      data-testid="unarchive-checklist"
                      onClick={(e) => {
                        e.stopPropagation();
                        unarchiveCl.mutate(cl.id);
                      }}
                    />
                  )}
                  <Trash2
                    className="h-3.5 w-3.5 text-ink3 hover:text-wrn cursor-pointer shrink-0"
                    data-testid="delete-checklist"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCl.mutate(cl.id);
                    }}
                  />
                  <ChevronRight className="h-4 w-4 text-ink3 shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-sm text-ink3 mb-3">暂无清单</p>
          <Button variant="outline" onClick={() => navigate("/checklists/new")}>
            <Plus className="h-4 w-4" />
            创建第一个清单
          </Button>
        </div>
      )}
    </div>
  );
}

export default ChecklistList;