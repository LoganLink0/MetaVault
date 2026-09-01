import { Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/components/dashboard/Dashboard";
import AssetList from "@/components/asset/AssetList";
import AssetDetail from "@/components/asset/AssetDetail";
import AssetForm from "@/components/asset/AssetForm";
import SupplierList from "@/components/supplier/SupplierList";
import SupplierDetail from "@/components/supplier/SupplierDetail";
import SupplierForm from "@/components/supplier/SupplierForm";
import ImportWizard from "@/components/import/ImportWizard";
import ExportPage from "@/components/export/ExportPage";
import NotificationPage from "@/components/notification/NotificationPage";
import ChecklistList from "@/components/checklist/ChecklistList";
import ChecklistDetail from "@/components/checklist/ChecklistDetail";
import ChecklistForm from "@/components/checklist/ChecklistForm";
import ErrorBoundary from "@/components/ErrorBoundary";

function App() {
  return (
    <>
      <ErrorBoundary>
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
      </ErrorBoundary>
      <Toaster position="top-center" richColors />
    </>
  );
}

export default App;