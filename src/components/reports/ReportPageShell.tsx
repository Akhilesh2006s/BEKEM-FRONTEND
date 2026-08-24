import type { ReactNode } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';

export function ReportPageShell({
  title,
  subtitle,
  filters,
  onExportCsv,
  exporting,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  filters?: ReactNode;
  onExportCsv?: () => void;
  exporting?: boolean;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="page-container max-w-full">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-ink-secondary hover:text-ink mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          All reports
        </button>
      ) : null}
      <PageHeader
        title={title}
        subtitle={subtitle || 'Operational MIS report'}
        action={
          onExportCsv ? (
            <Button variant="secondary" size="sm" disabled={exporting} onClick={onExportCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          ) : undefined
        }
      />
      {filters ? <div className="mb-3 flex flex-wrap gap-2 items-end">{filters}</div> : null}
      {children}
    </div>
  );
}
