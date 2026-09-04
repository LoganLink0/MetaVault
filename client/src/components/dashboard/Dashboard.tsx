import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bell, AlertTriangle, RefreshCw, TrendingDown, ClipboardCheck, Zap, CalendarClock, Sparkles } from "lucide-react";
import {
  useDashboardOverview,
  useHealthOverview,
  useSubscriptionSummary,
  useSecondConsumption,
  useMonthlyReview,
} from "@/hooks/useDashboard";
import { useWakeUpAsset } from "@/hooks/useAssets";
import { useAssets } from "@/hooks/useAssets";
import { useChecklists } from "@/hooks/useChecklists";
import { Badge } from "@/components/ui/badge";
import { scenarioLabels } from "@/types/checklist";
import { scenarioColor } from "@/components/checklist/templates";
import GanttTimeline from "./GanttTimeline";
import MiniCalendar from "./MiniCalendar";

const TYPE_COLORS: Record<string, string> = {
  physical: "var(--color-phy)",
  digital: "var(--color-dig)",
  subscription: "var(--color-sub)",
};

const TYPE_LABELS: Record<string, string> = {
  physical: "物理",
  digital: "数字",
  subscription: "订阅",
};

function ReminderPanel() {
  const navigate = useNavigate();
  const { data: health } = useHealthOverview();
  const { data: assets } = useAssets();

  const expiring = health?.expiringDetails ?? [];
  const unread = health?.unreadNotifications ?? 0;

  const expiringByType = useMemo(() => {
    const grouped: Record<string, any[]> = { physical: [], digital: [], subscription: [] };
    for (const item of expiring) {
      if (grouped[item.type] && grouped[item.type].length < 3) {
        grouped[item.type].push(item);
      }
    }
    return grouped;
  }, [expiring]);

  const replacements = (assets ?? [])
    .filter(a => {
      if (a.type !== "physical") return false;
      const ext = a.ext as any;
      return ext?.current_value && a.purchase_price && ext.current_value <= a.purchase_price * 0.1;
    })
    .slice(0, 3);

  const renewalSuggestions = (assets ?? [])
    .filter(a => {
      if (a.type !== "subscription") return false;
      const ext = a.ext as any;
      if (ext?.usage_frequency !== "rarely") return false;
      if (!ext?.next_billing_date) return false;
      const daysLeft = Math.ceil((new Date(ext.next_billing_date).getTime() - Date.now()) / 86400000);
      return daysLeft > 0 && daysLeft <= 7;
    })
    .slice(0, 3);

  function getDaysLeft(item: any): number | null {
    const extRaw = typeof item.ext === "string" ? JSON.parse(item.ext) : item.ext;
    const date = extRaw?.warranty_expiry ?? extRaw?.expiry_date ?? extRaw?.next_billing_date ?? "";
    if (!date) return null;
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
    return days > 0 ? days : null;
  }

  const hasContent = unread > 0
    || Object.values(expiringByType).some(arr => arr.length > 0)
    || replacements.length > 0
    || renewalSuggestions.length > 0;

  return (
    <div className="space-y-3 h-full flex flex-col">
      {unread > 0 && (
        <button
          onClick={() => navigate("/notifications")}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(231,76,60,.08)] border border-[rgba(231,76,60,.2)] text-sm hover:bg-[rgba(231,76,60,.12)] transition-colors"
        >
          <Bell className="h-3.5 w-3.5 text-wrn shrink-0" />
          <span className="text-wrn font-mono font-semibold">{unread}</span>
          <span className="text-ink2 text-xs">条未读提醒</span>
        </button>
      )}

      {(["physical", "digital", "subscription"] as const).map(type => {
        const items = expiringByType[type];
        if (items.length === 0) return null;
        return (
          <div key={type} className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-ink2">
              <AlertTriangle className="h-3 w-3" style={{ color: TYPE_COLORS[type] }} />
              <span>{TYPE_LABELS[type]}即将到期</span>
            </div>
            {items.map((item: any) => {
              const daysLeft = getDaysLeft(item);
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(`/assets/${item.id}`)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-pg border border-ink3 hover:bg-[rgba(44,36,24,.04)] transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[item.type] }} />
                    <span className="text-xs text-ink truncate">{item.name}</span>
                  </div>
                  {daysLeft !== null && (
                    <span className="text-[10px] font-mono shrink-0" style={{ color: TYPE_COLORS[type] }}>{daysLeft}天</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}

      {renewalSuggestions.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-ink2">
            <RefreshCw className="h-3 w-3 text-sub" />
            <span>续费建议</span>
          </div>
          {renewalSuggestions.map((item: any) => (
            <button
              key={item.id}
              onClick={() => navigate(`/assets/${item.id}`)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-pg border border-ink3 hover:bg-[rgba(44,36,24,.04)] transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--color-sub)" }} />
                <span className="text-xs text-ink truncate">{item.name}</span>
              </div>
              <span className="text-[10px] font-mono text-sub shrink-0">考虑取消</span>
            </button>
          ))}
        </div>
      )}

      {replacements.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-ink2">
            <TrendingDown className="h-3 w-3 text-phy" />
            <span>替换建议</span>
          </div>
          {replacements.map((item: any) => (
            <button
              key={item.id}
              onClick={() => navigate(`/assets/${item.id}`)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-pg border border-ink3 hover:bg-[rgba(44,36,24,.04)] transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--color-phy)" }} />
                <span className="text-xs text-ink truncate">{item.name}</span>
              </div>
              <span className="text-[10px] font-mono text-phy shrink-0">低残值</span>
            </button>
          ))}
        </div>
      )}

      {!hasContent && (
        <div className="text-center py-4 flex-1 flex items-center justify-center">
          <p className="text-xs text-ink3">暂无提醒或建议</p>
        </div>
      )}
    </div>
  );
}

function TypeDistribution() {
  const navigate = useNavigate();
  const { data: overview } = useDashboardOverview();

  const byType = overview?.byType ?? [];
  const total = byType.reduce((sum: number, t: any) => sum + t.count, 0) || 1;

  const segments = (["physical", "digital", "subscription"] as const).map(type => {
    const item = byType.find((t: any) => t.type === type);
    const count = item?.count ?? 0;
    return { type, count, pct: Math.round((count / total) * 100) };
  });

  return (
    <div className="bg-pg border-[1.5px] border-ink3 rounded-lg px-4 py-3">
      <div className="flex items-center gap-4">
        {/* Stacked bar */}
        <div className="flex-1 flex h-3 rounded-full overflow-hidden bg-ink3/30">
          {segments.map(s => (
            <button
              key={s.type}
              onClick={() => navigate(`/assets?type=${s.type}`)}
              className="transition-all hover:brightness-110"
              style={{ width: `${s.pct}%`, backgroundColor: TYPE_COLORS[s.type] }}
              title={`${TYPE_LABELS[s.type]} ${s.count}项 ${s.pct}%`}
            />
          ))}
        </div>
        {/* Labels */}
        <div className="flex items-center gap-3 shrink-0">
          {segments.map(s => (
            <button
              key={s.type}
              onClick={() => navigate(`/assets?type=${s.type}`)}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[s.type] }} />
              <span className="font-mono text-[11px] text-ink2">{TYPE_LABELS[s.type]}</span>
              <span className="font-mono text-[11px] font-semibold" style={{ color: TYPE_COLORS[s.type] }}>{s.pct}%</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// v0.8 月度回顾：本月二次消费次数 / 在用资产数 / 唤醒件数 + 最常用 Top3
function MonthlyReviewPanel({ hasAssets }: { hasAssets: boolean }) {
  const navigate = useNavigate();
  const { data: review } = useMonthlyReview();

  if (!review || !hasAssets) return null;
  const monthLabel = `${Number(review.month.slice(5, 7))} 月`;

  return (
    <div className="bg-pg border-[1.5px] border-ink3 rounded-lg px-4 py-3 flex flex-col md:flex-row md:items-center gap-3" data-testid="monthly-review">
      <div className="flex items-center gap-2 shrink-0">
        <Sparkles className="h-3.5 w-3.5 text-sub" />
        <span className="text-xs text-ink2">{monthLabel}回顾</span>
      </div>
      <div className="flex items-center gap-4 font-mono text-sm" data-testid="review-stats">
        <span><span className="font-semibold text-sub">{review.total_uses}</span> <span className="text-[11px] text-ink2 font-sans">次二次消费</span></span>
        <span className="text-ink4">|</span>
        <span><span className="font-semibold text-ink">{review.used_asset_count}</span> <span className="text-[11px] text-ink2 font-sans">件资产在用</span></span>
        <span className="text-ink4">|</span>
        <span><span className="font-semibold" style={{ color: "#4a9e6e" }}>{review.awakened_count}</span> <span className="text-[11px] text-ink2 font-sans">件被唤醒</span></span>
      </div>
      {review.top_assets.length > 0 && (
        <div className="flex items-center gap-2 md:ml-auto min-w-0">
          <span className="text-[11px] text-ink2 shrink-0">最常用</span>
          {review.top_assets.map((a) => (
            <button
              key={a.id}
              onClick={() => navigate(`/assets/${a.id}`)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-ink4 hover:bg-[rgba(44,36,24,.04)] transition-colors min-w-0"
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[a.type] }} />
              <span className="text-xs text-ink truncate max-w-[100px]">{a.name}</span>
              <span className="text-[10px] font-mono text-ink2">×{a.uses}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// v0.6 二次消费面板：消费率（近90天有用过的资产占比）+ 吃灰榜（最久未用 Top N，可一键安排使用）
function SecondConsumptionPanel() {
  const navigate = useNavigate();
  const { data: sc } = useSecondConsumption();
  const wakeUp = useWakeUpAsset();

  if (!sc || sc.total === 0) return null;

  function handleWakeUp(e: React.MouseEvent, assetId: string) {
    e.stopPropagation();
    wakeUp.mutate(assetId, {
      onSuccess: (result) => {
        toast.success(result.created ? "已加入「唤醒计划」清单" : "该资产已在唤醒计划中", {
          action: { label: "查看", onClick: () => navigate(`/checklists/${result.checklist_id}`) },
        });
      },
    });
  }

  return (
    <div className="bg-pg border-[1.5px] border-ink3 rounded-lg px-4 py-3 grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4" data-testid="sc-panel">
      {/* 消费率 */}
      <button
        className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-ink4 px-3 py-3 hover:bg-[rgba(44,36,24,.04)] transition-colors"
        onClick={() => navigate("/assets?sort=cpu")}
        data-testid="sc-rate"
      >
        <span className="font-mono text-2xl font-semibold" style={{ color: "var(--color-sub)" }}>{sc.rate}%</span>
        <span className="text-[10px] text-ink2 text-center leading-tight">近 {sc.window_days} 天二次消费率<br />{sc.consumed}/{sc.total} 件资产</span>
      </button>
      {/* 吃灰榜 */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-ink2 mb-1.5">
          <Zap className="h-3 w-3 text-sub" />
          <span>吃灰榜 · 最久未用</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
          {sc.dust_list.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-1 pl-2 pr-1 py-1 rounded-md hover:bg-[rgba(44,36,24,.04)] transition-colors min-w-0"
              data-testid="sc-dust-item"
            >
              <button
                onClick={() => navigate(`/assets/${item.id}`)}
                className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[item.type] }} />
                <span className="text-xs text-ink truncate">{item.name}</span>
              </button>
              <span className="text-[10px] font-mono shrink-0" style={{ color: item.never_used ? "var(--color-wrn)" : "var(--color-ink3)" }}>
                {item.never_used ? "从未使用" : `${item.days_since} 天未用`}
              </span>
              <button
                onClick={(e) => handleWakeUp(e, item.id)}
                disabled={wakeUp.isPending}
                title="加入唤醒计划清单，勾选完成时自动记一次使用"
                aria-label={`将 ${item.name} 加入唤醒计划`}
                className="rounded-md p-1 text-ink2 hover:bg-[rgba(44,36,24,.08)] shrink-0"
                data-testid="sc-wakeup-btn"
              >
                <CalendarClock className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthlyExpirySummary({ events }: { events: { date: string; type: string }[] }) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const counts = useMemo(() => {
    const c: Record<string, number> = { physical: 0, digital: 0, subscription: 0 };
    for (const e of events) {
      if (e.date.startsWith(thisMonth)) {
        c[e.type] = (c[e.type] ?? 0) + 1;
      }
    }
    return c;
  }, [events, thisMonth]);

  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  if (total === 0) return null;

  return (
    <div className="flex items-center gap-2 px-2 text-[11px] text-ink2">
      <span>本月到期</span>
      {(["physical", "digital", "subscription"] as const).map(type => (
        <span key={type} className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[type] }} />
          <span className="font-mono font-semibold" style={{ color: TYPE_COLORS[type] }}>{counts[type]}</span>
        </span>
      ))}
    </div>
  );
}

function ActiveChecklists() {
  const navigate = useNavigate();
  const { data: checklists } = useChecklists({ status: "active" });

  const active = (checklists ?? []).slice(0, 3);
  if (active.length === 0) return null;

  return (
    <div className="bg-pg border-[1.5px] border-ink3 rounded-lg px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-ink2">
          <ClipboardCheck className="h-3 w-3 text-phy" />
          <span>进行中的清单</span>
        </div>
        <button
          onClick={() => navigate("/checklists")}
          className="text-[11px] text-ink2 hover:text-ink underline underline-offset-2"
        >
          查看全部
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {active.map((cl) => {
          const total = cl.total_items ?? 0;
          const done = cl.completed_items ?? 0;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <button
              key={cl.id}
              onClick={() => navigate(`/checklists/${cl.id}`)}
              data-testid="dashboard-checklist"
              className="flex flex-col gap-1.5 px-3 py-2 rounded-md border border-ink3 bg-pg hover:bg-[rgba(44,36,24,.04)] transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-medium text-ink truncate">{cl.title}</span>
                <Badge variant="outline" className={`shrink-0 ${scenarioColor[cl.scenario]}`}>
                  {scenarioLabels[cl.scenario]}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-ink4 overflow-hidden">
                  <div className="h-full rounded-full bg-phy transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] font-mono text-ink2 shrink-0">{done}/{total}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const { data: overview } = useDashboardOverview();
  const { data: health } = useHealthOverview();
  const { data: subscription } = useSubscriptionSummary();
  const { data: assets } = useAssets();

  const activeCount = (overview?.byStatus ?? []).find((item: any) => item.status === "active")?.count ?? 0;

  const stats = [
    { label: "资产总数", value: String(overview?.totalAssets ?? 0), color: "var(--color-phy)", href: "/assets" },
    { label: "资产总值", value: `¥${((overview?.totalValue ?? 0) as number).toLocaleString()}`, color: "var(--color-dig)", href: "/assets" },
    { label: "即将到期", value: String(health?.expiringAssets ?? 0), color: "var(--color-wrn)", href: "/notifications" },
    { label: "供应商", value: String(overview?.totalSuppliers ?? 0), color: "var(--color-sub)", href: "/suppliers" },
    { label: "使用中", value: String(activeCount), color: "#4a9e6e", href: "/assets?status=active" },
    { label: "订阅月费", value: `¥${(subscription?.monthlyTotal ?? 0).toLocaleString()}`, color: "var(--color-sub)", href: "/assets?type=subscription" },
  ];

  const calendarEvents = (health?.expiringDetails ?? []).map((d: any) => {
    const extRaw = typeof d.ext === "string" ? JSON.parse(d.ext) : d.ext;
    const date = extRaw?.warranty_expiry ?? extRaw?.expiry_date ?? extRaw?.next_billing_date ?? "";
    return { date, type: d.type };
  }).filter((e: any) => e.date);

  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl font-bold tracking-[2px] uppercase">仪表盘</h2>

      {/* Stats strip — 6-cell grid */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-px bg-ink4 rounded-[10px] overflow-hidden border border-ink3">
        {stats.map((s) => (
          <button
            key={s.label}
            onClick={() => navigate(s.href)}
            className="flex flex-col items-center justify-center bg-pg py-3.5 px-2 hover:bg-[rgba(44,36,24,0.04)] transition-colors"
          >
            <span className="font-mono text-xl font-semibold" style={{ color: s.color }}>
              {s.value}
            </span>
            <span className="text-[10px] text-ink2 mt-1 tracking-wide">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Type distribution bar */}
      <TypeDistribution />

      {/* 月度回顾（无资产时隐藏） */}
      <MonthlyReviewPanel hasAssets={(overview?.totalAssets ?? 0) > 0} />

      {/* 二次消费率 + 吃灰榜（无资产时隐藏） */}
      <SecondConsumptionPanel />

      {/* Active checklists (hidden when none) */}
      <ActiveChecklists />

      {/* Calendar + Reminders | Gantt timeline */}
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-5 items-stretch">
        {/* Left column: Calendar + Monthly summary + Reminders */}
        <div className="flex flex-col gap-4">
          <MiniCalendar events={calendarEvents} />
          <MonthlyExpirySummary events={calendarEvents} />
          <div className="relative bg-pg border-[1.5px] border-ink3 rounded-lg p-3.5 flex-1">
            <span className="absolute -top-2 left-3.5 font-mono text-[8px] tracking-[2px] text-ink2 bg-pg px-1.5">
              INSET — REMINDERS & SUGGESTIONS
            </span>
            <ReminderPanel />
          </div>
        </div>

        {/* Right column: Gantt timeline */}
        <div>
          <GanttTimeline assets={assets ?? []} onBarClick={(id) => navigate(`/assets/${id}`)} />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;