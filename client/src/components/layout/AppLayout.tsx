import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import BottomNav from "./BottomNav";
import ErrorBoundary from "@/components/ErrorBoundary";

function AppLayout() {
  const location = useLocation();
  return (
    <div className="flex h-[100dvh] bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:px-8 md:py-7 relative z-[1]">
          {/* 路由切换淡入上浮：键控路径让每次导航重新编排 */}
          <div key={location.pathname} className="page-enter">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

export default AppLayout;
