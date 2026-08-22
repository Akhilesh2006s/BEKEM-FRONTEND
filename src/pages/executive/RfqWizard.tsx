import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  ROLE_COLORS,
  UserRole,
  formatCurrency,
  type PurchaseRequestDto,
  type MaterialRequestDto,
  type RfqComparisonDto,
  formatProjectLabel,
} from '@afios/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { StepIndicator } from '@/components/StepIndicator';
import { EmptyState } from '@/components/EmptyState';
import {
  VendorQuotationEditor,
  type VendorQuotationDraft,
} from '@/components/VendorQuotationEditor';
import { RfqVendorShareList, mergeAssignedVendors } from '@/components/RfqVendorShareList';
import { onlyAssignedDrafts } from '@/lib/rfqVendorAssignments';
import { cn } from '@/lib/utils';

import { DetailFieldInline, DetailFieldRow } from '@/components/ui/DetailFields';

const STEPS = [
  'Choose request',
  'Items & stock',
  'Vendor quotations (1–100)',
  'Review & share',
];

export function RfqWizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedPrId = searchParams.get('purchaseRequestId');
  const accent = ROLE_COLORS[UserRole.EXECUTIVE].primary;

  const [step, setStep] = useState(0);
  const [existingRfqChecked, setExistingRfqChecked] = useState(!preselectedPrId);
  const [selectedPr, setSelectedPr] = useState<PurchaseRequestDto | null>(null);
  const [selectedMr, setSelectedMr] = useState<MaterialRequestDto | null>(null);
  /** Material IDs skipped from RFQ (stock-covered by default). */
  const [skippedMaterialIds, setSkippedMaterialIds] = useState<Record<string, boolean>>({});
  const [rfqId, setRfqId] = useState<string | null>(null);
  const [rfqNumber, setRfqNumber] = useState('');
  const [comparison, setComparison] = useState<RfqComparisonDto | null>(null);
  const [drafts, setDrafts] = useState<VendorQuotationDraft[]>([]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [selectingPr, setSelectingPr] = useState(false);

  const {
    data: purchaseRequests,
    isLoading: prLoading,
    isFetching: prFetching,
    isError: prError,
  } = useQuery({
    queryKey: ['purchase-requests', 'ready-for-rfq'],
    queryFn: async () => {
      const res = await api.get<{ data: PurchaseRequestDto[] }>('/purchase-requests', {
        params: { readyForRfq: 'true' },
      });
      return res.data.data;
    },
  });

  const openPurchaseRequests = purchaseRequests ?? [];
  const preselectedFromList = preselectedPrId
    ? openPurchaseRequests.find((request) => request.id === preselectedPrId)
    : undefined;
  const {
    data: preselectedPurchaseRequest,
    isLoading: preselectedLoading,
    isError: preselectedError,
  } = useQuery({
    queryKey: ['purchase-request', preselectedPrId],
    queryFn: async () => {
      const res = await api.get<{ data: PurchaseRequestDto }>(
        `/purchase-requests/${preselectedPrId}`
      );
      return res.data.data;
    },
    enabled: Boolean(preselectedPrId && !preselectedFromList),
  });
  const quantity = comparison?.quantity ?? 1;

  const indentLines = useMemo(() => {
    if (!selectedMr?.items?.length) return [];
    return selectedMr.items.map((item) => {
      const materialId = (item.materialId || item.material?.id || '') as string;
      const requested = item.quantityRequested ?? item.requestedQty ?? 0;
      const available = item.availableQty ?? 0;
      const required =
        item.requiredQty != null ? item.requiredQty : Math.max(0, requested - available);
      return {
        materialId,
        name: item.material?.name || item.material?.description || 'Material',
        unit: item.unit || item.material?.unit || 'Nos',
        requested,
        available,
        required,
        requiredByDate: item.requiredByDate || null,
        coveredByStock: required <= 0,
      };
    });
  }, [selectedMr]);

  // Keep stock-covered lines skipped if user never toggled them (after indent refresh)
  useEffect(() => {
    if (!indentLines.length) return;
    setSkippedMaterialIds((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const line of indentLines) {
        if (!line.materialId || !line.coveredByStock) continue;
        if (!(line.materialId in next)) {
          next[line.materialId] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [indentLines]);

  const includedMaterialIds = useMemo(
    () => indentLines.filter((l) => l.materialId && !skippedMaterialIds[l.materialId]).map((l) => l.materialId),
    [indentLines, skippedMaterialIds]
  );

  const previewRfq = useMutation({
    mutationFn: async ({
      purchaseRequestId,
      includeIds,
    }: {
      purchaseRequestId: string;
      includeIds: string[];
    }) => {
      const res = await api.post<{
        data: RfqComparisonDto & { suggestedVendors?: { id: string; name: string }[] };
      }>('/rfqs/wizard/preview', {
        purchaseRequestId,
        includeMaterialIds: includeIds,
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      setRfqId(data.rfqId);
      setRfqNumber(data.rfqNumber);
      setComparison(data);
      // Do not hydrate vendors from the saved RFQ — reopen should not auto-select them.
      setStep(2);
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Could not start RFQ');
    },
  });

  const submitRfq = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: { rfqNumber?: string; status?: string } }>(
        '/rfqs/wizard/submit',
        {
          rfqId,
          quotations: onlyAssignedDrafts(drafts),
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          finalize: false,
        }
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      if (data && typeof data === 'object' && 'comparison' in data) {
        setComparison(data as RfqComparisonDto);
      }
      toast.success('RFQ saved');
      setStep(3);
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Could not save RFQ');
    },
  });

  const selectPurchaseRequest = async (pr: PurchaseRequestDto) => {
    if (pr.rfqId) {
      navigate(`/rfqs/${pr.rfqId}`, { replace: true });
      return;
    }
    setSelectingPr(true);
    setSelectedPr(pr);
    setDrafts([]);
    setRfqId(null);
    setRfqNumber('');
    setComparison(null);
    try {
      if (pr.materialRequestId) {
        const res = await api.get<{ data: MaterialRequestDto }>(
          `/material-requests/${pr.materialRequestId}`
        );
        const mr = res.data.data;
        setSelectedMr(mr);
        const skips: Record<string, boolean> = {};
        for (const item of mr.items || []) {
          const materialId = (item.materialId || item.material?.id || '') as string;
          if (!materialId) continue;
          const requested = item.quantityRequested ?? item.requestedQty ?? 0;
          const available = item.availableQty ?? 0;
          const required =
            item.requiredQty != null ? item.requiredQty : Math.max(0, requested - available);
          if (required <= 0) skips[materialId] = true;
        }
        setSkippedMaterialIds(skips);
      } else {
        setSelectedMr(null);
        setSkippedMaterialIds({});
      }
      setStep(1);
    } finally {
      setSelectingPr(false);
    }
  };

  useEffect(() => {
    if (!preselectedPrId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get<{ data: { rfqId?: string } | null }>(
          `/rfqs/by-pr/${preselectedPrId}`
        );
        const existingId = res.data.data?.rfqId;
        if (!cancelled && existingId) {
          navigate(`/rfqs/${existingId}`, { replace: true });
          return;
        }
      } catch {
        /* no existing RFQ — continue creating */
      }
      if (!cancelled) setExistingRfqChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [preselectedPrId, navigate]);

  useEffect(() => {
    if (!preselectedPrId || !existingRfqChecked || selectedPr || prLoading || selectingPr) return;
    const pr = preselectedFromList || preselectedPurchaseRequest;
    if (!pr) return;
    void selectPurchaseRequest(pr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    preselectedPrId,
    existingRfqChecked,
    preselectedFromList,
    preselectedPurchaseRequest,
    prLoading,
    selectedPr,
    selectingPr,
  ]);

  useEffect(() => {
    if (step !== 2) return;
    const assigned = onlyAssignedDrafts(drafts);
    if (assigned.length !== drafts.length) {
      setDrafts(assigned);
    }
  }, [step, drafts]);
  const assignedDrafts = onlyAssignedDrafts(drafts);
  const assignedVendors = useMemo(
    () => mergeAssignedVendors(assignedDrafts, comparison?.comparison?.vendors ?? []),
    [assignedDrafts, comparison]
  );

  return (
    <div className="min-h-screen flex flex-col w-full max-w-lg lg:max-w-6xl mx-auto bg-[#F8FAFC]">
      <header className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button
          onClick={() => (step > 0 ? setStep(step - 1) : navigate('/executive/rfq/inbox'))}
          className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-surface-muted"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-semibold text-ink">Create RFQ</h1>
      </header>

      {preselectedPrId && !existingRfqChecked ? (
        <div className="flex-1 px-4 pb-6">
          <div className="h-32 rounded-2xl bg-surface-muted animate-pulse" />
        </div>
      ) : (
        <>
      <StepIndicator current={step} total={STEPS.length} accentColor={accent} labels={STEPS} />
      <p className="text-center text-xs text-ink-secondary mb-2 px-4">{STEPS[step]}</p>

      <div className="flex-1 px-4 pb-6">
        <AnimatePresence mode="sync">
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <p className="text-xs text-ink-muted mb-3">
                Share the RFQ with vendors first. Create PO only after they reply — mark RFQs
                Obtained on RFQ detail, then Proceed with PO Creation.
              </p>
              {prLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-surface-muted animate-pulse" />
                  ))}
                </div>
              ) : prError || preselectedError ? (
                <EmptyState title="Could not load requests" description="Check API is running." />
              ) : (prLoading || prFetching || preselectedLoading || selectingPr) &&
                !openPurchaseRequests.length ? (
                <div className="h-32 rounded-2xl bg-surface-muted animate-pulse" />
              ) : !openPurchaseRequests.length ? (
                <EmptyState
                  title="No requests ready"
                  description="Approve a purchase request in Procurement Decisions first."
                />
              ) : (
                <div className="space-y-2">
                  {openPurchaseRequests.map((pr) => (
                    <Card
                      key={pr.id}
                      className={cn(
                        'cursor-pointer hover:shadow-card-hover',
                        selectingPr && 'pointer-events-none opacity-60'
                      )}
                      onClick={() => selectPurchaseRequest(pr)}
                    >
                      <DetailFieldRow className="items-center gap-2">
                        <p className="font-medium">{pr.prNumber}</p>
                      </DetailFieldRow>
                      <DetailFieldRow className="text-sm text-ink-secondary mt-1">
                        <DetailFieldInline label="Indent">
                          {pr.materialRequest?.indentNumber ?? 'Material request'}
                        </DetailFieldInline>
                        <DetailFieldInline label="Project">{formatProjectLabel(pr.project)}</DetailFieldInline>
                        <DetailFieldInline label="Est.">
                          {formatCurrency(pr.amountEstimate)}
                        </DetailFieldInline>
                      </DetailFieldRow>
                    </Card>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {step === 1 && selectedPr && (
            <motion.div key="s1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <p className="text-xs font-semibold text-bekem-accent bg-bekem-accent/10 border border-bekem-accent/20 rounded-lg px-3 py-2 mb-2">
                RFQ for {selectedPr.prNumber}
                {selectedMr?.indentNumber ? ` · Indent ${selectedMr.indentNumber}` : ''}
              </p>
              <p className="text-xs text-ink-secondary mb-2">
                Skip materials already covered by stock. Only included lines go into vendor RFQs
                (shortfall qty). You can Include a skipped line if you still want to procure it.
              </p>
              {indentLines.length ? (
                <div className="panel overflow-x-auto mb-3">
                  <table className="data-table min-w-[560px]">
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th className="num">Requested</th>
                        <th>Required by</th>
                        <th className="num">Available</th>
                        <th className="num">Shortfall</th>
                        <th>Status</th>
                        <th className="w-24" />
                      </tr>
                    </thead>
                    <tbody>
                      {indentLines.map((line) => {
                        const skipped = !!skippedMaterialIds[line.materialId];
                        return (
                          <tr
                            key={line.materialId}
                            className={cn(skipped && 'opacity-60')}
                          >
                            <td className="cell-text">
                              {line.name}
                              {skipped && (
                                <span className="block text-[10px] text-amber-700 font-medium">
                                  Skipped
                                  {line.coveredByStock ? ' — covered by stock' : ''}
                                </span>
                              )}
                            </td>
                            <td className="num tabular-nums">
                              {line.requested} {line.unit}
                            </td>
                            <td className="whitespace-nowrap">
                              {line.requiredByDate
                                ? new Date(line.requiredByDate).toLocaleDateString('en-GB')
                                : '—'}
                            </td>
                            <td className="num tabular-nums">{line.available}</td>
                            <td className="num tabular-nums font-semibold">
                              {line.required > 0 ? line.required : '—'}
                            </td>
                            <td className="text-xs">
                              {line.coveredByStock ? (
                                <span className="text-emerald-700">In stock</span>
                              ) : (
                                <span className="text-amber-800">Needs RFQ</span>
                              )}
                            </td>
                            <td>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  setSkippedMaterialIds((prev) => {
                                    const next = { ...prev };
                                    if (next[line.materialId]) delete next[line.materialId];
                                    else next[line.materialId] = true;
                                    return next;
                                  })
                                }
                              >
                                {skipped ? 'Include' : 'Skip'}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <div className="grid sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs font-semibold text-ink-muted">Vendor quote due date</label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-1 h-9"
                  />
                  <p className="mt-1 text-[11px] text-ink-muted">
                    This is the common last date for vendor replies. Product need dates are shown in
                    each line above.
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-ink-muted mb-2">
                {includedMaterialIds.length} material
                {includedMaterialIds.length === 1 ? '' : 's'} included in RFQ
              </p>
              <Button
                variant="accent"
                accentColor={accent}
                size="lg"
                disabled={previewRfq.isPending || includedMaterialIds.length === 0}
                onClick={() =>
                  previewRfq.mutate({
                    purchaseRequestId: selectedPr.id,
                    includeIds: includedMaterialIds,
                  })
                }
              >
                {previewRfq.isPending ? 'Creating RFQ…' : 'Continue'}
              </Button>
            </motion.div>
          )}

          {step === 2 && comparison && (
            <motion.div key="s2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <p className="text-xs text-ink-secondary mb-2">
                RFQ <span className="font-mono font-semibold">{rfqNumber}</span> — assign 1 to 100
                vendors (3+ recommended for comparison).
              </p>
              <VendorQuotationEditor
                quotations={drafts}
                quantity={quantity}
                items={comparison.items}
                onChange={(rows) => setDrafts(onlyAssignedDrafts(rows))}
                minRows={1}
              />
              <Button
                className="mt-4"
                variant="accent"
                accentColor={accent}
                size="lg"
                disabled={
                  assignedDrafts.length < 1 ||
                  assignedDrafts.length > 100 ||
                  submitRfq.isPending
                }
                onClick={() => submitRfq.mutate()}
              >
                {submitRfq.isPending ? 'Saving…' : 'Continue to review & share'}
              </Button>
            </motion.div>
          )}

          {step === 3 && rfqId && (
            <motion.div key="s3" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
              <div className="panel p-3">
                <p className="font-semibold text-ink">{rfqNumber}</p>
                <p className="text-sm text-ink-secondary mt-1">
                  {comparison?.indentNumber ? `Indent ${comparison.indentNumber}` : ''} ·{' '}
                  {assignedVendors.length} vendor RFQ(s)
                </p>
              </div>

              <RfqVendorShareList
                rfqId={rfqId}
                rfqNumber={rfqNumber}
                vendors={assignedVendors}
                items={comparison?.items ?? []}
              />

              <p className="text-xs text-ink-secondary">
                Share each vendor&apos;s RFQ above. When vendors reply, open RFQ detail, mark RFQs
                Obtained, then Proceed with PO Creation — vendor / L1 choice is on Create PO.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="accent"
                  accentColor={accent}
                  onClick={() => navigate(`/rfqs/${rfqId}`)}
                >
                  Open RFQ detail
                </Button>
                <Button variant="secondary" onClick={() => navigate('/executive/rfq/inbox')}>
                  Back to RFQ inbox
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
        </>
      )}
    </div>
  );
}
