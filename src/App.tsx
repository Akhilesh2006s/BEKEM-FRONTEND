import { useEffect, lazy } from 'react';

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Toaster } from 'sonner';

import { useAuthStore } from '@/stores/authStore';

import { connectSocket, useSocketNotifications } from '@/lib/socket';

import { AppShell } from '@/components/layout/AppShell';

import { LoginPage } from '@/pages/Login';

const RoleHomePage = lazy(() => import('@/pages/RoleHome').then((m) => ({ default: m.RoleHomePage })));
const SiteHomePage = lazy(() => import('@/pages/site/SiteHome').then((m) => ({ default: m.SiteHomePage })));
const StoreHomePage = lazy(() => import('@/pages/store/StoreHome').then((m) => ({ default: m.StoreHomePage })));
const PMHomePage = lazy(() => import('@/pages/pm/PMHome').then((m) => ({ default: m.PMHomePage })));
const ExecutiveHomePage = lazy(() =>
  import('@/pages/executive/ExecutiveHome').then((m) => ({ default: m.ExecutiveHomePage }))
);
const CoordinatorHomePage = lazy(() =>
  import('@/pages/coordinator/CoordinatorHome').then((m) => ({ default: m.CoordinatorHomePage }))
);
const CoordinatorVerifyPOsPage = lazy(() =>
  import('@/pages/coordinator/VerifyPOs').then((m) => ({ default: m.CoordinatorVerifyPOsPage }))
);
const CoordinatorVerifyWOsPage = lazy(() =>
  import('@/pages/coordinator/VerifyWOs').then((m) => ({ default: m.CoordinatorVerifyWOsPage }))
);
const ChairmanHomePage = lazy(() =>
  import('@/pages/chairman/ChairmanHome').then((m) => ({ default: m.ChairmanHomePage }))
);
const ChairmanApprovePOsPage = lazy(() =>
  import('@/pages/chairman/ApprovePOs').then((m) => ({ default: m.ChairmanApprovePOsPage }))
);
const ChairmanApproveWOsPage = lazy(() =>
  import('@/pages/chairman/ApproveWOs').then((m) => ({ default: m.ChairmanApproveWOsPage }))
);
const UserAnalyticsPage = lazy(() =>
  import('@/pages/chairman/UserAnalytics').then((m) => ({ default: m.UserAnalyticsPage }))
);
const RequestWizardPage = lazy(() =>
  import('@/pages/site/RequestWizard').then((m) => ({ default: m.RequestWizardPage }))
);
const MyRequestsPage = lazy(() => import('@/pages/site/MyRequests').then((m) => ({ default: m.MyRequestsPage })));
const RequestDetailPage = lazy(() =>
  import('@/pages/site/RequestDetail').then((m) => ({ default: m.RequestDetailPage }))
);
const AllocateFlowPage = lazy(() =>
  import('@/pages/store/AllocateFlow').then((m) => ({ default: m.AllocateFlowPage }))
);
const StockPage = lazy(() => import('@/pages/store/StockPage').then((m) => ({ default: m.StockPage })));
const StorePendingRequestsPage = lazy(() =>
  import('@/pages/store/StorePendingRequests').then((m) => ({ default: m.StorePendingRequestsPage }))
);
const GrnReceivePage = lazy(() =>
  import('@/pages/store/GrnReceive').then((m) => ({ default: m.GrnReceivePage }))
);
const StoreMaterialGrnPage = lazy(() =>
  import('@/pages/store/StoreMaterialGrn').then((m) => ({ default: m.StoreMaterialGrnPage }))
);
const GrnApprovalsPage = lazy(() =>
  import('@/pages/store/GrnApprovals').then((m) => ({ default: m.GrnApprovalsPage }))
);
const IssueMaterialPage = lazy(() =>
  import('@/pages/store/IssueMaterial').then((m) => ({ default: m.IssueMaterialPage }))
);
const StoreRegistersPage = lazy(() =>
  import('@/pages/store/StoreRegisters').then((m) => ({ default: m.StoreRegistersPage }))
);
const StockAgingPage = lazy(() =>
  import('@/pages/store/StockAgingPage').then((m) => ({ default: m.StockAgingPage }))
);
const BranchTransfersPage = lazy(() =>
  import('@/pages/shared/BranchTransfers').then((m) => ({ default: m.BranchTransfersPage }))
);
const BranchTransferDetailPage = lazy(() =>
  import('@/pages/branchTransfers/BranchTransferDetail').then((m) => ({
    default: m.BranchTransferDetailPage,
  }))
);
const PMBranchTransferRequestsPage = lazy(() =>
  import('@/pages/pm/PMBranchTransferRequests').then((m) => ({
    default: m.PMBranchTransferRequestsPage,
  }))
);
const NotificationsPage = lazy(() =>
  import('@/pages/Notifications').then((m) => ({ default: m.NotificationsPage }))
);
const PmMobileApprovalPage = lazy(() =>
  import('@/pages/pm/PmMobileApproval').then((m) => ({ default: m.PmMobileApprovalPage }))
);
const PmMobilePoApprovalPage = lazy(() =>
  import('@/pages/pm/PmMobilePoApproval').then((m) => ({ default: m.PmMobilePoApprovalPage }))
);
const PMPurchaseRequestsPage = lazy(() =>
  import('@/pages/pm/PMPurchaseRequests').then((m) => ({ default: m.PMPurchaseRequestsPage }))
);
const PmMaterialLookupPage = lazy(() =>
  import('@/pages/pm/PmMaterialLookup').then((m) => ({ default: m.PmMaterialLookupPage }))
);
const CoordinatorHoIndentsPage = lazy(() =>
  import('@/pages/coordinator/CoordinatorHoIndents').then((m) => ({ default: m.CoordinatorHoIndentsPage }))
);
const RfqDetailPage = lazy(() =>
  import('@/pages/rfq/RfqDetailPage').then((m) => ({ default: m.RfqDetailPage }))
);
const POWizardPage = lazy(() => import('@/pages/executive/POWizard').then((m) => ({ default: m.POWizardPage })));
const RfqWizardPage = lazy(() => import('@/pages/executive/RfqWizard').then((m) => ({ default: m.RfqWizardPage })));
const ExecutiveRfqListPage = lazy(() =>
  import('@/pages/executive/ExecutiveRfqList').then((m) => ({ default: m.ExecutiveRfqListPage }))
);
const PODetailPage = lazy(() => import('@/pages/procurement/PODetail').then((m) => ({ default: m.PODetailPage })));
const AuditLogViewerPage = lazy(() =>
  import('@/pages/audit/AuditLogViewer').then((m) => ({ default: m.AuditLogViewerPage }))
);
const ExplorerPage = lazy(() => import('@/pages/explorer/ExplorerPage').then((m) => ({ default: m.ExplorerPage })));
const ReportsHubPage = lazy(() =>
  import('@/pages/reports/ReportsHubPage').then((m) => ({ default: m.ReportsHubPage }))
);
const OperationalReportPage = lazy(() =>
  import('@/pages/reports/OperationalReportPage').then((m) => ({ default: m.OperationalReportPage }))
);
const VendorsListPage = lazy(() => import('@/pages/vendors/VendorsList').then((m) => ({ default: m.VendorsListPage })));
const VendorScorecardPage = lazy(() =>
  import('@/pages/vendors/VendorScorecard').then((m) => ({ default: m.VendorScorecardPage }))
);
const ProfilePage = lazy(() => import('@/pages/Profile').then((m) => ({ default: m.ProfilePage })));
const CreateWorkOrderPage = lazy(() =>
  import('@/pages/executive/CreateWorkOrder').then((m) => ({ default: m.CreateWorkOrderPage }))
);
const WorkOrderDetailPage = lazy(() =>
  import('@/pages/workOrders/WorkOrderDetail').then((m) => ({ default: m.WorkOrderDetailPage }))
);
const UserProvisioningPage = lazy(() =>
  import('@/pages/admin/UserProvisioning').then((m) => ({ default: m.UserProvisioningPage }))
);
const ProjectAdminPage = lazy(() =>
  import('@/pages/admin/ProjectAdmin').then((m) => ({ default: m.ProjectAdminPage }))
);
const VendorAdminPage = lazy(() =>
  import('@/pages/admin/VendorAdmin').then((m) => ({ default: m.VendorAdminPage }))
);
const SettingsAdminPage = lazy(() =>
  import('@/pages/admin/SettingsAdmin').then((m) => ({ default: m.SettingsAdminPage }))
);
const IndentCategoryAdminPage = lazy(() =>
  import('@/pages/admin/IndentCategoryAdmin').then((m) => ({ default: m.IndentCategoryAdminPage }))
);
const CreateMaterialPage = lazy(() =>
  import('@/pages/materials/CreateMaterial').then((m) => ({ default: m.CreateMaterialPage }))
);
const IncidentsPage = lazy(() =>
  import('@/pages/incidents/IncidentsPage').then((m) => ({ default: m.IncidentsPage }))
);
const FinancePage = lazy(() =>
  import('@/pages/finance/FinancePage').then((m) => ({ default: m.FinancePage }))
);
const MonthlyReportPage = lazy(() =>
  import('@/pages/finance/MonthlyReportPage').then((m) => ({ default: m.MonthlyReportPage }))
);
const MiscPurchasesPage = lazy(() =>
  import('@/pages/finance/MiscPurchasesPage').then((m) => ({ default: m.MiscPurchasesPage }))
);
const CategoryReportPage = lazy(() =>
  import('@/pages/materials/CategoryReportPage').then((m) => ({ default: m.CategoryReportPage }))
);
const ExecutivePurchaseRequestDetailPage = lazy(() =>
  import('@/pages/executive/ExecutivePurchaseRequestDetail').then((m) => ({
    default: m.ExecutivePurchaseRequestDetailPage,
  }))
);
const ProcurementDecisionsListPage = lazy(() =>
  import('@/pages/procurement/ProcurementDecisionsList').then((m) => ({
    default: m.ProcurementDecisionsListPage,
  }))
);
const ProcurementDecisionDetailPage = lazy(() =>
  import('@/pages/procurement/ProcurementDecisionDetail').then((m) => ({
    default: m.ProcurementDecisionDetailPage,
  }))
);
const PurchaseOrdersBrowsePage = lazy(() =>
  import('@/pages/shared/PurchaseOrdersBrowsePage').then((m) => ({
    default: m.PurchaseOrdersBrowsePage,
  }))
);
const ProcurementRequestsBrowsePage = lazy(() =>
  import('@/pages/shared/ProcurementRequestsBrowsePage').then((m) => ({
    default: m.ProcurementRequestsBrowsePage,
  }))
);

import { RoleGuard } from '@/components/RoleGuard';

import { UserRole } from '@afios/shared';

import { getRoleHomePath } from '@/lib/rolePaths';



const queryClient = new QueryClient({

  defaultOptions: {

    queries: { retry: 1, staleTime: 30_000 },

  },

});



function ProtectedRoute({ children }: { children: React.ReactNode }) {

  const user = useAuthStore((s) => s.user);

  const accessToken = useAuthStore((s) => s.accessToken);

  const location = useLocation();

  if (!user || !accessToken) {

    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;

  }

  return <>{children}</>;

}



function RoleHomeRedirect() {

  const user = useAuthStore((s) => s.user)!;

  return <Navigate to={getRoleHomePath(user.role)} replace />;

}



function SocketProvider({ children }: { children: React.ReactNode }) {

  const accessToken = useAuthStore((s) => s.accessToken);

  const { setup } = useSocketNotifications();



  useEffect(() => {

    if (accessToken) {

      connectSocket();

      setup();

    }

  }, [accessToken, setup]);



  return <>{children}</>;

}



export default function App() {

  return (

    <QueryClientProvider client={queryClient}>

      <BrowserRouter>

        <SocketProvider>

          <Routes>

            <Route path="/login" element={<LoginPage />} />

            <Route

              element={

                <ProtectedRoute>

                  <AppShell />

                </ProtectedRoute>

              }

            >

              <Route path="/" element={<RoleHomeRedirect />} />

              <Route

                path="/site"

                element={

                  <RoleGuard roles={[UserRole.SITE_INCHARGE]}>

                    <SiteHomePage />

                  </RoleGuard>

                }

              />

              <Route

                path="/store"

                element={

                  <RoleGuard roles={[UserRole.STORE_INCHARGE]}>

                    <StoreHomePage />

                  </RoleGuard>

                }

              />

              <Route

                path="/pm"

                element={

                  <RoleGuard roles={[UserRole.PROJECT_MANAGER]}>

                    <PMHomePage />

                  </RoleGuard>

                }

              />

              <Route

                path="/executive"

                element={

                  <RoleGuard roles={[UserRole.EXECUTIVE]}>

                    <ExecutiveHomePage />

                  </RoleGuard>

                }

              />

              <Route
                path="/coordinator"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR]}>
                    <CoordinatorHomePage />
                  </RoleGuard>
                }
              />

              <Route
                path="/coordinator/verify-pos"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR]}>
                    <CoordinatorVerifyPOsPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/coordinator/purchase-orders"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR]}>
                    <PurchaseOrdersBrowsePage
                      subtitle="All purchase orders — verify pending ones from Verify POs"
                      detailPath={(id) => `/coordinator/po/${id}`}
                    />
                  </RoleGuard>
                }
              />

              <Route
                path="/coordinator/procurement-requests"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR]}>
                    <ProcurementRequestsBrowsePage
                      subtitle="All procurement requests — approve linked POs from Verify POs"
                      detailPath={() => `/coordinator/purchase-orders`}
                    />
                  </RoleGuard>
                }
              />

              <Route
                path="/coordinator/grn"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR]}>
                    <GrnReceivePage />
                  </RoleGuard>
                }
              />

              <Route
                path="/coordinator/grn-approvals"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR]}>
                    <GrnApprovalsPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/coordinator/verify-wos"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR]}>
                    <CoordinatorVerifyWOsPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/chairman"
                element={
                  <RoleGuard roles={[UserRole.CHAIRMAN]}>
                    <ChairmanHomePage />
                  </RoleGuard>
                }
              />

              <Route
                path="/chairman/approve-pos"
                element={
                  <RoleGuard roles={[UserRole.CHAIRMAN]}>
                    <ChairmanApprovePOsPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/chairman/purchase-orders"
                element={
                  <RoleGuard roles={[UserRole.CHAIRMAN]}>
                    <PurchaseOrdersBrowsePage
                      subtitle="All purchase orders — approve pending ones from Approve POs"
                      detailPath={(id) => `/chairman/po/${id}`}
                    />
                  </RoleGuard>
                }
              />

              <Route
                path="/chairman/procurement-requests"
                element={
                  <RoleGuard roles={[UserRole.CHAIRMAN]}>
                    <ProcurementRequestsBrowsePage
                      subtitle="All procurement requests — approve linked POs from Approve POs"
                      detailPath={() => `/chairman/purchase-orders`}
                    />
                  </RoleGuard>
                }
              />

              <Route
                path="/chairman/approve-wos"
                element={
                  <RoleGuard roles={[UserRole.CHAIRMAN]}>
                    <ChairmanApproveWOsPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/chairman/user-analytics"
                element={
                  <RoleGuard capability="VIEW_USER_ANALYTICS">
                    <UserAnalyticsPage />
                  </RoleGuard>
                }
              />



              <Route path="/notifications" element={<NotificationsPage />} />

              <Route path="/profile" element={<ProfilePage />} />

              <Route
                path="/admin/users"
                element={
                  <RoleGuard systemAdmin>
                    <UserProvisioningPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/admin/projects"
                element={
                  <RoleGuard capability="MANAGE_PROJECTS">
                    <ProjectAdminPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/admin/vendors"
                element={
                  <RoleGuard capability="MANAGE_VENDORS">
                    <VendorAdminPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/admin/settings"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR, UserRole.CHAIRMAN]}>
                    <SettingsAdminPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/admin/indent-categories"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR, UserRole.CHAIRMAN]}>
                    <IndentCategoryAdminPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/materials/new"
                element={
                  <RoleGuard capability="CREATE_INVENTORY_ITEM">
                    <CreateMaterialPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/incidents"
                element={
                  <RoleGuard
                    capabilities={['CREATE_MATERIAL_REQUEST', 'VIEW_INCIDENTS', 'VIEW_ALL_PROJECTS']}
                    match="any"
                  >
                    <IncidentsPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/pm/material-indents"
                element={
                  <RoleGuard roles={[UserRole.PROJECT_MANAGER]}>
                    <IncidentsPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/executive/material-indents"
                element={
                  <RoleGuard roles={[UserRole.EXECUTIVE]}>
                    <IncidentsPage />
                  </RoleGuard>
                }
              />

              <Route path="/executive/rfq" element={<Navigate to="/executive/material-indents" replace />} />
              <Route path="/executive/rfqs" element={<Navigate to="/executive/material-indents" replace />} />

              <Route
                path="/executive/rfq/inbox"
                element={<Navigate to="/executive/material-indents" replace />}
              />

              <Route
                path="/coordinator/rfq/inbox"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR]}>
                    <ExecutiveRfqListPage browseOnly />
                  </RoleGuard>
                }
              />

              <Route
                path="/executive/ho-indents"
                element={<Navigate to="/coordinator/ho-indents" replace />}
              />

              <Route
                path="/coordinator/ho-indents"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR]}>
                    <CoordinatorHoIndentsPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/rfqs/:id"
                element={
                  <RoleGuard roles={[UserRole.EXECUTIVE, UserRole.COORDINATOR, UserRole.CHAIRMAN]} match="any">
                    <RfqDetailPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/executive/procurement-decisions"
                element={<Navigate to="/executive/material-indents" replace />}
              />

              <Route
                path="/executive/procurement-decisions/:id"
                element={
                  <RoleGuard roles={[UserRole.EXECUTIVE]}>
                    <ProcurementDecisionDetailPage listPath="/executive/material-indents" />
                  </RoleGuard>
                }
              />

              <Route
                path="/executive/finance"
                element={
                  <RoleGuard capability="VIEW_FINANCE">
                    <FinancePage />
                  </RoleGuard>
                }
              />

              <Route
                path="/coordinator/finance"
                element={
                  <RoleGuard capability="VIEW_FINANCE">
                    <FinancePage />
                  </RoleGuard>
                }
              />

              <Route
                path="/chairman/finance"
                element={
                  <RoleGuard capability="VIEW_FINANCE">
                    <FinancePage />
                  </RoleGuard>
                }
              />

              <Route
                path="/chairman/grn-approvals"
                element={
                  <RoleGuard roles={[UserRole.CHAIRMAN]}>
                    <GrnApprovalsPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/pm/finance"
                element={
                  <RoleGuard capability="VIEW_FINANCE">
                    <FinancePage />
                  </RoleGuard>
                }
              />

              <Route
                path="/store/finance"
                element={
                  <RoleGuard capability="VIEW_FINANCE">
                    <FinancePage />
                  </RoleGuard>
                }
              />

              {[
                '/executive/finance/monthly-report',
                '/coordinator/finance/monthly-report',
                '/chairman/finance/monthly-report',
                '/pm/finance/monthly-report',
                '/store/finance/monthly-report',
              ].map((path) => (
                <Route
                  key={path}
                  path={path}
                  element={
                    <RoleGuard capability="VIEW_FINANCE">
                      <MonthlyReportPage />
                    </RoleGuard>
                  }
                />
              ))}

              {[
                '/executive/misc-purchases',
                '/coordinator/misc-purchases',
                '/chairman/misc-purchases',
                '/pm/misc-purchases',
              ].map((path) => (
                <Route
                  key={path}
                  path={path}
                  element={
                    <RoleGuard capability="VIEW_FINANCE">
                      <MiscPurchasesPage />
                    </RoleGuard>
                  }
                />
              ))}

              <Route
                path="/admin/materials/category-report"
                element={
                  <RoleGuard capability="VIEW_FINANCE">
                    <CategoryReportPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/executive/vendors/new"
                element={
                  <RoleGuard capability="CREATE_VENDOR">
                    <VendorAdminPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/executive/purchase-requests"
                element={<Navigate to="/executive/material-indents" replace />}
              />

              <Route
                path="/executive/purchase-requests/:id"
                element={
                  <RoleGuard roles={[UserRole.EXECUTIVE]}>
                    <ExecutivePurchaseRequestDetailPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/coordinator/procurement-decisions"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR, UserRole.CHAIRMAN]}>
                    <ProcurementDecisionsListPage
                      basePath="/coordinator/procurement-decisions"
                      title="Procurement Decisions"
                      subtitle="Legacy branch-transfer recommendations only — POs are approved in the PO module"
                      emptyTitle="No decisions awaiting approval"
                      emptyDescription="Executive procurement decisions will appear here."
                    />
                  </RoleGuard>
                }
              />

              <Route
                path="/coordinator/procurement-decisions/:id"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR, UserRole.CHAIRMAN]}>
                    <ProcurementDecisionDetailPage listPath="/coordinator/procurement-decisions" />
                  </RoleGuard>
                }
              />

              <Route
                path="/coordinator/material-indents"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR]}>
                    <IncidentsPage />
                  </RoleGuard>
                }
              />



              <Route

                path="/store/stock"

                element={

                  <RoleGuard
                    roles={[
                      UserRole.STORE_INCHARGE,
                      UserRole.PROJECT_MANAGER,
                      UserRole.EXECUTIVE,
                      UserRole.COORDINATOR,
                      UserRole.CHAIRMAN,
                    ]}
                  >

                    <StockPage />

                  </RoleGuard>

                }

              />

              <Route

                path="/store/requests"

                element={

                  <RoleGuard roles={[UserRole.STORE_INCHARGE]}>

                    <StorePendingRequestsPage />

                  </RoleGuard>

                }

              />

              <Route
                path="/store/completed"
                element={<Navigate to="/store/requests?tab=completed" replace />}
              />
              <Route
                path="/store/verify-delivery"
                element={<Navigate to="/store/grn" replace />}
              />

              <Route

                path="/store/grn"

                element={

                  <RoleGuard roles={[UserRole.STORE_INCHARGE]}>

                    <StoreMaterialGrnPage />

                  </RoleGuard>

                }

              />

              <Route
                path="/store/purchase-orders"
                element={
                  <RoleGuard roles={[UserRole.STORE_INCHARGE]}>
                    <PurchaseOrdersBrowsePage
                      subtitle="All purchase orders for your assigned projects (view only)"
                      detailPath={(id) => `/purchase-orders/${id}`}
                    />
                  </RoleGuard>
                }
              />

              <Route
                path="/store/procurement-requests"
                element={<Navigate to="/store/purchase-orders" replace />}
              />

              <Route

                path="/store/issue"

                element={

                  <RoleGuard roles={[UserRole.STORE_INCHARGE]}>

                    <IssueMaterialPage />

                  </RoleGuard>

                }

              />

              <Route
                path="/store/registers"
                element={
                  <RoleGuard roles={[UserRole.STORE_INCHARGE, UserRole.COORDINATOR, UserRole.CHAIRMAN]}>
                    <StoreRegistersPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/store/stock-aging"
                element={
                  <RoleGuard
                    roles={[
                      UserRole.STORE_INCHARGE,
                      UserRole.PROJECT_MANAGER,
                      UserRole.COORDINATOR,
                      UserRole.CHAIRMAN,
                    ]}
                  >
                    <StockAgingPage />
                  </RoleGuard>
                }
              />

              <Route

                path="/pm/material-lookup"

                element={

                  <RoleGuard roles={[UserRole.PROJECT_MANAGER]}>

                    <PmMaterialLookupPage />

                  </RoleGuard>

                }

              />

              <Route
                path="/pm/approvals"
                element={<Navigate to="/pm/material-indents?tab=pending&queue=approved-store" replace />}
              />

              <Route

                path="/pm/mobile-approve/:id"

                element={

                  <RoleGuard roles={[UserRole.PROJECT_MANAGER]}>

                    <PmMobileApprovalPage />

                  </RoleGuard>

                }

              />

              <Route
                path="/pm/mobile-po-approve/:id"
                element={
                  <RoleGuard roles={[UserRole.PROJECT_MANAGER]}>
                    <PmMobilePoApprovalPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/pm/approve-pos"
                element={<Navigate to="/pm/purchase-orders" replace />}
              />

              <Route
                path="/pm/purchase-orders"
                element={
                  <RoleGuard roles={[UserRole.PROJECT_MANAGER]}>
                    <PurchaseOrdersBrowsePage
                      subtitle="All purchase orders for your assigned projects (view only)"
                      detailPath={(id) => `/pm/po/${id}`}
                    />
                  </RoleGuard>
                }
              />

              <Route
                path="/pm/procurement-requests"
                element={<Navigate to="/pm/material-indents" replace />}
              />

              <Route

                path="/pm/po/:id"

                element={

                  <RoleGuard roles={[UserRole.PROJECT_MANAGER]}>

                    <PODetailPage />

                  </RoleGuard>

                }

              />

              <Route

                path="/pm/purchase-requests"

                element={

                  <RoleGuard roles={[UserRole.PROJECT_MANAGER]}>

                    <PMPurchaseRequestsPage />

                  </RoleGuard>

                }

              />

              <Route
                path="/store/branch-transfers"
                element={<Navigate to="/store" replace />}
              />

              <Route
                path="/pm/branch-transfer-requests"
                element={
                  <RoleGuard roles={[UserRole.PROJECT_MANAGER]}>
                    <PMBranchTransferRequestsPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/pm/branch-transfer-approvals"
                element={<Navigate to="/pm/branch-transfer-requests" replace />}
              />

              <Route
                path="/branch-transfers/:id"
                element={
                  <RoleGuard
                    roles={[
                      UserRole.PROJECT_MANAGER,
                      UserRole.COORDINATOR,
                      UserRole.EXECUTIVE,
                      UserRole.CHAIRMAN,
                    ]}
                  >
                    <BranchTransferDetailPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/pm/branch-transfers"
                element={<Navigate to="/pm/branch-transfer-requests" replace />}
              />

              <Route
                path="/executive/branch-transfers"
                element={<Navigate to="/executive" replace />}
              />

              <Route
                path="/coordinator/branch-transfers"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR]}>
                    <BranchTransfersPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/chairman/branch-transfers"
                element={
                  <RoleGuard roles={[UserRole.CHAIRMAN]}>
                    <BranchTransfersPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/pm/approve-wos"
                element={<Navigate to="/pm" replace />}
              />

              <Route
                path="/executive/review-wos"
                element={<Navigate to="/executive" replace />}
              />

              <Route

                path="/executive/wo/new"

                element={

                  <RoleGuard roles={[UserRole.EXECUTIVE]}>

                    <CreateWorkOrderPage />

                  </RoleGuard>

                }

              />

              <Route

                path="/work-orders/:id"

                element={

                  <RoleGuard

                    roles={[
                      UserRole.EXECUTIVE,

                      UserRole.COORDINATOR,

                      UserRole.CHAIRMAN,

                      UserRole.PROJECT_MANAGER,

                    ]}

                  >

                    <WorkOrderDetailPage />

                  </RoleGuard>

                }

              />

              <Route

                path="/coordinator/wo/:id"

                element={

                  <RoleGuard roles={[UserRole.COORDINATOR]}>

                    <WorkOrderDetailPage />

                  </RoleGuard>

                }

              />

              <Route

                path="/chairman/wo/:id"

                element={

                  <RoleGuard roles={[UserRole.CHAIRMAN]}>

                    <WorkOrderDetailPage />

                  </RoleGuard>

                }

              />

              <Route

                path="/executive/po/new"

                element={

                  <RoleGuard roles={[UserRole.EXECUTIVE]} capability="CREATE_PO">

                    <POWizardPage />

                  </RoleGuard>

                }

              />

              <Route
                path="/executive/purchase-orders"
                element={
                  <RoleGuard roles={[UserRole.EXECUTIVE]}>
                    <PurchaseOrdersBrowsePage
                      subtitle="All purchase orders — create new POs from Create PO"
                      detailPath={(id) => `/purchase-orders/${id}`}
                    />
                  </RoleGuard>
                }
              />

              <Route

                path="/executive/rfq/new"

                element={

                  <RoleGuard roles={[UserRole.EXECUTIVE]}>

                    <RfqWizardPage />

                  </RoleGuard>

                }

              />

              <Route

                path="/purchase-orders/:id"

                element={

                  <RoleGuard

                    roles={[
                      UserRole.STORE_INCHARGE,
                      UserRole.PROJECT_MANAGER,
                      UserRole.EXECUTIVE,

                      UserRole.COORDINATOR,

                      UserRole.CHAIRMAN,

                    ]}

                  >

                    <PODetailPage />

                  </RoleGuard>

                }

              />

              <Route

                path="/chairman/po/:id"

                element={

                  <RoleGuard roles={[UserRole.CHAIRMAN]}>

                    <PODetailPage />

                  </RoleGuard>

                }

              />

              <Route

                path="/coordinator/po/:id"

                element={

                  <RoleGuard roles={[UserRole.COORDINATOR]}>

                    <PODetailPage />

                  </RoleGuard>

                }

              />

              <Route
                path="/explorer"
                element={
                  <RoleGuard capabilities={['VIEW_ALL_PROJECTS', 'VIEW_OWN_SCOPE']} match="any">
                    <ExplorerPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/site/reports"
                element={
                  <RoleGuard roles={[UserRole.SITE_INCHARGE]}>
                    <ReportsHubPage />
                  </RoleGuard>
                }
              />
              <Route
                path="/store/reports"
                element={
                  <RoleGuard roles={[UserRole.STORE_INCHARGE]}>
                    <ReportsHubPage />
                  </RoleGuard>
                }
              />
              <Route
                path="/pm/reports"
                element={
                  <RoleGuard roles={[UserRole.PROJECT_MANAGER]}>
                    <ReportsHubPage />
                  </RoleGuard>
                }
              />
              <Route
                path="/executive/reports"
                element={
                  <RoleGuard roles={[UserRole.EXECUTIVE]}>
                    <ReportsHubPage />
                  </RoleGuard>
                }
              />
              <Route
                path="/coordinator/reports"
                element={
                  <RoleGuard roles={[UserRole.COORDINATOR]}>
                    <ReportsHubPage />
                  </RoleGuard>
                }
              />
              <Route
                path="/chairman/reports"
                element={
                  <RoleGuard roles={[UserRole.CHAIRMAN]}>
                    <ReportsHubPage />
                  </RoleGuard>
                }
              />
              <Route
                path="/reports/:reportId"
                element={
                  <RoleGuard
                    roles={[
                      UserRole.SITE_INCHARGE,
                      UserRole.STORE_INCHARGE,
                      UserRole.PROJECT_MANAGER,
                      UserRole.EXECUTIVE,
                      UserRole.COORDINATOR,
                      UserRole.CHAIRMAN,
                    ]}
                  >
                    <OperationalReportPage />
                  </RoleGuard>
                }
              />

              <Route
                path="/vendors"

                element={

                  <RoleGuard roles={[UserRole.EXECUTIVE, UserRole.COORDINATOR, UserRole.CHAIRMAN]}>

                    <VendorsListPage />

                  </RoleGuard>

                }

              />

              <Route

                path="/vendors/:id"

                element={

                  <RoleGuard roles={[UserRole.EXECUTIVE, UserRole.COORDINATOR, UserRole.CHAIRMAN]}>

                    <VendorScorecardPage />

                  </RoleGuard>

                }

              />

              <Route

                path="/audit-logs"

                element={

                  <RoleGuard capability="VIEW_AUDIT_LOGS">

                    <AuditLogViewerPage />

                  </RoleGuard>

                }

              />

              <Route

                path="/request/new"

                element={

                  <RoleGuard capability="CREATE_MATERIAL_REQUEST">

                    <RequestWizardPage />

                  </RoleGuard>

                }

              />

              <Route path="/site/request/new" element={<Navigate to="/request/new" replace />} />

              <Route

                path="/requests"

                element={

                  <RoleGuard

                    roles={[

                      UserRole.SITE_INCHARGE,

                      UserRole.PROJECT_MANAGER,

                      UserRole.STORE_INCHARGE,
                      UserRole.EXECUTIVE,
                      UserRole.COORDINATOR,
                      UserRole.CHAIRMAN,

                    ]}

                  >

                    <MyRequestsPage />

                  </RoleGuard>

                }

              />

              <Route

                path="/requests/:id"

                element={

                  <RoleGuard

                    roles={[

                      UserRole.SITE_INCHARGE,

                      UserRole.PROJECT_MANAGER,

                      UserRole.STORE_INCHARGE,
                      UserRole.EXECUTIVE,
                      UserRole.COORDINATOR,
                      UserRole.CHAIRMAN,

                    ]}

                  >

                    <RequestDetailPage />

                  </RoleGuard>

                }

              />

              <Route

                path="/store/allocate/:id"

                element={

                  <RoleGuard roles={[UserRole.STORE_INCHARGE]}>

                    <AllocateFlowPage />

                  </RoleGuard>

                }

              />

              {/* Legacy role home alias */}

              <Route path="/role-home" element={<RoleHomePage />} />

            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />

          </Routes>

        </SocketProvider>

      </BrowserRouter>

      <Toaster position="top-right" richColors closeButton />

    </QueryClientProvider>

  );

}


