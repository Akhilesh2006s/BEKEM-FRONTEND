import { useNavigate } from 'react-router-dom';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { ChevronRight, Truck } from 'lucide-react';
import { UserRole, type BranchTransferDto } from '@afios/shared';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { ActionCard } from '@/components/ui/ActionCard';
import { EmptyState } from '@/components/EmptyState';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { StatusBadge } from '@/components/ui/StatusBadge';

const HO_PENDING = ['REQUESTED', 'PM_APPROVED', 'COORDINATOR_DECIDED', 'EXECUTIVE_APPROVED'];

function pageCopy(role: UserRole) {
  if (role === UserRole.EXECUTIVE) {
    return {
      title: 'Branch transfers',
      subtitle: 'Approve or reject PM transfer requests — source PM then dispatches with challan',
      empty: 'No branch transfers awaiting your review.',
      actionLabel: 'Awaiting Executive approval',
    };
  }
  if (role === UserRole.CHAIRMAN) {
    return {
      title: 'Branch transfer monitoring',
      subtitle: 'Enterprise visibility into inter-project stock movements',
      empty: 'No branch transfers recorded.',
      actionLabel: 'Active transfers',
    };
  }
  return {
    title: 'Branch transfer approvals',
    subtitle: 'Monitor Executive-approved transfers through dispatch and receipt / GRN',
    empty: 'No branch transfers pending Head Office review.',
    actionLabel: 'Awaiting decision or execution',
  };
}

export function BranchTransfersPage() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role) as UserRole;
  const copy = pageCopy(role);
  const isChairman = role === UserRole.CHAIRMAN;
  const isExecutive = role === UserRole.EXECUTIVE;

  const { data: transfers, list } = useListQuery({
    queryKey: ['branch-transfers', role],
    queryFn: async () => {
      const res = await api.get<{ data: BranchTransferDto[] }>('/branch-transfers');
      const rows = normalizeListData<BranchTransferDto>(res.data.data);
      if (isChairman) return rows;
      if (isExecutive) {
        return rows.filter((t) => t.status === 'REQUESTED' || HO_PENDING.includes(t.status));
      }
      return rows.filter((t) => HO_PENDING.includes(t.status));
    },
  });

  const pending = transfers?.length ?? 0;

  return (
    <div className="page-container max-w-4xl">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />

      <ActionCard
        title={copy.actionLabel}
        count={pending}
        subtitle={pending > 0 ? 'Review each transfer carefully' : 'Queue clear'}
        icon={Truck}
        tone="info"
        className="mb-4"
      />

      <ListQueryBoundary
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={list.onRetry}
        retrying={list.retrying}
        isEmpty={!transfers?.length}
        empty={
          <EmptyState celebrate title="No branch transfers pending" description={copy.empty} />
        }
      >
        <div className="space-y-2">
          {(transfers ?? []).map((t) => (
            <button
              key={t.id}
              type="button"
              className="data-row w-full text-left"
              onClick={() => navigate(`/branch-transfers/${t.id}`)}
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink">{t.transferNumber}</p>
                <p className="text-sm text-ink-secondary mt-0.5">
                  {t.fromProjectName || t.fromProject} → {t.toProjectName || t.toProject}
                </p>
                {t.items?.map((item, i) => (
                  <p key={i} className="text-xs text-ink-muted mt-0.5">
                    {item.materialName}: {item.quantity}
                  </p>
                ))}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={t.status} />
                <ChevronRight className="h-4 w-4 text-ink-muted" />
              </div>
            </button>
          ))}
        </div>
      </ListQueryBoundary>
    </div>
  );
}
