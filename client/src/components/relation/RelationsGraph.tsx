import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Waypoints } from "lucide-react";
import { useRelationGraph } from "@/hooks/useRelations";
import type { AssetType } from "@/types/asset";

// v0.9 关联领地：手绘 SVG 环形关联图（零图库依赖，制图学风格）
// 节点=资产（类型色点 + 名称标签），边=关联（向内弯曲贝塞尔，四种关系四种线色/线型）

const TYPE_COLORS: Record<AssetType, string> = {
  physical: "var(--color-phy)",
  digital: "var(--color-dig)",
  subscription: "var(--color-sub)",
};

const TYPE_LABELS: Record<AssetType, string> = { physical: "物理", digital: "数字", subscription: "订阅" };

const RELATION_STYLES: Record<string, { color: string; dash?: string; label: string }> = {
  depends_on: { color: "var(--color-phy)", label: "依赖" },
  contains: { color: "var(--color-dig)", label: "包含" },
  bound_to: { color: "var(--color-sub)", dash: "6 4", label: "绑定" },
  related_to: { color: "var(--color-ink3)", dash: "2 5", label: "相关" },
};

const SIZE = 1000;
const CENTER = SIZE / 2;
const RADIUS = 360;

function polar(angle: number, radius: number): { x: number; y: number } {
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

function truncate(name: string, max: number): string {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

// 标签缓解阈值：节点多于该数时只标注有连接的节点（hover/选中恒显示）
const LABEL_ALL_THRESHOLD = 24;
// 按规模动态截断长度
function labelMaxChars(nodeCount: number): number {
  if (nodeCount <= 16) return 12;
  if (nodeCount <= 40) return 8;
  return 6;
}

const ALL_TYPES: AssetType[] = ["physical", "digital", "subscription"];

function RelationsGraph() {
  const navigate = useNavigate();
  const { data: graph, isLoading } = useRelationGraph();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // 类型过滤：空集合 = 显示全部；点已选 chip 再次切回全部
  const [typeFilter, setTypeFilter] = useState<Set<AssetType>>(new Set());

  const allNodes = graph?.nodes ?? [];
  const allEdges = graph?.edges ?? [];
  const visibleTypes = typeFilter.size > 0 ? typeFilter : new Set(ALL_TYPES);
  const nodes = allNodes.filter((n) => visibleTypes.has(n.type));
  const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const edges = allEdges.filter((e) => nodeIds.has(e.source_id) && nodeIds.has(e.target_id));

  // 节点等距排布在圆环上（服务端已按 type+name 排序，同类型相邻；过滤后重新铺环）
  const positioned = useMemo(() => {
    const count = nodes.length;
    return nodes.map((node, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2; // 从正上方开始
      return { node, angle, ...polar(angle, RADIUS) };
    });
  }, [nodes]);

  const connectedIds = useMemo(() => new Set(edges.flatMap((e) => [e.source_id, e.target_id])), [edges]);
  const orphanCount = nodes.filter((n) => !connectedIds.has(n.id)).length;

  const edgePaths = useMemo(() => {
    const posById = new Map(positioned.map((p) => [p.node.id, p]));
    // 同对资产的多条关系沿弦法线方向并排错开（对径节点弦中点=圆心，靠 pull 无法错开）
    const pairCount = new Map<string, number>();
    const pairIndex = new Map<string, number>();
    edges.forEach((e) => {
      const key = [e.source_id, e.target_id].sort().join("|");
      pairIndex.set(e.id, pairCount.get(key) ?? 0);
      pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
    });
    const pairTotal = new Map(pairCount);

    const paths: Array<{ edge: (typeof edges)[number]; d: string; active: boolean }> = [];
    edges.forEach((edge) => {
      const p1 = posById.get(edge.source_id);
      const p2 = posById.get(edge.target_id);
      if (!p1 || !p2) return;
      const key = [edge.source_id, edge.target_id].sort().join("|");
      const idx = pairIndex.get(edge.id) ?? 0;
      const total = pairTotal.get(key) ?? 1;
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      // 控制点：弦中点向圆心收拢形成内弯，再沿弦法线偏移错开平行边
      const cx0 = CENTER + (mx - CENTER) * 0.4;
      const cy0 = CENTER + (my - CENTER) * 0.4;
      const nx = -(p2.y - p1.y);
      const ny = p2.x - p1.x;
      const len = Math.hypot(nx, ny) || 1;
      const off = (idx - (total - 1) / 2) * 40;
      const cx = cx0 + (nx / len) * off;
      const cy = cy0 + (ny / len) * off;
      const active = highlightId === null || highlightId === edge.source_id || highlightId === edge.target_id;
      paths.push({ edge, d: `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`, active });
    });
    return paths;
  }, [edges, positioned, highlightId]);

  if (isLoading) return <div className="py-12 text-center text-sm text-ink3">加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Waypoints className="h-5 w-5 text-ink2" />
        <h2 className="font-display text-xl font-bold tracking-[2px] uppercase">关联领地</h2>
      </div>

      {allNodes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          暂无资产——先去<a className="text-phy underline underline-offset-2 mx-1" href="/assets/new">新建资产</a>，再在详情页建立关联。
        </div>
      ) : (
        <>
          {/* 图例 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink2" data-testid="graph-legend">
            {Object.entries(RELATION_STYLES).map(([key, style]) => (
              <span key={key} className="flex items-center gap-1.5">
                <svg width="26" height="8">
                  <line x1="0" y1="4" x2="26" y2="4" stroke={style.color} strokeWidth="1.5" strokeDasharray={style.dash} />
                </svg>
                {style.label}
              </span>
            ))}
            <span className="text-ink4">|</span>
            {(["physical", "digital", "subscription"] as const).map((type) => (
              <span key={type} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[type] }} />
                {TYPE_LABELS[type]}
              </span>
            ))}
            {orphanCount > 0 && (
              <span className="text-ink3" data-testid="orphan-hint">当前筛选内 {orphanCount} 件暂无关联</span>
            )}
            <span className="text-ink4">|</span>
            <span className="flex items-center gap-1" data-testid="type-filter">
              {(["all", ...ALL_TYPES] as const).map((t) => {
                const isAll = t === "all";
                const active = isAll ? typeFilter.size === 0 : typeFilter.has(t as AssetType);
                return (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(isAll || typeFilter.has(t as AssetType) ? new Set() : new Set([t as AssetType]))}
                    className={`px-1.5 py-0.5 rounded-md font-medium transition-colors ${active ? "bg-ink text-pg" : "text-ink2 hover:bg-[rgba(44,36,24,.04)]"}`}
                    data-testid={`filter-${t}`}
                  >
                    {isAll ? "全部" : TYPE_LABELS[t as AssetType]}
                  </button>
                );
              })}
            </span>
          </div>

          {edges.length === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="no-relations-hint">
              还没有任何关联——打开资产详情页即可建立依赖、包含、绑定或相关关系。
            </p>
          )}

          {nodes.length === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="filter-empty-hint">
              当前筛选类型下暂无资产——点「全部」或选择其他类型查看。
            </p>
          )}
          <div className="rounded-lg border-[1.5px] border-ink3 bg-pg overflow-hidden">
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-auto select-none" data-testid="relation-svg">
              {/* 连线层 */}
              {edgePaths.map(({ edge, d, active }) => {
                const style = RELATION_STYLES[edge.relation] ?? RELATION_STYLES.related_to;
                return (
                  <path
                    key={edge.id}
                    d={d}
                    fill="none"
                    stroke={style.color}
                    strokeWidth={active ? 2 : 1.2}
                    strokeDasharray={style.dash}
                    opacity={active ? 0.9 : 0.12}
                    data-testid="relation-edge"
                    data-relation={edge.relation}
                  />
                );
              })}
              {/* 节点与标签层 */}
              {positioned.map(({ node, angle, x, y }, i) => {
                const isActive = highlightId === node.id;
                const connected = connectedIds.has(node.id);
                const dimmed = highlightId !== null && !isActive && !edges.some((e) => (e.source_id === highlightId && e.target_id === node.id) || (e.target_id === highlightId && e.source_id === node.id));
                const faded = (node.status === "disposed" || node.status === "expired") ? 0.35 : 1;
                // 相邻节点双档标签半径交错，降低环外标签碰撞
                const labelRadius = RADIUS + (i % 2 === 0 ? 24 : 54);
                const lp = polar(angle, labelRadius);
                const cos = Math.cos(angle);
                const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
                const showLabel = nodes.length <= LABEL_ALL_THRESHOLD || connected || isActive;
                return (
                  <g
                    key={node.id}
                    className="cursor-pointer"
                    onMouseEnter={() => setHighlightId(node.id)}
                    onMouseLeave={() => setHighlightId(null)}
                    onClick={() => navigate(`/assets/${node.id}`)}
                    opacity={dimmed ? 0.15 : faded}
                    data-testid="relation-node"
                    data-node-id={node.id}
                  >
                    {isActive && <circle cx={x} cy={y} r={14} fill="none" stroke={TYPE_COLORS[node.type]} strokeWidth={1} strokeDasharray="3 3" />}
                    {/* 透明命中区：节点圆点小，扩大可点击范围 */}
                    <circle cx={x} cy={y} r={22} fill="transparent" data-testid="relation-node-hit" />
                    <circle cx={x} cy={y} r={connected ? 7 : 4.5} fill={TYPE_COLORS[node.type]} fillOpacity={connected ? 1 : 0.45} data-testid="relation-node-dot" />
                    {showLabel && (
                      <text
                        x={lp.x}
                        y={lp.y}
                        textAnchor={anchor}
                        dominantBaseline="middle"
                        fontSize={isActive ? 17 : 15}
                        fill={isActive ? "var(--color-ink)" : "var(--color-ink2)"}
                        fontFamily="'DM Sans', sans-serif"
                      >
                        {truncate(node.name, labelMaxChars(nodes.length))}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </>
      )}
    </div>
  );
}

export default RelationsGraph;
