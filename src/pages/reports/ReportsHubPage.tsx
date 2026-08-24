import { lazy, Suspense, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, FileBarChart2 } from 'lucide-react';
import { UserRole } from '@afios/shared';
import { useAuthStore } from '@/stores/authStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import {
  getReportViewer,
  getReportsForRole,
  reportCategoryLabel,
  type ReportCategory,
  type ReportDefinition,
} from '@/lib/reportCatalog';
import { OperationalReportView } from '@/pages/reports/OperationalReportPage';

const FinancePage = lazy(() =>
  import('@/pages/finance/FinancePage').then((m) => ({ default: m.FinancePage }))
);
const MonthlyReportPage = lazy(() =>
  import('@/pages/finance/MonthlyReportPage').then((m) => ({ default: m.MonthlyReportPage }))
);
const ExplorerPage = lazy(() =>
  import('@/pages/explorer/ExplorerPage').then((m) => ({ default: m.ExplorerPage }))
);
const VendorsListPage = lazy(() =>
  import('@/pages/vendors/VendorsList').then((m) => ({ default: m.VendorsListPage }))
);
const MiscPurchasesPage = lazy(() =>
  import('@/pages/finance/MiscPurchasesPage').then((m) => ({ default: m.MiscPurchasesPage }))
);
const UserAnalyticsPage = lazy(() =>
  import('@/pages/chairman/UserAnalytics').then((m) => ({ default: m.UserAnalyticsPage }))
);
const CategoryReportPage = lazy(() =>
  import('@/pages/materials/CategoryReportPage').then((m) => ({ default: m.CategoryReportPage }))
);

const CATEGORY_ORDER: ReportCategory[] = [
  'inventory',
  'procurement',
  'project',
  'vendor',
  'finance',
  'mis',
  'compliance',
];

function EmbeddedReport({ name }: { name: string }) {
  switch (name) {
    case 'finance':
      return <FinancePage />;
    case 'monthly-finance':
      return <MonthlyReportPage />;
    case 'explorer':
      return <ExplorerPage />;
    case 'vendors':
      return <VendorsListPage />;
    case 'misc-purchases':
      return <MiscPurchasesPage />;
    case 'user-analytics':
      return <UserAnalyticsPage />;
    case 'category-materials':
      return <CategoryReportPage />;
    default:
      return <EmptyState title="Report not found" description="This report is not available." />;
  }
}

export function ReportsHubPage() {
  const [params, setParams] = useSearchParams();
  const role = useAuthStore((s) => s.user?.role) as UserRole;
  const reports = useMemo(() => (role ? getReportsForRole(role) : []), [role]);
  const selectedId = params.get('report');
  const viewer = selectedId ? getReportViewer(selectedId) : null;

  const grouped = useMemo(() => {
    const map = new Map<ReportCategory, ReportDefinition[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const report of reports) {
      const list = map.get(report.category) || [];
      list.push(report);
      map.set(report.category, list);
    }
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      label: reportCategoryLabel(cat),
      items: map.get(cat) || [],
    })).filter((g) => g.items.length);
  }, [reports]);

  const openReport = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('report', id);
    setParams(next, { replace: true });
  };

  const backToList = () => {
    const next = new URLSearchParams(params);
    next.delete('report');
    setParams(next, { replace: true });
  };

  if (!role) {
    return (
      <div className="page-container">
        <EmptyState title="Sign in required" description="Open Reports after signing in." />
      </div>
    );
  }

  if (selectedId && viewer) {
    if (viewer.type === 'grid') {
      return (
        <OperationalReportView
          reportId={viewer.configId}
          extraParams={viewer.extraParams}
          onBack={backToList}
        />
      );
    }
    return (
      <div className="page-container max-w-full">
        <button
          type="button"
          onClick={backToList}
          className="inline-flex items-center gap-2 text-sm font-medium text-ink-secondary hover:text-ink mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          All reports
        </button>
        <Suspense fallback={<p className="text-sm text-ink-muted">Loading report…</p>}>
          <EmbeddedReport name={viewer.name} />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="page-container max-w-full">
      <PageHeader
        title="Reports"
        subtitle="Pick a report — it opens here as a grid, without leaving Reports"
      />

      <div className="space-y-6">
        {grouped.map((group) => (
          <section key={group.category}>
            <h2 className="section-label mb-2">{group.label}</h2>
            <div className="table-shell">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Description</th>
                    <th className="w-28">Status</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((report) => {
                    const live = report.status === 'live';
                    return (
                      <tr
                        key={report.id}
                        className={live ? 'cursor-pointer' : 'opacity-70'}
                        onClick={() => {
                          if (!live) return;
                          openReport(report.id);
                        }}
                      >
                        <td className="font-semibold text-ink whitespace-nowrap">
                          <span className="inline-flex items-center gap-2">
                            <FileBarChart2 className="h-4 w-4 text-ink-muted shrink-0" />
                            {report.title}
                          </span>
                        </td>
                        <td className="cell-text text-ink-secondary">{report.description}</td>
                        <td>
                          <span
                            className={
                              live
                                ? 'text-[11px] font-semibold text-emerald-700'
                                : 'text-[11px] font-semibold text-ink-muted'
                            }
                          >
                            {live ? 'Live' : 'Coming soon'}
                          </span>
                        </td>
                        <td className="text-right">
                          {live ? (
                            <ChevronRight className="h-4 w-4 text-ink-muted inline-block" />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
