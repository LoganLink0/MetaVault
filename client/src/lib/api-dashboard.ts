import { apiFetch } from "./api-client";

export interface DashboardOverview {
  totalAssets: number;
  totalSuppliers: number;
  totalValue: number;
  byType: Array<{ type: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
}

export interface SubscriptionSummary {
  monthlyTotal: number;
  yearlyTotal: number;
  items: Array<{ id: string; name: string; amount: number; cycle: string; monthly: number }>;
}

export interface HealthOverview {
  unreadNotifications: number;
  expiringAssets: number;
  expiringDetails: Array<{ id: string; name: string; type: string; ext: unknown }>;
}

export interface TrendItem {
  month: string;
  type: string;
  monthly_cost: number;
}

export interface DustItem {
  id: string;
  name: string;
  type: string;
  last_used: string;
  days_since: number;
  never_used: boolean;
}

export interface SecondConsumption {
  window_days: number;
  consumed: number;
  total: number;
  rate: number;
  dust_list: DustItem[];
}

export function fetchDashboardOverview(): Promise<DashboardOverview> {
  return apiFetch<DashboardOverview>("/dashboard/overview");
}

export function fetchSubscriptionSummary(): Promise<SubscriptionSummary> {
  return apiFetch<SubscriptionSummary>("/dashboard/subscriptions");
}

export function fetchHealthOverview(): Promise<HealthOverview> {
  return apiFetch<HealthOverview>("/dashboard/health");
}

export function fetchDashboardTrends(months?: number): Promise<TrendItem[]> {
  const query = months ? `?months=${months}` : "";
  return apiFetch<TrendItem[]>(`/dashboard/trends${query}`);
}

export function fetchSecondConsumption(): Promise<SecondConsumption> {
  return apiFetch<SecondConsumption>("/dashboard/second-consumption");
}
