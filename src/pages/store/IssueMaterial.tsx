import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatProjectLabel, type MaterialRequestDto } from '@afios/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/EmptyState';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { StatusBadge } from '@/components/ui/StatusBadge';

export function IssueMaterialPage() {
  const navigate = useNavigate();

  const { data: indents, list } = useListQuery({
    queryKey: ['store-issue-to-site'],
    queryFn: async () => {
      const res = await api.get<{ data: MaterialRequestDto[] }>('/material-requests', {
        params: { queue: 'store-issue-to-site' },
      });
      return normalizeListData<MaterialRequestDto>(res.data.data);
    },
  });

  return (
    <div className="page-container max-w-full">
      <PageHeader
        title="Issue to site"
        subtitle="Verified / received indents — proceed with allocation to the indent raiser"
      />

      <ListQueryBoundary
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={list.onRetry}
        retrying={list.retrying}
        isEmpty={!indents?.length}
        empty={
          <EmptyState
            title="Nothing ready to issue"
            description="Complete a Stock Received entry in Material GRN. Those indents then appear here."
          />
        }
      >
        <div className="table-shell">
          <table className="data-table min-w-[64rem]">
            <thead>
              <tr>
                <th>Indent No</th>
                <th>Project</th>
                <th>Requested by</th>
                <th>Purpose</th>
                <th className="num">Items</th>
                <th>Date</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(indents ?? []).map((mr) => (
                <tr key={mr.id}>
                  <td className="cell-code whitespace-nowrap">{mr.indentNumber}</td>
                  <td className="cell-text whitespace-nowrap">{formatProjectLabel(mr.project)}</td>
                  <td className="cell-text whitespace-nowrap">
                    {mr.requestedByName || mr.requester?.name || '—'}
                  </td>
                  <td className="cell-text">{mr.purpose || '—'}</td>
                  <td className="num tabular-nums">
                    {mr.items?.length || (mr.materialId ? 1 : 0)}
                  </td>
                  <td className="whitespace-nowrap">{formatDate(mr.createdAt)}</td>
                  <td>
                    <StatusBadge status={mr.status} label="Received" />
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/requests/${mr.id}`)}
                    >
                      Proceed with Allocation
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
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
