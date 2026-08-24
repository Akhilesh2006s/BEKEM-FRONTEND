import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDate, UserRole } from '@afios/shared';
import { EmptyState } from '@/components/EmptyState';
import { CrossProjectStockPanel } from '@/components/CrossProjectStockPanel';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SearchSelect } from '@/components/SearchSelect';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

interface InventoryRow {
  id: string;
  poSlNo?: number;
  project: string;
  indentNo: string;
  supplier: string;
  poNo: string;
  poDate: string | null;
  itemCode: string;
  itemDescription: string;
  qty: number;
  units: string;
  poQty: string;
  unitRate: number;
  basicTotal: number;
  gst: number;
  netTotal: number;
  deliveryDate: string | null;
  expectedDeliveryDate?: string | null;
  isDeliveryLate?: boolean;
  delayReason?: string;
  delayReasonUpdatedAt?: string | null;
  delayReasonBy?: { id: string; name: string };
  advancePaid?: number;
  invoiceNumber?: string;
  invoiceDate?: string | null;
  qtyReceived?: number;
  qtyBalance?: number;
  qtyAvailable?: string;
  invoiceAmount?: number;
  deliveryLocation?: string;
  transport?: string;
  materialReceived?: string;
  invoiceEntry?: string;
  purpose?: string;
  financialYear: string;
}

type EditForm = {
  poSlNo: string;
  project: string;
  indentNo: string;
  supplier: string;
  poNo: string;
  poDate: string;
  itemCode: string;
  itemDescription: string;
  qty: string;
  units: string;
  poQty: string;
  unitRate: string;
  basicTotal: string;
  gst: string;
  netTotal: string;
  deliveryDate: string;
  expectedDeliveryDate: string;
  delayReason: string;
  advancePaid: string;
  invoiceNumber: string;
  invoiceDate: string;
  qtyReceived: string;
  qtyBalance: string;
  qtyAvailable: string;
  invoiceAmount: string;
  deliveryLocation: string;
  transport: string;
  materialReceived: string;
  invoiceEntry: string;
  purpose: string;
};

/** Fields through Delivery Date — Store Incharge can see/edit only these. */
const FIELDS_THROUGH_DELIVERY: Array<[keyof EditForm, string, string?]> = [
  ['poSlNo', 'PO S.No'],
  ['project', 'Project'],
  ['indentNo', 'Indent No'],
  ['supplier', 'Supplier'],
  ['poNo', 'PO No'],
  ['poDate', 'PO Date', 'date'],
  ['itemCode', 'Item Code'],
  ['itemDescription', 'Item Description'],
  ['qty', 'Qty'],
  ['units', 'Units'],
  ['poQty', 'PO Qty'],
  ['unitRate', 'Unit Rate'],
  ['basicTotal', 'Basic Total'],
  ['gst', 'GST'],
  ['netTotal', 'Net Total'],
  ['expectedDeliveryDate', 'Expected Delivery', 'date'],
  ['deliveryDate', 'Delivery Date', 'date'],
  ['delayReason', 'Delay reason'],
];

/** Fields after Delivery Date — Coordinator / Chairman only. */
const FIELDS_AFTER_DELIVERY: Array<[keyof EditForm, string, string?]> = [
  ['advancePaid', 'Advance Paid'],
  ['invoiceNumber', 'Invoice No'],
  ['invoiceDate', 'Invoice Date', 'date'],
  ['qtyReceived', 'Qty Received'],
  ['qtyBalance', 'Qty Balance'],
  ['qtyAvailable', 'Qty Available'],
  ['invoiceAmount', 'Invoice Amount'],
  ['deliveryLocation', 'Location'],
  ['transport', 'Transport'],
  ['materialReceived', 'Material Received'],
  ['invoiceEntry', 'Invoice Entry'],
  ['purpose', 'Purpose'],
];

function hasFullInventoryAccess(role?: string | null) {
  return (
    role === UserRole.COORDINATOR ||
    role === UserRole.CHAIRMAN ||
    role === UserRole.EXECUTIVE
  );
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return formatDate(iso);
  } catch {
    return '—';
  }
}

function fmtNum(n: number | null | undefined) {
  if (n == null || n === 0) return '—';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function toDateInput(iso: string | null | undefined) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function rowToForm(r: InventoryRow): EditForm {
  return {
    poSlNo: r.poSlNo != null ? String(r.poSlNo) : '',
    project: r.project || '',
    indentNo: r.indentNo || '',
    supplier: r.supplier || '',
    poNo: r.poNo || '',
    poDate: toDateInput(r.poDate),
    itemCode: r.itemCode || '',
    itemDescription: r.itemDescription || '',
    qty: r.qty != null ? String(r.qty) : '',
    units: r.units || '',
    poQty: r.poQty || '',
    unitRate: r.unitRate != null ? String(r.unitRate) : '',
    basicTotal: r.basicTotal != null ? String(r.basicTotal) : '',
    gst: r.gst != null ? String(r.gst) : '',
    netTotal: r.netTotal != null ? String(r.netTotal) : '',
    deliveryDate: toDateInput(r.deliveryDate),
    expectedDeliveryDate: toDateInput(r.expectedDeliveryDate ?? null),
    delayReason: r.delayReason || '',
    advancePaid: r.advancePaid != null ? String(r.advancePaid) : '',
    invoiceNumber: r.invoiceNumber || '',
    invoiceDate: toDateInput(r.invoiceDate),
    qtyReceived: r.qtyReceived != null ? String(r.qtyReceived) : '',
    qtyBalance: r.qtyBalance != null ? String(r.qtyBalance) : '',
    qtyAvailable: r.qtyAvailable || '',
    invoiceAmount: r.invoiceAmount != null ? String(r.invoiceAmount) : '',
    deliveryLocation: r.deliveryLocation || '',
    transport: r.transport || '',
    materialReceived: r.materialReceived || '',
    invoiceEntry: r.invoiceEntry || '',
    purpose: r.purpose || '',
  };
}

function numOrZero(v: string) {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function StockPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const fullAccess = hasFullInventoryAccess(role);
  const isStore = role === UserRole.STORE_INCHARGE;
  const isPm = role === UserRole.PROJECT_MANAGER;
  const isEnterprise = fullAccess;
  const showProjectFilter = isPm || isEnterprise;
  const canEditRows =
    role === UserRole.STORE_INCHARGE ||
    role === UserRole.COORDINATOR ||
    role === UserRole.CHAIRMAN ||
    role === UserRole.EXECUTIVE;
  const [search, setSearch] = useState('');
  const [project, setProject] = useState('');
  const [materialCompare, setMaterialCompare] = useState('Panel Board');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<InventoryRow | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const limit = 50;

  const editFields = (
    fullAccess ? [...FIELDS_THROUGH_DELIVERY, ...FIELDS_AFTER_DELIVERY] : FIELDS_THROUGH_DELIVERY
  ).filter(([key]) => !(isStore && key === 'project'));

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['stock-inventory', page, search, project],
    queryFn: async () => {
      const res = await api.get<{
        data: InventoryRow[];
        meta: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
          financialYear: string;
          projects: string[];
          importedAt?: string | null;
          ledgerType?: string;
          fieldAccess?: string;
          inventoryScope?: 'all' | 'single' | 'assigned' | 'none';
          assignedProjectName?: string | null;
          assignedProjects?: Array<{ id: string; name: string; code: string }>;
        };
      }>('/stock/inventory', {
        params: {
          page,
          limit,
          search: search || undefined,
          project: showProjectFilter && project ? project : undefined,
          financialYear: '25-26',
        },
      });
      return res.data;
    },
  });

  const {
    data: liveBalanceRows,
    isLoading: liveLoading,
    isError: liveError,
    refetch: refetchLive,
    isFetching: liveFetching,
  } = useQuery({
    queryKey: ['stock-balance-live'],
    enabled: isStore,
    queryFn: async () => {
      const res = await api.get<{
        data: Array<{
          id: string;
          itemCode: string;
          itemDescription: string;
          unit: string;
          openingBalance?: number;
          totalReceived: number;
          totalIssued: number;
          currentBalance: number;
        }>;
      }>('/stock/balance');
      return res.data.data ?? [];
    },
  });

  const { data: crossProjectRows } = useQuery({
    queryKey: ['pm-cross-stock', materialCompare],
    enabled: isPm && materialCompare.trim().length >= 2,
    queryFn: async () => {
      const res = await api.get<{
        data: Array<{
          materialId: string;
          materialName?: string;
          projects: Array<{
            projectId: string;
            projectCode: string;
            projectName: string;
            availableQty: number;
            sites?: Array<{
              siteId: string;
              siteName: string;
              availableQty: number;
            }>;
          }>;
        }>;
      }>('/stock/cross-project', { params: { search: materialCompare } });
      return res.data.data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!editing || !form) throw new Error('No row selected');
      const payload: Record<string, unknown> = {
        poSlNo: form.poSlNo === '' ? undefined : numOrZero(form.poSlNo),
        project: form.project,
        indentNo: form.indentNo,
        supplier: form.supplier,
        poNo: form.poNo,
        poDate: form.poDate || null,
        itemCode: form.itemCode,
        itemDescription: form.itemDescription,
        qty: numOrZero(form.qty),
        units: form.units,
        poQty: form.poQty,
        unitRate: numOrZero(form.unitRate),
        basicTotal: numOrZero(form.basicTotal),
        gst: numOrZero(form.gst),
        netTotal: numOrZero(form.netTotal),
        deliveryDate: form.deliveryDate || null,
        expectedDeliveryDate: form.expectedDeliveryDate || null,
        delayReason: form.delayReason,
      };
      if (fullAccess) {
        payload.advancePaid = numOrZero(form.advancePaid);
        payload.invoiceNumber = form.invoiceNumber;
        payload.invoiceDate = form.invoiceDate || null;
        payload.qtyReceived = numOrZero(form.qtyReceived);
        payload.qtyBalance = numOrZero(form.qtyBalance);
        payload.qtyAvailable = form.qtyAvailable;
        payload.invoiceAmount = numOrZero(form.invoiceAmount);
        payload.deliveryLocation = form.deliveryLocation;
        payload.transport = form.transport;
        payload.materialReceived = form.materialReceived;
        payload.invoiceEntry = form.invoiceEntry;
        payload.purpose = form.purpose;
      }
      await api.patch(`/stock/inventory/${editing.id}`, payload);
    },
    onSuccess: () => {
      toast.success('Record updated');
      setEditing(null);
      setForm(null);
      queryClient.invalidateQueries({ queryKey: ['stock-inventory'] });
    },
    onError: () => toast.error('Could not save record'),
  });

  const openEdit = (r: InventoryRow) => {
    setEditing(r);
    setForm(rowToForm(r));
  };

  const setField = (key: keyof EditForm, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const liveRows = (liveBalanceRows ?? []).filter((row) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [row.itemCode, row.itemDescription, row.unit].filter(Boolean).join(' ').toLowerCase().includes(q);
  });
  const projectFilterOptions =
    isPm && meta?.assignedProjects?.length
      ? meta.assignedProjects.map((p) => ({ id: p.name, label: p.name }))
      : (meta?.projects ?? []).map((p) => ({ id: p, label: p }));
  const pageTitle = isEnterprise
    ? 'Enterprise Stock Inventory'
    : 'Stock Inventory';
  const projectSubtitle = isStore
    ? meta?.assignedProjectName
      ? `Project: ${meta.assignedProjectName}`
      : 'Project: —'
    : isPm
      ? 'Filter by your assigned projects'
      : null;

  if (isStore) {
    return (
      <div className="px-4 pt-4 pb-6 max-w-[1200px] mx-auto">
        <header className="flex flex-col gap-2.5 mb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-gray-100"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="font-semibold text-gray-900">Live stock balance</h1>
              <p className="text-xs text-gray-500">
                {projectSubtitle && <span className="block font-medium text-gray-700">{projectSubtitle}</span>}
                Live balance from GRN receipts and Issue to site transactions
              </p>
            </div>
          </div>
          <input
            type="search"
            placeholder="Search item code, description, unit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl border border-border px-3 py-2 text-sm flex-1 min-w-[200px]"
          />
        </header>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 mb-3">
          <p className="font-semibold">Live stock ledger</p>
          <p className="text-xs mt-0.5">
            This balance updates from GRN receipt dates and Issue to site transactions automatically.
          </p>
        </div>

        <ListQueryBoundary
          isLoading={liveLoading}
          isError={liveError}
          onRetry={() => refetchLive()}
          retrying={liveFetching && !liveLoading}
          isEmpty={!liveRows.length}
          empty={<EmptyState title="No live stock found" description="GRN receipts will appear here automatically." />}
        >
          <div className="table-shell">
            <table className="data-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Item code</th>
                  <th>Description</th>
                  <th>Unit</th>
                  <th className="num">Opening</th>
                  <th className="num">Received</th>
                  <th className="num">Issued</th>
                  <th className="num">Current balance</th>
                </tr>
              </thead>
              <tbody>
                {liveRows.map((row) => {
                  const opening =
                    row.openingBalance ??
                    Math.round(
                      (Number(row.currentBalance || 0) -
                        Number(row.totalReceived || 0) +
                        Number(row.totalIssued || 0)) *
                        1000
                    ) / 1000;
                  return (
                  <tr key={row.id}>
                    <td className="cell-code whitespace-nowrap">{row.itemCode || '—'}</td>
                    <td className="cell-text">{row.itemDescription || '—'}</td>
                    <td className="whitespace-nowrap">{row.unit || '—'}</td>
                    <td className="num tabular-nums">{fmtNum(opening) || '—'}</td>
                    <td className="num tabular-nums">{fmtNum(row.totalReceived) || '—'}</td>
                    <td className="num tabular-nums">{fmtNum(row.totalIssued) || '—'}</td>
                    <td className="num tabular-nums font-semibold">{fmtNum(row.currentBalance) || '—'}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ListQueryBoundary>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-6 max-w-[1600px] mx-auto">
      <header className="flex flex-col gap-2.5 mb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-gray-100"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-semibold text-gray-900">{pageTitle}</h1>
            <p className="text-xs text-gray-500">
              {projectSubtitle && <span className="block font-medium text-gray-700">{projectSubtitle}</span>}
              BEKEM INFRA PROJECTS — FY {meta?.financialYear || '2025-26'}
              {meta?.total != null && ` · ${meta.total.toLocaleString()} line items`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            placeholder="Search PO, supplier, item…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-border px-3 py-2 text-sm flex-1 min-w-[200px]"
          />
          {showProjectFilter && (
            <SearchSelect
              value={project || null}
              onChange={(id) => {
                setProject(id);
                setPage(1);
              }}
              options={projectFilterOptions}
              placeholder={isEnterprise ? 'Search all projects…' : 'Search assigned projects…'}
              emptyMessage="No projects in index"
            />
          )}
        </div>
        {isPm && (
          <div className="rounded-xl border border-surface-border bg-white p-4 space-y-3">
            <p className="text-sm font-semibold text-ink">Live stock across your projects</p>
            <p className="text-xs text-ink-secondary">
              Compare on-hand quantity before requesting a branch transfer or forwarding to Head Office.
            </p>
            <input
              type="search"
              value={materialCompare}
              onChange={(e) => setMaterialCompare(e.target.value)}
              placeholder="Search material e.g. Panel Board"
              className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            />
            <CrossProjectStockPanel rows={crossProjectRows ?? []} />
          </div>
        )}
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          <p className="font-semibold">FY PO index — {isPm ? 'read-only' : 'editable'}</p>
          <p className="mt-1 text-sky-900/90">
            {fullAccess ? (
              <>
                Full field access. Late deliveries (after expected date) show in{' '}
                <span className="text-red-600 font-semibold">red</span> with the Store Incharge’s
                delay reason.
              </>
            ) : (
              <>
                Columns through delivery date. If delivery is late, the row is{' '}
                <span className="text-red-600 font-semibold">red</span> — enter a{' '}
                <strong>delay reason</strong> (visible to Coordinator and Chairman).
              </>
            )}{' '}
            New POs use format{' '}
            <span className="font-mono text-xs">BEKEM-CHITR/SRE/0004-1/25-26</span>.
            {meta?.importedAt && (
              <>
                {' '}
                Imported{' '}
                {new Date(meta.importedAt).toLocaleString('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
                .
              </>
            )}
          </p>
        </div>
      </header>

      <ListQueryBoundary
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        retrying={isFetching && !isLoading}
        isEmpty={!rows.length}
        skeletonRows={6}
        empty={
          <EmptyState
            title="No inventory data"
            description="Run: npm run import:po-index --workspace=apps/api — with your PO INDEX Excel file."
          />
        }
      >
        <>
          <div className="table-shell">
            <table
              className={cn(
                'data-table text-left',
                fullAccess ? 'min-w-[2100px]' : 'min-w-[1400px]'
              )}
            >
              <thead>
                <tr>
                  {canEditRows && (
                    <th className="sticky left-0 bg-slate-100 z-20">Edit</th>
                  )}
                  <th>PO S.No</th>
                  <th>Project</th>
                  <th>Indent No</th>
                  <th>Supplier</th>
                  <th className="min-w-[200px]">PO No</th>
                  <th>PO Date</th>
                  <th>Item Code</th>
                  <th className="min-w-[180px]">Item Description</th>
                  <th className="num">Qty</th>
                  <th>Units</th>
                  <th>PO Qty</th>
                  <th className="num">Unit Rate</th>
                  <th className="num">Basic Total</th>
                  <th className="num">GST</th>
                  <th className="num">Net Total</th>
                  <th>Expected Delivery</th>
                  <th>Delivery Date</th>
                  <th className="min-w-[140px]">Delay Reason</th>
                  {fullAccess && (
                    <>
                      <th className="num">Advance</th>
                      <th>Invoice No</th>
                      <th>Invoice Date</th>
                      <th className="num">Received</th>
                      <th className="num">Balance</th>
                      <th>Available</th>
                      <th className="num">Invoice Amt</th>
                      <th>Location</th>
                      <th>Transport</th>
                      <th>Mtrl Rcvd</th>
                      <th>Invoice Entry</th>
                      <th>Purpose</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(
                      r.isDeliveryLate
                        ? 'bg-red-50 text-red-900 hover:bg-red-100/80'
                        : 'hover:bg-slate-50/80'
                    )}
                  >
                    {canEditRows && (
                      <td
                        className={cn(
                          'px-2 py-1.5 border-r border-slate-100 sticky left-0 z-10',
                          r.isDeliveryLate ? 'bg-red-50' : 'bg-white'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-bekem-navy hover:bg-slate-50"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      </td>
                    )}
                    <td className="px-2 py-1.5 border-r border-slate-100">{r.poSlNo ?? '—'}</td>
                    <td className="px-2 py-1.5 border-r border-slate-100 font-medium">{r.project}</td>
                    <td className="px-2 py-1.5 border-r border-slate-100">{r.indentNo || '—'}</td>
                    <td className="px-2 py-1.5 border-r border-slate-100">{r.supplier}</td>
                    <td className="px-2 py-1.5 border-r border-slate-100 text-[10px]">
                      {r.poNo}
                    </td>
                    <td className="px-2 py-1.5 border-r border-slate-100 whitespace-nowrap">
                      {fmtDate(r.poDate)}
                    </td>
                    <td className="px-2 py-1.5 border-r border-slate-100">{r.itemCode}</td>
                    <td className="px-2 py-1.5 border-r border-slate-100">{r.itemDescription}</td>
                    <td className="px-2 py-1.5 border-r border-slate-100 text-right">{r.qty || '—'}</td>
                    <td className="px-2 py-1.5 border-r border-slate-100">{r.units}</td>
                    <td className="px-2 py-1.5 border-r border-slate-100">{r.poQty}</td>
                    <td className="px-2 py-1.5 border-r border-slate-100 text-right">
                      {fmtNum(r.unitRate)}
                    </td>
                    <td className="px-2 py-1.5 border-r border-slate-100 text-right">
                      {fmtNum(r.basicTotal)}
                    </td>
                    <td className="px-2 py-1.5 border-r border-slate-100 text-right">{fmtNum(r.gst)}</td>
                    <td className="px-2 py-1.5 border-r border-slate-100 text-right font-medium">
                      {fmtNum(r.netTotal)}
                    </td>
                    <td
                      className={cn(
                        'px-2 py-1.5 border-r border-slate-100 whitespace-nowrap font-medium',
                        r.isDeliveryLate && 'text-red-700'
                      )}
                    >
                      {fmtDate(r.expectedDeliveryDate ?? null)}
                    </td>
                    <td
                      className={cn(
                        'px-2 py-1.5 border-r border-slate-100 whitespace-nowrap font-medium',
                        r.isDeliveryLate && 'text-red-700'
                      )}
                    >
                      {fmtDate(r.deliveryDate)}
                      {r.isDeliveryLate && (
                        <span className="ml-1 text-[10px] font-bold uppercase">Late</span>
                      )}
                    </td>
                    <td
                      className={cn(
                        'px-2 py-1.5 min-w-[140px]',
                        fullAccess && 'border-r border-slate-100',
                        r.isDeliveryLate && 'text-red-800'
                      )}
                    >
                      {r.delayReason ? (
                        <span title={r.delayReasonBy?.name ? `By ${r.delayReasonBy.name}` : undefined}>
                          {r.delayReason}
                        </span>
                      ) : r.isDeliveryLate ? (
                        <span className="text-red-600/80 italic">Reason needed</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    {fullAccess && (
                      <>
                        <td className="px-2 py-1.5 border-r border-slate-100 text-right">
                          {fmtNum(r.advancePaid)}
                        </td>
                        <td className="px-2 py-1.5 border-r border-slate-100">
                          {r.invoiceNumber || '—'}
                        </td>
                        <td className="px-2 py-1.5 border-r border-slate-100 whitespace-nowrap">
                          {fmtDate(r.invoiceDate)}
                        </td>
                        <td className="px-2 py-1.5 border-r border-slate-100 text-right">
                          {r.qtyReceived ?? '—'}
                        </td>
                        <td className="px-2 py-1.5 border-r border-slate-100 text-right">
                          {r.qtyBalance ?? '—'}
                        </td>
                        <td className="px-2 py-1.5 border-r border-slate-100">
                          {r.qtyAvailable || '—'}
                        </td>
                        <td className="px-2 py-1.5 border-r border-slate-100 text-right">
                          {fmtNum(r.invoiceAmount)}
                        </td>
                        <td className="px-2 py-1.5 border-r border-slate-100">
                          {r.deliveryLocation}
                        </td>
                        <td className="px-2 py-1.5 border-r border-slate-100">{r.transport}</td>
                        <td className="px-2 py-1.5 border-r border-slate-100">
                          <span
                            className={cn(
                              r.materialReceived === 'Yes' && 'text-emerald-700 font-medium',
                              r.materialReceived === 'No' && 'text-red-600'
                            )}
                          >
                            {r.materialReceived || '—'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 border-r border-slate-100">
                          {r.invoiceEntry || '—'}
                        </td>
                        <td className="px-2 py-1.5">{r.purpose}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <p className="text-ink-muted">
                Page {meta.page} of {meta.totalPages} ({meta.total.toLocaleString()} rows)
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      </ListQueryBoundary>

      {editing && form && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-border px-3 py-2.5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-ink">Edit inventory record</h2>
                <p className="text-xs text-ink-muted font-mono mt-0.5">{editing.poNo || editing.id}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setForm(null);
                }}
                className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-3 grid gap-3 sm:grid-cols-2">
              {editFields.map(([key, label, type]) => (
                <label
                  key={key}
                  className={cn(
                    'block text-sm',
                    key === 'itemDescription' ||
                      key === 'purpose' ||
                      key === 'delayReason'
                      ? 'sm:col-span-2'
                      : ''
                  )}
                >
                  <span className="text-xs font-medium text-ink-secondary">{label}</span>
                  {key === 'delayReason' ? (
                    <textarea
                      value={form[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      rows={3}
                      placeholder={
                        editing.isDeliveryLate
                          ? 'Explain why delivery exceeded the expected date…'
                          : 'Optional — required when delivery is late'
                      }
                      className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
                    />
                  ) : (
                    <Input
                      type={type === 'date' ? 'date' : 'text'}
                      value={form[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      className="mt-1"
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="sticky bottom-0 bg-white border-t border-border px-3 py-2.5 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(null);
                  setForm(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
