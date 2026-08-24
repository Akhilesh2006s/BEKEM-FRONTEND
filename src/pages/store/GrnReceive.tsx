import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, Image as ImageIcon, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  ROLE_COLORS,
  UserRole,
  formatCurrency,
  formatDate,
  formatQuantity,
  formatProjectLabel,
  type PurchaseOrderDto,
  type PoGrnReceiptLineDto,
  type ProjectGrnCounterDto,
} from '@afios/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { cn } from '@/lib/utils';
import { DetailField, DetailFieldGrid } from '@/components/ui/DetailFields';

type ReceiveType = 'PARTIAL' | 'FULL';
type AttachmentCategory = 'INVOICE' | 'CHALLAN' | 'PHOTO';

interface GrnAttachmentDto {
  id?: string;
  name: string;
  fileType: string;
  category: AttachmentCategory;
  url?: string;
  dataBase64?: string;
}

interface GrnListRow {
  id: string;
  grnNumber: string;
  purchaseOrderId?: string | null;
  branchTransferId?: string | null;
  transferNumber?: string;
  /** PO number or "BT {transferNumber}" for branch-transfer receipts. */
  orderName?: string;
  poNumber: string;
  indentNumber: string;
  projectCode?: string;
  projectName?: string;
  vendorName: string;
  status: string;
  receivedAt: string | null;
  invoiceNo?: string;
  invoiceDate?: string | null;
  invoiceValue?: number;
  challanNo?: string;
  ewayBillNumber?: string;
  vehicleNo?: string;
  driverName?: string;
  note?: string;
  remarks?: string;
  receiveType?: string;
  quantityOrdered?: number;
  quantityReceivedThisGrn?: number;
  quantityReceived?: number;
  quantityRemaining?: number;
  items?: Array<{
    materialName: string;
    quantity: number;
    quantityOrdered?: number;
    unit?: string;
    rate?: number;
  }>;
  attachments?: GrnAttachmentDto[];
  receivedByName?: string;
}

function formatQtySummary(ordered?: number, received?: number, remaining?: number) {
  return {
    ordered: formatQuantity(Number(ordered || 0)),
    received: formatQuantity(Number(received || 0)),
    left: formatQuantity(Number(remaining || 0)),
  };
}

interface GrnAttachment {
  name: string;
  fileType: string;
  category: AttachmentCategory;
  dataBase64?: string;
}

interface GrnCreateResponse {
  id: string;
  grnNumber: string;
  status: string;
  approvalStage?: string;
}

async function readFileAsBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function openStoredAttachment(url: string, fileName: string, fileType?: string) {
  const path = url.startsWith('/api/') ? url.slice(4) : url;
  const res = await api.get(path, { responseType: 'blob' });
  const blob = new Blob([res.data], { type: fileType || res.data.type || 'application/octet-stream' });
  const objectUrl = window.URL.createObjectURL(blob);
  const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
  if (!opened) {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
}

function mapPoLinesToReceiptLines(po: PurchaseOrderDto): PoGrnReceiptLineDto[] {
  return (po.lineItems ?? []).map((li, lineIndex) => ({
    lineIndex,
    materialId: li.materialId,
    description: li.description,
    unit: '',
    orderedQty: li.quantity,
    previouslyReceived: 0,
    remainingQty: li.quantity,
    poRate: li.rate,
  }));
}

function lineKey(line: PoGrnReceiptLineDto) {
  return line.materialId || `line-${line.lineIndex}`;
}

function invoiceRateClass(invoicePrice: number, poRate: number) {
  if (Math.abs(invoicePrice - poRate) < 0.0001) return '';
  if (invoicePrice < poRate) return 'border-emerald-400 text-emerald-700 bg-emerald-50/50';
  return 'border-red-400 text-red-700 bg-red-50/50';
}

function hasAttachmentCategory(attachments: GrnAttachment[], category: AttachmentCategory) {
  return attachments.some((a) => a.category === category);
}

export function GrnReceivePage() {
  const accent = ROLE_COLORS[UserRole.COORDINATOR].primary;
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedPo, setSelectedPo] = useState<PurchaseOrderDto | null>(null);
  const [selectedGrnId, setSelectedGrnId] = useState<string | null>(null);
  const [receiptLines, setReceiptLines] = useState<PoGrnReceiptLineDto[]>([]);
  const [receivedByLine, setReceivedByLine] = useState<Record<string, number | ''>>({});
  const [invoicePriceByLine, setInvoicePriceByLine] = useState<Record<string, number>>({});
  const [receiveType, setReceiveType] = useState<ReceiveType>('PARTIAL');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [challanNo, setChallanNo] = useState('');
  const [ewayBillNumber, setEwayBillNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [attachments, setAttachments] = useState<GrnAttachment[]>([]);

  const invoiceRef = useRef<HTMLInputElement>(null);
  const challanRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);

  const { data: orders, list, refetch } = useListQuery({
    queryKey: ['grn-pending-pos'],
    queryFn: async () => {
      const res = await api.get<{ data: PurchaseOrderDto[] }>(
        '/goods-receipts/pending-purchase-orders'
      );
      return normalizeListData<PurchaseOrderDto>(res.data.data);
    },
  });

  const { data: receipts, list: receiptsList, refetch: refetchReceipts } = useListQuery({
    queryKey: ['grn-receipts-list'],
    queryFn: async () => {
      const res = await api.get<{ data: GrnListRow[] }>('/goods-receipts');
      return normalizeListData<GrnListRow>(res.data.data);
    },
  });

  const {
    data: grnDetail,
    isLoading: grnDetailLoading,
    isError: grnDetailError,
    refetch: refetchGrnDetail,
  } = useQuery({
    queryKey: ['grn-detail', selectedGrnId],
    queryFn: async () => {
      const res = await api.get<{ data: GrnListRow }>(`/goods-receipts/${selectedGrnId}`);
      return res.data.data;
    },
    enabled: !!selectedGrnId,
  });

  useEffect(() => {
    const grnFromUrl = searchParams.get('grn');
    if (grnFromUrl && /^[a-f\d]{24}$/i.test(grnFromUrl)) {
      setSelectedPo(null);
      setSelectedGrnId(grnFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!selectedGrnId) return;
    const next = new URLSearchParams(searchParams);
    if (next.get('grn') === selectedGrnId) return;
    next.set('grn', selectedGrnId);
    setSearchParams(next, { replace: true });
  }, [selectedGrnId, searchParams, setSearchParams]);

  const {
    data: grnContext,
    isLoading: grnLoading,
    isError: grnError,
    refetch: refetchGrnContext,
  } = useQuery({
    queryKey: ['po-grn-counter', selectedPo?.id],
    queryFn: async () => {
      const res = await api.get<{ data: ProjectGrnCounterDto }>(
        `/purchase-orders/${selectedPo!.id}/grn-counter`
      );
      return res.data.data;
    },
    enabled: !!selectedPo?.id,
  });

  const invoiceValue = useMemo(() => {
    return receiptLines.reduce((sum, row) => {
      const key = lineKey(row);
      const qty = Number(receivedByLine[key] || 0);
      const price = invoicePriceByLine[key] ?? row.poRate;
      return sum + qty * price;
    }, 0);
  }, [receiptLines, receivedByLine, invoicePriceByLine]);

  const requiresEway = invoiceValue > 50000;
  const ewayIncomplete = requiresEway && !ewayBillNumber.trim();
  const hasInvoiceUpload = hasAttachmentCategory(attachments, 'INVOICE');
  const hasChallanUpload = hasAttachmentCategory(attachments, 'CHALLAN');

  const isFullRemaining = useMemo(() => {
    if (!receiptLines.length) return false;
    return receiptLines.every((row) => {
      const received = Number(receivedByLine[lineKey(row)] || 0);
      return row.orderedQty - row.previouslyReceived - received <= 0.0001;
    });
  }, [receiptLines, receivedByLine]);

  useEffect(() => {
    const lines = grnContext?.lines?.length
      ? grnContext.lines
      : selectedPo?.lineItems?.length
        ? mapPoLinesToReceiptLines(selectedPo)
        : [];
    if (!lines.length) return;
    setReceiptLines(lines);
    const received: Record<string, number | ''> = {};
    const prices: Record<string, number> = {};
    lines.forEach((line) => {
      const key = lineKey(line);
      received[key] = '';
      prices[key] = line.poRate;
    });
    setReceivedByLine(received);
    setInvoicePriceByLine(prices);
    setReceiveType('PARTIAL');
  }, [grnContext, selectedPo]);

  useEffect(() => {
    if (!receiptLines.length) return;
    const next: ReceiveType = isFullRemaining ? 'FULL' : 'PARTIAL';
    setReceiveType((prev) => (prev === next ? prev : next));
  }, [isFullRemaining, receiptLines.length]);

  const resetForm = () => {
    setSelectedPo(null);
    setSelectedGrnId(null);
    setReceiptLines([]);
    setReceivedByLine({});
    setInvoicePriceByLine({});
    setReceiveType('PARTIAL');
    setInvoiceNo('');
    setChallanNo('');
    setEwayBillNumber('');
    setRemarks('');
    setAttachments([]);
  };

  const pickFiles = async (
    files: FileList | null,
    category: AttachmentCategory,
    input: HTMLInputElement | null
  ) => {
    if (!files?.length) return;
    try {
      const added = await Promise.all(
        Array.from(files).map(async (f) => ({
          name: f.name,
          fileType: f.type || 'application/octet-stream',
          category,
          dataBase64: await readFileAsBase64(f),
        }))
      );
      setAttachments((prev) => [...prev, ...added]);
    } catch {
      toast.error('Could not read one or more files');
    }
    if (input) input.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const validateSubmit = (saveDraft: boolean) => {
    if (saveDraft) return true;
    const totalReceivingNow = Object.values(receivedByLine).reduce<number>(
      (sum, value) => sum + Number(value || 0),
      0
    );
    if (totalReceivingNow <= 0) {
      toast.error('Enter the quantity received in this GRN');
      return false;
    }
    if (!hasInvoiceUpload || !hasChallanUpload) {
      toast.error('Invoice and Challan uploads are required');
      return false;
    }
    if (ewayIncomplete) {
      toast.message('GRN will be placed on hold until E-Way Bill is approved');
    }
    return true;
  };

  const receive = useMutation({
    mutationFn: async (saveDraft: boolean) => {
      if (!selectedPo) throw new Error('No PO');
      const items = receiptLines.map((line) => {
        const key = lineKey(line);
        const qty = Number(receivedByLine[key] || 0);
        const invoiceUnitPrice = invoicePriceByLine[key] ?? line.poRate;
        return {
          materialId: line.materialId!,
          quantityOrdered: line.orderedQty,
          quantityReceived: qty,
          invoiceUnitPrice,
          lineIndex: line.lineIndex,
          lineStatus:
            receiveType === 'FULL' || line.previouslyReceived + qty >= line.orderedQty
              ? 'RECEIVED'
              : ('PARTIAL' as const),
        };
      });
      const res = await api.post<{ data: GrnCreateResponse }>('/goods-receipts', {
        purchaseOrderId: selectedPo.id,
        receiveType,
        invoiceNo,
        invoiceDate: new Date(invoiceDate).toISOString(),
        invoiceValue,
        challanNo,
        ewayBillNumber,
        deliveryDate: new Date().toISOString(),
        remarks,
        attachments,
        saveDraft,
        items,
      });
      return { ...res.data.data, saveDraft };
    },
    onSuccess: (data) => {
      if (data.saveDraft) {
        toast.success('GRN draft saved');
      } else if (data.status === 'ON_HOLD') {
        toast.success(`${data.grnNumber} submitted — on hold pending Coordinator approval`);
      } else {
        toast.success('GRN approved — inventory updated');
      }
      resetForm();
      refetch();
      refetchReceipts();
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'GRN failed');
    },
  });

  const submitGrn = (saveDraft: boolean) => {
    if (!validateSubmit(saveDraft)) return;
    receive.mutate(saveDraft);
  };

  const openPo = (po: PurchaseOrderDto) => {
    setSelectedGrnId(null);
    setSelectedPo(po);
    setReceiveType('PARTIAL');
    setInvoiceNo('');
    setChallanNo('');
    setEwayBillNumber('');
    setRemarks('');
    setAttachments([]);
  };

  const openGrn = (grnId: string) => {
    setSelectedPo(null);
    setSelectedGrnId(grnId);
  };

  return (
    <div className="page-container max-w-full">
      <PageHeader
        title="Material receipt (GRN)"
        subtitle="One GRN per supplier invoice — variances go on hold for approval"
      />

      {selectedGrnId ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              setSelectedGrnId(null);
              const next = new URLSearchParams(searchParams);
              next.delete('grn');
              setSearchParams(next, { replace: true });
            }}
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-secondary hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to GRN list
          </button>

          {grnDetailLoading && <p className="text-sm text-ink-muted">Loading GRN…</p>}
          {grnDetailError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-2">
              <span>Could not load this GRN.</span>
              <Button type="button" variant="secondary" size="sm" onClick={() => refetchGrnDetail()}>
                Retry
              </Button>
            </div>
          )}

          {grnDetail && (
            <div className="panel overflow-hidden">
              <div className="h-1 bg-bekem-accent" />
              <div className="p-4 sm:p-3 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border pb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
                      Material receipt
                    </p>
                    <h2 className="text-lg font-semibold text-ink mt-0.5">{grnDetail.grnNumber}</h2>
                    <p className="text-sm text-ink-secondary mt-1">
                      {(grnDetail.orderName || grnDetail.poNumber || grnDetail.transferNumber || '—') +
                        ' · ' +
                        (grnDetail.vendorName || '—')}
                    </p>
                  </div>
                  <StatusBadge status={grnDetail.status} />
                </div>

                <DetailFieldGrid>
                  {(grnDetail.projectName || grnDetail.projectCode) && (
                    <DetailField label="Project">
                      {formatProjectLabel({
                        code: grnDetail.projectCode,
                        name: grnDetail.projectName,
                      })}
                    </DetailField>
                  )}
                  <DetailField label="Order (PO / BT)">
                    {grnDetail.orderName || grnDetail.poNumber || grnDetail.transferNumber || '—'}
                  </DetailField>
                  <DetailField label="Indent">{grnDetail.indentNumber || '—'}</DetailField>
                  <DetailField label="Received on">
                    {grnDetail.receivedAt ? formatDate(grnDetail.receivedAt) : '—'}
                  </DetailField>
                  <DetailField label="Received by">{grnDetail.receivedByName || '—'}</DetailField>
                  <DetailField label="Receive type">{grnDetail.receiveType || '—'}</DetailField>
                  <DetailField label="Invoice number">{grnDetail.invoiceNo || '—'}</DetailField>
                  <DetailField label="Invoice date">
                    {grnDetail.invoiceDate ? formatDate(grnDetail.invoiceDate) : '—'}
                  </DetailField>
                  <DetailField label="Invoice value">
                    {grnDetail.invoiceValue != null
                      ? formatCurrency(grnDetail.invoiceValue)
                      : '—'}
                  </DetailField>
                  <DetailField label="Challan number">{grnDetail.challanNo || '—'}</DetailField>
                  <DetailField label="E-Way bill">{grnDetail.ewayBillNumber || '—'}</DetailField>
                  <DetailField label="Vehicle">{grnDetail.vehicleNo || '—'}</DetailField>
                  <DetailField label="Driver">{grnDetail.driverName || '—'}</DetailField>
                  <DetailField label="Remarks" fullWidth>
                    {grnDetail.note || grnDetail.remarks || '—'}
                  </DetailField>
                </DetailFieldGrid>

                <div>
                  <p className="section-label mb-2">Items received</p>
                  <div className="table-shell">
                    <table className="data-table min-w-[40rem]">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th className="num">Ordered</th>
                          <th className="num">Received in this GRN</th>
                          <th>Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(grnDetail.items || []).map((item, index) => (
                          <tr key={`${item.materialName}-${index}`}>
                            <td className="cell-text">{item.materialName}</td>
                            <td className="num tabular-nums">
                              {formatQuantity(Number(item.quantityOrdered || 0))}
                            </td>
                            <td className="num tabular-nums font-semibold">
                              {formatQuantity(Number(item.quantity || 0))}
                            </td>
                            <td>{item.unit || '—'}</td>
                          </tr>
                        ))}
                        {!grnDetail.items?.length && (
                          <tr>
                            <td colSpan={4} className="text-ink-muted">
                              No line items recorded
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <p className="section-label mb-2">Documents shared</p>
                  {(grnDetail.attachments || []).length ? (
                    <ul className="space-y-2">
                      {grnDetail.attachments!.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-surface-border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink truncate">
                              {file.category}: {file.name}
                            </p>
                            <p className="text-[11px] text-ink-muted">{file.fileType}</p>
                          </div>
                          {file.url ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                void openStoredAttachment(
                                  file.url!,
                                  file.name,
                                  file.fileType
                                ).catch(() => toast.error('Could not open file'))
                              }
                            >
                              Open
                            </Button>
                          ) : (
                            <span className="text-[11px] text-ink-muted">
                              File name recorded only
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-muted">No documents attached to this GRN.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : !selectedPo ? (
        <div className="space-y-6">
        <div>
          <h2 className="section-label mb-3">Pending material receipts</h2>
        <ListQueryBoundary
          isLoading={list.isLoading}
          isError={list.isError}
          onRetry={list.onRetry}
          retrying={list.retrying}
          isEmpty={!orders?.length}
          empty={
            <EmptyState
              title="No approved POs ready for receipt"
              description="Approved purchase orders appear here for Material Received → Submit → auto GRN."
            />
          }
        >
          <div className="table-shell">
            <table className="data-table min-w-[72rem]">
              <thead>
                <tr>
                  <th>PO No</th>
                  <th>Reference</th>
                  <th>Vendor</th>
                  <th>Project</th>
                  <th className="num">Ordered</th>
                  <th className="num">Received</th>
                  <th className="num">Left</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {(orders ?? []).map((po) => {
                  const qty = formatQtySummary(
                    po.receiptSummary?.orderedQty,
                    po.receiptSummary?.receivedQty,
                    po.receiptSummary?.remainingQty
                  );
                  return (
                  <tr key={po.id} className="cursor-pointer" onClick={() => openPo(po)}>
                    <td className="cell-code whitespace-nowrap">PO #{po.displayPoNumber || '—'}</td>
                    <td className="cell-text whitespace-nowrap">{po.procurementRef || po.poNumber}</td>
                    <td className="cell-text">{po.vendor?.name || '—'}</td>
                    <td className="cell-text whitespace-nowrap">
                      {formatProjectLabel(po.purchaseRequest?.project)}
                    </td>
                    <td className="num tabular-nums whitespace-nowrap">{qty.ordered}</td>
                    <td className="num tabular-nums whitespace-nowrap">{qty.received}</td>
                    <td className="num tabular-nums whitespace-nowrap font-semibold">{qty.left}</td>
                    <td className="text-right">
                      <ChevronRight className="h-4 w-4 text-ink-muted inline-block" />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ListQueryBoundary>
          </div>

          <div>
            <h2 className="section-label mb-3">Material receipt listing</h2>
            <ListQueryBoundary
              isLoading={receiptsList.isLoading}
              isError={receiptsList.isError}
              onRetry={receiptsList.onRetry}
              retrying={receiptsList.retrying}
              isEmpty={!receipts?.length}
              empty={
                <EmptyState
                  title="No GRNs yet"
                  description="Submitted material receipts appear here with Indent, PO and Vendor traceability."
                />
              }
            >
              <div className="table-shell">
                <table className="data-table min-w-[80rem]">
                  <thead>
                    <tr>
                      <th>GRN Number</th>
                      <th>Order (PO / BT)</th>
                      <th>Indent Number</th>
                      <th>Project</th>
                      <th>Vendor / Source</th>
                      <th>Invoice</th>
                      <th>Material Receipt Date</th>
                      <th className="num">Ordered</th>
                      <th className="num">This GRN</th>
                      <th className="num">Received</th>
                      <th className="num">Left</th>
                      <th>Status</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {(receipts ?? []).map((g) => {
                      const qty = formatQtySummary(
                        g.quantityOrdered,
                        g.quantityReceived,
                        g.quantityRemaining
                      );
                      return (
                      <tr
                        key={g.id}
                        className="cursor-pointer"
                        onClick={() => openGrn(g.id)}
                      >
                        <td className="cell-code whitespace-nowrap">{g.grnNumber}</td>
                        <td className="cell-code whitespace-nowrap">
                          {g.orderName || g.poNumber || g.transferNumber || '—'}
                        </td>
                        <td className="cell-code whitespace-nowrap">{g.indentNumber || '—'}</td>
                        <td className="cell-text whitespace-nowrap">
                          {formatProjectLabel({ code: g.projectCode, name: g.projectName })}
                        </td>
                        <td className="cell-text">{g.vendorName || '—'}</td>
                        <td className="cell-code whitespace-nowrap">{g.invoiceNo || '—'}</td>
                        <td className="whitespace-nowrap">
                          {g.receivedAt ? formatDate(g.receivedAt) : '—'}
                        </td>
                        <td className="num tabular-nums whitespace-nowrap">{qty.ordered}</td>
                        <td className="num tabular-nums whitespace-nowrap">
                          {formatQuantity(Number(g.quantityReceivedThisGrn || 0))}
                        </td>
                        <td className="num tabular-nums whitespace-nowrap">{qty.received}</td>
                        <td className="num tabular-nums whitespace-nowrap font-semibold">{qty.left}</td>
                        <td>
                          <StatusBadge status={g.status} />
                        </td>
                        <td className="text-right">
                          <ChevronRight className="h-4 w-4 text-ink-muted inline-block" />
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ListQueryBoundary>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-secondary hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to PO list
          </button>

          <div className="panel overflow-hidden">
            <div className="h-1 bg-bekem-accent" />
            <div className="p-4 sm:p-3 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border pb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
                    GRN — PO #{selectedPo.displayPoNumber || '—'}
                  </p>
                  {receiptLines.some((l) => l.previouslyReceived > 0) && (
                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
                      Partial PO — enter only this delivery&apos;s qty/rates. Variances over tolerance go on hold.
                    </p>
                  )}
                  <p className="text-sm text-ink-muted font-mono mt-0.5">
                    {selectedPo.procurementRef || selectedPo.poNumber}
                  </p>
                  <p className="text-sm text-ink-secondary mt-1">
                    {formatProjectLabel(selectedPo.purchaseRequest?.project)} · {selectedPo.vendor?.name}
                  </p>
                </div>
                {grnContext?.grnNumber && (
                  <p className="text-sm font-bold text-ink bg-surface-muted px-3 py-1.5 rounded-lg">
                    Next: {grnContext.grnNumber}
                  </p>
                )}
              </div>

              {grnLoading && (
                <p className="text-sm text-ink-muted">Loading PO line items…</p>
              )}
              {grnError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-2">
                  <span>Could not load GRN balances — showing PO lines. Previously received qty may be incomplete.</span>
                  <Button type="button" variant="secondary" size="sm" onClick={() => refetchGrnContext()}>
                    Retry
                  </Button>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-surface-border">
                <table className="data-table min-w-[860px]">
                  <thead>
                    <tr>
                      <th className="text-left">Item</th>
                      <th className="text-right w-20">Ordered</th>
                      <th className="text-right w-28">Already received</th>
                      <th className="text-right w-28">Receive now</th>
                      <th className="text-right w-24">Balance after</th>
                      <th className="text-center w-14">Unit</th>
                      <th className="text-right w-28">PO rate</th>
                      <th className="text-right w-32">Invoice rate</th>
                      <th className="text-right w-28">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!receiptLines.length && !grnLoading ? (
                      <tr>
                        <td colSpan={9} className="text-center text-sm text-ink-muted py-6">
                          No line items on this PO.
                        </td>
                      </tr>
                    ) : null}
                    {receiptLines.map((row) => {
                      const key = lineKey(row);
                      const receivedValue = receivedByLine[key] ?? '';
                      const received = Number(receivedValue || 0);
                      const invoicePrice = invoicePriceByLine[key] ?? row.poRate;
                      const balance = Math.max(0, row.orderedQty - row.previouslyReceived - received);
                      const lineTotal = received * invoicePrice;
                      const qtyOver = received > row.remainingQty + 0.0001;
                      const rateClass = invoiceRateClass(invoicePrice, row.poRate);

                      return (
                        <tr key={key}>
                          <td>
                            <p className="font-medium text-ink">{row.description}</p>
                          </td>
                          <td className="text-right tabular-nums font-medium">{row.orderedQty}</td>
                          <td className="text-right tabular-nums font-medium text-ink-secondary">
                            {row.previouslyReceived}
                          </td>
                          <td className="text-right">
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              value={receivedValue}
                              placeholder="Enter qty"
                              onChange={(e) => {
                                const raw = e.target.value;
                                const v = raw === '' ? '' : Math.max(0, Number(raw));
                                setReceivedByLine((prev) => ({ ...prev, [key]: v }));
                              }}
                              className={cn(
                                'h-9 text-right tabular-nums w-24 ml-auto',
                                qtyOver && 'border-amber-400 text-amber-800'
                              )}
                            />
                          </td>
                          <td className="text-right tabular-nums font-semibold text-ink-muted">
                            {balance}
                          </td>
                          <td className="text-center text-ink-secondary">{row.unit || '—'}</td>
                          <td className="text-right tabular-nums">{formatCurrency(row.poRate)}</td>
                          <td className="text-right">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={invoicePrice}
                              onChange={(e) =>
                                setInvoicePriceByLine((prev) => ({
                                  ...prev,
                                  [key]: Number(e.target.value),
                                }))
                              }
                              className={cn(
                                'h-9 text-right tabular-nums w-32 ml-auto',
                                rateClass
                              )}
                            />
                          </td>
                          <td className="text-right tabular-nums font-semibold">
                            {formatCurrency(lineTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-muted/40">
                      <td colSpan={8} className="text-right font-semibold text-ink-secondary">
                        Invoice value
                      </td>
                      <td className="text-right font-bold tabular-nums">{formatCurrency(invoiceValue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="text-[11px] text-ink-muted">
                Invoice rate: green = below PO rate, red = above PO rate. Qty/price variance puts GRN on hold.
              </p>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <div>
                  <label className="text-xs font-semibold text-ink-muted">Invoice no.</label>
                  <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="mt-1 h-9" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink-muted">
                    Invoice date <span className="text-danger">*</span>
                  </label>
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="mt-1 h-9"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink-muted">Challan no.</label>
                  <Input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} className="mt-1 h-9" />
                </div>
                {requiresEway && (
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-red-700">E-Way Bill no. *</label>
                    <Input
                      value={ewayBillNumber}
                      onChange={(e) => setEwayBillNumber(e.target.value)}
                      className={cn('mt-1 h-9', !ewayBillNumber.trim() && 'border-red-300')}
                    />
                  </div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-ink-muted">Remarks</label>
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="mt-1 w-full min-h-[64px] rounded-xl border border-border px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-ink-muted">Uploads</p>
                  <input ref={invoiceRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => void pickFiles(e.target.files, 'INVOICE', invoiceRef.current)} />
                  <input ref={challanRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => void pickFiles(e.target.files, 'CHALLAN', challanRef.current)} />
                  <input ref={photosRef} type="file" className="hidden" accept="image/*" multiple onChange={(e) => void pickFiles(e.target.files, 'PHOTO', photosRef.current)} />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => invoiceRef.current?.click()}
                      className={cn(!hasInvoiceUpload && 'border-amber-300')}
                    >
                      <Upload className="h-3.5 w-3.5 mr-1" /> Invoice *
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => challanRef.current?.click()}
                      className={cn(!hasChallanUpload && 'border-amber-300')}
                    >
                      <FileText className="h-3.5 w-3.5 mr-1" /> Challan *
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => photosRef.current?.click()}>
                      <ImageIcon className="h-3.5 w-3.5 mr-1" /> Photos
                    </Button>
                  </div>
                  {attachments.length > 0 && (
                    <ul className="text-[11px] text-ink-secondary space-y-1">
                      {attachments.map((a, i) => (
                        <li key={`${a.name}-${i}`} className="flex justify-between gap-2">
                          <span>
                            {a.category}: {a.name}
                          </span>
                          <button type="button" className="text-danger" onClick={() => removeAttachment(i)}>
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-surface-border">
                <fieldset className="flex flex-wrap gap-3">
                  {(
                    [
                      { value: 'PARTIAL', label: 'Partial' },
                      { value: 'FULL', label: 'Full (remaining)' },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        'flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium',
                        receiveType === opt.value
                          ? 'border-bekem-accent bg-bekem-accent/5 text-bekem-accent'
                          : 'border-surface-border text-ink-secondary'
                      )}
                    >
                      <input
                        type="radio"
                        name="receiveType"
                        value={opt.value}
                        checked={receiveType === opt.value}
                        onChange={() => {
                          setReceiveType(opt.value);
                          if (opt.value === 'FULL') {
                            setReceivedByLine((prev) => {
                              const next = { ...prev };
                              receiptLines.forEach((line) => {
                                next[lineKey(line)] = line.remainingQty;
                              });
                              return next;
                            });
                          }
                        }}
                        className="accent-bekem-accent"
                      />
                      {opt.label}
                    </label>
                  ))}
                </fieldset>
                <div className="flex gap-2">
                  <Button variant="secondary" disabled={receive.isPending} onClick={() => submitGrn(true)}>
                    Save draft
                  </Button>
                  <Button
                    variant="accent"
                    accentColor={accent}
                    disabled={receive.isPending}
                    onClick={() => submitGrn(false)}
                  >
                    {receive.isPending ? 'Submitting…' : 'Submit GRN'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
