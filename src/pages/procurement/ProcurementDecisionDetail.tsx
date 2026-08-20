import { useState } from 'react';

import { useNavigate, useParams } from 'react-router-dom';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ArrowLeft } from 'lucide-react';

import { toast } from 'sonner';

import {

  formatCurrency,

  formatDate,

  ROLE_COLORS,

  UserRole,

  computeRequiredQty,
  formatProjectLabel,
} from '@afios/shared';

import type { IndentLineItemDto, ProcurementDecisionDto, ProjectDto } from '@afios/shared';

import { api } from '@/lib/api';

import { useAuthStore } from '@/stores/authStore';

import { Card } from '@/components/ui/Card';
import { DetailField, DetailFieldGrid } from '@/components/ui/DetailFields';

import { Button } from '@/components/ui/Button';

import { StatusBadge } from '@/components/ui/StatusBadge';

import { Textarea } from '@/components/ui/Input';

import { SearchSelect } from '@/components/SearchSelect';

import { StockComparisonTable } from '@/components/StockComparisonTable';

import { StatusTimeline } from '@/components/StatusTimeline';

import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { CoordinatorDailyCapBanner } from '@/components/PmDailyCapBanner';



interface ProcurementDecisionDetailPageProps {

  listPath: string;

}



function priorityLabel(priority?: string) {

  if (priority === 'HIGH') return 'High';

  if (priority === 'MEDIUM') return 'Medium';

  return 'Normal';

}



export function ProcurementDecisionDetailPage({ listPath }: ProcurementDecisionDetailPageProps) {

  const { id } = useParams<{ id: string }>();

  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const user = useAuthStore((s) => s.user);

  const role = user?.role as UserRole;



  const [method, setMethod] = useState<'PURCHASE_ORDER' | 'BRANCH_TRANSFER'>('PURCHASE_ORDER');

  const [remark, setRemark] = useState('');

  const [fromProjectId, setFromProjectId] = useState('');

  const [showReject, setShowReject] = useState(false);



  const { data: decision, isLoading, isError, refetch, isFetching } = useQuery({

    queryKey: ['procurement-decision', id],

    queryFn: async () => {

      const res = await api.get<{ data: ProcurementDecisionDto }>(`/procurement-decisions/${id}`);

      return res.data.data;

    },

    enabled: !!id,

  });



  const { data: projects } = useQuery({

    queryKey: ['projects-active'],

    queryFn: async () => {

      const res = await api.get<{ data: ProjectDto[] }>('/projects', { params: { status: 'ACTIVE' } });

      return res.data.data ?? [];

    },

    enabled: role === UserRole.COORDINATOR && !!decision?.canCoordinatorReview,

  });



  const proceedWithPo = useMutation({

    mutationFn: async () => {

      const res = await api.post<{ data: ProcurementDecisionDto }>(

        `/procurement-decisions/${id}/executive-decide`,

        { method: 'PURCHASE_ORDER', remark: remark.trim() }

      );

      return res.data.data;

    },

    onSuccess: (data) => {

      toast.success('Queued for RFQ — open Create RFQ to invite vendors and compare quotes');

      setRemark('');

      queryClient.invalidateQueries({ queryKey: ['procurement-decision', id] });

      queryClient.invalidateQueries({ queryKey: ['procurement-decisions'] });

      queryClient.invalidateQueries({ queryKey: ['purchase-requests', 'ready-for-po'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-requests', 'ready-for-rfq'] });

      queryClient.invalidateQueries({ queryKey: ['dashboard-widgets'] });

      queryClient.invalidateQueries({ queryKey: ['executive-rfqs'] });

      if (data.purchaseRequestId) {

        navigate(`/executive/rfq/new?purchaseRequestId=${data.purchaseRequestId}`);

      } else if (data.redirect?.path) {

        navigate(data.redirect.path);

      } else {

        navigate('/executive/rfq/new');

      }

    },

    onError: (err: Error & { response?: { data?: { message?: string } } }) => {

      toast.error(err.response?.data?.message || 'Could not queue for purchase order');

    },

  });



  const coordinatorReview = useMutation({

    mutationFn: async (action: 'approve' | 'reject') => {

      const res = await api.post<{ data: ProcurementDecisionDto }>(

        `/procurement-decisions/${id}/coordinator-review`,

        {

          action,

          method: action === 'approve' ? method : undefined,

          remark: remark.trim(),

          fromProjectId: action === 'approve' && method === 'BRANCH_TRANSFER' ? fromProjectId : undefined,

        }

      );

      return res.data.data;

    },

    onSuccess: (_, action) => {

      toast.success(action === 'approve' ? 'Procurement decision approved' : 'Procurement decision rejected');

      setRemark('');

      setShowReject(false);

      queryClient.invalidateQueries({ queryKey: ['procurement-decision', id] });

      queryClient.invalidateQueries({ queryKey: ['procurement-decisions'] });

      queryClient.invalidateQueries({ queryKey: ['dashboard-widgets'] });

    },

    onError: (err: Error & { response?: { data?: { message?: string } } }) => {

      toast.error(err.response?.data?.message || 'Review failed');

    },

  });



  const stockItems: IndentLineItemDto[] =

    decision?.items.map((item) => ({

      id: item.id,

      materialId: item.materialId,

      quantityRequested: item.requestedQty,

      requestedQty: item.requestedQty,

      availableQty: item.availableQty,

      requiredQty: item.requiredQty,

      material: { id: item.materialId, code: '', name: item.materialName, unit: item.unit },

      unit: item.unit,

    })) ?? [];



  const projectOptions =

    projects

      ?.filter((p) => p.id !== decision?.projectId)

      .map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` })) ?? [];



  const accent =

    role === UserRole.COORDINATOR

      ? ROLE_COLORS[UserRole.COORDINATOR].primary

      : ROLE_COLORS[UserRole.EXECUTIVE].primary;



  return (

    <div className="page-container max-w-3xl">

      <header className="flex items-center gap-3 mb-3">

        <button

          type="button"

          onClick={() => navigate(listPath)}

          className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-gray-100"

          aria-label="Go back"

        >

          <ArrowLeft className="h-5 w-5" />

        </button>

        <div className="min-w-0 flex-1">

          <h1 className="font-semibold text-ink truncate">

            {decision?.indentNumber || 'Procurement review'}

          </h1>

          {decision && <StatusBadge status={decision.status} className="mt-1" />}

        </div>

      </header>



      <ListQueryBoundary

        isLoading={isLoading}

        isError={isError}

        onRetry={() => refetch()}

        retrying={isFetching && !isLoading}

        skeletonRows={6}

        empty={<></>}

      >

        {decision && (

          <>

            <Card className="mb-3">

              <DetailFieldGrid>

                {decision.prNumber && (

                  <DetailField label="Purchase request">{decision.prNumber}</DetailField>

                )}

                <DetailField label="Project">
                  {formatProjectLabel({
                    code: decision.projectCode,
                    name: decision.projectName,
                  })}
                </DetailField>

                <DetailField label="Requested date">

                  {decision.indentDate ? formatDate(decision.indentDate) : '—'}

                </DetailField>

                <DetailField label="Priority">{priorityLabel(decision.priority)}</DetailField>

                <DetailField label="Requested by">{decision.requestedBy || '—'}</DetailField>

                <DetailField label="Estimated value">

                  {formatCurrency(decision.estimatedValue)}

                </DetailField>

                {decision.purpose && (

                  <DetailField label="Reason for request" fullWidth valueClassName="text-sm font-normal">

                    {decision.purpose}

                  </DetailField>

                )}

                {decision.pmRemarks && (

                  <DetailField label="PM remarks" fullWidth valueClassName="text-sm font-normal">

                    {decision.pmRemarks}

                  </DetailField>

                )}

              </DetailFieldGrid>

            </Card>



            <h2 className="section-label mb-3">Stock comparison (requesting site)</h2>

            <StockComparisonTable

              items={stockItems}

              className="mb-3"

              showPricing

              totalEstimatedValue={decision.estimatedValue}

            />



            <h2 className="section-label mb-3">Stock across all projects</h2>

            <div className="space-y-3 mb-3">

              {decision.items.map((item) => (

                <Card key={item.id} className="overflow-hidden p-0">

                  <div className="px-3 py-2 bg-surface-muted/50 border-b border-surface-border">

                    <p className="font-medium text-sm">{item.materialName}</p>

                    <p className="text-xs text-ink-muted">

                      Required: {computeRequiredQty(item.requestedQty, item.availableQty)} {item.unit}

                    </p>

                  </div>

                  {item.enterpriseStock.length ? (

                    <table className="w-full text-sm">

                      <thead>

                        <tr className="border-b border-surface-border">

                          <th className="text-left px-3 py-2 font-semibold text-ink-muted">Project</th>

                          <th className="text-left px-3 py-2 font-semibold text-ink-muted">Site</th>

                          <th className="text-right px-3 py-2 font-semibold text-ink-muted w-24">

                            Available

                          </th>

                        </tr>

                      </thead>

                      <tbody>

                        {item.enterpriseStock.map((row) => (

                          <tr key={`${item.id}-${row.projectId}`} className="border-b border-surface-border/60">

                            <td className="px-3 py-2">

                              {row.projectCode} — {row.projectName}

                            </td>

                            <td className="px-3 py-2 text-ink-secondary">{row.siteName || '—'}</td>

                            <td className="px-3 py-2 text-right tabular-nums">

                              {row.availableQty} {item.unit}

                            </td>

                          </tr>

                        ))}

                      </tbody>

                    </table>

                  ) : (

                    <p className="px-3 py-3 text-sm text-ink-muted">No stock recorded in other projects.</p>

                  )}

                </Card>

              ))}

            </div>



            {decision.purchaseRequestId && decision.status === 'PURCHASE_REQUESTED' && (

              <Card className="mb-3 border-success/30 bg-success-light/20">

                <p className="text-sm font-semibold text-ink">Ready for RFQ</p>

                <p className="text-xs text-ink-secondary mt-1">

                  {decision.prNumber} is queued for procurement. Create an RFQ to invite vendors and compare

                  quotes, then raise the purchase order from the winning quote.

                </p>

                {role === UserRole.EXECUTIVE && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button
                      variant="accent"
                      accentColor={accent}
                      onClick={() =>
                        navigate(`/executive/rfq/new?purchaseRequestId=${decision.purchaseRequestId}`)
                      }
                    >
                      Create RFQ
                    </Button>
                  </div>
                )}

              </Card>

            )}



            {decision.canExecutiveDecide && role === UserRole.EXECUTIVE && (

              <div className="panel p-3 mb-3 space-y-3">

                <p className="text-sm font-semibold text-ink">Procurement review</p>

                <p className="text-xs text-ink-secondary">

                  Review-only inbox — approve to queue this request for RFQ. Invite vendors, compare quotes,

                  then create the purchase order from the winning vendor.

                </p>

                <div>

                  <label className="text-xs font-medium text-ink-muted">Review note (optional)</label>

                  <Textarea

                    value={remark}

                    onChange={(e) => setRemark(e.target.value)}

                    placeholder="Brief note for audit trail…"

                    rows={3}

                    className="mt-1"

                  />

                </div>

                <Button

                  variant="accent"

                  accentColor={accent}

                  disabled={proceedWithPo.isPending}

                  onClick={() => proceedWithPo.mutate()}

                >

                  Proceed with RFQ

                </Button>

              </div>

            )}



            {decision.canCoordinatorReview && role === UserRole.COORDINATOR && (

              <div className="panel p-3 mb-3 space-y-3">

                <CoordinatorDailyCapBanner />

                <p className="text-sm font-semibold text-ink">Coordinator review (legacy branch transfer)</p>

                <p className="text-xs text-ink-secondary">

                  Purchase orders are created and approved in the PO workflow. This section applies only to

                  legacy branch-transfer recommendations.

                </p>

                <div className="space-y-2">

                  <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-surface-border p-3">

                    <input

                      type="radio"

                      name="coord-method"

                      checked={method === 'BRANCH_TRANSFER'}

                      onChange={() => setMethod('BRANCH_TRANSFER')}

                      className="mt-1"

                    />

                    <div>

                      <p className="font-medium text-sm">Branch transfer</p>

                    </div>

                  </label>

                </div>

                {method === 'BRANCH_TRANSFER' && (

                  <div>

                    <label className="text-xs font-semibold text-ink-muted block mb-1">

                      Source project (has stock)

                    </label>

                    <SearchSelect

                      placeholder="Select project with surplus stock…"

                      options={projectOptions}

                      value={fromProjectId || null}

                      onChange={(pid) => setFromProjectId(pid)}

                    />

                  </div>

                )}

                <div>

                  <label className="text-xs font-medium text-ink-muted">Remarks (required)</label>

                  <Textarea

                    value={remark}

                    onChange={(e) => setRemark(e.target.value)}

                    placeholder="Approval notes or reason for modification…"

                    rows={3}

                    className="mt-1"

                  />

                </div>

                <div className="flex flex-wrap gap-2">

                  <Button

                    variant="accent"

                    accentColor={accent}

                    disabled={

                      !remark.trim() ||

                      coordinatorReview.isPending ||

                      (method === 'BRANCH_TRANSFER' && !fromProjectId)

                    }

                    onClick={() => coordinatorReview.mutate('approve')}

                  >

                    Approve branch transfer

                  </Button>

                  <Button

                    variant="ghost"

                    className="text-danger"

                    disabled={coordinatorReview.isPending}

                    onClick={() => setShowReject(true)}

                  >

                    Reject

                  </Button>

                </div>

                {showReject && (

                  <div className="rounded-lg border border-danger/20 bg-danger-light/30 p-3 space-y-2">

                    <p className="text-sm font-medium text-danger-dark">Confirm rejection</p>

                    <Button

                      variant="destructive"

                      size="sm"

                      disabled={!remark.trim() || coordinatorReview.isPending}

                      onClick={() => coordinatorReview.mutate('reject')}

                    >

                      Reject procurement decision

                    </Button>

                  </div>

                )}

              </div>

            )}



            <h2 className="font-semibold text-ink mb-3">Audit trail</h2>

            <StatusTimeline entityType="MaterialRequest" entityId={decision.id} />

          </>

        )}

      </ListQueryBoundary>

    </div>

  );

}


