import { useMemo, useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  ISSUE_REASON_LABELS,
  ISSUE_TYPE_LABELS,
  formatDate,
  type IssueReason,
  type IssueType,
  type MaterialRequestDto,
} from '@afios/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { EmptyState } from '@/components/EmptyState';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { downloadExport } from '@/lib/downloadExport';
import { ChevronRight } from 'lucide-react';
import {
  formatIndentQueueStatus,
  formatIssuedFulfillmentLabel,
  isIndentFullyIssued,
} from '@/components/MaterialIndentsTable';

type IssueLineSource = {
  id: string;
  materialId: string;
  quantityRequested: number;
  quantityAllocated?: number;
  quantityIssued?: number;
  availableQty?: number;
  availableToIssueQty?: number;
  unit?: string;
  material?: MaterialRequestDto['material'];
};

function lineItems(mr: MaterialRequestDto): IssueLineSource[] {
  if (mr.items?.length) {
    return mr.items.map((item) => ({
      id: item.id,
      materialId: item.materialId,
      quantityRequested: item.quantityRequested,
      quantityAllocated: item.quantityAllocated,
      quantityIssued: item.quantityIssued,
      availableQty: item.availableQty,
      availableToIssueQty: item.availableToIssueQty,
      unit: item.unit,
      material: item.material,
    }));
  }
  if (mr.materialId || mr.material) {
    return [
      {
        id: mr.id,
        materialId: mr.materialId || mr.material?.id || '',
        quantityRequested: mr.quantityRequested || 0,
        quantityIssued: mr.quantityIssued || 0,
        availableQty: undefined,
        material: mr.material,
      },
    ];
  }
  return [];
}

interface IssueAttachment {
  name: string;
  fileType: string;
  category?: string;
}

const REASONS = Object.entries(ISSUE_REASON_LABELS) as [IssueReason, string][];
const ISSUE_TYPE_OPTIONS = Object.entries(ISSUE_TYPE_LABELS) as [IssueType, string][];

export function IssueMaterialPage() {
  const [selected, setSelected] = useState<MaterialRequestDto | null>(null);
  const [reason, setReason] = useState<IssueReason | ''>('');
  const [issueType, setIssueType] = useState<IssueType | ''>('');
  const [issueTypeError, setIssueTypeError] = useState('');
  const [reasonOther, setReasonOther] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [note, setNote] = useState('');
  const [issuedToName, setIssuedToName] = useState('');
  const [issuedToError, setIssuedToError] = useState('');
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [issuedQtyByLine, setIssuedQtyByLine] = useState<Record<string, number>>({});
  const [attachments, setAttachments] = useState<IssueAttachment[]>([]);
  const [ackAttachments, setAckAttachments] = useState<IssueAttachment[]>([]);
  const [lastIssue, setLastIssue] = useState<{ id: string; issueNumber: string } | null>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const ackRef = useRef<HTMLInputElement>(null);

  const { data: indents, list, refetch } = useListQuery({
    queryKey: ['ready-to-issue'],
    queryFn: async () => {
      const res = await api.get<{ data: MaterialRequestDto[] }>('/material-requests', {
        params: { status: 'MATERIAL_RECEIVED,CHAIRMAN_APPROVED,ALLOCATED,ISSUED,PARTIALLY_ISSUED' },
      });
      return normalizeListData<MaterialRequestDto>(res.data.data);
    },
  });

  const maxIssuable = (item: {
    availableToIssueQty?: number;
    quantityAllocated?: number;
    quantityIssued?: number;
    quantityRequested?: number;
    availableQty?: number;
  }) => {
    const remainingRequest = Math.max(
      0,
      Number(item.quantityRequested || 0) - Number(item.quantityIssued || 0)
    );
    const allocatedBalance = Math.max(
      0,
      Number(item.quantityAllocated || 0) - Number(item.quantityIssued || 0)
    );
    const ready =
      item.availableToIssueQty != null
        ? Number(item.availableToIssueQty)
        : Math.min(remainingRequest, Number(item.availableQty || 0));
    return Math.max(0, Math.min(remainingRequest, Math.max(ready, allocatedBalance)));
  };

  const issueLines = useMemo(() => {
    if (!selected) return [];
    return lineItems(selected).map((item) => {
      const available = maxIssuable(item);
      const key = item.id || item.materialId;
      const issued = issuedQtyByLine[key] ?? available;
      return {
        key,
        materialId: item.materialId,
        itemCode: item.material?.code || '—',
        description: item.material?.name || 'Material',
        unit: item.unit || item.material?.unit || '',
        available,
        issued,
        balance: Math.max(0, Math.round((available - issued + Number.EPSILON) * 100) / 100),
      };
    });
  }, [selected, issuedQtyByLine]);

  const pickFiles = (
    files: FileList | null,
    which: 'docs' | 'ack'
  ) => {
    if (!files?.length) return;
    const added = Array.from(files).map((f) => ({
      name: f.name,
      fileType: f.type || 'application/octet-stream',
      category: which === 'ack' ? 'CONTRACTOR_ACK' : 'ISSUE_SLIP',
    }));
    if (which === 'ack') setAckAttachments((prev) => [...prev, ...added]);
    else setAttachments((prev) => [...prev, ...added]);
  };

  const selectIndent = (mr: MaterialRequestDto) => {
    setSelected(mr);
    const next: Record<string, number> = {};
    lineItems(mr).forEach((item) => {
      const key = item.id || item.materialId;
      next[key] = maxIssuable(item);
    });
    setIssuedQtyByLine(next);
    setIssuedAt(new Date().toISOString().slice(0, 10));
  };

  const issue = useMutation({
    mutationFn: async () => {
      if (!reason) throw new Error('Please select an issue reason');
      if (reason === 'other' && !reasonOther.trim()) {
        throw new Error('Please provide details when reason is Other');
      }
      if (!issueType) throw new Error('Issue type is required');
      if (!issuedToName.trim()) {
        throw new Error(
          issueType === 'CONTRACT_ISSUE' ? 'Contractor name is required' : 'Employee name is required'
        );
      }
      const items = issueLines
        .filter((l) => l.issued > 0)
        .map((l) => ({ materialId: l.materialId, quantity: l.issued }));
      if (!items.length) throw new Error('Enter issued quantity for at least one item');

      const res = await api.post<{
        data: { issue: { id: string; issueNumber: string } };
      }>('/material-issues', {
        materialRequestId: selected!.id,
        reason,
        issueType,
        reasonOtherText: reason === 'other' ? reasonOther.trim() : undefined,
        issuedToName: issuedToName.trim(),
        issuedAt: new Date(issuedAt).toISOString(),
        note,
        items,
        attachments: [...attachments, ...ackAttachments],
      });
      return res.data.data.issue;
    },
    onSuccess: (issueData) => {
      toast.success('Material issued — site will confirm receipt');
      setLastIssue(issueData);
      setSelected(null);
      setReason('');
      setIssueType('');
      setIssueTypeError('');
      setReasonOther('');
      setReasonError('');
      setIssuedToName('');
      setIssuedToError('');
      setNote('');
      setAttachments([]);
      setAckAttachments([]);
      refetch();
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || e.message || 'Issue failed');
    },
  });

  const submitIssue = () => {
    if (!reason) {
      setReasonError('Issue reason is required');
      return;
    }
    if (reason === 'other' && !reasonOther.trim()) {
      setReasonError('Please provide details when reason is Other');
      return;
    }
    if (!issueType) {
      setIssueTypeError('Issue type is required');
      return;
    }
    if (!issuedToName.trim()) {
      setIssuedToError(
        issueType === 'CONTRACT_ISSUE'
          ? 'Contractor name is required'
          : 'Employee name is required'
      );
      return;
    }
    setReasonError('');
    setIssueTypeError('');
    setIssuedToError('');
    issue.mutate();
  };

  const downloadSlip = async () => {
    if (!lastIssue) return;
    try {
      await downloadExport(
        `/exports/material-issues/${lastIssue.id}.pdf`,
        `${lastIssue.issueNumber}.pdf`
      );
      toast.success('Issue slip downloaded');
    } catch {
      toast.error('Could not download issue slip');
    }
  };

  return (
    <div className="page-container max-w-full">
      <PageHeader
        title="Issue to site"
        subtitle="Issue material against indent and generate issue slip"
      />

      {lastIssue && (
        <div className="panel p-3 mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{lastIssue.issueNumber}</p>
            <p className="text-sm text-ink-secondary">Issue slip ready to print</p>
          </div>
          <Button variant="secondary" onClick={downloadSlip}>
            Download PDF
          </Button>
        </div>
      )}

      {!selected ? (
        <ListQueryBoundary
          isLoading={list.isLoading}
          isError={list.isError}
          onRetry={list.onRetry}
          retrying={list.retrying}
          isEmpty={!indents?.length}
          empty={
            <EmptyState
              title="Nothing ready to issue"
              description="Complete Material receipt (GRN) for delivered POs, or allocate stock from pending indents."
            />
          }
        >
          <div className="table-shell">
            <table className="data-table min-w-[64rem]">
              <thead>
                <tr>
                  <th>Indent No</th>
                  <th>Reason</th>
                  <th>Requested by</th>
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
                    <td className="cell-text">{mr.purpose || '—'}</td>
                    <td className="cell-text whitespace-nowrap">
                      {mr.requestedByName || mr.requester?.name || '—'}
                    </td>
                    <td className="num tabular-nums">
                      {mr.items?.length || (mr.materialId ? 1 : 0)}
                    </td>
                    <td className="whitespace-nowrap">{formatDate(mr.createdAt)}</td>
                    <td>
                      <StatusBadge
                        status={
                          mr.status === 'PARTIALLY_ISSUED' ||
                          (mr.status === 'ISSUED' && !isIndentFullyIssued(mr))
                            ? 'PARTIALLY_ISSUED'
                            : mr.status
                        }
                        label={
                          mr.status === 'ISSUED' || mr.status === 'PARTIALLY_ISSUED'
                            ? formatIssuedFulfillmentLabel(mr)
                            : formatIndentQueueStatus(
                                mr.status,
                                mr.pendingWith,
                                mr.approverNames,
                                mr.poStatus,
                                mr.pmProceededAllocation,
                                mr.allocationReviewStage,
                                mr.allocatedByRole
                              )
                        }
                      />
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
      ) : (
        <div className="space-y-3">
          <div className="panel p-3 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{selected.indentNumber}</p>
                <p className="text-sm text-ink-secondary">{selected.purpose || '—'}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-muted block mb-1">
                  Material Issue Date
                </label>
                <Input
                  type="date"
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                  className="w-auto"
                />
              </div>
            </div>

            <div className="table-shell">
              <table className="data-table min-w-[40rem]">
                <thead>
                  <tr>
                    <th>Item Code</th>
                    <th>Item Description</th>
                    <th className="num">Requested</th>
                    <th className="num">Already issued</th>
                    <th className="num">Remaining to issue</th>
                    <th className="num">Issue now</th>
                    <th className="num">Balance after</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {issueLines.map((line) => {
                    const source = lineItems(selected).find(
                      (i) => (i.id || i.materialId) === line.key
                    );
                    const alreadyIssued = Number(source?.quantityIssued || 0);
                    const requested = Number(source?.quantityRequested || 0);
                    return (
                      <tr key={line.key}>
                        <td className="cell-code whitespace-nowrap">{line.itemCode}</td>
                        <td className="cell-text">{line.description}</td>
                        <td className="num tabular-nums">{requested}</td>
                        <td className="num tabular-nums">{alreadyIssued}</td>
                        <td className="num tabular-nums font-semibold text-emerald-700">
                          {line.available}
                        </td>
                        <td className="num">
                          <Input
                            type="number"
                            min={0}
                            max={line.available}
                            step="any"
                            className="w-24 ml-auto text-right"
                            value={line.issued}
                            onChange={(e) => {
                              const raw = Number(e.target.value);
                              const nextQty = Number.isFinite(raw)
                                ? Math.min(line.available, Math.max(0, raw))
                                : 0;
                              setIssuedQtyByLine((prev) => ({ ...prev, [line.key]: nextQty }));
                            }}
                          />
                        </td>
                        <td className="num tabular-nums">{line.balance}</td>
                        <td>{line.unit || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel p-3 space-y-3">
            <div>
              <label className="text-sm font-medium text-ink-secondary block mb-2">
                Issue reason <span className="text-danger">*</span>
              </label>
              <select
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value as IssueReason | '');
                  if (e.target.value) setReasonError('');
                }}
                className="w-full border border-surface-border rounded-xl px-3 py-2.5 text-sm bg-white"
              >
                <option value="">Select reason…</option>
                {REASONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {reasonError && <p className="text-xs text-danger mt-1">{reasonError}</p>}
            </div>

            {reason === 'other' && (
              <Textarea
                value={reasonOther}
                onChange={(e) => setReasonOther(e.target.value)}
                placeholder="Describe the reason…"
              />
            )}

            <div>
              <label className="text-sm font-medium text-ink-secondary block mb-2">
                Issue type <span className="text-danger">*</span>
              </label>
              <select
                value={issueType}
                onChange={(e) => {
                  setIssueType(e.target.value as IssueType | '');
                  setIssuedToName('');
                  if (e.target.value) setIssueTypeError('');
                }}
                className="w-full border border-surface-border rounded-xl px-3 py-2.5 text-sm bg-white"
              >
                <option value="">Select issue type…</option>
                {ISSUE_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {issueTypeError && <p className="text-xs text-danger mt-1">{issueTypeError}</p>}
            </div>

            {issueType && (
              <div>
                <label className="text-sm font-medium text-ink-secondary block mb-2">
                  {issueType === 'CONTRACT_ISSUE' ? 'Contractor Name' : 'Employee Name'}{' '}
                  <span className="text-danger">*</span>
                </label>
                <Input
                  value={issuedToName}
                  onChange={(e) => {
                    setIssuedToName(e.target.value);
                    if (e.target.value.trim()) setIssuedToError('');
                  }}
                  placeholder={
                    issueType === 'CONTRACT_ISSUE' ? 'Contractor name' : 'Employee name'
                  }
                />
                {issuedToError && <p className="text-xs text-danger mt-1">{issuedToError}</p>}
              </div>
            )}

            {issueType === 'CONTRACT_ISSUE' && (
              <div>
                <p className="text-sm font-medium text-ink-secondary mb-2">
                  Signed acknowledgement <span className="text-ink-muted font-normal">(optional)</span>
                </p>
                <input
                  ref={ackRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="block w-full text-sm"
                  onChange={(e) => pickFiles(e.target.files, 'ack')}
                />
                {ackAttachments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {ackAttachments.map((a, i) => (
                      <li key={i} className="text-xs text-ink-secondary flex justify-between gap-2">
                        <span>{a.name}</span>
                        <button
                          type="button"
                          className="text-danger"
                          onClick={() => setAckAttachments((prev) => prev.filter((_, j) => j !== i))}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

            <div>
              <p className="text-sm font-medium text-ink-secondary mb-2">Upload documents</p>
              <input
                ref={docRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                className="block w-full text-sm"
                onChange={(e) => pickFiles(e.target.files, 'docs')}
              />
              {attachments.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {attachments.map((a, i) => (
                    <li key={i} className="text-xs text-ink-secondary flex justify-between gap-2">
                      <span>{a.name}</span>
                      <button
                        type="button"
                        className="text-danger"
                        onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Back
              </Button>
              <Button variant="primary" disabled={issue.isPending} onClick={submitIssue}>
                Issue material
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
