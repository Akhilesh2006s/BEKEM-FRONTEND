import type { IndentLineItemDto } from '@afios/shared';
import { computeRequiredQty, formatCurrency, formatQuantity } from '@afios/shared';
import { cn } from '@/lib/utils';

interface StockComparisonTableProps {
  items: IndentLineItemDto[];
  className?: string;
  showBanner?: boolean;
  /** Show unit price and line total columns when item pricing is present. */
  showPricing?: boolean;
  /** Show GRN/issue fulfillment quantities instead of the legacy allocated column. */
  showFulfillment?: boolean;
  /** Hide store-only "Available to issue" (e.g. Indent raiser). */
  showAvailableToIssue?: boolean;
  /** Server-computed total (sum of line totals). Falls back to item sum. */
  totalEstimatedValue?: number | null;
}

function lineItems(items: IndentLineItemDto[]) {
  return items.map((item) => {
    const requestedQty = item.requestedQty ?? item.quantityRequested ?? 0;
    const availableQty = item.availableQty ?? 0;
    const allocatedQty = item.quantityAllocated ?? 0;
    const receivedQty = item.quantityReceived ?? 0;
    const issuedQty = item.quantityIssued ?? 0;
    const availableToIssueQty = item.availableToIssueQty ?? 0;
    const remainingToIssueQty =
      item.remainingToIssueQty ?? Math.max(0, requestedQty - issuedQty);
    const pendingReceiptQty =
      item.pendingReceiptQty ??
      Math.max(0, remainingToIssueQty - Math.min(availableQty, remainingToIssueQty));
    const unitPrice = item.unitPrice ?? null;
    const lineTotal =
      item.lineTotal ??
      (unitPrice != null ? Math.round((requestedQty * unitPrice + Number.EPSILON) * 100) / 100 : null);
    return {
      id: item.id,
      name: item.material?.name || 'Material',
      unit: item.unit || item.material?.unit || '',
      requestedQty,
      allocatedQty,
      receivedQty,
      issuedQty,
      remainingToIssueQty,
      availableToIssueQty,
      pendingReceiptQty,
      requiredQty: computeRequiredQty(requestedQty, availableQty),
      unitPrice,
      lineTotal,
    };
  });
}

export function StockComparisonTable({
  items,
  className,
  showBanner = true,
  showPricing = false,
  showFulfillment = false,
  showAvailableToIssue = true,
  totalEstimatedValue,
}: StockComparisonTableProps) {
  const rows = lineItems(items);
  if (!rows.length) return null;

  const hasShortfall = rows.some((row) => row.requiredQty > 0);
  const hasPricing = showPricing || rows.some((row) => row.unitPrice != null);
  const fulfillmentCols = showFulfillment
    ? 4 + (showAvailableToIssue ? 1 : 0)
    : 1;
  const computedTotal =
    totalEstimatedValue ??
    (hasPricing
      ? Math.round(
          rows.reduce((sum, row) => sum + (row.lineTotal ?? 0), 0) * 100 + Number.EPSILON
        ) / 100
      : null);

  return (
    <div className={cn('space-y-2', className)}>
      {showBanner && (
        <div
          className={cn(
            'rounded border px-2 py-1.5 text-xs',
            hasShortfall
              ? 'border-warning/40 bg-warning/10 text-warning-dark'
              : 'border-success/30 bg-success-light/50 text-success-dark'
          )}
        >
          {hasShortfall
            ? 'Insufficient stock available for this project.'
            : 'Stock is available. Material can be issued without procurement.'}
        </div>
      )}

      <div className="table-shell">
        <table className="data-table min-w-[28rem]">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num w-20">Requested</th>
              {showFulfillment ? (
                <>
                  <th className="num w-20">GRN received</th>
                  <th className="num w-20">Issued</th>
                  <th className="num w-20">Remaining</th>
                  {showAvailableToIssue && (
                    <th className="num w-24">Available to issue</th>
                  )}
                  <th className="num w-24">Pending receipt</th>
                </>
              ) : (
                <th className="num w-20">Allocated</th>
              )}
              {hasPricing && (
                <>
                  <th className="num w-24">Unit price</th>
                  <th className="num w-24">Line total</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="cell-text" title={row.name}>
                  {row.name}
                  {row.unit && !hasPricing ? ` (${row.unit})` : ''}
                </td>
                <td className="num">{formatQuantity(row.requestedQty, row.unit)}</td>
                {showFulfillment ? (
                  <>
                    <td className="num">{formatQuantity(row.receivedQty, row.unit)}</td>
                    <td className="num">{formatQuantity(row.issuedQty, row.unit)}</td>
                    <td className="num font-semibold">
                      {formatQuantity(row.remainingToIssueQty, row.unit)}
                    </td>
                    {showAvailableToIssue && (
                      <td className="num font-medium text-emerald-700">
                        {formatQuantity(row.availableToIssueQty, row.unit)}
                      </td>
                    )}
                    <td className="num">{formatQuantity(row.pendingReceiptQty, row.unit)}</td>
                  </>
                ) : (
                  <td className="num">{formatQuantity(row.allocatedQty, row.unit)}</td>
                )}
                {hasPricing && (
                  <>
                    <td className="num text-ink-secondary">
                      {formatCurrency(row.unitPrice ?? 0)}
                    </td>
                    <td className="num font-medium">{formatCurrency(row.lineTotal ?? 0)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          {hasPricing && computedTotal != null && (
            <tfoot>
              <tr className="bg-slate-100 font-semibold">
                <td colSpan={2 + fulfillmentCols + (hasPricing ? 1 : 0)} className="text-right">
                  Total estimated value
                </td>
                <td className="num font-bold">{formatCurrency(computedTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
