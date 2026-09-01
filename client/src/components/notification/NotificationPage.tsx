import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, EyeOff, Bell } from "lucide-react";
import { useNotifications, useMarkRead, useDismiss } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const typeLabels: Record<string, string> = {
  warranty_expiry: "保修到期",
  subscription_renewal: "订阅续费",
  digital_expiry: "到期提醒",
  trial_expiry: "试用到期",
  usage_stagnation: "使用停滞",
  deprecation: "严重折旧",
  cancellation_suggestion: "取消建议",
  replacement_suggestion: "替换建议",
};

function NotificationPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "unread">("unread");
  const { data: notifications } = useNotifications(filter === "unread");
  const markRead = useMarkRead();
  const dismiss = useDismiss();

  const filtered = (notifications ?? []).filter((n) =>
    filter === "unread" ? !n.is_read && !n.is_dismissed : !n.is_dismissed
  );

  function markAllRead() {
    filtered.forEach((n) => {
      if (!n.is_read) markRead.mutate(n.id);
    });
  }

  function dismissAll() {
    filtered.forEach((n) => dismiss.mutate(n.id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold tracking-[2px] uppercase">通知</h2>
        <div className="flex items-center gap-2">
          <Button
            variant={filter === "unread" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("unread")}
          >
            未读
          </Button>
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            全部
          </Button>
          {filtered.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={markAllRead}>
                <Check className="h-4 w-4 mr-1" /> 全部已读
              </Button>
              <Button variant="outline" size="sm" onClick={dismissAll}>
                <EyeOff className="h-4 w-4 mr-1" /> 全部忽略
              </Button>
            </>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2" />
            <p>{filter === "unread" ? "没有未读通知" : "没有通知"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <Card key={n.id} className={n.is_read ? "opacity-60" : ""}>
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Badge variant="outline" className="text-xs mb-1">
                      {typeLabels[n.type] ?? n.type}
                    </Badge>
                    <p className="text-sm font-medium">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {n.asset_name && (
                        <span className="cursor-pointer hover:underline text-phy" onClick={() => navigate(`/assets/${n.asset_id}`)}>
                          {n.asset_name}
                        </span>
                      )}
                      {n.asset_name && n.trigger_date ? " · " : ""}
                      {n.trigger_date}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {!n.is_read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => markRead.mutate(n.id)}
                        title="标记已读"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => dismiss.mutate(n.id)}
                      title="忽略"
                    >
                      <EyeOff className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default NotificationPage;