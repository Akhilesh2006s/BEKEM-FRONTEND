import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Mail, MessageCircle } from 'lucide-react';
import { UserRole, formatProjectLabel } from '@afios/shared';
import { api } from '@/lib/api';
import type { RfqDetailDto } from '@afios/shared';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/layout/PageHeader';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { downloadExport } from '@/lib/downloadExport';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
import { hasSavedRfqVendors } from '@/lib/rfqVendorAssignments';

export function RfqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userRole = useAuthStore((s) => s.user?.role);
  const canProceedToPo = userRole === UserRole.EXECUTIVE;
  const [rfqsObtainedChecked, setRfqsObtainedChecked] = useState(false);

  const { data: rfq, ...query } = useQuery({
    queryKey: ['rfq', id],
    queryFn: async () => {
      const res = await api.get<{ data: RfqDetailDto }>(`/rfqs/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const quotesObtained = rfq?.status === 'FINALIZED' || Boolean(rfq?.quotesObtainedAt);
  const hasPo = Boolean(rfq?.poId);
  const showProceed = !hasPo && (quotesObtained || rfqsObtainedChecked);

  useEffect(() => {
    if (quotesObtained) {
      setRfqsObtainedChecked(true);
    }
  }, [quotesObtained]);

  useEffect(() => {
    if (!rfq || userRole !== UserRole.EXECUTIVE || hasPo) return;
    if (hasSavedRfqVendors(rfq)) return;
    if (!rfq.purchaseRequestId) return;
    navigate(`/executive/rfq/new?purchaseRequestId=${rfq.purchaseRequestId}`, { replace: true });
  }, [rfq, userRole, hasPo, navigate]);

  const markObtained = useMutation({
    mutationFn: async () => {
      await api.post(`/rfqs/${id}/quotes-obtained`);
    },
    onSuccess: () => {
      toast.success('RFQs Obtained — you can proceed with PO creation');
      queryClient.invalidateQueries({ queryKey: ['rfq', id] });
    },
    onError: (err: Error) => toast.error(err.message || 'Could not mark RFQs Obtained'),
  });

  const proceedToPo = async () => {
    if (!rfq?.purchaseRequestId) {
      toast.error('Purchase request missing for this RFQ');
      return;
    }
    try {
      if (!quotesObtained) {
        await markObtained.mutateAsync();
      }
      navigate(`/executive/po/new?purchaseRequestId=${rfq.purchaseRequestId}`);
    } catch {
      /* toast handled in mutation */
    }
  };

  const emailMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: { sent: boolean; to?: string } }>(`/rfqs/${id}/email`, {});
      return res.data.data;
    },
    onSuccess: (data) => {
      if (data.sent) toast.success(`RFQ emailed${data.to ? ` to ${data.to}` : ''}`);
      else toast.error('Email could not be sent');
    },
  });

  const whatsappMutation = useMutation({
    mutationFn: async () => {
      const res = await api.get<{ data: { url: string } }>(`/rfqs/${id}/share/whatsapp`);
      return res.data.data.url;
    },
    onSuccess: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
  });

  const downloadPdf = async () => {
    if (!rfq) return;
    await downloadExport(`/rfqs/${id}/pdf`, `${rfq.rfqNumber}.pdf`);
  };

  return (
    <div className="page-container max-w-3xl">
      <PageHeader
        title={rfq?.rfqNumber || 'RFQ'}
        subtitle={
          rfq?.projectCode || rfq?.projectName
            ? formatProjectLabel({ code: rfq.projectCode, name: rfq.projectName })
            : 'Request for quotation'
        }
        action={
          rfq ? (
            <div className="flex flex-wrap gap-1.5">
              <Button variant="secondary" size="sm" onClick={downloadPdf}>
                <Download className="h-4 w-4" />
                PDF
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={emailMutation.isPending}
                onClick={() => emailMutation.mutate()}
              >
                <Mail className="h-4 w-4" />
                Email
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={whatsappMutation.isPending}
                onClick={() => whatsappMutation.mutate()}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
            </div>
          ) : undefined
        }
      />

      <ListQueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        retrying={query.isFetching && !query.isLoading}
        skeletonRows={3}
        empty={<></>}
      >
        {rfq && (
          <div className="space-y-3">
            <div className="panel p-3 space-y-2">
              {rfq.indentNumber && (
                <p className="text-sm text-ink-secondary">
                  Indent <span className="font-medium text-ink">{rfq.indentNumber}</span>
                </p>
              )}
              {rfq.raisedByName && (
                <p className="text-sm text-ink-secondary">
                  Raised by{' '}
                  <span className="font-medium text-ink">
                    {rfq.raisedByName}
                    {rfq.raisedByRole === 'EXECUTIVE'
                      ? ' (Executive)'
                      : rfq.raisedByRole
                        ? ` (${rfq.raisedByRole})`
                        : ''}
                  </span>
                </p>
              )}
              {(rfq.items?.length ?? 0) > 0 && (
                <ul className="text-sm text-ink space-y-1">
                  {rfq.items.map((item) => (
                    <li key={item.materialId}>
                      {item.name} — {item.quantity} {item.unit}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-ink-muted">
                {hasPo
                  ? 'This RFQ already has a purchase order. Use View PO below to open it.'
                  : 'Share this RFQ with vendors. When they reply, mark RFQs Obtained below. Vendor selection, L1 / Non-L1, and remarks are filled on Create PO.'}
              </p>
            </div>

            <div className="panel p-3 space-y-3">
              {canProceedToPo ? (
                <>
                  {hasPo ? (
                    <div className="space-y-3">
                      <p className="text-sm text-ink">
                        Purchase order created
                        {rfq.poNumber ? (
                          <>
                            : <span className="font-semibold">{rfq.poNumber}</span>
                          </>
                        ) : null}
                      </p>
                      <p className="text-xs text-ink-secondary">
                        RFQs Obtained is complete. Open the PO to track or edit further steps.
                      </p>
                      <Button
                        variant="primary"
                        onClick={() => navigate(`/purchase-orders/${rfq.poId}`)}
                      >
                        View PO
                      </Button>
                    </div>
                  ) : (
                    <>
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4"
                          checked={quotesObtained || rfqsObtainedChecked}
                          disabled={quotesObtained || markObtained.isPending}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setRfqsObtainedChecked(checked);
                            if (checked && !quotesObtained) {
                              void markObtained.mutateAsync();
                            }
                          }}
                        />
                        <span>
                          <span className="block text-sm font-semibold text-ink">RFQs Obtained</span>
                          <span className="block text-xs text-ink-secondary mt-0.5">
                            Check this after vendors have shared their quotations.
                          </span>
                        </span>
                      </label>

                      {showProceed && (
                        <Button
                          variant="primary"
                          disabled={markObtained.isPending || !rfq.purchaseRequestId}
                          onClick={() => void proceedToPo()}
                        >
                          {markObtained.isPending ? 'Saving…' : 'Open PO creation'}
                        </Button>
                      )}
                    </>
                  )}
                </>
              ) : (
                <p className="text-xs text-ink-secondary">
                  {hasPo
                    ? `Purchase order created${rfq.poNumber ? ` (${rfq.poNumber})` : ''}.`
                    : quotesObtained
                      ? 'Vendor quotations obtained — Executive can proceed with PO creation.'
                      : 'Waiting for Executive to obtain vendor quotations and create PO.'}
                </p>
              )}
            </div>
          </div>
        )}
      </ListQueryBoundary>
    </div>
  );
}
