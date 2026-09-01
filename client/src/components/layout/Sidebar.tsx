import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Building2,
  ClipboardCheck,
  Upload,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "仪表盘", icon: LayoutDashboard },
  { to: "/assets", label: "资产管理", icon: Package },
  { to: "/suppliers", label: "优秀供应商", icon: Building2 },
  { to: "/checklists", label: "检查清单", icon: ClipboardCheck },
  { to: "/import", label: "数据导入", icon: Upload },
  { to: "/export", label: "数据导出", icon: Download },
];

function Sidebar() {
  return (
    <aside className="hidden md:flex w-56 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
          <path d="M12 7l1.5 3.5L17 12l-3.5 1.5L12 17l-1.5-3.5L7 12l3.5-1.5z" />
        </svg>
        <span className="font-display text-[18px] font-bold tracking-[1px] text-sidebar-foreground">
          METAVAULT
        </span>
      </div>
      <nav className="flex-1 space-y-1 px-2 py-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors relative",
                isActive
                  ? "text-sidebar-foreground bg-sidebar-accent after:absolute after:bottom-0 after:left-2 after:right-2 after:h-[2.5px] after:bg-[repeating-linear-gradient(90deg,var(--color-sidebar-foreground)_0px,var(--color-sidebar-foreground)_6px,transparent_6px,transparent_10px)] after:rounded-sm"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;