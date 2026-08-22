import { ChevronDown, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DEFAULT_GST_PERCENT } from '@afios/shared';
import type { VendorDto } from '@afios/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SearchSelect } from '@/components/SearchSelect';
import { VendorFormModal } from '@/components/VendorFormModal';
import { computeFinalCost } from '@/lib/quotationTotals';
import { cn } from '@/lib/utils';

export interface VendorQuotationDraft {
  vendorId: string;
  vendorName?: string;
  rate: number;
  gstPercent: number;
  paymentTerms: string;
  deliveryTerms: string;
  transportation?: string;
  deliveryTime?: string;
  make?: string;
  selectedMaterialIds?: string[];
  itemRates?: Array<{
    materialId: string;
    rate: number;
    gstPercent: number;
  }>;
}

interface VendorQuotationEditorProps {
  quotations: VendorQuotationDraft[];
  quantity?: number;
  items?: Array<{ materialId: string; name: string; quantity: number; unit: string }>;
  onChange: (rows: VendorQuotationDraft[]) => void;
  minRows?: number;
}

export function computeDraftFinalCost(row: VendorQuotationDraft, quantity = 1) {
  return computeFinalCost(row.rate, quantity, row.gstPercent);
}

function isAssigned(row: VendorQuotationDraft) {
  return !!row.vendorId && (row.selectedMaterialIds?.length ?? 0) > 0;
}

function dedupeQuotations(rows: VendorQuotationDraft[]): VendorQuotationDraft[] {
  const map = new Map<string, VendorQuotationDraft>();
  for (const row of rows) {
    if (!row.vendorId) continue;
    const existing = map.get(row.vendorId);
    if (!existing) {
      map.set(row.vendorId, row);
      continue;
    }
    const selected = new Set([
      ...(existing.selectedMaterialIds || []),
      ...(row.selectedMaterialIds || []),
    ]);
    const itemRateMap = new Map(
      [...(existing.itemRates || []), ...(row.itemRates || [])].map((it) => [it.materialId, it])
    );
    map.set(row.vendorId, {
      ...existing,
      ...row,
      selectedMaterialIds: Array.from(selected),
      itemRates: Array.from(itemRateMap.values()),
    });
  }
  return Array.from(map.values());
}

export function VendorQuotationEditor({
  quotations,
  quantity: _quantity = 1,
  items = [],
  onChange,
  minRows: _minRows = 1,
}: VendorQuotationEditorProps) {
  const MAX_VENDORS = 100;
  const { data: vendors } = useQuery({
    queryKey: ['vendors-active'],
    queryFn: async () => {
      const res = await api.get<{ data: VendorDto[] }>('/vendors');
      return res.data.data ?? [];
    },
  });

  const rfqMaterialIds = useMemo(
    () => items.map((item) => String(item.materialId || '')).filter(Boolean),
    [items]
  );
  const { data: vendorsByMaterial } = useQuery({
    queryKey: ['vendors-for-materials', rfqMaterialIds.join(',')],
    queryFn: async () => {
      const res = await api.get<{
        data: Array<{ materialId: string; vendors: VendorDto[] }>;
      }>('/vendors/for-materials', {
        params: { materialIds: rfqMaterialIds.join(','), strict: 'true' },
      });
      return res.data.data ?? [];
    },
    enabled: rfqMaterialIds.length > 0,
  });
  const vendorsByMaterialId = useMemo(() => {
    const map = new Map<string, VendorDto[]>();
    for (const row of vendorsByMaterial ?? []) {
      map.set(String(row.materialId), row.vendors || []);
    }
    return map;
  }, [vendorsByMaterial]);

  const [expandedMaterialId, setExpandedMaterialId] = useState<string | null>(
    () => items[0]?.materialId ?? null
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createInitialName, setCreateInitialName] = useState('');
  const [createProductIds, setCreateProductIds] = useState<string[]>([]);

  const setQuotations = (rows: VendorQuotationDraft[]) => onChange(dedupeQuotations(rows));

  const assignedQuotations = useMemo(
    () => quotations.filter(isAssigned),
    [quotations]
  );

  const findQuotationIndex = (vendorId: string) => quotations.findIndex((q) => q.vendorId === vendorId);

  const buildVendorRow = (vendorId: string, vendorName?: string): VendorQuotationDraft => {
    const vendor = vendors?.find((v) => v.id === vendorId);
    return {
      vendorId,
      vendorName: vendorName || vendor?.name,
      rate: 0,
      gstPercent: DEFAULT_GST_PERCENT,
      paymentTerms: '100% payment within 30 days from the date of supply',
      deliveryTerms: 'Delivery as per project schedule',
      transportation: '',
      deliveryTime: '',
      make: '',
      selectedMaterialIds: [],
      itemRates: items.map((it) => ({
        materialId: it.materialId,
        rate: 0,
        gstPercent: DEFAULT_GST_PERCENT,
      })),
    };
  };

  const updateVendor = (vendorId: string, patch: Partial<VendorQuotationDraft>) => {
    const rowIndex = findQuotationIndex(vendorId);
    if (rowIndex < 0) return;
    const next = quotations.map((q, i) => (i === rowIndex ? { ...q, ...patch } : q));
    setQuotations(next);
  };

  const removeVendor = (vendorId: string) => {
    setQuotations(quotations.filter((q) => q.vendorId !== vendorId));
  };

  const toggleProductVendor = (materialId: string, vendorId: string, checked: boolean, vendorName?: string) => {
    if (checked) {
      const rowIndex = findQuotationIndex(vendorId);
      if (rowIndex < 0 && assignedQuotations.length >= MAX_VENDORS) {
        toast.error(`Maximum ${MAX_VENDORS} vendors allowed on an RFQ`);
        return;
      }
      const base = rowIndex >= 0 ? quotations[rowIndex] : buildVendorRow(vendorId, vendorName);
      const selected = new Set(base.selectedMaterialIds || []);
      selected.add(materialId);
      const next =
        rowIndex >= 0
          ? quotations.map((q, i) =>
              i === rowIndex ? { ...q, selectedMaterialIds: Array.from(selected) } : q
            )
          : [...quotations, { ...base, selectedMaterialIds: Array.from(selected) }];
      setQuotations(next);
      return;
    }

    const rowIndex = findQuotationIndex(vendorId);
    if (rowIndex < 0) return;

    const row = quotations[rowIndex];
    const selected = new Set(row.selectedMaterialIds || []);
    selected.delete(materialId);
    const remaining = Array.from(selected);

    if (remaining.length === 0) {
      setQuotations(quotations.filter((_, i) => i !== rowIndex));
      return;
    }

    setQuotations(
      quotations.map((q, i) => (i === rowIndex ? { ...q, selectedMaterialIds: remaining } : q))
    );
  };

  const assignVendorToProducts = (
    vendorId: string,
    vendorName: string,
    materialIds: string[]
  ) => {
    if (!materialIds.length) return;
    const rowIndex = findQuotationIndex(vendorId);
    if (rowIndex < 0 && assignedQuotations.length >= MAX_VENDORS) {
      toast.error(`Maximum ${MAX_VENDORS} vendors allowed on an RFQ`);
      return;
    }
    const base = rowIndex >= 0 ? quotations[rowIndex] : buildVendorRow(vendorId, vendorName);
    const selected = new Set([...(base.selectedMaterialIds || []), ...materialIds]);
    const next =
      rowIndex >= 0
        ? quotations.map((q, i) =>
            i === rowIndex
              ? { ...q, vendorName: vendorName || q.vendorName, selectedMaterialIds: Array.from(selected) }
              : q
          )
        : [
            ...quotations,
            {
              ...base,
              vendorName,
              selectedMaterialIds: Array.from(selected),
            },
          ];
    setQuotations(next);
  };

  const openCreateVendor = (preselectMaterialId?: string, name = '') => {
    const defaults =
      preselectMaterialId
        ? [preselectMaterialId]
        : items.length === 1
          ? [items[0].materialId]
          : items.map((it) => it.materialId);
    setCreateInitialName(name);
    setCreateProductIds(defaults);
    setCreateOpen(true);
  };

  const handleVendorCreated = (vendor: VendorDto) => {
    if (!vendor?.id) return;
    const rfqIds = items.map((it) => String(it.materialId || '')).filter(Boolean);
    const fromContext = createProductIds.map(String).filter((id) => rfqIds.includes(id));
    const assignedIds = fromContext.length ? fromContext : rfqIds;
    if (!assignedIds.length) {
      toast.error('Vendor saved, but this RFQ has no products to assign');
      return;
    }
    assignVendorToProducts(vendor.id, vendor.name, assignedIds);
  };

  return (
    <div className="space-y-2">
      {!!items.length && (
        <div className="panel p-2 space-y-3 !overflow-visible">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-ink-muted">Product-wise vendor assignment</p>
              <p className="text-[11px] text-ink-secondary mt-0.5">
                                Search inside the dropdown — only vendors who have this product in Materials supplied.
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={() => openCreateVendor()}>
              <Plus className="h-3.5 w-3.5" />
              Add vendor
            </Button>
          </div>
          {items.map((item) => {
            const isExpanded = expandedMaterialId === item.materialId;
            const assignedForProduct = assignedQuotations.filter((q) =>
              q.selectedMaterialIds?.map(String).includes(String(item.materialId))
            );
            const assignedIds = new Set(assignedForProduct.map((q) => q.vendorId));
            const productVendorOptions = (vendorsByMaterialId.get(String(item.materialId)) ?? [])
              .filter((vendor) => !assignedIds.has(vendor.id))
              .map((vendor) => ({
                id: vendor.id,
                label: vendor.name,
                sublabel: [vendor.code, vendor.gstNumber, vendor.phone].filter(Boolean).join(' · '),
              }))
              .sort((a, b) => a.label.localeCompare(b.label));
            const assignedNames = assignedForProduct.map((q) => q.vendorName || q.vendorId);
            return (
              <div key={item.materialId} className="border border-surface-border rounded-lg overflow-visible">
                <button
                  type="button"
                  className={cn(
                    'w-full bg-surface-muted/40 px-2.5 py-2 flex flex-wrap items-center justify-between gap-2 text-left hover:bg-surface-muted/60 transition-colors',
                    isExpanded && 'bg-bekem-accent/5 border-b border-surface-border'
                  )}
                  onClick={() =>
                    setExpandedMaterialId((prev) =>
                      prev === item.materialId ? null : item.materialId
                    )
                  }
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
                    )}
                    <span className="text-xs font-semibold text-ink truncate">{item.name}</span>
                  </span>
                  <p className="text-[11px] text-ink-secondary tabular-nums">
                    Qty {item.quantity} · {item.unit}
                    {assignedNames.length ? (
                      <span className="text-bekem-accent font-medium"> · {assignedNames.join(', ')}</span>
                    ) : (
                      <span className="text-amber-700 font-medium"> · No vendor selected</span>
                    )}
                  </p>
                </button>
                {isExpanded && (
                  <div className="px-2.5 py-3 space-y-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex-1 min-w-[240px] max-w-lg space-y-1">
                        <span className="text-[10px] font-medium text-ink-muted">
                          Vendors who supply this product
                        </span>
                        <SearchSelect
                          key={`${item.materialId}-${assignedIds.size}`}
                          value={null}
                          options={productVendorOptions}
                          placeholder={
                            productVendorOptions.length
                              ? 'Search and select a vendor…'
                              : 'No vendors supply this product'
                          }
                          emptyMessage="No matching vendor supplies this product"
                          disabled={!productVendorOptions.length}
                          compact
                          onChange={(vendorId, option) => {
                            if (!vendorId) return;
                            toggleProductVendor(item.materialId, vendorId, true, option.label);
                          }}
                        />
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openCreateVendor(item.materialId)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add vendor
                      </Button>
                    </div>

                    {assignedForProduct.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {assignedForProduct.map((q) => (
                          <span
                            key={q.vendorId}
                            className="inline-flex items-center gap-1 max-w-full rounded-md border border-bekem-accent/25 bg-bekem-accent/5 px-2 py-1 text-[11px] font-medium text-ink"
                          >
                            <span className="truncate">{q.vendorName || q.vendorId}</span>
                            <button
                              type="button"
                              className="shrink-0 rounded p-0.5 text-ink-muted hover:text-danger hover:bg-danger/10"
                              onClick={() => toggleProductVendor(item.materialId, q.vendorId, false)}
                              aria-label={`Remove ${q.vendorName || q.vendorId}`}
                              title="Remove"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-ink-muted">
                        {productVendorOptions.length
                          ? 'Open the dropdown to search vendors who supply this product.'
                          : 'No vendors have this product in Materials supplied. Add a vendor to assign one.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="panel">
        <div className="px-2.5 py-2 border-b border-surface-border bg-surface-muted/30">
          <p className="text-xs font-semibold text-ink-muted">Assigned vendor quotations</p>
          <p className="text-[11px] text-ink-secondary">
            {assignedQuotations.length
              ? `${assignedQuotations.length} vendor RFQ(s) — tick product checkboxes to assign — scroll sideways if needed`
              : 'Vendors you add or select above appear here as columns'}
          </p>
        </div>
        {assignedQuotations.length ? (
          <div className="procurement-landscape-scroll">
            <table className="data-table">
              <thead>
                <tr className="bg-surface-muted/40">
                  <th className="sticky left-0 z-[1] bg-slate-100 min-w-[120px]">Metric</th>
                  {assignedQuotations.map((row, index) => (
                    <th key={row.vendorId} className="min-w-[160px]">
                      <span className="block">Vendor {index + 1}</span>
                      <span className="block font-normal text-[10px] truncate max-w-[180px] normal-case tracking-normal">
                        {row.vendorName || row.vendorId}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="sticky left-0 z-[1] bg-white font-medium text-ink-secondary whitespace-nowrap align-top pt-2.5">
                    Products
                  </td>
                  {assignedQuotations.map((row) => (
                    <td key={row.vendorId} className="align-top">
                      <div className="flex flex-col gap-1.5 py-1">
                        {items.map((item) => {
                          const checked = row.selectedMaterialIds?.includes(item.materialId) ?? false;
                          return (
                            <label
                              key={item.materialId}
                              className="inline-flex items-start gap-1.5 text-[11px] text-ink cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                                checked={checked}
                                onChange={(e) =>
                                  toggleProductVendor(item.materialId, row.vendorId, e.target.checked)
                                }
                              />
                              <span className="leading-snug">{item.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 z-[1] bg-white font-medium text-ink-secondary whitespace-nowrap">
                    Payment Terms
                  </td>
                  {assignedQuotations.map((row) => (
                    <td key={row.vendorId}>
                      <Input
                        className="input-compact"
                        value={row.paymentTerms}
                        onChange={(e) => updateVendor(row.vendorId, { paymentTerms: e.target.value })}
                        placeholder="e.g. Net 30"
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 z-[1] bg-white font-medium text-ink-secondary whitespace-nowrap">
                    Transportation
                  </td>
                  {assignedQuotations.map((row) => (
                    <td key={row.vendorId}>
                      <Input
                        className="input-compact"
                        value={row.transportation || ''}
                        onChange={(e) =>
                          updateVendor(row.vendorId, { transportation: e.target.value })
                        }
                        placeholder="e.g. Extra / Included"
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 z-[1] bg-white font-medium text-ink-secondary whitespace-nowrap">
                    Delivery Time
                  </td>
                  {assignedQuotations.map((row) => (
                    <td key={row.vendorId}>
                      <Input
                        className="input-compact"
                        value={row.deliveryTime || row.deliveryTerms || ''}
                        onChange={(e) =>
                          updateVendor(row.vendorId, {
                            deliveryTime: e.target.value,
                            deliveryTerms: e.target.value,
                          })
                        }
                        placeholder="e.g. 7–10 days"
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 z-[1] bg-white font-medium text-ink-secondary whitespace-nowrap">
                    Make
                  </td>
                  {assignedQuotations.map((row) => (
                    <td key={row.vendorId}>
                      <Input
                        className="input-compact"
                        value={row.make || ''}
                        onChange={(e) => updateVendor(row.vendorId, { make: e.target.value })}
                        placeholder="Brand / make"
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 z-[1] bg-white font-medium text-ink-secondary whitespace-nowrap">
                    Actions
                  </td>
                  {assignedQuotations.map((row) => (
                    <td key={row.vendorId} className="text-center">
                      <button
                        type="button"
                        onClick={() => removeVendor(row.vendorId)}
                        className="inline-flex items-center gap-0.5 text-[10px] font-medium text-danger hover:text-danger/80 px-1.5 py-1 rounded border border-danger/30 hover:bg-danger/5"
                        aria-label="Remove vendor"
                        title="Remove from all products"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-sm text-ink-muted py-6 px-3">
            No vendors assigned yet. Select an existing vendor from the product dropdown, or add a vendor.
          </p>
        )}
      </div>

      <VendorFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        initialName={createInitialName}
        initialMaterialIds={createProductIds}
        onSaved={handleVendorCreated}
      />
    </div>
  );
}
