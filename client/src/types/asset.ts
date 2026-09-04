export type AssetType = "physical" | "digital" | "subscription";
export type AssetStatus = "active" | "idle" | "expired" | "disposed";

export interface PhysicalExt {
  location?: string;
  warranty_expiry?: string;
  serial_number?: string;
  model?: string;
  quantity?: number;
  unit?: string;
  usage?: string;
  owner?: string;
  source?: string;
  current_value?: number;
}

export interface UsageStats {
  last_access?: string;
}

export interface DigitalExt {
  platform?: string;
  account?: string;
  expiry_date?: string;
  auto_renew?: boolean;
  usage_stats?: UsageStats;
}

export interface SubscriptionExt {
  billing_cycle?: string;
  next_billing_date?: string;
  amount?: number;
  trial_end?: string;
  screenshot_url?: string;
  usage_frequency?: "daily" | "weekly" | "monthly" | "rarely";
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  category: string;
  status: AssetStatus;
  tags: string[];
  purchase_date: string | null;
  purchase_price: number | null;
  currency: string;
  supplier_id: string | null;
  notes: string | null;
  ext: PhysicalExt | DigitalExt | SubscriptionExt;
  usage_count?: number;
  created_at: string;
  updated_at: string;
}

export interface AssetInput {
  name: string;
  type: AssetType;
  category: string;
  status?: AssetStatus;
  tags?: string[];
  purchase_date?: string;
  purchase_price?: number;
  currency?: string;
  supplier_id?: string;
  notes?: string;
  ext?: PhysicalExt | DigitalExt | SubscriptionExt;
}

export interface AssetFilters {
  asset_type?: AssetType;
  status?: AssetStatus;
  category?: string;
  search?: string;
  sort?: "name" | "price" | "created_at" | "updated_at" | "cpu";
}

// v0.6 使用日志（二次消费）
export type UsageEventSource = "quick" | "backfill" | "checklist";

export interface UsageEvent {
  id: string;
  asset_id: string;
  used_at: string;
  duration_minutes: number | null;
  note: string | null;
  source: UsageEventSource;
  created_at: string;
}

export interface UsageEventInput {
  used_at?: string;
  duration_minutes?: number;
  note?: string;
}

export interface UsageEventList {
  total: number;
  events: UsageEvent[];
}

export const categoryLabels: Record<string, string> = {
  "physical.laptop": "笔记本电脑",
  "physical.phone": "手机",
  "physical.monitor": "显示器",
  "physical.furniture": "家具",
  "physical.camera": "相机",
  "physical.book": "书籍",
  "physical.other": "其他物理资产",
  "digital.domain": "域名",
  "digital.course": "在线课程",
  "digital.ebook": "电子书",
  "digital.software_license": "软件许可",
  "digital.account": "数字账号",
  "digital.other": "其他数字资产",
  "subscription.saas": "SaaS 服务",
  "subscription.membership": "会员",
  "subscription.cloud_service": "云服务",
  "subscription.streaming": "流媒体",
  "subscription.insurance": "保险",
  "subscription.other": "其他订阅",
};
