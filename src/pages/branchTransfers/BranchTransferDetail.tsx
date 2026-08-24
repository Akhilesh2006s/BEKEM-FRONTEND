import { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { ROLE_COLORS, UserRole, type BranchTransferDto } from '@afios/shared';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StatusTimeline } from '@/components/StatusTimeline';
import { SuccessScreen } from '@/components/SuccessScreen';
import { getRoleHomePath } from '@/lib/rolePaths';
import { DetailField, DetailFieldGrid } from '@/components/ui/DetailFields';

export function BranchTransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user)!;
  const role = user.role as UserRole;
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');
  const [challanNo, setChallanNo] = useState('');
  const [expectedArrivalDate, setExpectedArrivalDate] = useState('');
  const [dispatchNote, setDispatchNote] = useState('');
  const [receiveQtyByMaterial, setReceiveQtyByMaterial] = useState<Record<string, string>>({});
  const [receiveChallan, setReceiveChallan] = useState('');
  const [receiveNote, setReceiveNote] = useState('');

  const accent =
    role === UserRole.COORDINATOR
      ? ROLE_COLORS[UserRole.COORDINATOR].primary
      : role === UserRole.EXECUTIVE
        ? ROLE_COLORS[UserRole.EXECUTIVE].primary
        : ROLE_COLORS[UserRole.PROJECT_MANAGER].primary;

  const { data: transfer, isLoading } = useQuery({
    queryKey: ['branch-transfer', id],
    queryFn: async () => {
      const res = await api.get<{ data: BranchTransferDto }>(`/branch-transfers/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['branch-transfer', id] });
    queryClient.invalidateQueries({ queryKey: ['branch-transfers'] });
    queryClient.invalidateQueries({ queryKey: ['pm-branch-transfer-requests'] });
    queryClient.invalidateQueries({ queryKey: ['material-request'] });
    queryClient.invalidateQueries({ queryKey: ['stock-inventory'] });
    queryClient.invalidateQueries({ queryKey: ['stock-balance-live'] });
    queryClient.invalidateQueries({ queryKey: ['pm-cross-stock-all'] });
  };

  const executiveApprove = useMutation({
    mutationFn: () => api.post(`/branch-transfers/${id}/executive-approve`, { note }),
    onSuccess: () => {
      setDoneMessage(
        'Approved — source Project Manager will dispatch with challan and expected arrival date'
      );
      setDone(true);
    },
    onError: () => toast.error('Approval failed'),
    onSettled: invalidate,
  });

  const executiveReject = useMutation({
    mutationFn: () => api.post(`/branch-transfers/${id}/executive-reject`, { note }),
    onSuccess: () => {
      setDoneMessage('Branch transfer rejected');
      setDone(true);
    },
    onError: () => toast.error('Rejection failed'),
    onSettled: invalidate,
  });

  const dispatch = useMutation({
    mutationFn: () =>
      api.post(`/branch-transfers/${id}/dispatch`, {
        challanNo,
        expectedArrivalDate,
        dispatchNote,
      }),
    onSuccess: () => {
      setDoneMessage('Dispatched — requesting PM will submit receipt and GRN on arrival');
      setDone(true);
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Dispatch failed'),
    onSettled: invalidate,
  });

  const receive = useMutation({
    mutationFn: () => {
      const items = (transfer?.items || [])
        .map((item) => {
          const mid = item.materialId || '';
          const qty = Number(receiveQtyByMaterial[mid] ?? item.quantityRemaining ?? 0);
          return { materialId: mid, quantity: qty };
        })
        .filter((i) => i.materialId && i.quantity > 0);
      return api.post(`/branch-transfers/${id}/receive`, {
        challanNo: receiveChallan || transfer?.challanNo,
        note: receiveNote,
        items,
      });
    },
    onSuccess: (res) => {
      const grnNumber = res.data?.grn?.grnNumber;
      setDoneMessage(
        grnNumber
          ? `Receipt posted — GRN ${grnNumber} created`
          : 'Receipt posted — GRN created for this arrival'
      );
      setDone(true);
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Receipt failed'),
    onSettled: invalidate,
  });

  const receiveDefaultsReady = useMemo(() => {
    if (!transfer?.items?.length) return false;
    return transfer.items.some((i) => (i.quantityRemaining ?? i.quantity - (i.quantityReceived || 0)) > 0);
  }, [transfer]);

  if (done) {
    return (
      <SuccessScreen
        title="Done!"
        message={doneMessage}
        accentColor={accent}
        primaryAction={{ label: 'Back to home', onClick: () => navigate(getRoleHomePath(role)) }}
      />
    );
  }

  if (isLoading || !transfer) {
    return <div className="p-6 h-40 bg-surface-muted animate-pulse rounded-xl mx-4 mt-4" />;
  }

  return (
    <div className="px-4 pt-4 pb-6 max-w-lg mx-auto">
      <header className="flex items-center gap-3 mb-3">
        <button
          onClick={() => navigate(-1)}
          className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-gray-100"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-semibold">{transfer.transferNumber}</h1>
          <StatusBadge status={transfer.status} className="mt-1" />
        </div>
      </header>

      <Card className="mb-3">
        <DetailFieldGrid>
          <DetailField label="Route" labelClassName="text-gray-500">
            {transfer.fromProjectName || transfer.fromProject} →{' '}
            {transfer.toProjectName || transfer.toProject}
          </DetailField>
          {transfer.items?.map((item, i) => (
            <DetailField key={i} label="Material" labelClassName="text-gray-500">
              {item.materialName}: {item.quantity}
              {item.quantityReceived != null && item.quantityReceived > 0
                ? ` · received ${item.quantityReceived}`
                : ''}
            </DetailField>
          ))}
          {transfer.note && (
            <DetailField
              label="Note"
              fullWidth
              labelClassName="text-gray-500"
              valueClassName="text-sm font-normal"
            >
              {transfer.note}
            </DetailField>
          )}
          {transfer.requestedBy && (
            <DetailField label="Requested by" labelClassName="text-gray-500">
              {transfer.requestedBy}
            </DetailField>
          )}
          {transfer.challanNo && (
            <DetailField label="Challan" labelClassName="text-gray-500">
              {transfer.challanNo}
            </DetailField>
          )}
          {transfer.expectedArrivalDate && (
            <DetailField label="Expected arrival" labelClassName="text-gray-500">
              {new Date(transfer.expectedArrivalDate).toLocaleDateString('en-IN')}
            </DetailField>
          )}
          {transfer.dispatchNote && (
            <DetailField
              label="Dispatch note"
              fullWidth
              labelClassName="text-gray-500"
              valueClassName="text-sm font-normal"
            >
              {transfer.dispatchNote}
            </DetailField>
          )}

          {role === UserRole.PROJECT_MANAGER && transfer.status === 'REQUESTED' && (
            <p className="w-full basis-full text-xs text-ink-secondary rounded-lg bg-surface-muted px-3 py-2">
              Awaiting Executive approval.
            </p>
          )}
          {role === UserRole.EXECUTIVE && transfer.status === 'REQUESTED' && (
            <p className="w-full basis-full text-xs text-ink-secondary rounded-lg bg-surface-muted px-3 py-2">
              Approve to send to the source Project Manager for dispatch (challan + ETA). Stock moves
              only after dispatch and destination receipt.
            </p>
          )}
          {transfer.status === 'EXECUTIVE_APPROVED' && (
            <p className="w-full basis-full text-xs text-ink-secondary rounded-lg bg-surface-muted px-3 py-2">
              Source PM must confirm challan and expected arrival, then dispatch.
            </p>
          )}
          {(transfer.status === 'DISPATCHED' || transfer.status === 'PARTIALLY_RECEIVED') && (
            <p className="w-full basis-full text-xs text-ink-secondary rounded-lg bg-surface-muted px-3 py-2">
              Material in transit / partial. Requesting PM submits receipt — each receipt creates a
              GRN.
            </p>
          )}
        </DetailFieldGrid>
      </Card>

      {(transfer.receiptGrns?.length || 0) > 0 && (
        <Card className="mb-3 p-4 space-y-2">
          <p className="text-sm font-semibold text-ink">Receipt GRNs</p>
          <ul className="space-y-2">
            {transfer.receiptGrns!.map((g) => (
              <li key={g.id} className="text-sm flex justify-between gap-2">
                <span className="font-medium text-ink">{g.grnNumber}</span>
                <span className="text-ink-secondary tabular-nums">
                  qty {g.receivedQuantity ?? '—'}
                  {g.challanNo ? ` · ${g.challanNo}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <h2 className="font-semibold text-sm mb-3">Timeline</h2>
      <StatusTimeline entityType="BranchTransfer" entityId={transfer.id} />

      {transfer.canExecutiveApprove && (
        <div className="mt-6 space-y-3 border-t border-surface-border pt-6">
          <h2 className="font-semibold text-sm">Executive review</h2>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for audit trail…"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="accent"
              size="lg"
              accentColor={accent}
              disabled={executiveApprove.isPending}
              onClick={() => executiveApprove.mutate()}
            >
              Approve branch transfer
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="text-danger"
              disabled={!note.trim() || executiveReject.isPending}
              onClick={() => executiveReject.mutate()}
            >
              Reject (remark required)
            </Button>
          </div>
        </div>
      )}

      {transfer.canSourceDispatch && (
        <div className="mt-6 space-y-3 border-t border-surface-border pt-6">
          <h2 className="font-semibold text-sm">Source PM — dispatch</h2>
          <p className="text-xs text-ink-secondary">
            Confirm you are releasing this stock. Enter challan number and when it should arrive.
            Source stock is deducted on dispatch.
          </p>
          <label className="block text-sm font-medium text-ink">
            Challan number *
            <Input
              className="mt-1"
              value={challanNo}
              onChange={(e) => setChallanNo(e.target.value)}
              placeholder="e.g. CH/2026/001"
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            Expected arrival date *
            <Input
              className="mt-1"
              type="date"
              value={expectedArrivalDate}
              onChange={(e) => setExpectedArrivalDate(e.target.value)}
            />
          </label>
          <Textarea
            value={dispatchNote}
            onChange={(e) => setDispatchNote(e.target.value)}
            placeholder="Optional dispatch note (vehicle, contact…)…"
          />
          <Button
            variant="accent"
            size="lg"
            accentColor={accent}
            disabled={!challanNo.trim() || !expectedArrivalDate || dispatch.isPending}
            onClick={() => dispatch.mutate()}
          >
            Dispatch to requesting project
          </Button>
        </div>
      )}

      {transfer.canReceive && receiveDefaultsReady && (
        <div className="mt-6 space-y-3 border-t border-surface-border pt-6">
          <h2 className="font-semibold text-sm">Requesting PM — submit receipt</h2>
          <p className="text-xs text-ink-secondary">
            After material arrives, record quantities received. Each submission creates a GRN (partial
            arrivals can create multiple GRNs).
          </p>
          {transfer.items?.map((item) => {
            const mid = item.materialId || '';
            const remaining =
              item.quantityRemaining ?? Math.max(0, item.quantity - (item.quantityReceived || 0));
            if (remaining <= 0) return null;
            const value = receiveQtyByMaterial[mid] ?? String(remaining);
            return (
              <label key={mid} className="block text-sm font-medium text-ink">
                {item.materialName || 'Material'} — receive qty (max {remaining})
                <Input
                  className="mt-1"
                  type="number"
                  min={0}
                  max={remaining}
                  value={value}
                  onChange={(e) =>
                    setReceiveQtyByMaterial((prev) => ({ ...prev, [mid]: e.target.value }))
                  }
                />
              </label>
            );
          })}
          <label className="block text-sm font-medium text-ink">
            Challan (optional override)
            <Input
              className="mt-1"
              value={receiveChallan}
              onChange={(e) => setReceiveChallan(e.target.value)}
              placeholder={transfer.challanNo || 'Challan on receipt'}
            />
          </label>
          <Textarea
            value={receiveNote}
            onChange={(e) => setReceiveNote(e.target.value)}
            placeholder="Receipt note…"
          />
          <Button
            variant="accent"
            size="lg"
            accentColor={accent}
            disabled={receive.isPending}
            onClick={() => receive.mutate()}
          >
            Submit receipt & create GRN
          </Button>
        </div>
      )}

      {transfer.materialRequestId && (
        <p className="mt-4 text-xs text-ink-muted">
          Linked indent:{' '}
          <Link className="text-bekem-accent underline" to={`/incidents/${transfer.materialRequestId}`}>
            open indent
          </Link>
        </p>
      )}
    </div>
  );
}
