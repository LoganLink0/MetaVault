import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Bell, BellOff, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getVapidPublicKey,
  subscribePush,
  unsubscribePush,
} from "@/lib/api-notifications";
import { useNotifications, useScanNotifications } from "@/hooks/useNotifications";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function Header() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchText, setSearchText] = useState(searchParams.get("q") ?? "");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // 通知面板
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const { data: notifications } = useNotifications();
  const unread = notifications?.filter((n: any) => !n.is_read && !n.is_dismissed).length ?? 0;

  // 扫描提醒
  const scan = useScanNotifications();
  const [scanLoading, setScanLoading] = useState(false);

  function handleScan() {
    setScanLoading(true);
    scan.mutate(undefined, {
      onSuccess: () => toast.success("扫描完成"),
      onError: () => toast.error("扫描失败"),
      onSettled: () => setScanLoading(false),
    });
  }

  // 推送开关
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          reg.pushManager.getSubscription().then((sub) => {
            setPushEnabled(!!sub);
          }).catch(() => {});
        }
      }).catch(() => {});
    }
  }, []);

  async function togglePush() {
    if (pushLoading) return;
    setPushLoading(true);
    try {
      if (pushEnabled) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await unsubscribePush(sub.endpoint);
          await sub.unsubscribe();
        }
        setPushEnabled(false);
        toast.success("推送通知已关闭");
      } else {
        if (!("serviceWorker" in navigator)) {
          toast.error("当前浏览器不支持推送通知");
          return;
        }
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          toast.error("需要允许通知权限才能开启推送");
          return;
        }
        const publicKey = await getVapidPublicKey();
        if (!publicKey) {
          toast.error("Web Push 未配置，请检查服务器 VAPID 密钥");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        await subscribePush(sub);
        setPushEnabled(true);
        toast.success("推送通知已开启");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "推送设置失败";
      if (msg.includes("push service") || msg.includes("permission denied") || msg.includes("Registration failed")) {
        toast.error("推送注册失败，请确保：1) 已允许通知权限 2) 使用 localhost:3001 访问（非 5174）");
      } else {
        toast.error(msg);
      }
    } finally {
      setPushLoading(false);
    }
  }

  // 点击外部关闭面板
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchText.trim()) {
      navigate(`/assets?q=${encodeURIComponent(searchText.trim())}`);
    }
  }

  return (
    <header className="nav-dashed-border sticky top-0 z-50 flex h-[54px] items-center justify-between border-b border-ink4/70 bg-pg/85 px-4 md:px-6 gap-2 backdrop-blur-md">
      <div className="flex items-center gap-1">
        {/* 通知铃铛 */}
        <div ref={notifRef} className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setNotifOpen(!notifOpen)}
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-wrn text-[10px] text-white font-bold animate-badge-pulse">
                {unread}
              </span>
            )}
          </Button>
          {notifOpen && (
            <div
              className="absolute left-0 top-full mt-1 w-72 rounded-md border border-ink3 bg-card shadow-lg z-50"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* 内容区 */}
              <div className="max-h-64 overflow-y-auto">
                {notifications && notifications.length > 0 ? (
                  <>
                    {notifications.slice(0, 10).map((n: any) => (
                      <div
                        key={n.id}
                        className="border-b border-ink4 px-3 py-2 text-sm last:border-0"
                      >
                        <p className="font-medium">{n.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {n.trigger_date}
                        </p>
                      </div>
                    ))}
                    <Link
                      to="/notifications"
                      className="block px-3 py-2 text-sm text-center text-muted-foreground hover:text-foreground border-t border-ink4"
                      onClick={() => setNotifOpen(false)}
                    >
                      查看全部通知
                    </Link>
                  </>
                ) : (
                  <div className="py-6 text-center">
                    <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-3">暂无通知</p>
                    <Button variant="outline" size="sm" onClick={handleScan} disabled={scanLoading}>
                      {scanLoading ? "扫描中..." : "扫描提醒"}
                    </Button>
                  </div>
                )}
              </div>
              {/* 推送开关 */}
              <div className="border-t border-ink4 px-3 py-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">推送通知</span>
                  <button
                    onClick={togglePush}
                    disabled={pushLoading}
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-2 py-1 transition-colors",
                      pushEnabled
                        ? "bg-phy/10 text-phy"
                        : "bg-ink4/50 text-ink2"
                    )}
                  >
                    {pushEnabled ? (
                      <>
                        <Bell className="h-3 w-3" />
                        <span>已开启</span>
                      </>
                    ) : (
                      <>
                        <BellOff className="h-3 w-3" />
                        <span>已关闭</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 桌面搜索 */}
      <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-sm">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索资产..."
            className="pl-9"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </form>

      {/* 移动搜索 */}
      {mobileSearchOpen ? (
        <form onSubmit={handleSearch} className="flex md:hidden flex-1 gap-1">
          <Input
            placeholder="搜索资产..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            autoFocus
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMobileSearchOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </form>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileSearchOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      )}
    </header>
  );
}

export default Header;
