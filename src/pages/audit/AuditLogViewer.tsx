import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Filter } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@afios/shared';
import { formatAuditAction } from '@/lib/auditLabels';
import type { AuditLogDto } from '@afios/shared';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { PdfActions } from '@/components/PdfActions';

export function AuditLogViewerPage() {
  const navigate = useNavigate();
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const pdfQuery = (() => {
    const params = new URLSearchParams();
    if (entityType) params.set('entityType', entityType);
    if (action) params.set('action', action);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    const q = params.toString();
    return q ? `/exports/audit-logs.pdf?${q}` : '/exports/audit-logs.pdf';
  })();

  const { data: logs, list } = useListQuery({
    queryKey: ['audit-logs', entityType, action, from, to],
    queryFn: async () => {
      const res = await api.get<{ data: AuditLogDto[] }>('/audit-logs', {
        params: {
          entityType: entityType || undefined,
          action: action || undefined,
          from: from || undefined,
          to: to || undefined,
          limit: 100,
        },
      });
      return normalizeListData<AuditLogDto>(res.data.data);
    },
  });

  return (
    <div className="page-container max-w-4xl">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-ink-secondary hover:text-ink mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <PageHeader
        title="Audit log"
        subtitle="Compliance trail — filter by entity, action, or date range"
      />

      <div className="panel p-3 mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-xs font-semibold text-ink-muted mb-1 block">Entity type</label>
          <Input
            placeholder="MaterialRequest…"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink-muted mb-1 block">Action</label>
          <Input
            placeholder="POST /api/…"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink-muted mb-1 block">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink-muted mb-1 block">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
          <Button variant="secondary" size="sm" onClick={list.onRetry} disabled={list.retrying}>
            <Filter className="h-4 w-4" />
            {list.retrying ? 'Loading…' : 'Apply filters'}
          </Button>
          <PdfActions path={pdfQuery} filename="audit-log.pdf" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEntityType('');
              setAction('');
              setFrom('');
              setTo('');
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      <ListQueryBoundary
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={list.onRetry}
        retrying={list.retrying}
        isEmpty={!logs?.length}
        skeletonRows={6}
        empty={<EmptyState title="No audit entries" description="Try adjusting your filters." />}
      >
        <div className="space-y-2">
          {(logs ?? []).map((log) => (
            <div key={log.id} className="panel px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink">{formatAuditAction(log.action)}</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  {log.actorName} · {log.entityType}
                  {log.entityId ? ` · ${log.entityId.slice(-6)}` : ''}
                </p>
              </div>
              <time className="text-xs text-ink-muted shrink-0 tabular-nums">
                {formatDate(log.timestamp)}
              </time>
            </div>
          ))}
        </div>
      </ListQueryBoundary>
    </div>
  );
}
