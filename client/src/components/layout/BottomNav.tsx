import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Building2,
  ClipboardCheck,
  Waypoints,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/", label: "仪表盘", icon: LayoutDashboard },
  { to: "/assets", label: "资产", icon: Package },
  { to: "/relations", label: "关联", icon: Waypoints },
  { to: "/suppliers", label: "供应商", icon: Building2 },
  { to: "/checklists", label: "清单", icon: ClipboardCheck },
];

function BottomNav() {
  return (
    <nav className="flex md:hidden items-center justify-around border-t border-ink3 bg-pg/95 backdrop-blur-md h-14 safe-b-pb">
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center gap-0.5 text-xs min-w-[56px] transition-all active:scale-95",
              isActive ? "text-ink font-semibold" : "text-ink2"
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.2 : 1.8} />
              {label}
              {/* 活动指示点：制图学定位标 */}
              <span
                className={cn("h-1 w-1 rounded-full bg-ink transition-all duration-200", isActive ? "scale-100 opacity-100" : "scale-0 opacity-0")}
              />
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default BottomNav;