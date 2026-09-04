export type ChecklistScenario = "business_trip" | "travel" | "daily_check" | "moving" | "custom";
export type ChecklistStatus = "active" | "completed" | "archived";

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  content: string;
  checked: boolean;
  asset_id: string | null;
  asset_name: string | null;
  asset_type: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Checklist {
  id: string;
  title: string;
  scenario: ChecklistScenario;
  status: ChecklistStatus;
  due_date: string | null;
  notes: string | null;
  kind?: "normal" | "wake_up";
  total_items: number;
  completed_items: number;
  created_at: string;
  updated_at: string;
  items?: ChecklistItem[];
}

export interface ChecklistInput {
  title: string;
  scenario: ChecklistScenario;
  status?: ChecklistStatus;
  due_date?: string | null;
  notes?: string | null;
  items?: { content: string; checked?: boolean; asset_id?: string | null; sort_order?: number }[];
}

export interface ChecklistItemInput {
  content: string;
  asset_id?: string | null;
  sort_order?: number;
}

export const scenarioLabels: Record<ChecklistScenario, string> = {
  business_trip: "出差",
  travel: "旅行",
  daily_check: "日常检查",
  moving: "搬家",
  custom: "自定义",
};

export const statusLabels: Record<ChecklistStatus, string> = {
  active: "进行中",
  completed: "已完成",
  archived: "已归档",
};
