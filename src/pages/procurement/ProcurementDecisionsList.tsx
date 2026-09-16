import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { formatCurrency, formatDate, formatProjectLabel, UserRole } from '@afios/shared';
import type { ProcurementDecisionListItemDto } from '@afios/shared';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { CoordinatorDailyCapBanner } from '@/components/PmDailyCapBanner';
import { useAuthStore } from '@/stores/authStore';

interface ProcurementDecisionsListPageProps {
  basePath: string;
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyDescription: string;
}

export function ProcurementDecisionsListPage({
  basePath,
  title,
  subtitle,
  emptyTitle,
  emptyDescription,
}: ProcurementDecisionsListPageProps) {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);

  const { data: decisions, list } = useListQuery({
    queryKey: ['procurement-decisions', basePath],
    queryFn: async () => {
      const res = await api.get<{ data: ProcurementDecisionListItemDto[] }>('/procurement-decisions');
      return normalizeListData<ProcurementDecisionListItemDto>(res.data.data);
    },
  });

  return (
    <div className="page-container max-w-full">
      <PageHeader
        title={title}
        subtitle={subtitle}
        onBack
        action={
          <button
            type="button"
            onClick={() => navigate('/')}
            className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-gray-100"
            aria-label="Go home"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        }
      />

      {role === UserRole.COORDINATOR && <CoordinatorDailyCapBanner />}

      <ListQueryBoundary
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={list.onRetry}
        retrying={list.retrying}
        isEmpty={!decisions?.length}
        skeletonRows={3}
        empty={<EmptyState title={emptyTitle} description={emptyDescription} />}
      >
        <div className="table-shell">
          <table className="data-table min-w-[72rem]">
            <thead>
              <tr>
                <th>Indent No</th>
                <th>Project</th>
                <th>Date</th>
                <th className="num">Value</th>
                <th>Priority</th>
                <th>PR</th>
                <th>Purpose</th>
                <th>Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {(decisions ?? []).map((d) => (
                <tr
                  key={d.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`${basePath}/${d.id}`)}
                >
                  <td className="cell-code whitespace-nowrap">{d.indentNumber}</td>
                  <td className="cell-text whitespace-nowrap">{formatProjectLabel({ code: d.projectCode, name: d.projectName })}</td>
                  <td className="whitespace-nowrap">{d.indentDate ? formatDate(d.indentDate) : '—'}</td>
                  <td className="num tabular-nums whitespace-nowrap">{formatCurrency(d.estimatedValue)}</td>
                  <td className="whitespace-nowrap">{d.priority || '—'}</td>
                  <td className="cell-code whitespace-nowrap">{d.prNumber || '—'}</td>
                  <td className="cell-text">{d.purpose || '—'}</td>
                  <td><StatusBadge status={d.status} /></td>
                  <td className="text-right">
                    <ChevronRight className="h-4 w-4 text-ink-muted inline-block" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListQueryBoundary>
    </div>
  );
}
