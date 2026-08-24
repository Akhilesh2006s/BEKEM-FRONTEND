import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@afios/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { cn } from '@/lib/utils';

type RegisterTab = 'inward' | 'outward' | 'stock';

interface InwardLineItem {
  materialId?: string;
  materialName?: string;
  hsnCode?: string;
  unit?: string;
  quantity?: number;
  rate?: number;
  basicAmount?: number;
  others?: number;
  totalBasic?: number;
  igst?: number;
  cgst?: number;
  sgst?: number;
  grossAmount?: number;
}

interface GrnRow {
  id: string;
  grnNumber: string;
  poNumber: string;
  indentNumber: string;
  vendorName: string;
  status: string;
  receivedAt: string | null;
  invoiceNo?: string;
  invoiceDate?: string | null;
  ewayBillNumber?: string;
  items?: InwardLineItem[];
}

interface InwardRegisterRow {
  key: string;
  slNo: number;
  mrnNo: string;
  mrnDate: string | null;
  billNo: string;
  billDate: string | null;
  supplierName: string;
  materialName: string;
  hsnCode: string;
  units: string;
  qty: number;
  rate: number;
  basicAmount: number;
  others: number;
  totalBasic: number;
  igst: number;
  cgst: number;
  sgst: number;
  grossAmount: number;
  wayBillNo: string;
}

interface IssueLineItem {
  materialId?: string;
  quantity?: number;
  rate?: number;
  amount?: number;
  unit?: string;
  materialName?: string;
  material?: { name?: string; unit?: string };
}

interface IssueRow {
  id: string;
  issueNumber: string;
  materialRequest?: { indentNumber?: string };
  issuedToName?: string;
  contractorName?: string;
  issueType?: string;
  issuedAt?: string;
  createdAt?: string;
  items: IssueLineItem[];
}

interface OutwardRegisterRow {
  key: string;
  slNo: number;
  minNo: string;
  minDate: string | null;
  issuedTo: string;
  contractorName: string;
  materialName: string;
  units: string;
  qty: number;
  rate: number;
  amount: number;
}

interface BalanceRow {
  id: string;
  itemCode: string;
  itemDescription: string;
  unit: string;
  openingBalance?: number;
  totalReceived: number;
  totalIssued: number;
  currentBalance: number;
}

const TABS: Array<{ key: RegisterTab; label: string }> = [
  { key: 'inward', label: 'Inward Register' },
  { key: 'outward', label: 'Outward Register' },
  { key: 'stock', label: 'Stock Register' },
];

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return formatCurrency(n);
}

function parseRegisterTab(value: string | null): RegisterTab {
  if (value === 'outward' || value === 'stock' || value === 'inward') return value;
  return 'inward';
}

export function StoreRegistersPage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTabState] = useState<RegisterTab>(() => parseRegisterTab(params.get('tab')));

  const setTab = (next: RegisterTab) => {
    setTabState(next);
    const nextParams = new URLSearchParams(params);
    nextParams.set('tab', next);
    setParams(nextParams, { replace: true });
  };

  const inward = useListQuery({
    queryKey: ['register-inward'],
    queryFn: async () => {
      const res = await api.get<{ data: GrnRow[] }>('/goods-receipts');
      return normalizeListData<GrnRow>(res.data.data);
    },
    enabled: tab === 'inward',
  });

  const outward = useListQuery({
    queryKey: ['register-outward'],
    queryFn: async () => {
      const res = await api.get<{ data: IssueRow[] }>('/material-issues');
      return normalizeListData<IssueRow>(res.data.data);
    },
    enabled: tab === 'outward',
  });

  const stock = useListQuery({
    queryKey: ['register-stock'],
    queryFn: async () => {
      const res = await api.get<{ data: BalanceRow[] }>('/stock/balance');
      return normalizeListData<BalanceRow>(res.data.data);
    },
    enabled: tab === 'stock',
  });

  const inwardRows = useMemo(() => {
    const rows: InwardRegisterRow[] = [];
    let slNo = 1;
    for (const g of inward.data ?? []) {
      const lines = g.items?.length
        ? g.items
        : [
            {
              materialName: '—',
              hsnCode: '',
              unit: '',
              quantity: 0,
              rate: 0,
              basicAmount: 0,
              others: 0,
              totalBasic: 0,
              igst: 0,
              cgst: 0,
              sgst: 0,
              grossAmount: 0,
            },
          ];
      lines.forEach((line, idx) => {
        const qty = Number(line.quantity) || 0;
        const rate = Number(line.rate) || 0;
        const basicAmount = Number(line.basicAmount ?? qty * rate) || 0;
        const others = Number(line.others) || 0;
        const totalBasic = Number(line.totalBasic ?? basicAmount + others) || 0;
        rows.push({
          key: `${g.id}-${line.materialId || idx}`,
          slNo: slNo++,
          mrnNo: g.grnNumber || '—',
          mrnDate: g.receivedAt,
          billNo: g.invoiceNo || '—',
          billDate: g.invoiceDate || null,
          supplierName: g.vendorName || '—',
          materialName: line.materialName || '—',
          hsnCode: line.hsnCode || '—',
          units: line.unit || '—',
          qty,
          rate,
          basicAmount,
          others,
          totalBasic,
          igst: Number(line.igst) || 0,
          cgst: Number(line.cgst) || 0,
          sgst: Number(line.sgst) || 0,
          grossAmount: Number(line.grossAmount) || 0,
          wayBillNo: g.ewayBillNumber || '—',
        });
      });
    }
    return rows;
  }, [inward.data]);

  const outwardRows = useMemo(() => {
    const rows: OutwardRegisterRow[] = [];
    let slNo = 1;
    for (const issue of outward.data ?? []) {
      const lines = issue.items?.length
        ? issue.items
        : [
            {
              materialName: '—',
              unit: '',
              quantity: 0,
              rate: 0,
              amount: 0,
            },
          ];
      lines.forEach((line, idx) => {
        const qty = Number(line.quantity) || 0;
        const rate = Number(line.rate) || 0;
        const amount = Number(line.amount ?? qty * rate) || 0;
        rows.push({
          key: `${issue.id}-${line.materialId || idx}`,
          slNo: slNo++,
          minNo: issue.issueNumber || '—',
          minDate: issue.issuedAt || issue.createdAt || null,
          issuedTo: issue.issuedToName || '—',
          contractorName:
            issue.contractorName ||
            (issue.issueType === 'CONTRACT_ISSUE' ? issue.issuedToName || '—' : '—'),
          materialName: line.materialName || line.material?.name || '—',
          units: line.unit || line.material?.unit || '—',
          qty,
          rate,
          amount,
        });
      });
    }
    return rows;
  }, [outward.data]);

  return (
    <div className="page-container max-w-full">
      <PageHeader
        title="Material registers"
        subtitle="Opening + Inward (GRNs) − Outward (Issues) = Current balance"
      />

      <div className="flex gap-1 bg-surface-muted rounded-lg p-1 mb-4 w-full sm:w-fit overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2 text-sm font-semibold rounded-md whitespace-nowrap transition-colors',
              tab === t.key ? 'bg-white text-ink border border-surface-border' : 'text-ink-secondary hover:text-ink'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'inward' && (
        <ListQueryBoundary
          isLoading={inward.list.isLoading}
          isError={inward.list.isError}
          onRetry={inward.list.onRetry}
          retrying={inward.list.retrying}
          isEmpty={!inwardRows.length}
          empty={<EmptyState title="No inward entries" description="GRNs appear here when material is received." />}
        >
          <div className="table-shell overflow-x-auto">
            <table className="data-table min-w-[110rem] text-[11px]">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">Sl. No.</th>
                  <th className="whitespace-nowrap">MRN No</th>
                  <th className="whitespace-nowrap">MRN Date</th>
                  <th className="whitespace-nowrap">Bill No.</th>
                  <th className="whitespace-nowrap">Bill Date</th>
                  <th className="whitespace-nowrap">Supplier Name</th>
                  <th className="whitespace-nowrap">Material Name</th>
                  <th className="whitespace-nowrap">HSN Code</th>
                  <th className="whitespace-nowrap">Units</th>
                  <th className="num whitespace-nowrap">Qty</th>
                  <th className="num whitespace-nowrap">Rate</th>
                  <th className="num whitespace-nowrap">Basic Amount</th>
                  <th className="num whitespace-nowrap">Others</th>
                  <th className="num whitespace-nowrap">Total Basic</th>
                  <th className="num whitespace-nowrap">IGST</th>
                  <th className="num whitespace-nowrap">CGST</th>
                  <th className="num whitespace-nowrap">SGST</th>
                  <th className="num whitespace-nowrap">Gross Amount</th>
                  <th className="whitespace-nowrap">Way Bill No.</th>
                </tr>
              </thead>
              <tbody>
                {inwardRows.map((row) => (
                  <tr key={row.key}>
                    <td className="num tabular-nums">{row.slNo}</td>
                    <td className="cell-code whitespace-nowrap">{row.mrnNo}</td>
                    <td className="whitespace-nowrap">{formatDate(row.mrnDate)}</td>
                    <td className="cell-code whitespace-nowrap">{row.billNo}</td>
                    <td className="whitespace-nowrap">{formatDate(row.billDate)}</td>
                    <td className="cell-text">{row.supplierName}</td>
                    <td className="cell-text">{row.materialName}</td>
                    <td className="cell-code whitespace-nowrap">{row.hsnCode}</td>
                    <td className="whitespace-nowrap">{row.units}</td>
                    <td className="num tabular-nums">{row.qty.toLocaleString('en-IN')}</td>
                    <td className="num tabular-nums whitespace-nowrap">{money(row.rate)}</td>
                    <td className="num tabular-nums whitespace-nowrap">{money(row.basicAmount)}</td>
                    <td className="num tabular-nums whitespace-nowrap">{money(row.others)}</td>
                    <td className="num tabular-nums whitespace-nowrap">{money(row.totalBasic)}</td>
                    <td className="num tabular-nums whitespace-nowrap">{money(row.igst)}</td>
                    <td className="num tabular-nums whitespace-nowrap">{money(row.cgst)}</td>
                    <td className="num tabular-nums whitespace-nowrap">{money(row.sgst)}</td>
                    <td className="num tabular-nums font-semibold whitespace-nowrap">
                      {money(row.grossAmount)}
                    </td>
                    <td className="cell-code whitespace-nowrap">{row.wayBillNo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ListQueryBoundary>
      )}

      {tab === 'outward' && (
        <ListQueryBoundary
          isLoading={outward.list.isLoading}
          isError={outward.list.isError}
          onRetry={outward.list.onRetry}
          retrying={outward.list.retrying}
          isEmpty={!outwardRows.length}
          empty={<EmptyState title="No outward entries" description="Material issues appear here after store issue." />}
        >
          <div className="table-shell overflow-x-auto">
            <table className="data-table min-w-[72rem] text-[11px]">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">Sl. No.</th>
                  <th className="whitespace-nowrap">MIN No</th>
                  <th className="whitespace-nowrap">MIN Date</th>
                  <th className="whitespace-nowrap">Issued To</th>
                  <th className="whitespace-nowrap">Contractor Name</th>
                  <th className="whitespace-nowrap">Material Name</th>
                  <th className="whitespace-nowrap">Units</th>
                  <th className="num whitespace-nowrap">Qty</th>
                  <th className="num whitespace-nowrap">Rate</th>
                  <th className="num whitespace-nowrap">Amount</th>
                </tr>
              </thead>
              <tbody>
                {outwardRows.map((row) => (
                  <tr key={row.key}>
                    <td className="num tabular-nums">{row.slNo}</td>
                    <td className="cell-code whitespace-nowrap">{row.minNo}</td>
                    <td className="whitespace-nowrap">{formatDate(row.minDate)}</td>
                    <td className="cell-text">{row.issuedTo}</td>
                    <td className="cell-text">{row.contractorName}</td>
                    <td className="cell-text">{row.materialName}</td>
                    <td className="whitespace-nowrap">{row.units}</td>
                    <td className="num tabular-nums">{row.qty.toLocaleString('en-IN')}</td>
                    <td className="num tabular-nums whitespace-nowrap">{money(row.rate)}</td>
                    <td className="num tabular-nums font-semibold whitespace-nowrap">
                      {money(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ListQueryBoundary>
      )}

      {tab === 'stock' && (
        <ListQueryBoundary
          isLoading={stock.list.isLoading}
          isError={stock.list.isError}
          onRetry={stock.list.onRetry}
          retrying={stock.list.retrying}
          isEmpty={!stock.data?.length}
          empty={<EmptyState title="No stock balances" description="Balances update from GRN inward and material issue outward." />}
        >
          <div className="table-shell">
            <table className="data-table min-w-[48rem]">
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Item Description</th>
                  <th>Unit</th>
                  <th className="num">Opening</th>
                  <th className="num">Total Received</th>
                  <th className="num">Total Issued</th>
                  <th className="num">Current Balance</th>
                </tr>
              </thead>
              <tbody>
                {(stock.data ?? []).map((row) => {
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
                    <td className="cell-code">{row.itemCode}</td>
                    <td className="cell-text">{row.itemDescription}</td>
                    <td>{row.unit || '—'}</td>
                    <td className="num tabular-nums">{opening}</td>
                    <td className="num tabular-nums">{row.totalReceived}</td>
                    <td className="num tabular-nums">{row.totalIssued}</td>
                    <td className="num tabular-nums font-semibold">{row.currentBalance}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ListQueryBoundary>
      )}
    </div>
  );
}
