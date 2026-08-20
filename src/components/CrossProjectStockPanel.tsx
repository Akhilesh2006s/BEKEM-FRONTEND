import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

export interface CrossProjectStockRow {
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
}

export type CrossProjectSource = {
  projectId: string;
  projectCode: string;
  projectName: string;
  siteId: string;
  siteName: string;
};

export function takeKey(materialId: string, siteId: string) {
  return `${materialId}::${siteId}`;
}

export function takenForMaterial(
  takeQtyByKey: Record<string, number>,
  materialId: string,
  excludeSiteId?: string
) {
  const prefix = `${materialId}::`;
  let sum = 0;
  for (const [key, qty] of Object.entries(takeQtyByKey)) {
    if (!key.startsWith(prefix)) continue;
    if (excludeSiteId && key === takeKey(materialId, excludeSiteId)) continue;
    sum += Number(qty) || 0;
  }
  return sum;
}

export function otherProjectSitesWithStock(
  rows: CrossProjectStockRow[],
  requestingProjectId?: string
): CrossProjectSource[] {
  const seen = new Map<string, CrossProjectSource>();
  for (const row of rows) {
    for (const p of row.projects) {
      if (requestingProjectId && p.projectId === requestingProjectId) continue;
      for (const site of p.sites || []) {
        if (site.availableQty <= 0) continue;
        if (!seen.has(site.siteId)) {
          seen.set(site.siteId, {
            projectId: p.projectId,
            projectCode: p.projectCode,
            projectName: p.projectName,
            siteId: site.siteId,
            siteName: site.siteName,
          });
        }
      }
    }
  }
  return [...seen.values()];
}

export function buildBatchSources(
  takeQtyByKey: Record<string, number>,
  sources: CrossProjectSource[]
): Array<{
  fromProjectId: string;
  fromSiteId: string;
  items: Array<{ materialId: string; quantity: number }>;
}> {
  const bySite = new Map<
    string,
    {
      fromProjectId: string;
      fromSiteId: string;
      items: Array<{ materialId: string; quantity: number }>;
    }
  >();
  for (const [key, qty] of Object.entries(takeQtyByKey)) {
    const quantity = Number(qty);
    if (!(quantity > 0)) continue;
    const sep = key.indexOf('::');
    if (sep < 0) continue;
    const materialId = key.slice(0, sep);
    const siteId = key.slice(sep + 2);
    const source = sources.find((s) => s.siteId === siteId);
    if (!source) continue;
    if (!bySite.has(siteId)) {
      bySite.set(siteId, {
        fromProjectId: source.projectId,
        fromSiteId: siteId,
        items: [],
      });
    }
    bySite.get(siteId)!.items.push({ materialId, quantity });
  }
  return [...bySite.values()];
}

interface CrossProjectStockPanelProps {
  rows: CrossProjectStockRow[];
  className?: string;
  requestingProjectId?: string;
  takeQtyByKey?: Record<string, number>;
  onChangeTake?: (materialId: string, source: CrossProjectSource, qty: number) => void;
  requestedByMaterial?: Record<string, number>;
  alreadyCoveredByMaterial?: Record<string, number>;
  lockedSiteIds?: string[];
}

export function CrossProjectStockPanel({
  rows,
  className,
  requestingProjectId,
  takeQtyByKey = {},
  onChangeTake,
  requestedByMaterial = {},
  alreadyCoveredByMaterial = {},
  lockedSiteIds = [],
}: CrossProjectStockPanelProps) {
  const takeMode = Boolean(onChangeTake);
  const locked = new Set(lockedSiteIds);
  const visibleRows = rows
    .map((row) => ({
      ...row,
      projects: row.projects.filter(
        (p) => !requestingProjectId || p.projectId !== requestingProjectId
      ),
    }))
    .filter((row) => row.projects.length > 0);

  if (!visibleRows.length) return null;

  return (
    <div className={cn('space-y-3', className)}>
      {visibleRows.map((row) => {
        const requested = requestedByMaterial[row.materialId] ?? 0;
        const already = alreadyCoveredByMaterial[row.materialId] ?? 0;
        const taking = takenForMaterial(takeQtyByKey, row.materialId);
        const remaining = Math.max(0, requested - already - taking);
        return (
          <Card key={row.materialId} className="p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold text-ink">{row.materialName || 'Material'}</p>
              {takeMode && requested > 0 ? (
                <p className="text-xs text-ink-secondary tabular-nums">
                  Taking {already + taking} of {requested}
                  {remaining > 0 ? ` · Remaining ${remaining}` : ' · Fully covered'}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              {row.projects.map((p) => {
                const hasSurplus = p.availableQty > 0;
                const sites = p.sites?.length ? p.sites : null;
                return (
                  <div
                    key={p.projectId}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-sm',
                      hasSurplus
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : 'border-surface-border'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{p.projectName}</p>
                        <p className="text-xs text-ink-muted">{p.projectCode}</p>
                      </div>
                      <p className="tabular-nums font-semibold text-ink shrink-0">
                        Available: {p.availableQty}
                      </p>
                    </div>
                    {sites ? (
                      <ul className="mt-2 space-y-1 border-t border-surface-border/70 pt-2">
                        {sites.map((site) => {
                          const source: CrossProjectSource = {
                            projectId: p.projectId,
                            projectCode: p.projectCode,
                            projectName: p.projectName,
                            siteId: site.siteId,
                            siteName: site.siteName,
                          };
                          const isLocked = locked.has(site.siteId);
                          const othersTaken = takenForMaterial(
                            takeQtyByKey,
                            row.materialId,
                            site.siteId
                          );
                          const maxTake = Math.max(
                            0,
                            Math.min(
                              site.availableQty,
                              Math.max(0, requested - already - othersTaken)
                            )
                          );
                          const current =
                            Number(takeQtyByKey[takeKey(row.materialId, site.siteId)]) || 0;
                          return (
                            <li
                              key={site.siteId}
                              className={cn(
                                'flex items-center justify-between gap-3 text-xs rounded-lg px-2 py-1.5',
                                takeMode && current > 0 && 'bg-white ring-1 ring-bekem-accent'
                              )}
                            >
                              <span className="text-ink-secondary min-w-0">
                                {site.siteName}
                                <span className="ml-2 tabular-nums text-ink">
                                  {site.availableQty} available
                                </span>
                              </span>
                              {isLocked ? (
                                <span className="text-ink-muted shrink-0">Already requested</span>
                              ) : takeMode && site.availableQty > 0 && maxTake > 0 ? (
                                  <label className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-ink-muted">Take</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={maxTake}
                                      step={1}
                                      value={current || ''}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        if (raw === '') {
                                          onChangeTake?.(row.materialId, source, 0);
                                          return;
                                        }
                                        const n = Number(raw);
                                        if (!Number.isFinite(n)) return;
                                        onChangeTake?.(
                                          row.materialId,
                                          source,
                                          Math.max(0, Math.min(maxTake, n))
                                        );
                                      }}
                                      className="w-16 rounded-md border border-surface-border bg-white px-1.5 py-1 text-right tabular-nums text-ink"
                                      aria-label={`Take quantity from ${site.siteName}`}
                                    />
                                  </label>
                              ) : takeMode ? (
                                <span className="text-ink-muted shrink-0">
                                  {site.availableQty > 0 ? 'Need covered' : 'No stock'}
                                </span>
                              ) : (
                                <span className="tabular-nums font-medium text-ink">
                                  {site.availableQty}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-ink-muted">No site linked</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
