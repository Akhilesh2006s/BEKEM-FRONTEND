import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { UserRole, formatCurrency, formatDate } from '@afios/shared';
import { api } from '@/lib/api';
import { ReportPageShell } from '@/components/reports/ReportPageShell';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { exportCsv } from '@/lib/exportCsv';
import { getReportById, reportsHubPath } from '@/lib/reportCatalog';
import { useAuthStore } from '@/stores/authStore';

type Column = {
  key: string;
  label: string;
  format?: 'date' | 'currency' | 'bool' | 'status';
};

const REPORT_CONFIG: Record<
  string,
  { api: string; title: string; subtitle: string; columns: Column[]; filename: string }
> = {
  'indent-aging': {
    api: '/reports/indent-aging',
    title: 'Indent status & aging',
    subtitle: 'Where each indent is stuck and for how many days',
    filename: 'indent-aging',
    columns: [
      { key: 'indentNumber', label: 'Indent' },
      { key: 'projectCode', label: 'Project' },
      { key: 'siteName', label: 'Site' },
      { key: 'raisedBy', label: 'Raised by' },
      { key: 'status', label: 'Status', format: 'status' },
      { key: 'daysOpen', label: 'Days open' },
      { key: 'daysInStatus', label: 'Days in status' },
      { key: 'updatedAt', label: 'Last update', format: 'date' },
    ],
  },
  'open-po': {
    api: '/reports/open-po',
    title: 'Open / delayed purchase orders',
    subtitle: 'Approved POs still pending material receipt',
    filename: 'open-po',
    columns: [
      { key: 'poNumber', label: 'PO' },
      { key: 'vendorName', label: 'Vendor' },
      { key: 'projectCode', label: 'Project' },
      { key: 'amount', label: 'Amount', format: 'currency' },
      { key: 'orderedQty', label: 'Ordered' },
      { key: 'receivedQty', label: 'Received' },
      { key: 'remainingQty', label: 'Left' },
      { key: 'expectedDeliveryDate', label: 'Expected', format: 'date' },
      { key: 'overdue', label: 'Overdue', format: 'bool' },
      { key: 'daysLate', label: 'Days late' },
    ],
  },
  'grn-register': {
    api: '/reports/grn-register',
    title: 'GRN register',
    subtitle: 'This GRN qty is this receipt only. Ordered / PO received / Left are cumulative on the PO.',
    filename: 'grn-register',
    columns: [
      { key: 'grnNumber', label: 'GRN' },
      { key: 'poNumber', label: 'PO' },
      { key: 'indentNumber', label: 'Indent' },
      { key: 'vendorName', label: 'Vendor' },
      { key: 'invoiceNo', label: 'Invoice' },
      { key: 'invoiceValue', label: 'Invoice value', format: 'currency' },
      { key: 'quantityThisGrn', label: 'This GRN' },
      { key: 'quantityOrdered', label: 'PO ordered' },
      { key: 'quantityReceived', label: 'PO received (cum.)' },
      { key: 'quantityRemaining', label: 'PO remaining' },
      { key: 'status', label: 'Status', format: 'status' },
      { key: 'receivedAt', label: 'Received on', format: 'date' },
    ],
  },
  'issue-register': {
    api: '/reports/issue-register',
    title: 'Material issue register',
    subtitle: 'Issues to site linked to indent',
    filename: 'issue-register',
    columns: [
      { key: 'issueNumber', label: 'Issue' },
      { key: 'indentNumber', label: 'Indent' },
      { key: 'materialName', label: 'Material' },
      { key: 'quantity', label: 'Qty' },
      { key: 'unit', label: 'Unit' },
      { key: 'issuedToName', label: 'Issued to' },
      { key: 'issuedBy', label: 'Issued by' },
      { key: 'issuedAt', label: 'Issued on', format: 'date' },
    ],
  },
  'project-material-cost': {
    api: '/reports/project-material-cost',
    title: 'Project material cost summary',
    subtitle: 'Issued value, GRN value, and open PO commitment by project',
    filename: 'project-material-cost',
    columns: [
      { key: 'projectCode', label: 'Project' },
      { key: 'projectName', label: 'Name' },
      { key: 'budget', label: 'Budget', format: 'currency' },
      { key: 'issuedValue', label: 'Issued value', format: 'currency' },
      { key: 'grnValue', label: 'GRN value', format: 'currency' },
      { key: 'poValue', label: 'PO value', format: 'currency' },
      { key: 'openPoCommitment', label: 'Open PO commitment', format: 'currency' },
      { key: 'totalExposure', label: 'Total exposure', format: 'currency' },
    ],
  },
  'three-way': {
    api: '/reports/three-way',
    title: 'PO–GRN–invoice exceptions',
    subtitle: 'Three-way match exceptions and GRNs on hold',
    filename: 'three-way-exceptions',
    columns: [
      { key: 'grnNumber', label: 'GRN' },
      { key: 'poNumber', label: 'PO' },
      { key: 'vendorName', label: 'Vendor' },
      { key: 'invoiceNo', label: 'Invoice' },
      { key: 'invoiceValue', label: 'Invoice value', format: 'currency' },
      { key: 'qtyVariance', label: 'Qty variance', format: 'bool' },
      { key: 'priceVariance', label: 'Price variance', format: 'bool' },
      { key: 'holdReasons', label: 'Hold reasons' },
      { key: 'status', label: 'Status', format: 'status' },
      { key: 'receivedAt', label: 'Received', format: 'date' },
    ],
  },
  'ap-aging': {
    api: '/reports/ap-aging',
    title: 'Vendor AP aging',
    subtitle: 'Outstanding bills by aging bucket',
    filename: 'ap-aging',
    columns: [
      { key: 'billNumber', label: 'Bill' },
      { key: 'vendorName', label: 'Vendor' },
      { key: 'projectCode', label: 'Project' },
      { key: 'invoiceNumber', label: 'Invoice' },
      { key: 'invoiceValue', label: 'Invoice value', format: 'currency' },
      { key: 'paidAmount', label: 'Paid', format: 'currency' },
      { key: 'outstandingAmount', label: 'Outstanding', format: 'currency' },
      { key: 'agingDays', label: 'Age (days)' },
      { key: 'agingBucket', label: 'Bucket' },
      { key: 'paymentStatus', label: 'Status', format: 'status' },
      { key: 'dueDate', label: 'Due', format: 'date' },
    ],
  },
  pipeline: {
    api: '/reports/pipeline',
    title: 'Procurement pipeline MIS',
    subtitle: 'Demand stuck at each gate — indent through GRN and AP',
    filename: 'pipeline-mis',
    columns: [
      { key: 'stage', label: 'Stage' },
      { key: 'count', label: 'Count' },
      { key: 'value', label: 'Value', format: 'currency' },
    ],
  },
  'approval-trail': {
    api: '/reports/approval-trail',
    title: 'Approval & audit trail',
    subtitle: 'Who changed what across documents',
    filename: 'approval-trail',
    columns: [
      { key: 'timestamp', label: 'When', format: 'date' },
      { key: 'actorName', label: 'Actor' },
      { key: 'actorRole', label: 'Role' },
      { key: 'action', label: 'Action' },
      { key: 'entityType', label: 'Entity' },
      { key: 'entityId', label: 'Entity ID' },
      { key: 'remark', label: 'Remark' },
    ],
  },
  shortage: {
    api: '/reports/shortage',
    title: 'Shortage / reorder',
    subtitle: 'Materials below threshold with open indent and open PO cover',
    filename: 'shortage-reorder',
    columns: [
      { key: 'materialName', label: 'Material' },
      { key: 'materialCode', label: 'Code' },
      { key: 'siteName', label: 'Site' },
      { key: 'quantityOnHand', label: 'On hand' },
      { key: 'availableQty', label: 'Available' },
      { key: 'lowStockThreshold', label: 'Threshold' },
      { key: 'shortfall', label: 'Shortfall' },
      { key: 'openIndentQty', label: 'Open indent qty' },
      { key: 'openPoQty', label: 'Open PO qty' },
      { key: 'unit', label: 'Unit' },
    ],
  },
  'price-compare': {
    api: '/reports/price-compare',
    title: 'Last purchase price compare',
    subtitle: 'Current PO rate vs previous purchase',
    filename: 'price-compare',
    columns: [
      { key: 'materialName', label: 'Material' },
      { key: 'currentPo', label: 'Current PO' },
      { key: 'currentVendor', label: 'Vendor' },
      { key: 'currentRate', label: 'Current rate', format: 'currency' },
      { key: 'lastPo', label: 'Last PO' },
      { key: 'lastVendor', label: 'Last vendor' },
      { key: 'lastRate', label: 'Last rate', format: 'currency' },
      { key: 'changePct', label: 'Change %' },
      { key: 'createdAt', label: 'PO date', format: 'date' },
    ],
  },
  'gst-register': {
    api: '/reports/gst-register',
    title: 'GST purchase register',
    subtitle: 'Taxable value and GST by GRN invoice',
    filename: 'gst-register',
    columns: [
      { key: 'grnNumber', label: 'GRN' },
      { key: 'invoiceNo', label: 'Invoice' },
      { key: 'invoiceDate', label: 'Invoice date', format: 'date' },
      { key: 'vendorName', label: 'Vendor' },
      { key: 'gstin', label: 'GSTIN' },
      { key: 'taxableValue', label: 'Taxable', format: 'currency' },
      { key: 'gstPercent', label: 'GST %' },
      { key: 'gstAmount', label: 'GST amount', format: 'currency' },
      { key: 'invoiceValue', label: 'Invoice value', format: 'currency' },
      { key: 'status', label: 'Status', format: 'status' },
    ],
  },
  'doc-completeness': {
    api: '/reports/doc-completeness',
    title: 'Document completeness',
    subtitle: 'Missing invoice / challan / e-way on GRNs',
    filename: 'doc-completeness',
    columns: [
      { key: 'grnNumber', label: 'GRN' },
      { key: 'poNumber', label: 'PO' },
      { key: 'vendorName', label: 'Vendor' },
      { key: 'invoiceNo', label: 'Invoice #' },
      { key: 'invoiceValue', label: 'Value', format: 'currency' },
      { key: 'hasInvoiceFile', label: 'Invoice file', format: 'bool' },
      { key: 'hasChallanFile', label: 'Challan file', format: 'bool' },
      { key: 'hasEway', label: 'E-Way', format: 'bool' },
      { key: 'missingDocs', label: 'Missing' },
      { key: 'receivedAt', label: 'Received', format: 'date' },
    ],
  },
  'spend-vendor': {
    api: '/reports/spend-vendor',
    title: 'Spend by vendor',
    subtitle: 'PO / GRN / paid concentration by supplier',
    filename: 'spend-by-vendor',
    columns: [
      { key: 'vendorName', label: 'Vendor' },
      { key: 'poCount', label: 'PO count' },
      { key: 'poValue', label: 'PO value', format: 'currency' },
      { key: 'grnValue', label: 'GRN value', format: 'currency' },
      { key: 'paidAmount', label: 'Paid', format: 'currency' },
      { key: 'outstandingAmount', label: 'Outstanding', format: 'currency' },
      { key: 'pctOfPoSpend', label: '% of PO spend' },
    ],
  },
  'branch-transfer-register': {
    api: '/reports/branch-transfer-register',
    title: 'Branch transfer register',
    subtitle: 'Inter-project transfers with material lines',
    filename: 'branch-transfer-register',
    columns: [
      { key: 'transferNumber', label: 'Transfer' },
      { key: 'fromProject', label: 'From' },
      { key: 'toProject', label: 'To' },
      { key: 'materialName', label: 'Material' },
      { key: 'quantity', label: 'Qty' },
      { key: 'quantityReceived', label: 'Received' },
      { key: 'status', label: 'Status', format: 'status' },
      { key: 'requestedBy', label: 'Requested by' },
      { key: 'createdAt', label: 'Created', format: 'date' },
    ],
  },
  'rfq-pipeline': {
    api: '/reports/rfq-pipeline',
    title: 'RFQ pipeline',
    subtitle: 'RFQs with PR, indent, and linked PO',
    filename: 'rfq-pipeline',
    columns: [
      { key: 'rfqNumber', label: 'RFQ' },
      { key: 'status', label: 'Status', format: 'status' },
      { key: 'prNumber', label: 'PR' },
      { key: 'indentNumber', label: 'Indent' },
      { key: 'projectCode', label: 'Project' },
      { key: 'raisedBy', label: 'Raised by' },
      { key: 'daysOpen', label: 'Days open' },
      { key: 'poNumber', label: 'PO' },
      { key: 'poStatus', label: 'PO status', format: 'status' },
      { key: 'createdAt', label: 'Created', format: 'date' },
    ],
  },
  'grn-payment-reco': {
    api: '/reports/grn-payment-reco',
    title: 'GRN–payment reconciliation',
    subtitle: 'GRN invoice vs payment bill',
    filename: 'grn-payment-reco',
    columns: [
      { key: 'grnNumber', label: 'GRN' },
      { key: 'poNumber', label: 'PO' },
      { key: 'vendorName', label: 'Vendor' },
      { key: 'invoiceNo', label: 'Invoice' },
      { key: 'grnInvoiceValue', label: 'GRN value', format: 'currency' },
      { key: 'billNumber', label: 'Bill' },
      { key: 'billInvoiceValue', label: 'Bill value', format: 'currency' },
      { key: 'paidAmount', label: 'Paid', format: 'currency' },
      { key: 'outstandingAmount', label: 'Outstanding', format: 'currency' },
      { key: 'paymentStatus', label: 'Payment status', format: 'status' },
      { key: 'matched', label: 'Matched', format: 'bool' },
      { key: 'receivedAt', label: 'Received', format: 'date' },
    ],
  },
  'stock-movement': {
    api: '/reports/stock-movement',
    title: 'Stock movement ledger',
    subtitle: 'Live stock movements: GRN/transfer inward, issues, and adjustments',
    filename: 'stock-movement',
    columns: [
      { key: 'movedAt', label: 'When', format: 'date' },
      { key: 'movementType', label: 'Type' },
      { key: 'docNumber', label: 'Document' },
      { key: 'ref', label: 'Ref' },
      { key: 'materialName', label: 'Material' },
      { key: 'quantity', label: 'Qty' },
      { key: 'unit', label: 'Unit' },
      { key: 'party', label: 'Party' },
    ],
  },
  'cancelled-procurement': {
    api: '/reports/cancelled-procurement',
    title: 'Cancelled / rejected procurement',
    subtitle: 'Rejected indents and POs',
    filename: 'cancelled-procurement',
    columns: [
      { key: 'docType', label: 'Type' },
      { key: 'docNumber', label: 'Number' },
      { key: 'projectCode', label: 'Project' },
      { key: 'party', label: 'Party' },
      { key: 'amount', label: 'Amount', format: 'currency' },
      { key: 'status', label: 'Status', format: 'status' },
      { key: 'reason', label: 'Reason' },
      { key: 'updatedAt', label: 'Updated', format: 'date' },
    ],
  },
  'wo-cost': {
    api: '/reports/wo-cost',
    title: 'Work order cost & progress',
    subtitle: 'Contract value, milestones, and material issues',
    filename: 'wo-cost',
    columns: [
      { key: 'woNumber', label: 'WO' },
      { key: 'projectCode', label: 'Project' },
      { key: 'vendorName', label: 'Vendor' },
      { key: 'status', label: 'Status', format: 'status' },
      { key: 'amount', label: 'Contract value', format: 'currency' },
      { key: 'progressPercent', label: 'Progress %' },
      { key: 'completedQuantity', label: 'Completed qty' },
      { key: 'totalQuantity', label: 'Total qty' },
      { key: 'milestonesDone', label: 'Milestones done' },
      { key: 'milestonesTotal', label: 'Milestones total' },
      { key: 'materialQty', label: 'Material qty issued' },
      { key: 'createdAt', label: 'Created', format: 'date' },
    ],
  },
  'live-stock': {
    api: '/stock/balance',
    title: 'Live stock balance',
    subtitle: 'Opening + inward − outward = current balance',
    filename: 'live-stock',
    columns: [
      { key: 'itemCode', label: 'Item code' },
      { key: 'itemDescription', label: 'Description' },
      { key: 'unit', label: 'Unit' },
      { key: 'openingBalance', label: 'Opening' },
      { key: 'totalReceived', label: 'Received' },
      { key: 'totalIssued', label: 'Issued' },
      { key: 'currentBalance', label: 'Current balance' },
    ],
  },
  'stock-aging': {
    api: '/stock/aging',
    title: 'Stock aging',
    subtitle: 'FIFO batches and opening / non-FIFO remainder',
    filename: 'stock-aging',
    columns: [
      { key: 'itemCode', label: 'Item code' },
      { key: 'itemDescription', label: 'Description' },
      { key: 'unit', label: 'Unit' },
      { key: 'grnNumber', label: 'Batch / GRN' },
      { key: 'availableQuantity', label: 'Qty' },
      { key: 'agingDays', label: 'Aging days' },
      { key: 'source', label: 'Source' },
    ],
  },
};

export { REPORT_CONFIG };

function cellValue(row: Record<string, unknown>, col: Column) {
  const raw = row[col.key];
  if (col.format === 'date') {
    return raw ? formatDate(String(raw)) : '—';
  }
  if (col.format === 'currency') {
    if (raw == null || raw === '') return '—';
    return formatCurrency(Number(raw) || 0);
  }
  if (col.format === 'bool') {
    return raw ? 'Yes' : 'No';
  }
  if (raw == null || raw === '') return '—';
  return String(raw);
}

export function OperationalReportView({
  reportId,
  extraParams,
  onBack,
}: {
  reportId: string;
  extraParams?: Record<string, string>;
  onBack?: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const config = REPORT_CONFIG[reportId];
  const meta = getReportById(reportId);
  const [from, setFrom] = useState(params.get('from') || '');
  const [to, setTo] = useState(params.get('to') || '');

  const queryParams = useMemo(() => {
    const q: Record<string, string> = { ...(extraParams || {}) };
    if (from) q.from = from;
    if (to) q.to = to;
    if (params.get('overdue')) q.overdue = params.get('overdue')!;
    if (params.get('mine')) q.mine = params.get('mine')!;
    if (params.get('status')) q.status = params.get('status')!;
    return q;
  }, [from, to, params, extraParams]);

  const { data: rows, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['operational-report', reportId, queryParams],
    queryFn: async () => {
      const res = await api.get<{ data: Array<Record<string, unknown>> }>(config.api, {
        params: queryParams,
      });
      return res.data.data || [];
    },
    enabled: Boolean(config),
  });

  if (!config) {
    return (
      <div className="page-container">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-secondary hover:text-ink mb-3"
          >
            All reports
          </button>
        ) : null}
        <EmptyState
          title="Report not found"
          description="This report id is not available. Open Reports from the sidebar."
        />
      </div>
    );
  }

  const applyDates = () => {
    const next = new URLSearchParams(params);
    if (from) next.set('from', from);
    else next.delete('from');
    if (to) next.set('to', to);
    else next.delete('to');
    setParams(next, { replace: true });
  };

  return (
    <ReportPageShell
      title={meta?.title || config.title}
      subtitle={meta?.description || config.subtitle}
      onBack={onBack}
      onExportCsv={() =>
        exportCsv(
          config.filename,
          config.columns.map((c) => ({ key: c.key, label: c.label })),
          (rows || []).map((row) => {
            const flat: Record<string, unknown> = {};
            for (const col of config.columns) {
              flat[col.key] = cellValue(row, col);
            }
            return flat;
          })
        )
      }
      filters={
        <>
          <label className="text-xs text-ink-muted">
            From
            <Input
              type="date"
              className="mt-1 h-9"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              onBlur={applyDates}
            />
          </label>
          <label className="text-xs text-ink-muted">
            To
            <Input
              type="date"
              className="mt-1 h-9"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onBlur={applyDates}
            />
          </label>
        </>
      }
    >
      <ListQueryBoundary
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        retrying={isFetching && !isLoading}
        isEmpty={!rows?.length}
        empty={<EmptyState title="No rows" description="No data for the selected filters." />}
      >
        <div className="table-shell">
          <table className="data-table min-w-full">
            <thead>
              <tr>
                {config.columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((row, index) => (
                <tr key={String(row.id || index)}>
                  {config.columns.map((col) => (
                    <td
                      key={col.key}
                      className={
                        col.format === 'currency' || col.key.toLowerCase().includes('qty')
                          ? 'num tabular-nums whitespace-nowrap'
                          : 'whitespace-nowrap'
                      }
                    >
                      {col.format === 'status' ? (
                        <StatusBadge status={String(row[col.key] || '')} />
                      ) : (
                        cellValue(row, col)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListQueryBoundary>
    </ReportPageShell>
  );
}

export function OperationalReportPage() {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const [params] = useSearchParams();
  const role = useAuthStore((s) => s.user?.role) as UserRole | undefined;
  const navigate = useNavigate();

  useEffect(() => {
    if (!role || !reportId) return;
    const next = new URLSearchParams(params);
    next.set('report', reportId);
    navigate(`${reportsHubPath(role)}?${next.toString()}`, { replace: true });
  }, [role, reportId, params, navigate]);

  return null;
}
