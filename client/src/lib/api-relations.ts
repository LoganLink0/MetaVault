import { apiFetch } from "./api-client";
import type { AssetType, AssetStatus } from "@/types/asset";

export interface Relation {
  id: string;
  source_id: string;
  target_id: string;
  relation: "depends_on" | "contains" | "bound_to" | "related_to";
  source_name: string;
  target_name: string;
  created_at: string;
}

export function fetchRelations(assetId: string): Promise<Relation[]> {
  return apiFetch<Relation[]>(`/relations/${assetId}`);
}

export function addRelation(sourceId: string, targetId: string, relation: string): Promise<Relation> {
  return apiFetch<Relation>("/relations", {
    method: "POST",
    body: JSON.stringify({ source_id: sourceId, target_id: targetId, relation }),
  });
}

export function removeRelation(id: string): Promise<void> {
  return apiFetch(`/relations/${id}`, { method: "DELETE" });
}

// v0.9 关联领地：全局关联图
export interface RelationGraphNode {
  id: string;
  name: string;
  type: AssetType;
  status: AssetStatus;
}

export interface RelationGraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation: Relation["relation"];
}

export interface RelationGraph {
  nodes: RelationGraphNode[];
  edges: RelationGraphEdge[];
}

export function fetchRelationGraph(): Promise<RelationGraph> {
  return apiFetch<RelationGraph>("/relations/graph");
}
