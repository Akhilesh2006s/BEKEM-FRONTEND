import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  ROLE_COLORS,
  UserRole,
  formatDate,
  formatProjectLabel,
  formatQuantity,
  type MaterialRequestDto,
} from '@afios/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { EmptyState } from '@/components/EmptyState';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { StatusBadge } from '@/components/ui/StatusBadge';

type ReceiveLine = {
  key: string;
  materialId: string;
  itemCode: string;
  description: string;
  unit: string;
  ordered: number;
  receiveNow: number;
};

function indentLines(mr: MaterialRequestDto): Array<{
  key: string;
  materialId: string;
  itemCode: string;
  description: string;
  unit: string;
  ordered: number;
}> {
  if (mr.items?.length) {
    return mr.items.map((item) => ({
      key: item.id || item.materialId,
      materialId: item.materialId,
      itemCode: item.material?.code || '—',
      description: item.material?.name || 'Material',
      unit: item.unit || item.material?.unit || '',
      ordered: Number(item.quantityRequested || 0),
    }));
  }
  if (mr.materialId || mr.material) {
    return [
      {
        key: mr.id,
        materialId: mr.materialId || mr.material?.id || '',
        itemCode: mr.material?.code || '—',
        description: mr.material?.name || 'Material',
        unit: mr.material?.unit || '',
        ordered: Number(mr.quantityRequested || 0),
      },
    ];
  }
  return [];
}

export function StoreMaterialGrnPage() {
  const accent = ROLE_COLORS[UserRole.STORE_INCHARGE].primary;
  const [selected, setSelected] = useState<MaterialRequestDto | null>(null);
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState('');
  const [qtyByLine, setQtyByLine] = useState<Record<string, number>>({});

  const { data: indents, list, refetch } = useListQuery({
    queryKey: ['store-yet-to-receive'],
    queryFn: async () => {
      const res = await api.get<{ data: MaterialRequestDto[] }>('/material-requests', {
        params: { queue: 'store-yet-to-receive' },
      });
      return normalizeListData<MaterialRequestDto>(res.data.data);
    },
  });

  const lines: ReceiveLine[] = useMemo(() => {
    if (!selected) return [];
    return indentLines(selected).map((line) => ({
      ...line,
      receiveNow: qtyByLine[line.key] ?? line.ordered,
    }));
  }, [selected, qtyByLine]);

  const selectIndent = (mr: MaterialRequestDto) => {
    setSelected(mr);
    const next: Record<string, number> = {};
    indentLines(mr).forEach((line) => {
      next[line.key] = line.ordered;
    });
    setQtyByLine(next);
    setReceivedAt(new Date().toISOString().slice(0, 10));
    setRemark('');
  };

  const submit = useMutation({
    mutationFn: async () => {
      const items = lines
        .filter((line) => line.receiveNow > 0)
        .map((line) => ({
          materialId: line.materialId,
          quantityReceived: line.receiveNow,
        }));
      if (!items.length) {
        throw new Error('Enter received quantity for at least one item');
      }
      const res = await api.post<{ data: MaterialRequestDto }>(
        `/material-requests/${selected!.id}/stock-received`,
        {
          remark: remark.trim() || undefined,
          receivedAt: new Date(receivedAt).toISOString(),
          items,
        }
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      toast.success(`${data.indentNumber} marked received — now available under Issue to site`);
      setSelected(null);
      setRemark('');
      refetch();
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || e.message || 'Could not record stock received');
    },
  });

  if (selected) {
    return (
      <div className="page-container max-w-4xl">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-sm text-ink-secondary mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to yet-to-receive
        </button>
        <PageHeader
          title={`Stock Received — ${selected.indentNumber}`}
          subtitle={`${formatProjectLabel(selected.project)}${
            selected.site?.name ? ` · ${selected.site.name}` : ''
          }`}
        />

        <div className="panel p-3 mb-3 space-y-1 text-sm">
          <p>
            <span className="text-ink-muted">Requested by:</span>{' '}
            {selected.requestedByName || selected.requester?.name || '—'}
          </p>
          <p>
            <span className="text-ink-muted">Purpose:</span> {selected.purpose || '—'}
          </p>
          <p>
            <span className="text-ink-muted">PO:</span> {selected.poNumber || '—'}
          </p>
        </div>

        <div className="table-shell mb-3">
          <table className="data-table min-w-[40rem]">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Ordered</th>
                <th className="num">Receive now</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((row) => (
                <tr key={row.key}>
                  <td className="cell-text">
                    <span className="cell-code">{row.itemCode}</span>
                    <span className="block text-ink-secondary">{row.description}</span>
                  </td>
                  <td className="num tabular-nums">{formatQuantity(row.ordered)}</td>
                  <td className="num">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={row.receiveNow}
                      onChange={(e) => {
                        const v = Math.max(0, Number(e.target.value) || 0);
                        setQtyByLine((prev) => ({ ...prev, [row.key]: v }));
                      }}
                      className="w-24 text-right ml-auto"
                    />
                  </td>
                  <td className="whitespace-nowrap">{row.unit || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel p-3 space-y-3">
          <div>
            <label className="text-xs font-semibold text-ink-muted block mb-1">Received date</label>
            <Input
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              className="w-auto"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-muted block mb-1">Remarks</label>
            <Textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Optional note for this stock-received entry…"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              accentColor={accent}
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
            >
              Submit Stock Received
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container max-w-full">
      <PageHeader
        title="Material GRN"
        subtitle="Approved indents that are yet to be received — record Stock Received to send them to Issue to site"
      />
      <ListQueryBoundary
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={list.onRetry}
        retrying={list.retrying}
        isEmpty={!indents?.length}
        empty={
          <EmptyState
            title="No indents yet to receive"
            description="After procurement approval, approved indents appear here until Store records Stock Received."
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
                <th>PO</th>
                <th className="num">Items</th>
                <th>Date</th>
                <th>Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {(indents ?? []).map((mr) => (
                <tr key={mr.id} className="cursor-pointer" onClick={() => selectIndent(mr)}>
                  <td className="cell-code whitespace-nowrap">{mr.indentNumber}</td>
                  <td className="cell-text whitespace-nowrap">{formatProjectLabel(mr.project)}</td>
                  <td className="cell-text whitespace-nowrap">
                    {mr.requestedByName || mr.requester?.name || '—'}
                  </td>
                  <td className="cell-code whitespace-nowrap">{mr.poNumber || '—'}</td>
                  <td className="num tabular-nums">{mr.items?.length || (mr.materialId ? 1 : 0)}</td>
                  <td className="whitespace-nowrap">{formatDate(mr.createdAt)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={mr.status} label="Approved" />
                      <StatusBadge status="PENDING" label="Yet to be Received" />
                    </div>
                  </td>
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
