import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ProjectStockMaterial {
  materialId: string;
  materialCode?: string;
  materialName?: string;
  unit?: string;
  availableQty: number;
  sites: Array<{ siteId: string; siteName: string; availableQty: number }>;
}

interface ProjectStockSummary {
  projectId: string;
  projectCode: string;
  projectName: string;
  materials: ProjectStockMaterial[];
}

interface StockAcrossProjectsDropdownProps {
  excludeProjectId?: string;
  className?: string;
}

export function StockAcrossProjectsDropdown({
  excludeProjectId,
  className,
}: StockAcrossProjectsDropdownProps) {
  const [open, setOpen] = useState(false);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['pm-cross-stock-all', excludeProjectId],
    enabled: open,
    queryFn: async () => {
      const res = await api.get<{ data: ProjectStockSummary[] }>('/stock/cross-project/all', {
        params: excludeProjectId ? { excludeProjectId } : undefined,
      });
      return res.data.data;
    },
  });

  const projects = data ?? [];

  return (
    <div className={cn('rounded-xl border border-surface-border bg-white', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full text-left px-4 py-3"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Layers className="h-4 w-4 text-ink-muted" />
          Stock Across Projects
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-ink-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-ink-muted" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-surface-border pt-3">
          <p className="text-[11px] text-ink-muted">
            All materials on your other projects. Take qty for this indent is on the items above — not
            this list.
          </p>
          {isLoading ? (
            <p className="text-xs text-ink-muted">Loading stock across your projects…</p>
          ) : isError ? (
            <p className="text-xs text-danger">Could not load stock across projects.</p>
          ) : !projects.length ? (
            <p className="text-xs text-ink-muted">No other assigned projects found.</p>
          ) : (
            projects.map((p) => {
              const isExpanded = expandedProjectId === p.projectId;
              return (
                <div key={p.projectId} className="rounded-lg border border-surface-border">
                  <button
                    type="button"
                    onClick={() => setExpandedProjectId(isExpanded ? null : p.projectId)}
                    className="flex items-center justify-between w-full text-left px-3 py-2"
                    aria-expanded={isExpanded}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{p.projectName}</p>
                      <p className="text-xs text-ink-muted">{p.projectCode}</p>
                    </div>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-ink-secondary tabular-nums">
                        {p.materials.length} item{p.materials.length === 1 ? '' : 's'}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-ink-muted" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-ink-muted" />
                      )}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-surface-border px-3 py-2 space-y-2">
                      {!p.materials.length ? (
                        <p className="text-xs text-ink-muted">No stock available at this project.</p>
                      ) : (
                        p.materials.map((m) => (
                          <div key={m.materialId} className="rounded-lg bg-surface-muted/40 px-2.5 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm text-ink">{m.materialName || 'Material'}</p>
                              <p className="text-sm font-semibold tabular-nums text-ink">
                                {m.availableQty} {m.unit || ''}
                              </p>
                            </div>
                            {m.sites?.length ? (
                              <ul className="mt-1 space-y-0.5">
                                {m.sites.map((s) => (
                                  <li
                                    key={s.siteId}
                                    className="flex items-center justify-between text-xs text-ink-muted"
                                  >
                                    <span>{s.siteName}</span>
                                    <span className="tabular-nums">{s.availableQty}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
