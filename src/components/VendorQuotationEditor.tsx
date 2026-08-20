import { ChevronDown, ChevronRight, Plus, Search, Trash2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DEFAULT_GST_PERCENT, MATERIAL_CATEGORY_NAMES } from '@afios/shared';
import type { CreateVendorDto, MaterialCategoryDto, VendorDto } from '@afios/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
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

const emptyVendorForm = (): CreateVendorDto => ({
  name: '',
  isMsme: false,
  gstNumber: '',
  panNumber: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  bankName: '',
  bankAccountNumber: '',
  ifscCode: '',
  category: '',
  suppliedCategories: [],
  materialIds: [],
});

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
  const queryClient = useQueryClient();
  const { data: vendors } = useQuery({
    queryKey: ['vendors-active'],
    queryFn: async () => {
      const res = await api.get<{ data: VendorDto[] }>('/vendors');
      return res.data.data ?? [];
    },
  });

  const { data: materialCategories } = useQuery({
    queryKey: ['material-categories'],
    queryFn: async () => {
      const res = await api.get<{ data: MaterialCategoryDto[] }>('/material-categories');
      return res.data.data ?? [];
    },
  });

  const categoryOptions = useMemo(() => {
    const names = (materialCategories ?? [])
      .map((c) => c.name)
      .filter((name): name is string => !!name?.trim());
    return names.length ? names : [...MATERIAL_CATEGORY_NAMES];
  }, [materialCategories]);

  const [productVendorSearch, setProductVendorSearch] = useState<Record<string, string>>({});
  const [searchFocusedMaterialId, setSearchFocusedMaterialId] = useState<string | null>(null);
  const [expandedMaterialId, setExpandedMaterialId] = useState<string | null>(
    () => items[0]?.materialId ?? null
  );
  const searchBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateVendorDto>(emptyVendorForm);
  const [createProductIds, setCreateProductIds] = useState<string[]>([]);

  const setQuotations = (rows: VendorQuotationDraft[]) => onChange(dedupeQuotations(rows));

  const assignedQuotations = useMemo(
    () => quotations.filter(isAssigned),
    [quotations]
  );

  const allVendorOptions = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; code?: string; gstNumber?: string; phone?: string }
    >();
    for (const v of vendors ?? []) {
      map.set(v.id, {
        id: v.id,
        name: v.name,
        code: v.code,
        gstNumber: v.gstNumber,
        phone: v.phone,
      });
    }
    for (const q of assignedQuotations) {
      if (q.vendorId && !map.has(q.vendorId)) {
        map.set(q.vendorId, { id: q.vendorId, name: q.vendorName || q.vendorId });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [vendors, assignedQuotations]);

  const vendorMaterialIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const vendor of vendors ?? []) {
      map.set(vendor.id, new Set((vendor.materialIds || []).map(String)));
    }
    return map;
  }, [vendors]);

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

  const openCreateVendor = (preselectMaterialId?: string) => {
    const defaults =
      preselectMaterialId
        ? [preselectMaterialId]
        : items.length === 1
          ? [items[0].materialId]
          : items.map((it) => it.materialId);
    setCreateForm(emptyVendorForm());
    setCreateProductIds(defaults);
    setCreateOpen(true);
  };

  const createVendor = useMutation({
    mutationFn: async () => {
      const payload: CreateVendorDto = {
        ...createForm,
        name: createForm.name.trim(),
        panNumber: createForm.panNumber?.trim() || '',
        contactPerson: createForm.contactPerson?.trim() || '',
        phone: createForm.phone?.trim() || '',
        bankName: createForm.bankName?.trim() || '',
        bankAccountNumber: createForm.bankAccountNumber?.trim() || '',
        ifscCode: createForm.ifscCode?.trim() || '',
        gstNumber: createForm.gstNumber?.trim() || '',
        category: createForm.category?.trim() || '',
        suppliedCategories: createForm.category?.trim()
          ? [createForm.category.trim()]
          : [],
        materialIds: createProductIds,
      };
      const res = await api.post<{ data: VendorDto }>('/vendors', payload);
      return res.data.data;
    },
    onSuccess: (vendor) => {
      queryClient.invalidateQueries({ queryKey: ['vendors-active'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      assignVendorToProducts(vendor.id, vendor.name, createProductIds);
      setCreateOpen(false);
      setCreateForm(emptyVendorForm());
      toast.success(
        vendor.authorizationStatus === 'PENDING'
          ? `${vendor.name} created (pending authorization) and assigned to RFQ`
          : `${vendor.name} created and assigned to RFQ`
      );
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Failed to create vendor');
    },
  });

  const canCreate =
    !!createForm.name?.trim() &&
    !!createForm.panNumber?.trim() &&
    !!createForm.contactPerson?.trim() &&
    !!createForm.phone?.trim() &&
    !!createForm.bankName?.trim() &&
    !!createForm.bankAccountNumber?.trim() &&
    !!createForm.ifscCode?.trim() &&
    !!createForm.category?.trim() &&
    createProductIds.length > 0;

  return (
    <div className="space-y-2">
      {!!items.length && (
        <div className="panel p-2 space-y-3 !overflow-visible">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-ink-muted">Product-wise vendor assignment</p>
              <p className="text-[11px] text-ink-secondary mt-0.5">
                Search and select vendors, or create a new vendor. Assign 1–100 vendors (3+ recommended).
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={() => openCreateVendor()}>
              <Plus className="h-3.5 w-3.5" />
              Create new vendor
            </Button>
          </div>
          {items.map((item) => {
            const isExpanded = expandedMaterialId === item.materialId;
            const searchRaw = productVendorSearch[item.materialId] || '';
            const searchQuery = searchRaw.trim().toLowerCase();
            const assignedForProduct = assignedQuotations.filter((q) =>
              q.selectedMaterialIds?.includes(item.materialId)
            );
            const assignedIds = new Set(assignedForProduct.map((q) => q.vendorId));
            const filteredVendors = allVendorOptions.filter((vendor) => {
              if (assignedIds.has(vendor.id)) return false;
              const mappedMaterialIds = vendorMaterialIds.get(vendor.id);
              if (!mappedMaterialIds?.has(item.materialId)) return false;
              if (!searchQuery) return false;
              const haystack = [
                vendor.name,
                vendor.code,
                vendor.gstNumber,
                vendor.phone,
              ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
              return haystack.includes(searchQuery);
            });
            const showSuggestions =
              searchFocusedMaterialId === item.materialId && searchQuery.length > 0;
            const mappedVendorCount = allVendorOptions.filter((vendor) =>
              vendorMaterialIds.get(vendor.id)?.has(item.materialId)
            ).length;
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
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[200px] max-w-md">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none z-[1]" />
                        <Input
                          className="input-compact pl-7"
                          placeholder="Search vendors to assign…"
                          value={searchRaw}
                          onChange={(e) =>
                            setProductVendorSearch((prev) => ({
                              ...prev,
                              [item.materialId]: e.target.value,
                            }))
                          }
                          onFocus={() => {
                            if (searchBlurTimer.current) clearTimeout(searchBlurTimer.current);
                            setSearchFocusedMaterialId(item.materialId);
                          }}
                          onBlur={() => {
                            searchBlurTimer.current = setTimeout(() => {
                              setSearchFocusedMaterialId((prev) =>
                                prev === item.materialId ? null : prev
                              );
                            }, 150);
                          }}
                          aria-label={`Search vendors for ${item.name}`}
                          aria-autocomplete="list"
                        />
                        {showSuggestions && (
                          <div
                            className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border border-surface-border bg-white shadow-lg"
                            role="listbox"
                          >
                            <div className="px-2.5 py-1.5 border-b border-surface-border bg-surface-muted/40">
                              <p className="text-[10px] font-medium text-ink-muted">
                                {filteredVendors.length
                                  ? `${filteredVendors.length} vendor${filteredVendors.length === 1 ? '' : 's'} — scroll to see all`
                                  : mappedVendorCount
                                    ? 'No matching vendor for this product search'
                                    : 'No vendors mapped to this product yet'}
                              </p>
                            </div>
                            <ul className="max-h-[min(22rem,50vh)] overflow-y-auto overscroll-contain">
                              {filteredVendors.length ? (
                                filteredVendors.map((vendor) => (
                                  <li key={vendor.id} role="option">
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 hover:bg-bekem-accent/5 transition-colors border-b border-surface-border/60 last:border-b-0"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => {
                                        toggleProductVendor(
                                          item.materialId,
                                          vendor.id,
                                          true,
                                          vendor.name
                                        );
                                        setProductVendorSearch((prev) => ({
                                          ...prev,
                                          [item.materialId]: '',
                                        }));
                                        setSearchFocusedMaterialId(null);
                                      }}
                                    >
                                      <span className="block text-xs font-medium text-ink">
                                        {vendor.name}
                                      </span>
                                      {(vendor.code || vendor.gstNumber || vendor.phone) && (
                                        <span className="block text-[10px] text-ink-muted mt-0.5">
                                          {[vendor.code, vendor.gstNumber, vendor.phone]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        </span>
                                      )}
                                    </button>
                                  </li>
                                ))
                              ) : (
                                <li className="px-3 py-2.5 space-y-2">
                                  <p className="text-xs text-ink-muted">
                                    No vendors match “{searchRaw.trim()}”
                                  </p>
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-bekem-accent hover:underline"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      setCreateForm({
                                        ...emptyVendorForm(),
                                        name: searchRaw.trim(),
                                      });
                                      setCreateProductIds([item.materialId]);
                                      setCreateOpen(true);
                                      setSearchFocusedMaterialId(null);
                                    }}
                                  >
                                    Create “{searchRaw.trim()}” as new vendor
                                  </button>
                                </li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openCreateVendor(item.materialId)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        New vendor
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
                        Type a vendor name and select, or create a new vendor for this product.
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
              : 'Assign vendors to products above — they will appear here as columns'}
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
            No vendors assigned yet. Search a vendor or create a new one above.
          </p>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => !createVendor.isPending && setCreateOpen(false)}
        title="Create new vendor"
        subtitle="Vendor is created and assigned to selected RFQ products"
        className="max-w-xl"
      >
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block sm:col-span-2">
              <span className="text-[11px] font-medium text-ink-secondary">Vendor name *</span>
              <Input
                className="input-compact mt-0.5"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Supplier name"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-[11px] font-medium text-ink-secondary">Category *</span>
              <select
                className="input-compact mt-0.5 flex h-7 w-full rounded border border-surface-border bg-white px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-bekem-navy/15 focus:border-bekem-navy/30"
                value={createForm.category || ''}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    category: e.target.value,
                    suppliedCategories: e.target.value ? [e.target.value] : [],
                  }))
                }
                aria-label="Vendor category"
              >
                <option value="">Select category…</option>
                {categoryOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-ink-secondary">GST number</span>
              <Input
                className="input-compact mt-0.5"
                value={createForm.gstNumber || ''}
                onChange={(e) => setCreateForm((f) => ({ ...f, gstNumber: e.target.value }))}
                placeholder="GSTIN"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-ink-secondary">PAN *</span>
              <Input
                className="input-compact mt-0.5"
                value={createForm.panNumber || ''}
                onChange={(e) => setCreateForm((f) => ({ ...f, panNumber: e.target.value }))}
                placeholder="PAN"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-ink-secondary">Contact person *</span>
              <Input
                className="input-compact mt-0.5"
                value={createForm.contactPerson || ''}
                onChange={(e) => setCreateForm((f) => ({ ...f, contactPerson: e.target.value }))}
                placeholder="Name"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-ink-secondary">Phone *</span>
              <Input
                className="input-compact mt-0.5"
                value={createForm.phone || ''}
                onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Mobile"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-ink-secondary">Bank name *</span>
              <Input
                className="input-compact mt-0.5"
                value={createForm.bankName || ''}
                onChange={(e) => setCreateForm((f) => ({ ...f, bankName: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-ink-secondary">Account number *</span>
              <Input
                className="input-compact mt-0.5"
                value={createForm.bankAccountNumber || ''}
                onChange={(e) => setCreateForm((f) => ({ ...f, bankAccountNumber: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-ink-secondary">IFSC *</span>
              <Input
                className="input-compact mt-0.5"
                value={createForm.ifscCode || ''}
                onChange={(e) => setCreateForm((f) => ({ ...f, ifscCode: e.target.value }))}
              />
            </label>
            <label className="inline-flex items-center gap-2 sm:col-span-2 pt-1">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={!!createForm.isMsme}
                onChange={(e) => setCreateForm((f) => ({ ...f, isMsme: e.target.checked }))}
              />
              <span className="text-xs text-ink">MSME registered vendor</span>
            </label>
          </div>

          {!!items.length && (
            <div className="rounded-md border border-surface-border bg-surface-muted/30 p-2.5">
              <p className="text-[11px] font-semibold text-ink-muted mb-1.5">
                Assign products in this RFQ *
              </p>
              <div className="flex flex-col gap-1.5">
                {items.map((item) => {
                  const checked = createProductIds.includes(item.materialId);
                  return (
                    <label
                      key={item.materialId}
                      className="inline-flex items-start gap-2 text-xs text-ink cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        checked={checked}
                        onChange={(e) => {
                          setCreateProductIds((prev) =>
                            e.target.checked
                              ? [...prev, item.materialId]
                              : prev.filter((id) => id !== item.materialId)
                          );
                        }}
                      />
                      <span>
                        {item.name}
                        <span className="text-ink-muted">
                          {' '}
                          · Qty {item.quantity} {item.unit}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1 pb-1">
            <Button
              type="button"
              variant="ghost"
              disabled={createVendor.isPending}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!canCreate || createVendor.isPending}
              onClick={() => createVendor.mutate()}
            >
              {createVendor.isPending ? 'Creating…' : 'Create & assign'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
