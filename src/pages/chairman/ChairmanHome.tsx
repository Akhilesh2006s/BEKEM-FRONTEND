import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Users, ClipboardCheck, Package, HardHat, FileBarChart2 } from 'lucide-react';
import { getGreeting, formatCurrency, formatUnitCount } from '@afios/shared';
import type { ChairmanKpiDto } from '@afios/shared';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { DashboardSkeleton } from '@/components/ui/DashboardSkeleton';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { TodayPanel } from '@/components/layout/TodayPanel';
import { useTodayActions } from '@/hooks/useTodayActions';
import { ListErrorState } from '@/components/ListErrorState';
import { PdfActions } from '@/components/PdfActions';
import { cn } from '@/lib/utils';
import { fmtInrLimit, useApprovalLimits } from '@/hooks/useApprovalLimits';

function MiniBar({ value, max, tone }: { value: number; max: number; tone: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
      <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ChairmanHomePage() {
  const navigate = useNavigate();
  const { data: today, isLoading: todayLoading } = useTodayActions();
  const { data: approvalLimits } = useApprovalLimits();
  const [projectPage, setProjectPage] = useState(1);
  const [supplierPage, setSupplierPage] = useState(1);

  const { data: kpis, isLoading: kpisLoading, isError: kpisError, refetch: refetchKpis, isFetching: kpisFetching } = useQuery({
    queryKey: ['chairman-kpis', projectPage],
    queryFn: async () => {
      const res = await api.get<{ data: ChairmanKpiDto }>('/dashboard/chairman-kpis', {
        params: { page: projectPage, limit: 15 },
      });
      return res.data.data;
    },
  });

  const { data: chairmanExtras } = useQuery({
    queryKey: ['chairman-dashboard-extras', supplierPage],
    queryFn: async () => {
      const res = await api.get<{ data: ChairmanKpiDto & import('@afios/shared').ChairmanDashboardExtrasDto }>(
        '/dashboard/chairman',
        { params: { page: supplierPage, limit: 8 } }
      );
      return res.data.data;
    },
  });

  const { data: budgetRows } = useQuery({
    queryKey: ['budget-vs-actual'],
    queryFn: async () => {
      const res = await api.get<{ data: import('@afios/shared').BudgetVsActualDto[] }>(
        '/dashboard/budget-vs-actual'
      );
      return res.data.data;
    },
  });

  if (kpisLoading) return <DashboardSkeleton />;
  if (kpisError) {
    return (
      <div className="page-container">
        <ListErrorState onRetry={() => refetchKpis()} retrying={kpisFetching} />
      </div>
    );
  }

  const pipeline = kpis?.poPipeline;
  const maxPipe = Math.max(
    pipeline?.pmPending || 0,
    pipeline?.coordinatorPending || 0,
    pipeline?.chairmanPending || 0,
    pipeline?.approved || 0,
    1
  );

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={getGreeting()}
        title="Mission control"
        subtitle="Every action across projects — POs, WOs, budget, stock, and delays"
      />

      <TodayPanel actions={today ?? []} loading={todayLoading} />

      {kpis?.approvalRules && (
        <div className="mb-3 rounded-lg border border-review/20 bg-review-light px-3 py-2 text-sm text-ink">
          <p className="font-semibold text-bekem-accent">PO approval rules</p>
          <p className="mt-1 text-ink-secondary">{kpis.approvalRules.note}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-4 lg:mb-5">
        <StatCard
          hero
          label="Projects"
          value={kpis?.projectsRunning ?? 0}
          tone="blue"
          sparkline={kpis?.sparklines.budget}
          trend={{
            label:
              (kpis?.budgetCap ?? 0) > 0
                ? `${kpis?.budgetDeployPct ?? 0}% budget deployed`
                : 'No budget cap configured',
          }}
        />
        <StatCard
          hero
          label="Your PO approvals"
          value={kpis?.approvalsPending ?? 0}
          tone="chairman"
          sparkline={kpis?.sparklines.approvals}
          trend={{
            label: `Above ${fmtInrLimit(approvalLimits?.poCoordinatorMaxInr ?? 5000)} awaiting Chairman`,
            positive: (kpis?.approvalsPending ?? 0) === 0,
          }}
          onClick={() => navigate('/chairman/approve-pos')}
        />
        <StatCard
          hero
          label="WO approvals"
          value={kpis?.woPipeline?.chairmanPending ?? 0}
          tone="blue"
          icon={<HardHat className="h-6 w-6" />}
          trend={{ label: 'Work orders pending you' }}
          onClick={() => navigate('/chairman/approve-wos')}
        />
        <StatCard
          hero
          label="Delayed indents"
          value={kpis?.delayed ?? 0}
          tone="amber"
          icon={<AlertTriangle className="h-6 w-6" />}
          trend={{
            label: (kpis?.delayed ?? 0) > 0 ? 'Past required-by date' : 'On schedule',
            positive: (kpis?.delayed ?? 0) === 0,
          }}
        />
        <StatCard
          hero
          label="Material shortage"
          value={kpis?.shortages ?? 0}
          tone="rose"
          sparkline={kpis?.sparklines.shortages}
          trend={{
            label:
              (kpis?.shortagesChangePct ?? 0) <= 0
                ? `↓ ${Math.abs(kpis?.shortagesChangePct ?? 0)}% vs last week`
                : `↑ ${kpis?.shortagesChangePct}% vs last week`,
            positive: (kpis?.shortagesChangePct ?? 0) <= 0,
            changePct: kpis?.shortagesChangePct,
          }}
        />
        <StatCard
          hero
          label="Approved PO value"
          value={formatCurrency(kpis?.approvedPoValue ?? 0)}
          tone="blue"
          trend={{ label: `${kpis?.approvedPoCount ?? 0} approved POs` }}
        />
        <StatCard
          hero
          label="Open indents"
          value={kpis?.openIndents ?? 0}
          tone="amber"
          icon={<ClipboardCheck className="h-6 w-6" />}
        />
        <StatCard
          hero
          label="Stock inventory"
          value="Full access"
          tone="blue"
          icon={<Package className="h-6 w-6" />}
          trend={{ label: 'All fields + late delivery reasons' }}
          onClick={() => navigate('/store/stock')}
        />
        <StatCard
          hero
          label="Team overview"
          value="Analytics"
          tone="blue"
          icon={<Users className="h-6 w-6" />}
          trend={{ label: 'User activity, indents & assignments' }}
          onClick={() => navigate('/chairman/user-analytics')}
        />
        <StatCard
          hero
          label="Reports"
          value="MIS"
          tone="blue"
          icon={<FileBarChart2 className="h-6 w-6" />}
          trend={{ label: 'Pipeline, AP aging, project cost, audit' }}
          onClick={() => navigate('/chairman/reports')}
        />
      </div>

      {pipeline && (
        <section className="mb-4 lg:mb-5 panel p-3">
          <h2 className="section-label mb-4">PO pipeline (company-wide)</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {(
              [
                { label: 'PM (< ₹5k)', value: pipeline.pmPending, tone: 'bg-violet-500' },
                { label: 'Coordinator (₹5–10k)', value: pipeline.coordinatorPending, tone: 'bg-teal-500' },
                { label: 'Chairman (> ₹10k)', value: pipeline.chairmanPending, tone: 'bg-amber-500' },
                { label: 'Approved', value: pipeline.approved, tone: 'bg-emerald-500' },
              ] as const
            ).map((row) => (
              <div key={row.label} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-secondary">{row.label}</span>
                  <span className="font-semibold tabular-nums">{row.value}</span>
                </div>
                <MiniBar value={row.value} max={maxPipe} tone={row.tone} />
              </div>
            ))}
          </div>
        </section>
      )}

      {kpis?.projectBreakdown && kpis.projectBreakdown.length > 0 && (
        <section className="mb-4 lg:mb-5">
          <h2 className="section-label mb-4">Project-wise overview (A–Z)</h2>
          <div className="table-shell overflow-x-auto">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="text-right">Health</th>
                  <th className="text-right">Budget %</th>
                  <th className="text-right">POs</th>
                  <th className="text-right">PO value</th>
                  <th className="text-right">Your queue</th>
                  <th className="text-right">Indents</th>
                  <th className="text-right">Late</th>
                </tr>
              </thead>
              <tbody>
                {kpis.projectBreakdown.map((row) => (
                  <tr key={row.projectId}>
                      <td className="font-medium">
                        {row.code}
                        <span className="block text-xs text-ink-muted font-normal mt-0.5">
                          {row.name}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{row.healthScore}%</td>
                      <td className="text-right">
                        <span
                          className={
                            row.deployPct > 85
                              ? 'text-warning font-semibold'
                              : 'text-success font-semibold'
                          }
                        >
                          {row.deployPct}%
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{row.purchaseOrders}</td>
                      <td className="text-right tabular-nums">
                        {formatCurrency(row.approvedPoValue)}
                      </td>
                      <td className="text-right tabular-nums">
                        {row.pendingChairmanPos > 0 ? (
                          <button
                            type="button"
                            className="font-semibold text-amber-700 hover:underline"
                            onClick={() => navigate('/chairman/approve-pos')}
                          >
                            {row.pendingChairmanPos}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td className="text-right tabular-nums">{row.indents}</td>
                      <td className="text-right tabular-nums">
                        {row.lateIndents > 0 ? (
                          <span className="text-red-600 font-semibold">{row.lateIndents}</span>
                        ) : (
                          '0'
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {kpis.projectPagination && (
            <PaginationBar
              pagination={kpis.projectPagination}
              onPageChange={setProjectPage}
              className="mt-4"
            />
          )}
        </section>
      )}

      {budgetRows && budgetRows.length > 0 && (
        <section className="mb-4 lg:mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-label">Budget vs actual</h2>
            <PdfActions
              path="/exports/budget-vs-actual.pdf"
              filename="budget-vs-actual.pdf"
              viewLabel="View"
              downloadLabel="Download"
            />
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="text-right">Deployed</th>
                  <th className="text-right">Budget</th>
                  <th className="text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {budgetRows.map((row) => (
                  <tr key={row.projectId}>
                    <td className="font-medium">
                      {row.code}
                      <span className="block text-xs text-ink-muted font-normal mt-0.5">{row.name}</span>
                    </td>
                    <td className="text-right tabular-nums">{formatCurrency(row.budgetSpent)}</td>
                    <td className="text-right tabular-nums text-ink-muted">
                      {formatCurrency(row.budgetTotal)}
                    </td>
                    <td className="text-right">
                      <span
                        className={
                          row.deployPct > 85
                            ? 'text-warning font-semibold'
                            : 'text-success font-semibold'
                        }
                      >
                        {row.deployPct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {chairmanExtras?.enterpriseSummary && (
        <section className="mb-4 lg:mb-5 panel p-3">
          <h2 className="section-label mb-4">Enterprise summary</h2>
          <div className="grid sm:grid-cols-3 gap-2.5">
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide">Total approved spend</p>
              <p className="text-2xl font-bold mt-1">
                {formatCurrency(chairmanExtras.enterpriseSummary.totalSpend)}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide">Open POs (receipt pending)</p>
              <p className="text-2xl font-bold mt-1">{chairmanExtras.enterpriseSummary.openPoCount}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide">Budget deployed</p>
              <p className="text-2xl font-bold mt-1">
                {formatCurrency(chairmanExtras.enterpriseSummary.budgetDeployed)}
              </p>
              <p className="text-xs text-ink-muted mt-1">
                {chairmanExtras.enterpriseSummary.budgetCap > 0 ? (
                  <>
                    {chairmanExtras.enterpriseSummary.deployPct ?? 0}% of{' '}
                    {formatCurrency(chairmanExtras.enterpriseSummary.budgetCap)} cap
                  </>
                ) : (
                  'No budget cap configured'
                )}
              </p>
            </div>
          </div>
        </section>
      )}

      {chairmanExtras?.suppliers && (
        <section className="mb-4 lg:mb-5 panel p-3">
          <h2 className="section-label mb-4">Suppliers ({chairmanExtras.suppliers.totalCount})</h2>
          <div className="space-y-2">
            {chairmanExtras.suppliers.topVendors?.map((v) => (
              <div key={v.id} className="flex justify-between text-sm border-b border-surface-border pb-2 last:border-0">
                <span className="font-medium">
                  {v.name}
                  {v.isMsme && (
                    <span className="ml-2 text-[10px] uppercase text-teal-700 font-bold">MSME</span>
                  )}
                </span>
                <span className="text-ink-muted tabular-nums">{v.poCount} POs</span>
              </div>
            ))}
          </div>
          {chairmanExtras.suppliers.pagination && (
            <PaginationBar
              pagination={chairmanExtras.suppliers.pagination}
              onPageChange={setSupplierPage}
              className="mt-4"
            />
          )}
        </section>
      )}

      {chairmanExtras?.stock && (
        <section className="mb-4 lg:mb-5 panel p-3">
          <h2 className="section-label mb-4">Stock health</h2>
          <div className="grid sm:grid-cols-4 gap-2.5 text-sm">
            <div>
              <p className="text-ink-muted">Status</p>
              <p className="font-bold text-lg">{chairmanExtras.stock.healthLabel}</p>
            </div>
            <div>
              <p className="text-ink-muted">Shortages</p>
              <p className={cn('font-bold text-lg', chairmanExtras.stock.shortages > 0 && 'text-red-600')}>
                {chairmanExtras.stock.shortages}
              </p>
            </div>
            <div>
              <p className="text-ink-muted">SKUs</p>
              <p className="font-bold text-lg">{chairmanExtras.stock.skuCount}</p>
            </div>
            <div>
              <p className="text-ink-muted">On hand (units)</p>
              <p className="font-bold text-lg tabular-nums">{formatUnitCount(chairmanExtras.stock.totalOnHand)}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
