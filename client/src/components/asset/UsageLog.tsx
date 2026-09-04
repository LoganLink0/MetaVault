import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2, CalendarPlus, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUsageEvents, useCreateUsageEvent, useBulkCreateUsageEvents, useDeleteUsageEvent, useWakeUpAsset } from "@/hooks/useAssets";
import type { Asset } from "@/types/asset";

const sourceLabels: Record<string, string> = { quick: "一键", backfill: "补录", checklist: "清单" };

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 单次使用成本（v0.6 CP/U）：订阅不参与（持续流出租金，非一次性第一次消费）
function CostPerUse({ asset }: { asset: Asset }) {
  if (asset.type === "subscription") return null;
  if (asset.purchase_price == null || asset.purchase_price <= 0) return null;

  const count = asset.usage_count ?? 0;
  return (
    <span className="text-xs text-muted-foreground whitespace-nowrap" data-testid="cost-per-use">
      {count === 0 ? (
        <span className="rounded-md bg-phy08 px-1.5 py-0.5 font-medium text-wrn">从未二次消费</span>
      ) : (
        <>单次使用成本 <span className="font-mono text-ink">¥{(Number(asset.purchase_price) / count).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</span>/次</>
      )}
    </span>
  );
}

// v0.6 使用日志：一次有意识的使用记一笔（二次消费数据层）
export default function UsageLog({ asset }: { asset: Asset }) {
  const navigate = useNavigate();
  const { data } = useUsageEvents(asset.id, 200);
  const createEvent = useCreateUsageEvent(asset.id);
  const bulkCreate = useBulkCreateUsageEvents(asset.id);
  const deleteEvent = useDeleteUsageEvent(asset.id);
  const wakeUp = useWakeUpAsset();

  const [showBackfill, setShowBackfill] = useState(false);
  const [usedAt, setUsedAt] = useState(localToday());
  const [count, setCount] = useState("1");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");

  const readOnly = asset.status === "disposed" || asset.status === "expired";
  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const pending = createEvent.isPending || bulkCreate.isPending;

  function resetForm() {
    setUsedAt(localToday());
    setCount("1");
    setDuration("");
    setNote("");
  }

  function handleQuick() {
    createEvent.mutate({});
  }

  function handleWakeUp() {
    wakeUp.mutate(asset.id, {
      onSuccess: (result) => {
        toast.success(result.created ? "已加入「唤醒计划」清单" : "该资产已在唤醒计划中", {
          action: { label: "查看", onClick: () => navigate(`/checklists/${result.checklist_id}`) },
        });
      },
    });
  }

  function handleBackfill(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.max(1, Math.min(parseInt(count) || 1, 200));
    // 本地钳制：输入框 min=1 挡不住手输 0/负数/超大值，直接发会被服务端 400
    const minutes = duration.trim() === "" ? undefined : Math.min(1440, Math.max(1, parseInt(duration) || 1));
    const input = {
      used_at: usedAt,
      duration_minutes: minutes,
      note: note.trim() || undefined,
    };
    if (n === 1) {
      createEvent.mutate(input, {
        onSuccess: () => { resetForm(); setShowBackfill(false); },
      });
    } else {
      bulkCreate.mutate(Array.from({ length: n }, () => input), {
        onSuccess: () => { resetForm(); setShowBackfill(false); },
      });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-3">
          <CardTitle className="font-display text-sm font-semibold tracking-wide">
            使用记录{total > 0 && <span className="ml-2 font-mono text-muted-foreground">{total} 次</span>}
          </CardTitle>
          <CostPerUse asset={asset} />
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            {showBackfill ? (
              <Button variant="ghost" size="sm" onClick={() => setShowBackfill(false)}>收起</Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setShowBackfill(true)} data-testid="usage-backfill-toggle">
                <CalendarPlus className="h-4 w-4 mr-1" /> 补录
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleWakeUp} disabled={wakeUp.isPending} data-testid="usage-wakeup-btn" title="加入唤醒计划清单，勾选完成时自动记一次使用">
              <CalendarClock className="h-4 w-4 mr-1" /> 安排使用
            </Button>
            <Button variant="outline" size="sm" onClick={handleQuick} disabled={pending} data-testid="usage-quick-btn">
              <Plus className="h-4 w-4 mr-1" /> {createEvent.isPending ? "记录中..." : "记一次使用"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {readOnly && <div className="text-muted-foreground">资产已{asset.status === "disposed" ? "处置" : "过期"}，不再记录新使用（历史记录保留）。</div>}

        {showBackfill && !readOnly && (
          <form onSubmit={handleBackfill} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end rounded-md border border-ink4 p-3" data-testid="usage-backfill-form">
            <div className="space-y-1">
              <Label htmlFor="usage-date">使用日期</Label>
              <Input id="usage-date" type="date" value={usedAt} max={localToday()} onChange={(e) => setUsedAt(e.target.value)} required data-testid="usage-date-input" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="usage-count">次数</Label>
              <Input id="usage-count" type="number" min={1} max={200} value={count} onChange={(e) => setCount(e.target.value)} data-testid="usage-count-input" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="usage-duration">时长（分钟，可选）</Label>
              <Input id="usage-duration" type="number" min={1} max={1440} value={duration} onChange={(e) => setDuration(e.target.value)} data-testid="usage-duration-input" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="usage-note">备注（可选）</Label>
              <Input id="usage-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="这次用它做了什么" data-testid="usage-note-input" />
            </div>
            <Button type="submit" size="sm" disabled={pending} className="col-span-2 md:col-span-4" data-testid="usage-submit-btn">
              {pending ? "保存中..." : `补录 ${Math.max(1, Math.min(parseInt(count) || 1, 200))} 条`}
            </Button>
          </form>
        )}

        {events.length === 0 ? (
          <div className="text-muted-foreground" data-testid="usage-empty">
            还没有使用记录。买来只是第一次消费，用起来才算数——用了一次就记一笔。
          </div>
        ) : (
          <div className="divide-y divide-ink4">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between gap-2 py-2" data-testid="usage-event-row">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono whitespace-nowrap">{ev.used_at}</span>
                  <Badge variant="secondary" className="shrink-0">{sourceLabels[ev.source] ?? ev.source}</Badge>
                  {ev.duration_minutes != null && <span className="text-muted-foreground whitespace-nowrap font-mono">{ev.duration_minutes} 分钟</span>}
                  {ev.note && <span className="truncate text-muted-foreground">{ev.note}</span>}
                </div>
                <button
                  onClick={() => { if (confirm("删除这条使用记录？")) deleteEvent.mutate(ev.id); }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-[rgba(44,36,24,0.04)] shrink-0"
                  data-testid="usage-delete-btn"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {total > events.length && (
              <div className="pt-2 text-xs text-muted-foreground">仅显示最近 {events.length} 条，共 {total} 条</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
