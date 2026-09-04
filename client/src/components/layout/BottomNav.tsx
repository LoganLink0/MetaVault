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
    <nav className="flex md:hidden items-center justify-around border-t border-ink3 bg-pg h-14 safe-b-pb">
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center gap-0.5 text-xs transition-colors",
              isActive ? "text-ink font-semibold" : "text-ink2"
            )
          }
        >
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export default BottomNav;