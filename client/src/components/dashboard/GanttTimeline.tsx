import { useMemo } from "react";
import type { Asset, PhysicalExt, DigitalExt, SubscriptionExt } from "@/types/asset";

const TYPE_COLORS = {
  physical: "#3B6B8A",
  digital: "#9B8EC4",
  subscription: "#D4A843",
};

interface TimelineItem {
  id: string;
  name: string;
  type: Asset["type"];
  endDate: string;
  daysLeft: number; // negative = expired
  price: number | null;
  urgency: "expired" | "critical" | "warning" | "safe";
}

function getExt<T>(asset: Asset): T | undefined {
  return asset.ext as T | undefined;
}

function extractTimelineItems(assets: Asset[], now: Date): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const asset of assets) {
    if (asset.type === "physical") {
      const ext = getExt<PhysicalExt>(asset);
      const end = ext?.warranty_expiry ?? "";
      if (!end) continue;
      const daysLeft = Math.ceil((new Date(end).getTime() - now.getTime()) / 86400000);
      if (daysLeft > 60) continue;
      const urgency = daysLeft <= 0 ? "expired" : daysLeft <= 7 ? "critical" : daysLeft <= 30 ? "warning" : "safe";
      items.push({ id: asset.id, name: asset.name, type: "physical", endDate: end, daysLeft, price: asset.purchase_price, urgency });
    } else if (asset.type === "digital") {
      const ext = getExt<DigitalExt>(asset);
      const end = ext?.expiry_date ?? "";
      if (!end) continue;
      const daysLeft = Math.ceil((new Date(end).getTime() - now.getTime()) / 86400000);
      if (daysLeft > 60) continue;
      const urgency = daysLeft <= 0 ? "expired" : daysLeft <= 7 ? "critical" : daysLeft <= 30 ? "warning" : "safe";
      items.push({ id: asset.id, name: asset.name, type: "digital", endDate: end, daysLeft, price: asset.purchase_price, urgency });
    } else {
      const ext = getExt<SubscriptionExt>(asset);
      const end = ext?.next_billing_date ?? "";
      if (!end) continue;
      const daysLeft = Math.ceil((new Date(end).getTime() - now.getTime()) / 86400000);
      if (daysLeft > 60) continue;
      const urgency = daysLeft <= 0 ? "expired" : daysLeft <= 7 ? "critical" : daysLeft <= 30 ? "warning" : "safe";
      items.push({ id: asset.id, name: asset.name, type: "subscription", endDate: end, daysLeft, price: ext?.amount ?? asset.purchase_price, urgency });
    }
  }

  items.sort((a, b) => {
    if (a.urgency !== b.urgency) {
      const order = { expired: 0, critical: 1, warning: 2, safe: 3 };
      return order[a.urgency] - order[b.urgency];
    }
    return a.daysLeft - b.daysLeft;
  });

  return items;
}

interface GanttTimelineProps {
  assets: Asset[];
  onBarClick?: (assetId: string) => void;
}

function GanttTimeline({ assets, onBarClick }: GanttTimelineProps) {
  const now = useMemo(() => new Date(), []);
  const windowDays = 60;

  const items = useMemo(() => extractTimelineItems(assets, now), [assets, now]);

  const svgW = 1100;
  const labelW = 60;
  const chartW = svgW - labelW - 40;
  const chartX = labelW;
  const barH = 44;
  const barGap = 16;
  const zoneY = 80;
  const barsH = items.length * (barH + barGap) + 20;
  const totalSvgH = Math.max(zoneY + barsH + 80, 650);
  const axisY = totalSvgH - 30;

  // Time axis: 0 days (today) to 60 days
  const dayToX = (days: number) => chartX + (Math.max(0, Math.min(days, windowDays)) / windowDays) * chartW;

  // Key markers on the time axis
  const timeMarkers = [
    { days: 0, label: "今天", major: true },
    { days: 7, label: "7天", major: true },
    { days: 14, label: "14天", major: false },
    { days: 30, label: "30天", major: true },
    { days: 45, label: "45天", major: false },
    { days: 60, label: "60天", major: true },
  ];

  if (items.length === 0) {
    return (
      <div className="relative">
        <span className="absolute -top-2 left-3.5 font-mono text-[8px] tracking-[2px] text-ink2 bg-pg px-1.5 z-10">INSET — EXPIRY HEATMAP</span>
        <div className="gantt-wrap border-[1.5px] border-ink3 rounded-lg overflow-hidden bg-pg py-16">
          <p className="text-sm text-muted-foreground text-center">近60天无到期资产</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <span className="absolute -top-2 left-3.5 font-mono text-[8px] tracking-[2px] text-ink2 bg-pg px-1.5 z-10">INSET — EXPIRY HEATMAP</span>
      <div className="gantt-wrap border-[1.5px] border-ink3 rounded-lg overflow-hidden bg-pg h-full flex flex-col">
      <div className="gantt-container overflow-x-auto overflow-y-visible flex-1">
        <svg
          className="block min-w-[1100px]"
          viewBox={`0 0 ${svgW} ${totalSvgH}`}
          preserveAspectRatio="xMidYMin slice"
        >
          <defs>
            <filter id="todayGlow">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <pattern id="gGrid" width={chartW / windowDays} height={barH + barGap} patternUnits="userSpaceOnUse" x={chartX}>
              <line x1="0" y1="0" x2="0" y2={barH + barGap} stroke="#b8a994" strokeWidth=".3" opacity=".2" />
              <line x1="0" y1={barH + barGap - 1} x2={chartW / windowDays} y2={barH + barGap - 1} stroke="#b8a994" strokeWidth=".15" opacity=".12" />
            </pattern>
            <pattern id="gContour" width="200" height="120" patternUnits="userSpaceOnUse">
              <path d="M0 60 Q50 40 100 60 T200 60" fill="none" stroke="#b8a994" strokeWidth=".4" opacity=".12" />
              <path d="M0 100 Q60 80 120 100 T200 100" fill="none" stroke="#b8a994" strokeWidth=".3" opacity=".09" />
              <path d="M0 20 Q70 0 140 20 T200 20" fill="none" stroke="#b8a994" strokeWidth=".3" opacity=".09" />
            </pattern>
            <pattern id="expiredHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="#b8a994" strokeWidth="1" opacity=".3" />
            </pattern>
          </defs>

          {/* Background layers */}
          <rect x="0" y="0" width={svgW} height={totalSvgH} fill="url(#gContour)" />
          <rect x={chartX} y={zoneY - 8} width={chartW} height={items.length * (barH + barGap) + 16} fill="url(#gGrid)" />

          {/* Urgency zone backgrounds */}
          {/* Critical zone: 0-7 days */}
          <rect x={chartX} y={zoneY - 8} width={dayToX(7) - chartX} height={items.length * (barH + barGap) + 16} fill="rgba(231,76,60,.04)" />
          {/* Warning zone: 7-30 days */}
          <rect x={dayToX(7)} y={zoneY - 8} width={dayToX(30) - dayToX(7)} height={items.length * (barH + barGap) + 16} fill="rgba(212,168,67,.03)" />

          {/* Terrain zone tints by type */}
          {["physical", "digital", "subscription"].map((zoneType) => {
            const zoneItems = items.filter(i => i.type === zoneType);
            if (zoneItems.length === 0) return null;
            const firstIdx = items.indexOf(zoneItems[0]);
            const lastIdx = items.indexOf(zoneItems[zoneItems.length - 1]);
            const yTop = zoneY + firstIdx * (barH + barGap) - 4;
            const yBot = zoneY + (lastIdx + 1) * (barH + barGap) + 4;
            const col = TYPE_COLORS[zoneType as keyof typeof TYPE_COLORS];
            const r = parseInt(col.slice(1, 3), 16);
            const g = parseInt(col.slice(3, 5), 16);
            const b = parseInt(col.slice(5, 7), 16);
            return (
              <rect
                key={zoneType}
                x={chartX}
                y={yTop}
                width={chartW}
                height={yBot - yTop}
                rx="4"
                fill={`rgba(${r},${g},${b},.04)`}
                stroke={`rgba(${r},${g},${b},.1)`}
                strokeWidth=".5"
                strokeDasharray="4 2"
              />
            );
          })}

          {/* Heat bars */}
          {items.map((item, idx) => {
            const y = zoneY + idx * (barH + barGap);
            const textY = y + barH / 2 + 4;
            const displayName = item.name.length > 12 ? item.name.slice(0, 12) + "…" : item.name;

            let barCol: string;
            let barOpacity: number;
            let barEndX: number;

            if (item.urgency === "expired") {
              barCol = "#b8a994";
              barOpacity = 0.6;
              barEndX = chartX + 120; // minimum visible width for expired
            } else if (item.urgency === "critical") {
              barCol = "#E74C3C";
              barOpacity = 1;
              barEndX = dayToX(item.daysLeft);
            } else {
              barCol = TYPE_COLORS[item.type];
              barOpacity = item.urgency === "safe" ? 0.5 : 1;
              barEndX = dayToX(item.daysLeft);
            }

            const textOpacity = item.urgency === "expired" ? 0.85 : item.urgency === "safe" ? 0.75 : 1;

            const barW = Math.max(barEndX - chartX, 60);
            const r = parseInt(barCol.slice(1, 3), 16);
            const g = parseInt(barCol.slice(3, 5), 16);
            const b = parseInt(barCol.slice(5, 7), 16);

            const daysLabel = item.urgency === "expired"
              ? "已过期"
              : `${item.daysLeft}天`;

            const textColor = item.urgency === "expired" ? "#6b5d4d" : barCol;

            const labelInside = barW >= 150;

            return (
              <g key={item.id}>
                {/* Bar background */}
                <rect
                  x={chartX}
                  y={y}
                  width={barW}
                  height={barH}
                  rx="6"
                  fill={`rgba(${r},${g},${b},.12)`}
                  stroke={barCol}
                  strokeWidth="1.5"
                  opacity={barOpacity * 0.85}
                  style={{ cursor: "pointer" }}
                  onClick={() => onBarClick?.(item.id)}
                >
                  <title>{item.name}{item.price != null ? ` · ¥${item.price.toLocaleString()}` : ""} · {daysLabel}</title>
                </rect>
                {/* Bar fill */}
                {item.urgency === "expired" ? (
                  <rect x={chartX + 2} y={y + 2} width={Math.max(barW - 4, 2)} height={barH - 4} rx="4" fill="url(#expiredHatch)" style={{ cursor: "pointer" }} onClick={() => onBarClick?.(item.id)} />
                ) : (
                  <rect x={chartX + 2} y={y + 2} width={Math.max(barW - 4, 2)} height={barH - 4} rx="4" fill={barCol} opacity={0.22 * barOpacity} style={{ cursor: "pointer" }} onClick={() => onBarClick?.(item.id)} />
                )}

                <text x={chartX - 6} y={textY} fontFamily="JetBrains Mono,monospace" fontSize="12" fill="#6b5d4d" textAnchor="end">{idx + 1}</text>

                {/* Type icon */}
                {item.type === "physical" && (
                  <rect x={chartX + 8} y={y + barH / 2 - 5} width="9" height="10" rx="1.5" fill={barCol} opacity=".5" />
                )}
                {item.type === "digital" && (
                  <circle cx={chartX + 13} cy={y + barH / 2} r="5" fill={barCol} opacity=".4" />
                )}
                {item.type === "subscription" && (
                  <path d={`M${chartX + 7} ${y + barH / 2} Q${chartX + 13} ${y + barH / 2 - 5} ${chartX + 19} ${y + barH / 2} Q${chartX + 13} ${y + barH / 2 + 5} ${chartX + 7} ${y + barH / 2}`} fill={barCol} opacity=".45" />
                )}

                {labelInside ? (
                  <>
                    <text x={chartX + 26} y={textY} fontFamily="Space Grotesk,sans-serif" fontSize="14" fontWeight="500" fill={textColor} opacity={textOpacity}>{displayName}</text>
                    <text x={chartX + barW - 8} y={textY} fontFamily="JetBrains Mono,monospace" fontSize="12" fontWeight={item.urgency === "critical" ? "600" : "500"} fill={textColor} opacity={textOpacity} textAnchor="end">{daysLabel}</text>
                  </>
                ) : (
                  <>
                    <text x={chartX + barW + 6} y={textY} fontFamily="Space Grotesk,sans-serif" fontSize="14" fontWeight="500" fill={textColor} opacity={textOpacity}>{displayName}</text>
                    <text x={chartX + barW + 10 + displayName.length * 9} y={textY} fontFamily="JetBrains Mono,monospace" fontSize="12" fontWeight={item.urgency === "critical" ? "600" : "500"} fill={textColor} opacity={textOpacity}>{daysLabel}</text>
                  </>
                )}

                {/* Critical: pulsing dashed border */}
                {item.urgency === "critical" && (
                  <rect
                    x={chartX - 2}
                    y={y - 2}
                    width={barW + 4}
                    height={barH + 4}
                    rx="8"
                    fill="none"
                    stroke="#E74C3C"
                    strokeWidth="1.5"
                    strokeDasharray="5 3"
                    style={{ animation: "warnGlow 2s ease-in-out infinite" }}
                  />
                )}
              </g>
            );
          })}

          {/* TODAY line at x=0 */}
          <line x1={chartX} y1="55" x2={chartX} y2={axisY - 10} stroke="#2E7DD1" strokeWidth="2" filter="url(#todayGlow)" />
          <line x1={chartX} y1="55" x2={chartX} y2={axisY - 10} stroke="#2E7DD1" strokeWidth=".5" opacity=".3" strokeDasharray="3 5" />
          <g transform={`translate(${chartX},53)`}>
            <path d="M-7 -14 L7 -14 L7 -4 L0 5 L-7 -4 Z" fill="#2E7DD1" />
            <text x="0" y="-5" fontFamily="JetBrains Mono,monospace" fontSize="9" fontWeight="600" fill="#fff" textAnchor="middle">{now.getDate()}</text>
          </g>

          {/* Time axis */}
          <line x1={chartX} y1={axisY - 8} x2={chartX + chartW} y2={axisY - 8} stroke="#b8a994" strokeWidth=".5" opacity=".5" />
          {timeMarkers.map((m, i) => {
            const x = dayToX(m.days);
            return (
              <g key={i}>
                <line x1={x} y1={axisY - 12} x2={x} y2={axisY - 4} stroke="#b8a994" strokeWidth={m.major ? ".6" : ".4"} opacity={m.major ? ".5" : ".3"} />
                <text x={x} y={axisY + 6} fontFamily="JetBrains Mono,monospace" fontSize={m.major ? "13" : "11"} fill={m.major ? "#6b5d4d" : "#b8a994"} textAnchor="middle">{m.label}</text>
              </g>
            );
          })}

          {/* Zone labels */}
          <text x={dayToX(3.5)} y={axisY + 20} fontFamily="Space Grotesk,sans-serif" fontSize="10" fill="#E74C3C" textAnchor="middle" letterSpacing="1" opacity=".6">紧急</text>
          <text x={dayToX(18.5)} y={axisY + 20} fontFamily="Space Grotesk,sans-serif" fontSize="10" fill="#6b5d4d" textAnchor="middle" letterSpacing="1" opacity=".4">正常</text>
          <text x={dayToX(45)} y={axisY + 20} fontFamily="Space Grotesk,sans-serif" fontSize="10" fill="#b8a994" textAnchor="middle" letterSpacing="1" opacity=".4">远期</text>

          {/* Legend — top-right corner */}
          <g transform={`translate(${chartX + chartW - 400},30)`}>
            <rect x="-6" y="-7" width="410" height="22" fill="rgba(245,240,235,.92)" rx="3" />
            <rect x="0" y="-1" width="14" height="8" rx="2" fill="#3B6B8A" />
            <text x="18" y="7" fontFamily="DM Sans,sans-serif" fontSize="12" fill="#6b5d4d">物理</text>
            <rect x="52" y="-1" width="14" height="8" rx="2" fill="#9B8EC4" />
            <text x="70" y="7" fontFamily="DM Sans,sans-serif" fontSize="12" fill="#6b5d4d">数字</text>
            <rect x="104" y="-1" width="14" height="8" rx="2" fill="#D4A843" />
            <text x="122" y="7" fontFamily="DM Sans,sans-serif" fontSize="12" fill="#6b5d4d">订阅</text>
            <line x1="158" y1="3" x2="174" y2="3" stroke="#2E7DD1" strokeWidth="2" />
            <text x="178" y="7" fontFamily="DM Sans,sans-serif" fontSize="12" fill="#6b5d4d">TODAY</text>
            <rect x="220" y="-1" width="14" height="8" rx="2" fill="#E74C3C" />
            <text x="238" y="7" fontFamily="DM Sans,sans-serif" fontSize="12" fill="#6b5d4d">紧急</text>
            <rect x="274" y="-1" width="14" height="8" rx="2" fill="#b8a994" opacity=".6" stroke="#9e9282" strokeWidth=".5" />
            <text x="292" y="7" fontFamily="DM Sans,sans-serif" fontSize="12" fill="#9e9282">已过期</text>
            <rect x="342" y="-1" width="14" height="8" rx="2" fill="none" stroke="#6b5d4d" strokeWidth="1" strokeDasharray="3 2" opacity=".5" />
            <text x="360" y="7" fontFamily="DM Sans,sans-serif" fontSize="12" fill="#b8a994">远期</text>
          </g>

          {/* Topographic contour lines */}
          {[0, 1, 2, 3, 4, 5].map(i => {
            const cy = 80 + i * Math.min(55, (totalSvgH - 200) / 6);
            return (
              <path
                key={i}
                d={`M${chartX} ${cy} Q${chartX + chartW * .2} ${cy - 15 + i * 3} ${chartX + chartW * .4} ${cy + 5} Q${chartX + chartW * .6} ${cy + 18 - i * 2} ${chartX + chartW * .8} ${cy - 8 + i} Q${chartX + chartW * .95} ${cy + 10} ${chartX + chartW} ${cy}`}
                fill="none"
                stroke="#b8a994"
                strokeWidth=".4"
                opacity={0.1 + i * .015}
              />
            );
          })}
        </svg>
      </div>
      </div>
    </div>
  );
}

export default GanttTimeline;
