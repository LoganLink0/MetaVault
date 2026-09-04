import { useQuery } from "@tanstack/react-query";
import {
  fetchDashboardOverview,
  fetchSubscriptionSummary,
  fetchHealthOverview,
  fetchDashboardTrends,
  fetchSecondConsumption,
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