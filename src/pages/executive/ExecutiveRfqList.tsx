import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileStack, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import type { PurchaseRequestDto, RfqListItemDto } from '@afios/shared';
import { ROLE_LABELS, UserRole } from '@afios/shared';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate, formatProjectLabel } from '@afios/shared';

function raisedByLabel(rfq: RfqListItemDto) {
  if (!rfq.raisedByName) return '—';
  const role =
    rfq.raisedByRole && ROLE_LABELS[rfq.raisedByRole as UserRole]
      ? ROLE_LABELS[rfq.raisedByRole as UserRole]
      : rfq.raisedByRole || '';
  return role ? `${rfq.raisedByName} (${role})` : rfq.raisedByName;
}

interface ExecutiveRfqListPageProps {
  /** Coordinator/chairman browse: view RFQs with raiser attribution, no create actions. */
  browseOnly?: boolean;
}

export function ExecutiveRfqListPage({ browseOnly = false }: ExecutiveRfqListPageProps) {
  const navigate = useNavigate();

  const { data: rfqs, isLoading: rfqsLoading, isError: rfqsError, refetch: refetchRfqs, isFetching: rfqsFetching } = useQuery({
    queryKey: ['executive-rfqs'],
    queryFn: async () => {
      const res = await api.get<{ data: RfqListItemDto[] }>('/rfqs');
      return res.data.data ?? [];
    },
  });

  const {
    data: readyPurchaseRequests,
    isLoading: prsLoading,
    isError: prsError,
    refetch: refetchPrs,
    isFetching: prsFetching,
  } = useQuery({
    queryKey: ['purchase-requests', 'ready-for-rfq'],
    queryFn: async () => {
      const res = await api.get<{ data: PurchaseRequestDto[] }>('/purchase-requests', {
        params: { readyForRfq: 'true' },
      });
      return res.data.data ?? [];
    },
    enabled: !browseOnly,
  });

  const rfqByPrId = useMemo(() => {
    const map = new Map<string, RfqListItemDto>();
    for (const rfq of rfqs ?? []) {
      if (rfq.purchaseRequestId) map.set(rfq.purchaseRequestId, rfq);
    }
    return map;
  }, [rfqs]);

  const openCount = (rfqs ?? []).filter((r) => r.status === 'OPEN').length;
  const isLoading = rfqsLoading || (!browseOnly && prsLoading);
  const isError = rfqsError || (!browseOnly && prsError);
  const isFetching = rfqsFetching || (!browseOnly && prsFetching);

  const refetch = () => {
    refetchRfqs();
    if (!browseOnly) refetchPrs();
  };

  const startRfq = (purchaseRequestId: string) => {
    navigate(`/executive/rfq/new?purchaseRequestId=${purchaseRequestId}`);
  };

  const openRfq = (rfq: RfqListItemDto) => {
    if (!browseOnly && rfq.purchaseRequestId && !(rfq.assignedVendorCount > 0)) {
      startRfq(rfq.purchaseRequestId);
      return;
    }
    navigate(`/rfqs/${rfq.id}`);
  };

  return (
    <div className="page-container max-w-full">
      <PageHeader
        title="Request for quotation (RFQ)"
        subtitle={
          browseOnly
            ? 'RFQs raised by Executives — who raised each RFQ is shown below'
            : 'Share RFQ → wait for vendor quotes → finalize → then Create PO'
        }
        action={
          browseOnly ? undefined : (
            <Button variant="primary" onClick={() => navigate('/executive/rfq/new')}>
              <Plus className="h-4 w-4" />
              Create RFQ
            </Button>
          )
        }
      />

      <div className="panel p-3 mb-3 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-bekem-accent/10 text-bekem-accent flex items-center justify-center">
          <FileStack className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">
            {browseOnly
              ? `${rfqs?.length ?? 0} RFQ${(rfqs?.length ?? 0) === 1 ? '' : 's'} · ${openCount} open`
              : `${readyPurchaseRequests?.length ?? 0} ready for RFQ · ${openCount} open RFQ${
                  openCount === 1 ? '' : 's'
                }`}
          </p>
          <p className="text-xs text-ink-muted">
            {browseOnly
              ? 'When an Executive raises an RFQ, it appears here with Raised by attribution'
              : 'Standard flow: Decision → RFQ share → Vendor quotes → Finalize → Create PO'}
          </p>
        </div>
      </div>

      <ListQueryBoundary
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        retrying={isFetching && !isLoading}
        isEmpty={!readyPurchaseRequests?.length && !rfqs?.length}
        skeletonRows={4}
        empty={
          <EmptyState
            title="No RFQs yet"
            description={
              browseOnly
                ? 'RFQs raised by Executives will appear here.'
                : 'After a procurement decision, purchase requests appear here to start RFQ — compare vendor quotes before raising a PO.'
            }
            actionLabel={browseOnly ? undefined : 'Create RFQ'}
            onAction={browseOnly ? undefined : () => navigate('/executive/rfq/new')}
          />
        }
      >
        <>
          {!browseOnly && !!readyPurchaseRequests?.length && (
            <section className="mb-6">
              <h2 className="section-label mb-3">Ready for RFQ</h2>
              <p className="text-xs text-ink-secondary mb-3">
                Same list as Create RFQ step 1 — tap a request to start a new RFQ. Existing RFQs open from All RFQs below.
              </p>
              <div className="table-shell">
                <table className="data-table min-w-[72rem]">
                  <thead>
                    <tr>
                      <th>PR No</th>
                      <th>Indent</th>
                      <th>Project</th>
                      <th className="num">Estimate</th>
                      <th>RFQ</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readyPurchaseRequests.map((pr) => {
                      const rfq = rfqByPrId.get(pr.id);

                      return (
                        <tr key={pr.id}>
                          <td className="cell-code whitespace-nowrap">{pr.prNumber}</td>
                          <td className="cell-text whitespace-nowrap">
                            {pr.materialRequest?.indentNumber || 'Purchase request'}
                          </td>
                          <td className="cell-text whitespace-nowrap">{formatProjectLabel(pr.project)}</td>
                          <td className="num tabular-nums whitespace-nowrap">
                            {formatCurrency(pr.amountEstimate)}
                          </td>
                          <td className="cell-code whitespace-nowrap">{rfq?.rfqNumber || '—'}</td>
                          <td>{rfq ? <StatusBadge status={rfq.status} /> : '—'}</td>
                          <td>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() =>
                                rfq && (rfq.assignedVendorCount || 0) > 0
                                  ? openRfq(rfq)
                                  : startRfq(pr.id)
                              }
                            >
                              {rfq && (rfq.assignedVendorCount || 0) > 0
                                ? 'Open RFQ'
                                : rfq
                                  ? 'Continue RFQ'
                                  : 'Create RFQ'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {!!rfqs?.length && (
            <section>
              <h2 className="section-label mb-3">{browseOnly ? 'RFQs' : 'All RFQs'}</h2>
              <div className="table-shell">
                <table className="data-table min-w-[72rem]">
                  <thead>
                    <tr>
                      <th>RFQ No</th>
                      <th>Indent</th>
                      <th>Raised by</th>
                      <th>Created</th>
                      <th>Due</th>
                      <th>Status</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {rfqs.map((rfq) => (
                      <tr
                        key={rfq.id}
                        className="cursor-pointer"
                        onClick={() => openRfq(rfq)}
                      >
                        <td className="cell-code whitespace-nowrap">{rfq.rfqNumber}</td>
                        <td className="cell-text whitespace-nowrap">
                          {rfq.indentNumber || 'Purchase request'}
                        </td>
                        <td className="cell-text whitespace-nowrap">{raisedByLabel(rfq)}</td>
                        <td className="whitespace-nowrap">{formatDate(rfq.createdAt)}</td>
                        <td className="whitespace-nowrap">
                          {rfq.dueDate ? formatDate(rfq.dueDate) : '—'}
                        </td>
                        <td>
                          <StatusBadge status={rfq.status} />
                        </td>
                        <td className="text-right">
                          {!browseOnly && rfq.status === 'FINALIZED' && rfq.poId ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/purchase-orders/${rfq.poId}`);
                              }}
                            >
                              View PO
                            </Button>
                          ) : !browseOnly && rfq.status === 'FINALIZED' && rfq.purchaseRequestId ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(
                                  `/executive/po/new?purchaseRequestId=${rfq.purchaseRequestId}`
                                );
                              }}
                            >
                              Create PO
                            </Button>
                          ) : (
                            <ChevronRight className="h-4 w-4 text-ink-muted inline-block" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      </ListQueryBoundary>
    </div>
  );
}
