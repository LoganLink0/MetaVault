import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  fetchDashboardOverview,
  fetchSubscriptionSummary,
  fetchHealthOverview,
  fetchDashboardTrends,
  fetchSecondConsumption,
  fetchMonthlyReview,
} from "@/lib/api-dashboard";

export function useDashboardOverview() {
  return useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: fetchDashboardOverview,
  });
}

export function useSecondConsumption() {
  return useQuery({
    queryKey: ["dashboard", "second-consumption"],
    queryFn: fetchSecondConsumption,
  });
}

export function useMonthlyReview(month?: string) {
  return useQuery({
    queryKey: ["dashboard", "monthly-review", month ?? "current"],
    queryFn: () => fetchMonthlyReview(month),
    placeholderData: keepPreviousData, // 翻月时保留上月数据展示，避免整卡卸载闪烁
  });
}

export function useSubscriptionSummary() {
  return useQuery({
    queryKey: ["dashboard", "subscriptions"],
    queryFn: fetchSubscriptionSummary,
  });
}

export function useHealthOverview() {
  return useQuery({
    queryKey: ["dashboard", "health"],
    queryFn: fetchHealthOverview,
  });
}

export function useDashboardTrends(months?: number) {
  return useQuery({
    queryKey: ["dashboard", "trends", months],
    queryFn: () => fetchDashboardTrends(months),
  });
}