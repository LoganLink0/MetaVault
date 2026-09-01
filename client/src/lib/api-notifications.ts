import { apiFetch } from "./api-client";

export interface Notification {
  id: string;
  asset_id: string | null;
  asset_name: string | null;
  checklist_id: string | null;
  checklist_title: string | null;
  type: "warranty_expiry" | "subscription_renewal" | "digital_expiry" | "trial_expiry" | "usage_stagnation" | "deprecation" | "cancellation_suggestion" | "replacement_suggestion" | "checklist_due";
  message: string;
  trigger_date: string;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
}

export function fetchNotifications(unreadOnly = false): Promise<Notification[]> {
  return apiFetch<Notification[]>(`/notifications${unreadOnly ? "?unread_only=true" : ""}`);
}

export function markNotificationRead(id: string): Promise<void> {
  return apiFetch(`/notifications/${id}/read`, { method: "PATCH" });
}

export function dismissNotification(id: string): Promise<void> {
  return apiFetch(`/notifications/${id}/dismiss`, { method: "PATCH" });
}

export function scanNotifications(): Promise<{ scanned: number }> {
  return apiFetch("/notifications/scan", { method: "POST" });
}

export async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await apiFetch<{ publicKey: string }>("/notifications/vapid-public-key");
    return res.publicKey;
  } catch {
    return null;
  }
}

export async function subscribePush(subscription: PushSubscription): Promise<void> {
  await apiFetch("/notifications/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subscription.toJSON().keys,
    }),
  });
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  await apiFetch("/notifications/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}
