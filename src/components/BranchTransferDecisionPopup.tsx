import { ArrowRightLeft, Send } from 'lucide-react';
import { formatQuantity, type PmStockDecisionDto } from '@afios/shared';
import { cn } from '@/lib/utils';

interface BranchTransferDecisionPopupProps {
  decision: PmStockDecisionDto;
  className?: string;
}

export function BranchTransferDecisionPopup({
  decision,
  className,
}: BranchTransferDecisionPopupProps) {
  const viable = decision.branchTransferViable;
  const displayLines = decision.lines.filter(
    (l) => l.currentProjectAvailableQty + l.alreadyCoveredQty < l.requiredQty
  );
  const linesToShow = displayLines.length ? displayLines : decision.lines;

  return (
    <div className={cn('relative mb-1', className)} role="status" aria-live="polite">
      <div
        className={cn(
          'rounded-xl border px-3 py-2.5 shadow-sm',
          viable ? 'border-emerald-200 bg-emerald-50/80' : 'border-amber-200 bg-amber-50/80'
        )}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Decision formula
        </p>
        <p className="mt-1 text-xs text-ink-secondary">
          Current project stock + other projects&apos; stock vs required quantity
        </p>
        <ul className="mt-2 space-y-2">
          {linesToShow.map((line) => {
            const covers = line.combinedAvailableQty >= line.requiredQty;
            return (
              <li key={line.materialId} className="text-sm">
                {linesToShow.length > 1 && line.materialName ? (
                  <p className="text-xs font-medium text-ink mb-0.5">{line.materialName}</p>
                ) : null}
                <p className="font-semibold tabular-nums text-ink">
                  {formatQuantity(line.currentProjectAvailableQty)} +{' '}
                  {formatQuantity(line.otherProjectsAvailableQty)} ={' '}
                  {formatQuantity(line.combinedAvailableQty)}
                  <span className="mx-1 text-ink-muted">{covers ? '≥' : '<'}</span>
                  {formatQuantity(line.requiredQty)}
                </p>
                <p className="text-[11px] text-ink-muted tabular-nums">
                  Current {formatQuantity(line.currentProjectAvailableQty, line.unit)} · Other
                  projects {formatQuantity(line.otherProjectsAvailableQty, line.unit)} · Required{' '}
                  {formatQuantity(line.requiredQty, line.unit)}
                  {line.alreadyCoveredQty > 0
                    ? ` · Already requested via BT ${formatQuantity(line.alreadyCoveredQty, line.unit)}`
                    : ''}
                </p>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex items-start gap-2 text-xs font-medium">
          {viable ? (
            <>
              <ArrowRightLeft className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-700" />
              <p className="text-emerald-800">
                Branch Transfer is viable. You may request a transfer — Executive will approve or
                reject. Or forward to HO for procurement.
              </p>
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-800" />
              <p className="text-amber-900">
                Branch Transfer cannot fulfill this indent. Choose Forward to HO for further
                approval — Executive will proceed with procurement.
              </p>
            </>
          )}
        </div>
      </div>
      <div
        className={cn(
          'mx-auto h-0 w-0 border-x-[7px] border-x-transparent border-t-[8px]',
          viable ? 'border-t-emerald-200' : 'border-t-amber-200'
        )}
        aria-hidden
      />
    </div>
  );
}
