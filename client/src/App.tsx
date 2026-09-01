import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import AppLayout from "@/components/layout/AppLayout";
import ErrorBoundary from "@/components/ErrorBoundary";

// 路由级代码分割：手机端首屏只需加载布局壳 + 当前页，
// 避免整包 JS 解析阻塞主线程导致点按跳转卡顿
const Dashboard = lazy(() => import("@/components/dashboard/Dashboard"));
const AssetList = lazy(() => import("@/components/asset/AssetList"));
const AssetDetail = lazy(() => import("@/components/asset/AssetDetail"));
const AssetForm = lazy(() => import("@/components/asset/AssetForm"));
const SupplierList = lazy(() => import("@/components/supplier/SupplierList"));
const SupplierDetail = lazy(() => import("@/components/supplier/SupplierDetail"));
const SupplierForm = lazy(() => import("@/components/supplier/SupplierForm"));
const ImportWizard = lazy(() => import("@/components/import/ImportWizard"));
const ExportPage = lazy(() => import("@/components/export/ExportPage"));
const NotificationPage = lazy(() => import("@/components/notification/NotificationPage"));
const ChecklistList = lazy(() => import("@/components/checklist/ChecklistList"));
const ChecklistDetail = lazy(() => import("@/components/checklist/ChecklistDetail"));
const ChecklistForm = lazy(() => import("@/components/checklist/ChecklistForm"));

function RouteFallback() {
  return <div className="py-12 text-center text-sm text-ink3">加载中...</div>;
}

function App() {
  return (
    <>
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/assets" element={<AssetList />} />
              <Route path="/assets/new" element={<AssetForm />} />
              <Route path="/assets/:id" element={<AssetDetail />} />
              <Route path="/assets/:id/edit" element={<AssetForm />} />
              <Route path="/suppliers" element={<SupplierList />} />
              <Route path="/suppliers/new" element={<SupplierForm />} />
              <Route path="/suppliers/:id" element={<SupplierDetail />} />
              <Route path="/suppliers/:id/edit" element={<SupplierForm />} />
              <Route path="/import" element={<ImportWizard />} />
              <Route path="/export" element={<ExportPage />} />
              <Route path="/notifications" element={<NotificationPage />} />
              <Route path="/checklists" element={<ChecklistList />} />
              <Route path="/checklists/new" element={<ChecklistForm />} />
              <Route path="/checklists/:id" element={<ChecklistDetail />} />
              <Route path="/checklists/:id/edit" element={<ChecklistForm />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <Toaster position="top-center" richColors />
    </>
  );
}

export default App;
