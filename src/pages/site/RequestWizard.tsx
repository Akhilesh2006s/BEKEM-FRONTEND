import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Search, Package, Building2, MapPin, ChevronRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  ROLE_COLORS,
  UserRole,
  formatCurrency,
  MATERIAL_CATEGORY_NAMES,
  MATERIAL_CATEGORY_OTHERS,
  INDENT_REQUEST_TYPES,
  INDENT_REQUEST_TYPE_LABELS,
  INDENT_VALUE_CAP_INR,
  INDENT_CAP_REACHED_MESSAGE,
  computeIndentRunningTotal,
  computeIndentLineTotal,
  hasMaterialUnitPrice,
  isMaterialOverBelowCap,
  resolveMaterialUnitPrice,
  formatProjectLabel,
  type IndentRequestType,
  type MaterialDto,
  type CreateIndentDto,
  type CreateSiteMaterialDto,
  type SiteDto,
} from '@afios/shared';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SuccessScreen } from '@/components/SuccessScreen';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { QuantityStepper } from '@/components/QuantityStepper';
import { cn } from '@/lib/utils';
import { groupMaterialsByCategory } from '@/lib/groupMaterialsByCategory';
import { IndentCategorySelect } from '@/components/IndentCategorySelect';

interface LineDraft {
  material: MaterialDto;
  quantity: number;
  unit: string;
  location: string;
  requiredByDate: string;
}

const MATERIAL_CATEGORIES = MATERIAL_CATEGORY_NAMES;

function unitPriceSuffix(unit: string) {
  if (!unit) return '';
  if (unit.length > 1 && unit.endsWith('s')) return unit.slice(0, -1);
  return unit;
}

export function RequestWizardPage() {
  const submitLockRef = useRef(false);
  const submissionKeyRef = useRef(crypto.randomUUID());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user)!;
  const role = user.role as UserRole;
  const isStore = role === UserRole.STORE_INCHARGE;
  const accent = ROLE_COLORS[isStore ? UserRole.STORE_INCHARGE : UserRole.SITE_INCHARGE].primary;
  const homePath = isStore ? '/store' : '/site';
  const roleLabel = isStore ? 'Store Incharge' : 'New indent';
  const isSiteIncharge = role === UserRole.SITE_INCHARGE;
  const [step, setStep] = useState<'project' | 'materials'>(isSiteIncharge ? 'materials' : 'project');
  const [indentRequestType, setIndentRequestType] = useState<IndentRequestType | ''>('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [pickQty, setPickQty] = useState(0);
  const [pickUnit, setPickUnit] = useState('Nos');
  const [pickLocation, setPickLocation] = useState('');
  const [pickRequiredByDate, setPickRequiredByDate] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialDto | null>(null);
  const [customName, setCustomName] = useState('');
  const [customUnit, setCustomUnit] = useState('Nos');
  const [customCategory, setCustomCategory] = useState<(typeof MATERIAL_CATEGORIES)[number]>('Civil Materials');
  const [customCategoryRemarks, setCustomCategoryRemarks] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customQty, setCustomQty] = useState(0);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [success, setSuccess] = useState(false);
  const [indentNumber, setIndentNumber] = useState('');
  const [purpose, setPurpose] = useState('');
  const [requestedByName, setRequestedByName] = useState('');
  const [indentCategoryId, setIndentCategoryId] = useState('');

  const hasRequesterName = Boolean(requestedByName.trim());
  const hasIndentCategory = Boolean(indentCategoryId);

  const { data: sites, isLoading: sitesLoading } = useQuery({
    queryKey: ['indent-sites'],
    queryFn: async () => {
      const res = await api.get<{ data: SiteDto[] }>('/sites');
      return res.data.data;
    },
  });

  useEffect(() => {
    if (!sites?.length) return;
    if (!selectedSiteId) {
      setSelectedSiteId(sites[0].id);
    }
    if (isSiteIncharge || sites.length === 1) {
      setStep('materials');
    }
  }, [sites, selectedSiteId, isSiteIncharge]);

  const selectedSite = sites?.find((s) => s.id === selectedSiteId);

  const { data: materials, isLoading } = useQuery({
    queryKey: ['materials', search.trim().toLowerCase()],
    queryFn: async () => {
      const res = await api.get<{ data: MaterialDto[] }>('/materials', {
        params: { search: search.trim() || undefined },
      });
      const rows = res.data.data ?? [];
      const term = search.trim().toLowerCase();
      if (!term) return rows;
      // Only name / code / grade — do not keep description/category hits in the list.
      return rows
        .filter((m) => {
          const name = String(m.name || '').toLowerCase();
          const code = String(m.code || '').toLowerCase();
          const grade = String(m.grade || '').toLowerCase();
          return name.includes(term) || code.includes(term) || grade.includes(term);
        })
        .sort((a, b) => {
          const score = (m: MaterialDto) => {
            const name = String(m.name || '').toLowerCase();
            const code = String(m.code || '').toLowerCase();
            if (name === term || code === term) return 0;
            if (name.startsWith(term) || code.startsWith(term)) return 1;
            if (name.includes(term) || code.includes(term)) return 2;
            return 3;
          };
          return score(a) - score(b);
        });
    },
    enabled: step === 'materials',
  });

  const groupedMaterials = useMemo(
    () => groupMaterialsByCategory(materials ?? [], [...MATERIAL_CATEGORIES]),
    [materials]
  );

  const runningTotal = useMemo(() => computeIndentRunningTotal(lines), [lines]);
  const showPricing = indentRequestType === 'BELOW_5000';
  const enforceBelowCap = indentRequestType === 'BELOW_5000';
  const atCap = enforceBelowCap && runningTotal >= INDENT_VALUE_CAP_INR;
  const canAddMaterials = hasRequesterName && hasIndentCategory && Boolean(indentRequestType) && !atCap;
  const belowCapInvalid = enforceBelowCap && runningTotal >= INDENT_VALUE_CAP_INR;

  const projectedTotal = (
    nextLines: LineDraft[]
  ) => computeIndentRunningTotal(nextLines);

  const wouldExceedCap = (nextLines: LineDraft[]) =>
    indentRequestType === 'BELOW_5000' && projectedTotal(nextLines) >= INDENT_VALUE_CAP_INR;

  const mutation = useMutation({
    mutationFn: async (data: CreateIndentDto) => {
      const res = await api.post<{ data: { indentNumber: string } }>('/material-requests', data, {
        headers: { 'Idempotency-Key': submissionKeyRef.current },
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      setIndentNumber(data.indentNumber);
      setSuccess(true);
    },
    onError: () => {
      submitLockRef.current = false;
      toast.error('Failed to submit indent');
    },
  });

  const createSiteMaterial = useMutation({
    mutationFn: async (payload: CreateSiteMaterialDto) => {
      const res = await api.post<{ data: MaterialDto; meta: { created: boolean; reused: boolean } }>(
        '/materials/site-request',
        payload
      );
      return res.data;
    },
  });

  const addLine = (
    material: MaterialDto,
    qty = pickQty,
    unit = pickUnit,
    location = pickLocation,
    requiredByDate = pickRequiredByDate
  ) => {
    if (qty <= 0) {
      toast.error('Enter quantity');
      return;
    }
    if (!location.trim()) {
      toast.error('Enter location');
      return;
    }
    if (!requiredByDate) {
      toast.error('Select required by date');
      return;
    }
    if (!requestedByName.trim()) {
      toast.error('Enter requested by name first');
      return;
    }
    if (!indentRequestType) {
      toast.error('Select indent request type first');
      return;
    }
    if (indentRequestType === 'BELOW_5000' && !hasMaterialUnitPrice(material)) {
      toast.error('Price not available for this item. Ask HQ to set a reference rate, or use Above ₹5,000.');
      return;
    }
    if (indentRequestType === 'BELOW_5000' && isMaterialOverBelowCap(material)) {
      toast.error('This item costs ₹5,000 or more. Use an Above ₹5,000 indent request.');
      return;
    }
    const lineUnit = (unit || material.unit || 'Nos').trim() || 'Nos';
    const newLine: LineDraft = {
      material,
      quantity: qty,
      unit: lineUnit,
      location: location.trim(),
      requiredByDate,
    };
    const withoutSame = lines.filter((l) => l.material.id !== material.id);
    const next = [...withoutSame, newLine];
    if (wouldExceedCap(next)) {
      toast.error('This would exceed the ₹5,000 limit for Below ₹5,000 indents');
      return;
    }
    setLines(next);
    setSelectedMaterial(null);
    setPickQty(0);
    setPickUnit('Nos');
    setPickLocation('');
    setPickRequiredByDate('');
    setSearch('');
  };

  const addCustomLine = async () => {
    const name = customName.trim();
    if (!name) {
      toast.error('Enter the material name');
      return;
    }
    if (customQty <= 0) return;
    if (customCategory === MATERIAL_CATEGORY_OTHERS && !customCategoryRemarks.trim()) {
      toast.error('Remarks are required when category is Others');
      return;
    }
    const unit = customUnit.trim() || 'Nos';

    try {
      const { data: material, meta } = await createSiteMaterial.mutateAsync({
        name,
        unit,
        category: customCategory,
        categoryRemarks:
          customCategory === MATERIAL_CATEGORY_OTHERS ? customCategoryRemarks.trim() : undefined,
        description: customDescription.trim() || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ['materials'] });
      setSelectedMaterial(material);
      setPickQty(customQty);
      setPickUnit(unit);
      setCustomName('');
      setCustomUnit('Nos');
      setCustomCategory('Civil Materials');
      setCustomCategoryRemarks('');
      setCustomDescription('');
      setCustomQty(0);
      setShowCustomForm(false);
      toast.success(
        meta.reused
          ? `“${name}” already in catalog — enter qty, location & date below`
          : `“${name}” saved to Material Master — enter qty, location & date below`
      );
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Could not save material');
    }
  };

  const updateLineQty = (materialId: string, quantity: number) => {
    if (quantity <= 0) {
      setLines((prev) =>
        prev.map((l) => (l.material.id === materialId ? { ...l, quantity: 0 } : l))
      );
      return;
    }
    setLines((prev) => {
      const next = prev.map((l) => (l.material.id === materialId ? { ...l, quantity } : l));
      if (wouldExceedCap(next)) {
        toast.error('Quantity would exceed the ₹5,000 limit');
        return prev;
      }
      return next;
    });
  };

  const updateLineUnit = (materialId: string, unit: string) => {
    setLines((prev) =>
      prev.map((l) => (l.material.id === materialId ? { ...l, unit } : l))
    );
  };

  const updateLineField = (
    materialId: string,
    patch: Partial<Pick<LineDraft, 'location' | 'requiredByDate' | 'quantity' | 'unit'>>
  ) => {
    setLines((prev) =>
      prev.map((l) => (l.material.id === materialId ? { ...l, ...patch } : l))
    );
  };

  const removeLine = (materialId: string) => {
    setLines((prev) => prev.filter((l) => l.material.id !== materialId));
  };

  const isBlockedForBelowCap = (material: MaterialDto) =>
    indentRequestType === 'BELOW_5000' &&
    (isMaterialOverBelowCap(material) || !hasMaterialUnitPrice(material));

  const selectMaterial = (material: MaterialDto) => {
    if (!canAddMaterials) return;
    if (isBlockedForBelowCap(material)) {
      if (isMaterialOverBelowCap(material)) {
        toast.error('This item costs ₹5,000 or more. Use an Above ₹5,000 indent request.');
      } else {
        toast.error('Price not available for this item. Ask HQ to set a reference rate, or use Above ₹5,000.');
      }
      return;
    }
    setSelectedMaterial(material);
    const inCart = lines.find((l) => l.material.id === material.id);
    setPickQty(inCart?.quantity ?? 0);
    setPickUnit(inCart?.unit || material.unit || 'Nos');
    setPickLocation(inCart?.location || '');
    setPickRequiredByDate(inCart?.requiredByDate || '');
  };

  const goBack = () => {
    if (showCustomForm) {
      setShowCustomForm(false);
      return;
    }
    if (selectedMaterial) {
      setSelectedMaterial(null);
      setPickQty(0);
      return;
    }
    if (indentRequestType) {
      setIndentRequestType('');
      setLines([]);
      setSearch('');
      return;
    }
    const canSkipProject = isSiteIncharge || (sites?.length === 1);
    if (!canSkipProject && step === 'materials') {
      setStep('project');
      return;
    }
    navigate(homePath);
  };

  if (success) {
    return (
      <SuccessScreen
        title="Indent submitted!"
        message={`${indentNumber} sent to store. You'll be notified at each step.`}
        accentColor={accent}
        primaryAction={{ label: 'Back to home', onClick: () => navigate(homePath) }}
        secondaryAction={{ label: 'View my indents', onClick: () => navigate('/incidents') }}
      />
    );
  }

  const skipProjectStep = isSiteIncharge || (sites?.length === 1);

  if (sitesLoading && (isSiteIncharge || step === 'materials')) {
    return (
      <div className="page-container max-w-full">
        <div className="h-48 rounded-3xl bg-surface-muted animate-pulse" />
      </div>
    );
  }

  if (!sites?.length && !sitesLoading) {
    return (
      <div className="page-container max-w-2xl">
        <PageHeader
          eyebrow={roleLabel}
          title="New indent"
          subtitle="Your account has no site linked for raising indents."
        />
        <EmptyState
          title="No site assigned"
          description="Your account has no project or site linked. Contact the coordinator."
        />
      </div>
    );
  }

  if (!skipProjectStep && step === 'project') {
    return (
      <div className="page-container max-w-2xl">
        <PageHeader
          eyebrow={`${roleLabel} · Step 1 of 2`}
          title="Select site"
          subtitle="Confirm which site this new indent is for before adding products."
        />

        {sitesLoading ? (
          <div className="h-48 rounded-3xl bg-surface-muted animate-pulse" />
        ) : !sites?.length ? (
          <EmptyState
            title="No site assigned"
            description="Your account has no project or site linked. Contact the coordinator."
          />
        ) : (
          <div className="space-y-3">
            {sites.map((site) => {
              const isSelected = selectedSiteId === site.id;
              return (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => setSelectedSiteId(site.id)}
                  className={cn(
                    'w-full text-left rounded-3xl border p-6 transition-all duration-200',
                    isSelected
                      ? 'border-bekem-accent bg-bekem-accent/5 shadow-md ring-2 ring-bekem-accent/20'
                      : 'border-surface-border bg-white hover:border-bekem-accent/40 hover:shadow-sm'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={cn(
                        'h-12 w-12 rounded-2xl flex items-center justify-center shrink-0',
                        isSelected ? 'bg-bekem-accent text-white' : 'bg-surface-muted text-ink-secondary'
                      )}
                    >
                      <Building2 className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {(site.project?.name || site.project?.code) && (
                        <>
                          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                            Project
                          </p>
                          <p className="text-sm font-medium text-ink mt-0.5">
                            {formatProjectLabel(site.project)}
                          </p>
                        </>
                      )}
                      <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted mt-2">
                        Site
                      </p>
                      <p className="text-lg font-semibold text-ink mt-1">{site.name}</p>
                      {site.chainageLabel && (
                        <div className="flex items-center gap-1.5 mt-3 text-sm text-ink-secondary">
                          <MapPin className="h-4 w-4 shrink-0 text-ink-muted" />
                          <span>{site.chainageLabel}</span>
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-bekem-accent text-white">
                        Selected
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

            <Button
              variant="accent"
              size="lg"
              accentColor={accent}
              className="w-full mt-2"
              disabled={!selectedSiteId}
              onClick={() => setStep('materials')}
            >
              Continue to materials
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-container max-w-full">
      <div className="flex items-start gap-2 mb-2">
        <button
          type="button"
          onClick={goBack}
          className="mt-0.5 h-9 w-9 flex items-center justify-center rounded-xl hover:bg-surface-muted text-ink-secondary"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <PageHeader
            eyebrow={skipProjectStep ? roleLabel : `${roleLabel} · Step 2 of 2`}
            title="New indent"
            subtitle={
              selectedSite
                ? `${formatProjectLabel(selectedSite.project, selectedSite.name)} · ${selectedSite.name}${
                    selectedSite.chainageLabel ? ` · ${selectedSite.chainageLabel}` : ''
                  }`
                : 'Add multiple products — each with its own quantity, location and required-by date.'
            }
          />
        </div>
      </div>

      <div className="mb-3 grid gap-3 lg:grid-cols-3">
        {(selectedSite?.project?.name || selectedSite?.project?.code) && (
          <div className="panel p-3 space-y-1">
            <p className="text-xs font-semibold text-ink">Project</p>
            <p className="text-sm font-medium text-ink">{formatProjectLabel(selectedSite?.project)}</p>
            {selectedSite?.name && (
              <p className="text-[11px] text-ink-secondary">
                {selectedSite.name}
                {selectedSite.chainageLabel ? ` · ${selectedSite.chainageLabel}` : ''}
              </p>
            )}
          </div>
        )}
        <div className="panel p-3 space-y-2">
          <label className="text-xs font-semibold text-ink">
            Requested by <span className="text-danger">*</span>
          </label>
          <Input
            value={requestedByName}
            onChange={(e) => setRequestedByName(e.target.value)}
            placeholder="Enter requester name"
            className="text-sm"
          />
          {!hasRequesterName && (
            <p className="text-[11px] text-ink-secondary">
              Enter requester name above to enable material search and catalog options below.
            </p>
          )}
        </div>

        <div className="panel p-3 space-y-2">
          <label className="text-xs font-semibold text-ink">
            Indent category <span className="text-danger">*</span>
          </label>
          <IndentCategorySelect
            value={indentCategoryId}
            onChange={setIndentCategoryId}
            disabled={!hasRequesterName}
          />
          <p className="text-[11px] text-ink-secondary">
            One category for the whole indent — routes to the assigned executive.
          </p>
        </div>

        <div className="panel p-3 space-y-2">
          <label className="text-xs font-semibold text-ink">
            Indent request type <span className="text-danger">*</span>
          </label>
          <select
            value={indentRequestType}
            disabled={!hasRequesterName || !hasIndentCategory}
            onChange={(e) => {
              const next = e.target.value as IndentRequestType | '';
              setIndentRequestType(next);
              if (next === 'BELOW_5000') {
                const blocked = lines.filter(
                  (l) => isMaterialOverBelowCap(l.material) || !hasMaterialUnitPrice(l.material)
                );
                if (blocked.length) {
                  setLines((prev) =>
                    prev.filter(
                      (l) =>
                        !isMaterialOverBelowCap(l.material) && hasMaterialUnitPrice(l.material)
                    )
                  );
                  toast.message('Removed items priced ₹5,000+ (or without price) from this indent');
                } else if (computeIndentRunningTotal(lines) >= INDENT_VALUE_CAP_INR) {
                  toast.message('Reduce items or quantities to stay under ₹5,000');
                }
                if (
                  selectedMaterial &&
                  (isMaterialOverBelowCap(selectedMaterial) || !hasMaterialUnitPrice(selectedMaterial))
                ) {
                  setSelectedMaterial(null);
                }
              }
            }}
            className="w-full h-8 rounded border border-surface-border px-2 text-xs bg-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Select type…</option>
            {INDENT_REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {INDENT_REQUEST_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {indentRequestType === 'BELOW_5000' && (
            <p className="text-[11px] text-ink-secondary">
              Below ₹5,000 — unit prices and the running total are shown below.
            </p>
          )}
          {indentRequestType === 'ABOVE_5000' && (
            <p className="text-[11px] text-ink-secondary">
              No value limit. Pricing stays hidden from site and store — visible to approvers only.
            </p>
          )}
        </div>
      </div>

      {selectedSite && (
        <div className="mb-3 rounded-2xl border border-bekem-accent/20 bg-gradient-to-r from-bekem-navy/5 to-bekem-accent/5 px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Site</p>
          <p className="font-medium text-ink-secondary">
            {selectedSite.name}
            {selectedSite.chainageLabel ? ` · ${selectedSite.chainageLabel}` : ''}
          </p>
        </div>
      )}

      <div className={cn('grid gap-3 lg:grid-cols-5 lg:items-start', !hasRequesterName && 'opacity-60')}>
        {/* Cart */}
        <aside className="lg:col-span-2 order-1 lg:order-2">
          <div className="panel p-3 lg:sticky lg:top-20 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">Your indent</h2>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-bekem-accent/10 text-bekem-accent">
                {lines.length} product{lines.length === 1 ? '' : 's'}
              </span>
            </div>

            {lines.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-surface-border bg-surface-muted/40 px-4 py-8 text-center">
                <Package className="h-8 w-8 text-ink-muted mx-auto mb-2" />
                <p className="text-sm font-medium text-ink-secondary">No products added yet</p>
                <p className="text-xs text-ink-muted mt-1">
                  Select products from catalog — each has its own qty, location and date
                </p>
              </div>
            ) : (
              <div className="max-h-[min(520px,60vh)] overflow-y-auto pr-1 space-y-3">
                {lines.map((line, idx) => (
                  <div
                    key={line.material.id}
                    className="rounded-2xl border border-surface-border bg-white p-3 space-y-3"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-ink-muted">#{idx + 1}</p>
                        <p className="font-semibold text-sm text-ink truncate">{line.material.name}</p>
                        <p className="text-xs text-ink-secondary mt-0.5">
                          {line.material.code}
                          {line.material.grade ? ` · ${line.material.grade}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(line.material.id)}
                        className="shrink-0 p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1 block">
                          Qty
                        </label>
                        <QuantityStepper
                          size="compact"
                          value={line.quantity}
                          onChange={(v) => updateLineQty(line.material.id, v)}
                          min={0}
                          unit={line.unit}
                          accentColor={accent}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1 block">
                          Unit
                        </label>
                        <Input
                          value={line.unit}
                          onChange={(e) => updateLineUnit(line.material.id, e.target.value)}
                          placeholder="Nos"
                          className="h-9 text-sm text-center"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-ink-muted mb-1 block">
                        Location <span className="text-danger">*</span>
                      </label>
                      <Input
                        value={line.location}
                        onChange={(e) =>
                          updateLineField(line.material.id, { location: e.target.value })
                        }
                        placeholder="Site location / area / chainage"
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-ink-muted mb-1 block">
                        Required by date <span className="text-danger">*</span>
                      </label>
                      <Input
                        type="date"
                        value={line.requiredByDate}
                        onChange={(e) =>
                          updateLineField(line.material.id, { requiredByDate: e.target.value })
                        }
                        className="text-sm"
                      />
                    </div>

                    {showPricing && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-dashed border-surface-border">
                        {hasMaterialUnitPrice(line.material) ? (
                          <>
                            <span className="text-ink-muted">
                              {formatCurrency(resolveMaterialUnitPrice(line.material))}
                              {line.unit ? ` / ${unitPriceSuffix(line.unit)}` : ''} × {line.quantity}
                            </span>
                            <span className="font-semibold tabular-nums text-ink">
                              {formatCurrency(
                                computeIndentLineTotal(
                                  line.quantity,
                                  resolveMaterialUnitPrice(line.material)
                                )
                              )}
                            </span>
                          </>
                        ) : (
                          <span className="text-warning">
                            Price not in master — ask HQ to set reference rate
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-surface-border space-y-3">
              <div>
                <label className="text-xs font-semibold text-ink-muted mb-1 block">
                  Reason for request <span className="text-danger">*</span>
                </label>
                <Input
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Why is this material needed? (mandatory)"
                  className="text-sm"
                />
              </div>
              {atCap && (
                <p className="text-[11px] text-warning-dark bg-warning/10 border border-warning/30 rounded px-2 py-1.5">
                  {INDENT_CAP_REACHED_MESSAGE}
                </p>
              )}
              <Button
                variant="accent"
                size="lg"
                accentColor={accent}
                className="w-full"
                disabled={
                  lines.length === 0 ||
                  lines.some(
                    (l) =>
                      l.quantity <= 0 || !l.location.trim() || !l.requiredByDate
                  ) ||
                  !purpose.trim() ||
                  !requestedByName.trim() ||
                  !indentCategoryId ||
                  !indentRequestType ||
                  belowCapInvalid ||
                  mutation.isPending
                }
                onClick={() => {
                  if (submitLockRef.current || mutation.isPending) return;
                  const first = lines[0];
                  if (!first) return;
                  submitLockRef.current = true;
                  mutation.mutate({
                    indentRequestType: indentRequestType as IndentRequestType,
                    purpose: purpose.trim(),
                    requestedByName: requestedByName.trim(),
                    indentCategoryId,
                    location: first.location.trim(),
                    requiredByDate: new Date(first.requiredByDate).toISOString(),
                    items: lines.map((l) => ({
                      materialId: l.material.id,
                      unit: l.unit || l.material.unit || 'Nos',
                      quantityRequested: l.quantity,
                      location: l.location.trim(),
                      requiredByDate: new Date(l.requiredByDate).toISOString(),
                    })),
                  });
                }}
              >
                <Plus className="h-4 w-4" />
                {mutation.isPending ? 'Submitting…' : 'Submit indent'}
              </Button>
            </div>
          </div>
        </aside>

        {/* Material picker */}
        <div className="lg:col-span-3 order-2 lg:order-1 space-y-5">
          <div className="panel p-3 space-y-3">
            <label className="text-sm font-semibold text-ink">Search materials</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by code, name, grade…"
                className="pl-10 h-11"
                disabled={!hasRequesterName}
              />
            </div>

            {selectedMaterial && (
              <div className="rounded-2xl border border-bekem-accent/30 bg-bekem-accent/5 p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-bekem-accent">
                    Selected
                  </p>
                  <p className="font-semibold text-ink mt-1">{selectedMaterial.name}</p>
                  <p className="text-xs text-ink-secondary mt-0.5">
                    {selectedMaterial.code}
                    {selectedMaterial.grade ? ` · ${selectedMaterial.grade}` : ''}
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-2.5 items-end">
                  <QuantityStepper
                    value={pickQty}
                    onChange={setPickQty}
                    min={0}
                    unit={pickUnit}
                    accentColor={accent}
                  />
                  <div>
                    <label className="text-xs font-semibold text-ink-muted mb-1 block">Unit</label>
                    <Input
                      value={pickUnit}
                      onChange={(e) => setPickUnit(e.target.value)}
                      placeholder="Nos, Pkts, Mtr…"
                      className="h-11"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink-muted mb-1 block">
                    Location <span className="text-danger">*</span>
                  </label>
                  <Input
                    value={pickLocation}
                    onChange={(e) => setPickLocation(e.target.value)}
                    placeholder="Site location / area / chainage"
                    className="h-11"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink-muted mb-1 block">
                    Required by date <span className="text-danger">*</span>
                  </label>
                  <Input
                    type="date"
                    value={pickRequiredByDate}
                    onChange={(e) => setPickRequiredByDate(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      setSelectedMaterial(null);
                      setPickQty(0);
                      setPickLocation('');
                      setPickRequiredByDate('');
                    }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    variant="accent"
                    accentColor={accent}
                    className="flex-1"
                    disabled={
                      !canAddMaterials ||
                      isBlockedForBelowCap(selectedMaterial) ||
                      pickQty <= 0 ||
                      !pickLocation.trim() ||
                      !pickRequiredByDate
                    }
                    onClick={() =>
                      addLine(
                        selectedMaterial,
                        pickQty,
                        pickUnit,
                        pickLocation,
                        pickRequiredByDate
                      )
                    }
                  >
                    Add to indent
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted px-1">
              {search ? 'Search results' : 'Catalog'}
            </p>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-2xl bg-surface-muted animate-pulse" />
                ))}
              </div>
            ) : !hasRequesterName ? (
              <div className="rounded-2xl border border-dashed border-surface-border bg-surface-muted/40 px-4 py-6 text-center text-sm text-ink-secondary">
                Enter requester name above to browse and add materials.
              </div>
            ) : !indentRequestType ? (
              <div className="rounded-2xl border border-dashed border-surface-border bg-surface-muted/40 px-4 py-6 text-center text-sm text-ink-secondary">
                Select an indent request type above to browse materials.
              </div>
            ) : search && !materials?.length ? (
              <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 px-4 py-6 text-center space-y-3">
                <p className="text-sm font-medium text-ink">No catalog match for “{search}”</p>
                <p className="text-xs text-ink-secondary">
                  You can still request it — store will procure and deliver.
                </p>
                <Button
                  variant="accent"
                  accentColor={accent}
                  onClick={() => {
                    setCustomName(search.trim());
                    setShowCustomForm(true);
                  }}
                >
                  Add “{search.trim()}” as new material
                </Button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {groupedMaterials.map((group) => (
                  <div key={group.category}>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted px-1 py-1.5 sticky top-0 bg-white/95">
                      {group.category}
                    </p>
                    <div className="space-y-2">
                      {group.items.slice(0, 12).map((m) => {
                  const inCart = lines.find((l) => l.material.id === m.id);
                  const isSelected = selectedMaterial?.id === m.id;
                  const overCap = isBlockedForBelowCap(m);
                  const disabled = !canAddMaterials || overCap;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => selectMaterial(m)}
                      disabled={disabled}
                      title={
                        overCap
                          ? isMaterialOverBelowCap(m)
                            ? 'Unit price is ₹5,000 or more — use Above ₹5,000 indent'
                            : 'Price not available — use Above ₹5,000 indent'
                          : undefined
                      }
                      className={cn(
                        'w-full text-left rounded-2xl border px-3 py-2 transition-all duration-200',
                        disabled && 'opacity-50 cursor-not-allowed',
                        isSelected
                          ? 'border-bekem-accent bg-bekem-accent/5 shadow-sm'
                          : 'border-surface-border bg-white hover:border-bekem-accent/40 hover:shadow-sm',
                        overCap && 'hover:border-surface-border hover:shadow-none'
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-ink">{m.name}</p>
                          <p className="text-xs text-ink-secondary mt-0.5">
                            {m.pickerSubtitle ?? (
                              <>
                                {m.code}
                                {m.grade ? ` · ${m.grade}` : ''} · {m.unit}
                              </>
                            )}
                          </p>
                          {showPricing && hasMaterialUnitPrice(m) && (
                            <p className="text-xs text-ink-muted mt-0.5 tabular-nums">
                              {formatCurrency(resolveMaterialUnitPrice(m))} / {unitPriceSuffix(m.unit || 'Nos')}
                              {isMaterialOverBelowCap(m) ? ' · above ₹5,000' : ''}
                            </p>
                          )}
                        </div>
                          {inCart ? (
                          <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            On indent
                          </span>
                        ) : overCap ? (
                          <span className="shrink-0 text-xs font-medium text-ink-muted">
                            {isMaterialOverBelowCap(m) ? 'Use Above ₹5,000' : 'No price'}
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs font-medium text-bekem-accent">
                            Select →
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-surface-border bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink">Material not in catalog?</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Add a new material — it is saved to Material Master immediately.
                  </p>
                </div>
                {!showCustomForm && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!canAddMaterials}
                    onClick={() => setShowCustomForm(true)}
                  >
                    Add new material
                  </Button>
                )}
              </div>

              {showCustomForm && (
                <div className="space-y-3 pt-1 border-t border-surface-border">
                  <div>
                    <label className="text-xs font-semibold text-ink-muted mb-1 block">
                      Material name <span className="text-danger">*</span>
                    </label>
                    <Input
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="e.g. Sand, Cement"
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-ink-muted mb-1 block">
                        Unit <span className="text-danger">*</span>
                      </label>
                      <Input
                        value={customUnit}
                        onChange={(e) => setCustomUnit(e.target.value)}
                        placeholder="Nos, Mts, Bags…"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-ink-muted mb-1 block">
                        Category <span className="text-danger">*</span>
                      </label>
                      <select
                        value={customCategory}
                        onChange={(e) =>
                          setCustomCategory(e.target.value as (typeof MATERIAL_CATEGORIES)[number])
                        }
                        className="w-full h-10 rounded-xl border border-surface-border px-3 text-sm bg-white"
                      >
                        {MATERIAL_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {customCategory === MATERIAL_CATEGORY_OTHERS && (
                    <div>
                      <label className="text-xs font-semibold text-ink-muted mb-1 block">
                        Remarks <span className="text-danger">*</span>
                      </label>
                      <Input
                        value={customCategoryRemarks}
                        onChange={(e) => setCustomCategoryRemarks(e.target.value)}
                        placeholder="Specify material type…"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-ink-muted mb-1 block">
                      Description (optional)
                    </label>
                    <Input
                      value={customDescription}
                      onChange={(e) => setCustomDescription(e.target.value)}
                      placeholder="Grade, spec, or usage notes"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink-muted mb-1 block">
                      Quantity for this indent
                    </label>
                    <QuantityStepper
                      size="compact"
                      value={customQty}
                      onChange={setCustomQty}
                      min={0}
                      unit={customUnit || 'Nos'}
                      accentColor={accent}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => {
                        setShowCustomForm(false);
                        setCustomName('');
                        setCustomQty(1);
                        setCustomDescription('');
                      }}
                      disabled={createSiteMaterial.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="accent"
                      accentColor={accent}
                      className="flex-1"
                      onClick={() => void addCustomLine()}
                      disabled={createSiteMaterial.isPending || !canAddMaterials}
                    >
                      {createSiteMaterial.isPending ? 'Saving…' : 'Save & add to indent'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
