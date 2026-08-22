import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  ROLE_COLORS,
  UserRole,
  formatCurrency,
  snapGstPercent,
  formatProjectLabel,
  type MaterialRequestDto,
  type PoLineItemDto,
  type PurchaseRequestDto,
  type QuotationDto,
  type VendorDto,
} from '@afios/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { StepIndicator } from '@/components/StepIndicator';
import { SuccessScreen } from '@/components/SuccessScreen';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { DetailField, DetailFieldGrid, DetailFieldInline, DetailFieldRow } from '@/components/ui/DetailFields';
import { PoPreviewDocument } from '@/components/PoPreviewDocument';
import { SearchSelect } from '@/components/SearchSelect';
import { computePoLineTotals } from '@/lib/poLineTotals';
import type {
  BillingAddressType,
  DeliveryAddressType,
  MaterialSearchResultDto,
  QuotationComparisonDto,
  MaterialPurchaseHistoryDto,
} from '@afios/shared';
import { PurchaseHistoryPanel } from '@/components/PurchaseHistoryPanel';
import { PoWizardStockPanel } from '@/components/PoWizardStockPanel';
import { GstPercentSelect } from '@/components/GstPercentSelect';
import { PoMaterialVendorAssign } from '@/components/PoMaterialVendorAssign';
import { PoProductCompareStep } from '@/components/PoProductCompareStep';
import {
  bestOfferForQuantity,
  effectiveBreakdown,
  offersForMaterialId,
  resolveOfferQuote,
  type LineVendorQuoteMap,
  type MaterialVendorOfferRow,
  type VendorQuoteOverride,
} from '@/lib/vendorOffersForMaterial';

const STEPS = [
  'Choose request',
  'Assign vendors',
  'Compare quotes',
  'Line items & GST',
  'Terms & addresses',
  'Review',
  'Preview PO',
];

interface LineVendorRow {
  materialId: string;
  material: { id: string; code: string; name: string; unit: string } | null;
  vendors: VendorDto[];
}

interface MaterialOfferRow {
  materialId: string;
  material: { id: string; code: string; name: string; unit: string } | null;
  offers: Array<{
    vendorId: string;
    vendorName: string;
    gstNumber?: string;
    rate: number | null;
    gstPercent?: number;
    lastQuotedAt?: string | null;
  }>;
  minQuotedRate: number | null;
  maxQuotedRate: number | null;
}

interface PoAttachment {
  name: string;
  fileType: string;
  category?: string;
}

function lineTotal(item: PoLineItemDto) {
  return computePoLineTotals(item.quantity, item.rate, item.gstPercent ?? 18).lineTotal;
}

function grandTotalAll(lines: PoLineItemDto[]) {
  return lines.reduce(
    (s, row) => s + computePoLineTotals(row.quantity, row.rate, row.gstPercent ?? 18).grandTotal,
    0
  );
}

export function POWizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedPrId = searchParams.get('purchaseRequestId');
  const accent = ROLE_COLORS[UserRole.EXECUTIVE].primary;
  const [step, setStep] = useState(0);
  const [selectedMr, setSelectedMr] = useState<MaterialRequestDto | null>(null);
  const [selectedPr, setSelectedPr] = useState<PurchaseRequestDto | null>(null);
  const [lineVendorByIndex, setLineVendorByIndex] = useState<Record<number, string>>({});
  const [lineVendorsByIndex, setLineVendorsByIndex] = useState<Record<number, string[]>>({});
  const [lineVendorQuotesByIndex, setLineVendorQuotesByIndex] = useState<
    Record<number, LineVendorQuoteMap>
  >({});
  /** Lines skipped because no vendor (custom products) — PO proceeds for the rest. */
  const [skippedLines, setSkippedLines] = useState<Record<number, boolean>>({});
  const [vendorRows, setVendorRows] = useState<LineVendorRow[]>([]);
  const [vendorOfferRows, setVendorOfferRows] = useState<MaterialVendorOfferRow[]>([]);
  const [quotations, setQuotations] = useState<QuotationDto[]>([]);
  const [lineItems, setLineItems] = useState<PoLineItemDto[]>([]);
  const [registeredOfficeAddress, setRegisteredOfficeAddress] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [billingAddressType, setBillingAddressType] = useState<BillingAddressType>('registered_office');
  const [hasProjectBilling, setHasProjectBilling] = useState(false);
  const [projectBillingAddress, setProjectBillingAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryAddressType, setDeliveryAddressType] = useState<DeliveryAddressType>('site');
  const [deliveryAddressOtherText, setDeliveryAddressOtherText] = useState('');
  const [referenceNote, setReferenceNote] = useState('');
  const [attachments, setAttachments] = useState<PoAttachment[]>([]);
  const [paymentTerms, setPaymentTerms] = useState('Net 30 days');
  const [additionalTerms, setAdditionalTerms] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [purchaseHistory, setPurchaseHistory] = useState<MaterialPurchaseHistoryDto[]>([]);
  const [vendorSelectionReasons, setVendorSelectionReasons] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [createdPoCount, setCreatedPoCount] = useState(0);
  const [selectingPr, setSelectingPr] = useState(false);

  const { data: purchaseRequests, isLoading: prLoading, isError: prError } = useQuery({
    queryKey: ['purchase-requests', 'ready-for-po'],
    queryFn: async () => {
      const res = await api.get<{ data: PurchaseRequestDto[] }>('/purchase-requests', {
        params: { readyForPo: 'true' },
      });
      return res.data.data;
    },
  });

  const openPurchaseRequests = purchaseRequests ?? [];
  const stepLoading = prLoading;
  const hasReadyItems = openPurchaseRequests.length > 0;

  const loadVendorOffers = async (materialIds: string[], purchaseRequestId?: string) => {
    if (!materialIds.length) {
      setVendorOfferRows([]);
      setVendorRows([]);
      return;
    }
    const res = await api.get<{ data: MaterialOfferRow[] }>('/vendors/offers-for-materials', {
      params: {
        materialIds: materialIds.join(','),
        strict: 'true',
        purchaseRequestId,
      },
    });
    const rows = res.data.data;
    setVendorOfferRows(rows);
    setVendorRows(
      rows.map((row) => ({
        materialId: row.materialId,
        material: row.material,
        vendors: row.offers.map((o) => ({
          id: o.vendorId,
          name: o.vendorName,
          gstNumber: o.gstNumber,
        })) as VendorDto[],
      }))
    );
  };

  const createPo = useMutation({
    mutationFn: async () => {
      const ordersMap = new Map<
        string,
        { vendorId: string; lineItems: Array<ReturnType<typeof mapLine>>; attachments: PoAttachment[] }
      >();
      const mapLine = (row: PoLineItemDto) => {
        const totals = computePoLineTotals(row.quantity, row.rate, row.gstPercent ?? 18);
        return {
          description: row.description,
          materialId: row.materialId,
          hsnCode: row.hsnCode,
          quantity: row.quantity,
          unit: row.unit || '',
          rate: row.rate,
          gstPercent: row.gstPercent ?? 18,
          amount: totals.lineTotal,
        };
      };

      // Req 60 — one PO per vendor; group active lines by selected vendor.
      lineItems.forEach((row, index) => {
        if (skippedLines[index]) return;
        const vendorId = lineVendorsByIndex[index]?.[0] || lineVendorByIndex[index];
        if (!vendorId) return;
        const item = mapLine(row);
        const existing = ordersMap.get(vendorId);
        if (existing) {
          existing.lineItems.push(item);
        } else {
          ordersMap.set(vendorId, { vendorId, lineItems: [item], attachments: [] });
        }
      });

      const orders = Array.from(ordersMap.values()).map((order, i) => ({
        ...order,
        attachments: i === 0 ? attachments : [],
      }));

      const res = await api.post<{ data: unknown[]; count: number }>('/purchase-orders/wizard/batch', {
        materialRequestId: selectedMr?.id,
        purchaseRequestId: selectedPr?.id,
        paymentTerms,
        additionalTerms,
        billingAddress,
        billingAddressType,
        deliveryAddress:
          deliveryAddressType === 'other' ? deliveryAddressOtherText : deliveryAddress,
        deliveryAddressType,
        deliveryAddressOtherText:
          deliveryAddressType === 'other' ? deliveryAddressOtherText : undefined,
        expectedDeliveryDate: expectedDeliveryDate || undefined,
        referenceNote:
          referenceNote || (selectedMr?.indentNumber ? `Indent ${selectedMr.indentNumber}` : ''),
        whyWeChoseThisVendor: assignedVendorIds
          .map((vendorId) => vendorSelectionReasons[vendorId]?.trim())
          .filter(Boolean)
          .join(' • '),
        vendorSelectionReasons: Object.fromEntries(
          assignedVendorIds
            .map((vendorId) => [vendorId, vendorSelectionReasons[vendorId]?.trim()])
            .filter((entry): entry is [string, string] => Boolean(entry[1]))
        ),
        orders,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setCreatedPoCount(data.count || 1);
      toast.success(
        data.count > 1 ? `${data.count} purchase orders created` : 'Purchase order created'
      );
      setSuccess(true);
    },
  });

  const loadQuotations = useMutation({
    mutationFn: async (purchaseRequestId: string) => {
      const res = await api.post<{
        data: QuotationDto[];
        comparison?: QuotationComparisonDto;
        purchaseHistory?: MaterialPurchaseHistoryDto[];
        lineItems?: PoLineItemDto[];
        billingAddress?: string;
        deliveryAddress?: string;
        subtotal?: number;
      }>('/purchase-orders/wizard/preview-quotations', { purchaseRequestId });
      return res.data;
    },
    onSuccess: (data) => {
      setQuotations(data.data);
      if (data.purchaseHistory) setPurchaseHistory(data.purchaseHistory);
      if (data.lineItems?.length) setLineItems(data.lineItems);
      if (data.billingAddress) {
        setRegisteredOfficeAddress(data.billingAddress);
        setBillingAddress(data.billingAddress);
        setProjectBillingAddress('');
        setHasProjectBilling(false);
        setBillingAddressType('registered_office');
      }
      if (data.deliveryAddress) setDeliveryAddress(data.deliveryAddress);
    },
  });

  const loadProjectBilling = async (projectId: string) => {
    try {
      const res = await api.get<{
        data: { hasProjectBillingAddress: boolean; billingAddress: string | null; registeredOfficeAddress: string };
      }>(`/projects/${projectId}/billing-address`);
      const { hasProjectBillingAddress, billingAddress: projAddr, registeredOfficeAddress } =
        res.data.data;
      setHasProjectBilling(hasProjectBillingAddress);
      setProjectBillingAddress(projAddr || '');
      setBillingAddress(
        billingAddressType === 'project_billing' && projAddr ? projAddr : registeredOfficeAddress
      );
      if (!billingAddress) setBillingAddress(registeredOfficeAddress);
    } catch {
      setHasProjectBilling(false);
    }
  };

  const updateLineItem = (index: number, patch: Partial<PoLineItemDto>) => {
    setLineItems((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch, amount: lineTotal({ ...row, ...patch }) } : row))
    );
  };

  const addLineFromMaterial = async (_id: string, material: MaterialSearchResultDto) => {
    const newLine: PoLineItemDto = {
      materialId: material.id,
      description: material.description || material.name || '',
      itemCode: material.itemCode,
      hsnCode: material.hsnCode,
      gstPercent: snapGstPercent(material.gstRate),
      quantity: 1,
      rate: 0,
      amount: 0,
    };
    const nextLines = [...lineItems, newLine];
    setLineItems(nextLines);
    const materialIds = nextLines.map((l) => l.materialId).filter(Boolean) as string[];
    await loadVendorOffers(materialIds, selectedPr?.id);
  };

  const removeLineItem = (index: number) => {
    setLineItems((rows) => rows.filter((_, i) => i !== index));
    setLineVendorByIndex((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k);
        if (i < index) next[i] = v;
        else if (i > index) next[i - 1] = v;
      });
      return next;
    });
    setLineVendorsByIndex((prev) => {
      const next: Record<number, string[]> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k);
        if (i < index) next[i] = v;
        else if (i > index) next[i - 1] = v;
      });
      return next;
    });
    setSkippedLines((prev) => {
      const next: Record<number, boolean> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k);
        if (i < index) next[i] = v;
        else if (i > index) next[i - 1] = v;
      });
      return next;
    });
  };

  const pickFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const added = Array.from(files).map((f) => ({
      name: f.name,
      fileType: f.type || 'application/octet-stream',
      category: 'QUOTATION',
    }));
    setAttachments((prev) => [...prev, ...added]);
  };

  const vendorsForLineIndex = (index: number) => {
    const row = lineItems[index];
    const materialId = row?.materialId;
    if (!materialId) return [];
    return vendorRows.find((r) => r.materialId === materialId)?.vendors ?? [];
  };

  const offersForLineIndex = (index: number) => {
    const row = lineItems[index];
    return offersForMaterialId(row?.materialId, vendorOfferRows);
  };

  const getVendorQuote = (
    lineIdx: number,
    materialId: string | undefined,
    vendorId: string,
    row: PoLineItemDto
  ) => {
    const offer = offersForMaterialId(materialId, vendorOfferRows).find((o) => o.vendorId === vendorId);
    const override = lineVendorQuotesByIndex[lineIdx]?.[vendorId];
    const resolved = offer
      ? resolveOfferQuote(offer, override)
      : { rate: override?.rate ?? null, gstPercent: override?.gstPercent ?? row.gstPercent ?? 18 };
    return {
      rate: resolved.rate ?? row.rate,
      gstPercent: resolved.gstPercent,
    };
  };

  const handleVendorQuoteChange = (
    lineIndex: number,
    vendorId: string,
    patch: VendorQuoteOverride
  ) => {
    setLineVendorQuotesByIndex((prev) => ({
      ...prev,
      [lineIndex]: {
        ...(prev[lineIndex] || {}),
        [vendorId]: { ...(prev[lineIndex]?.[vendorId] || {}), ...patch },
      },
    }));
  };

  const activeLineIndexes = lineItems
    .map((_, i) => i)
    .filter((i) => !skippedLines[i]);
  const assignedVendorIds = [
    ...new Set(
      activeLineIndexes
        .flatMap((i) => lineVendorsByIndex[i] || (lineVendorByIndex[i] ? [lineVendorByIndex[i]] : []))
        .filter(Boolean)
    ),
  ];
  const allSelectedVendorsHaveReasons =
    assignedVendorIds.length > 0 &&
    assignedVendorIds.every(
      (vendorId) => (vendorSelectionReasons[vendorId] || '').trim().length > 0
    );
  const allActiveLinesHaveVendor =
    activeLineIndexes.length > 0 &&
    activeLineIndexes.every((i) => !!lineVendorByIndex[i]);

  const selectPurchaseRequest = async (pr: PurchaseRequestDto) => {
    setSelectingPr(true);
    setSelectedPr(pr);
    setLineVendorByIndex({});
    setLineVendorsByIndex({});
    setLineVendorQuotesByIndex({});
    setSkippedLines({});
    setQuotations([]);
    setLineItems([]);
    try {
      let mr: MaterialRequestDto | null = null;
      if (pr.materialRequestId) {
        const res = await api.get<{ data: MaterialRequestDto }>(
          `/material-requests/${pr.materialRequestId}`
        );
        mr = res.data.data;
        setSelectedMr(mr);
      } else {
        setSelectedMr(null);
      }
      const preview = await loadQuotations.mutateAsync(pr.id);
      if (preview.data?.length) setQuotations(preview.data);
      const items = preview.lineItems?.length ? preview.lineItems : [];
      setLineItems(items);
      if (mr) {
        const ids =
          mr.items?.map((i) => i.materialId || i.material?.id).filter(Boolean) ||
          (mr.materialId || mr.material?.id ? [mr.materialId || mr.material?.id] : []);
        await loadVendorOffers(ids as string[], pr.id);
        if (mr.projectId) await loadProjectBilling(mr.projectId);
      } else {
        setVendorRows([]);
        setVendorOfferRows([]);
      }
      setStep(1);
    } finally {
      setSelectingPr(false);
    }
  };

  useEffect(() => {
    if (!preselectedPrId || selectedPr || prLoading || selectingPr) return;
    const pr = openPurchaseRequests.find((p) => p.id === preselectedPrId);
    if (pr) {
      void selectPurchaseRequest(pr);
      return;
    }
    void (async () => {
      try {
        const res = await api.get<{ data: PurchaseRequestDto }>(`/purchase-requests/${preselectedPrId}`);
        if (res.data.data) {
          await selectPurchaseRequest(res.data.data);
        }
      } catch {
        // Ignore fallback failures and leave manual selection available.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when PR list is ready
  }, [preselectedPrId, openPurchaseRequests, prLoading, selectedPr, selectingPr]);

  const allActiveLinesHaveRatesForCompare =
    activeLineIndexes.length > 0 &&
    activeLineIndexes.every((i) => {
      const row = lineItems[i];
      const offers = offersForLineIndex(i);
      const quotes = lineVendorQuotesByIndex[i] || {};
      return offers.some((offer) => effectiveBreakdown(offer, row.quantity, quotes[offer.vendorId]));
    });

  const allActiveLinesHaveVendorSelected =
    activeLineIndexes.length > 0 &&
    activeLineIndexes.every((i) => (lineVendorsByIndex[i]?.length ?? 0) > 0);

  const runCompare = () => {
    if (!allActiveLinesHaveRatesForCompare) {
      toast.error('Enter quoted rate and GST for at least one vendor on each product');
      return;
    }
    const next: Record<number, string[]> = {};
    activeLineIndexes.forEach((i) => {
      const row = lineItems[i];
      const offers = offersForLineIndex(i);
      const quotes = lineVendorQuotesByIndex[i] || {};
      const best = bestOfferForQuantity(offers, row.quantity, quotes);
      if (best) next[i] = [best.vendorId];
    });
    setLineVendorsByIndex(next);
    setStep(2);
  };

  const confirmVendorSelection = () => {
    if (!allActiveLinesHaveVendorSelected) {
      toast.error('Select a vendor for each product');
      return;
    }
    if (!allSelectedVendorsHaveReasons) {
      toast.error('Enter why each selected vendor was chosen');
      return;
    }
    for (const i of activeLineIndexes) {
      const row = lineItems[i];
      const vendorId = lineVendorsByIndex[i]?.[0];
      if (!vendorId) continue;
      const { rate } = getVendorQuote(i, row.materialId, vendorId, row);
      if (!rate || rate <= 0) {
        toast.error(`Missing rate for selected vendor on ${row.description}`);
        return;
      }
    }
    const firstVendorId = lineVendorsByIndex[activeLineIndexes[0]]?.[0];
    const quote = quotations.find((q) => q.vendorId === firstVendorId);
    if (quote?.terms) setPaymentTerms(quote.terms);
    const skipped = Object.values(skippedLines).filter(Boolean).length;
    if (skipped > 0) {
      toast.info(
        `${skipped} line(s) skipped — order the rest; add vendors in Vendors admin for skipped items`
      );
    }

    const expandedItems: PoLineItemDto[] = [];
    const expandedVendors: Record<number, string> = {};
    let newIdx = 0;

    activeLineIndexes.forEach((oldIdx) => {
      const row = lineItems[oldIdx];
      const vendorIds = lineVendorsByIndex[oldIdx]?.filter(Boolean) ?? [];
      if (!vendorIds.length) return;

      if (vendorIds.length === 1) {
        const { rate, gstPercent } = getVendorQuote(oldIdx, row.materialId, vendorIds[0], row);
        const totals = computePoLineTotals(row.quantity, rate, gstPercent);
        expandedItems.push({ ...row, rate, gstPercent, amount: totals.lineTotal });
        expandedVendors[newIdx++] = vendorIds[0];
        return;
      }

      let remaining = row.quantity;
      vendorIds.forEach((vendorId, vi) => {
        const qty =
          vi === vendorIds.length - 1 ? remaining : Math.floor(row.quantity / vendorIds.length);
        remaining -= qty;
        if (qty <= 0) return;
        const { rate, gstPercent } = getVendorQuote(oldIdx, row.materialId, vendorId, row);
        const totals = computePoLineTotals(qty, rate, gstPercent);
        expandedItems.push({
          ...row,
          quantity: qty,
          rate,
          gstPercent,
          amount: totals.lineTotal,
        });
        expandedVendors[newIdx++] = vendorId;
      });
    });

    setLineItems(expandedItems);
    setLineVendorByIndex(expandedVendors);
    setLineVendorsByIndex({});
    setSkippedLines({});
    setStep(3);
  };

  return (
    success ? (
      <SuccessScreen
        title={createdPoCount > 1 ? `${createdPoCount} POs created!` : 'PO created!'}
        message="RFQ and quotations were auto-generated. PO(s) are now pending coordinator verification."
        accentColor={accent}
        primaryAction={{ label: 'Back to home', onClick: () => navigate('/') }}
      />
    ) : (
    <div className="min-h-screen flex flex-col w-full max-w-lg lg:max-w-6xl mx-auto bg-[#F8FAFC]">
      <header className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button
          onClick={() => (step > 0 ? setStep(step - 1) : navigate('/'))}
          className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-surface-muted"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-semibold text-ink">Create Purchase Order</h1>
      </header>

      <StepIndicator current={step} total={STEPS.length} accentColor={accent} labels={STEPS} />
      <p className="text-center text-xs text-ink-secondary mb-2 px-4">{STEPS[step]}</p>

      <div className="flex-1 px-4 pb-6">
        <AnimatePresence mode="sync">
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              {stepLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-surface-muted animate-pulse" />
                  ))}
                </div>
              ) : prError ? (
                <EmptyState
                  title="Could not load requests"
                  description="Check that the API is running (npm run dev:api), then refresh this page."
                />
              ) : !hasReadyItems ? (
                <EmptyState
                  title="No requests ready for PO"
                  description="Finalize an RFQ after vendor quotations are received — those purchase requests then appear here for Create PO."
                />
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Approved for PO creation
                  </p>
                  {openPurchaseRequests.map((pr) => (
                        <Card
                          key={pr.id}
                          className={cn(
                            'cursor-pointer hover:shadow-card-hover',
                            selectingPr && 'pointer-events-none opacity-60'
                          )}
                          onClick={() => selectPurchaseRequest(pr)}
                        >
                          <DetailFieldRow className="items-center gap-2">
                            <p className="font-medium">{pr.prNumber}</p>
                          </DetailFieldRow>
                          <DetailFieldRow className="text-sm text-ink-secondary mt-1">
                            <DetailFieldInline label="Indent">
                              {pr.materialRequest?.indentNumber ?? 'Material request'}
                            </DetailFieldInline>
                            <DetailFieldInline label="Project">{formatProjectLabel(pr.project)}</DetailFieldInline>
                            <DetailFieldInline label="Est.">
                              {formatCurrency(pr.amountEstimate)}
                            </DetailFieldInline>
                          </DetailFieldRow>
                        </Card>
                      ))}
                </div>
              )}
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="pointer-events-auto">
              {selectedPr && (
                <p className="text-xs font-semibold text-bekem-accent bg-bekem-accent/10 border border-bekem-accent/20 rounded-lg px-3 py-2 mb-2">
                  Lines from purchase request {selectedPr.prNumber}
                  {selectedMr?.indentNumber ? ` · Indent ${selectedMr.indentNumber}` : ''}
                </p>
              )}
              <PoWizardStockPanel
                materialIds={vendorRows.map((r) => r.materialId).filter(Boolean)}
                requestingProjectId={selectedPr?.projectId || selectedMr?.projectId}
                className="mb-2"
              />
              <PoMaterialVendorAssign
                lineItems={lineItems}
                lineVendorsByIndex={lineVendorsByIndex}
                vendorQuotesByLineIndex={lineVendorQuotesByIndex}
                skippedLines={skippedLines}
                offersForLineIndex={offersForLineIndex}
                onVendorsChange={(i, vendorIds) =>
                  setLineVendorsByIndex((prev) => ({ ...prev, [i]: vendorIds }))
                }
                onVendorQuoteChange={handleVendorQuoteChange}
                showVendorSelection={false}
                onSkipToggle={(i) => {
                  setSkippedLines((prev) => {
                    const next = { ...prev };
                    if (next[i]) {
                      delete next[i];
                    } else {
                      next[i] = true;
                      setLineVendorsByIndex((v) => {
                        const nv = { ...v };
                        delete nv[i];
                        return nv;
                      });
                    }
                    return next;
                  });
                }}
                onSplitByVendor={() => {
                  const next: Record<number, string[]> = { ...lineVendorsByIndex };
                  lineItems.forEach((row, i) => {
                    if (skippedLines[i]) return;
                    const offers = offersForLineIndex(i);
                    const quotes = lineVendorQuotesByIndex[i];
                    const best = bestOfferForQuantity(offers, row.quantity, quotes);
                    if (best) {
                      next[i] = [best.vendorId];
                    }
                  });
                  setLineVendorsByIndex(next);
                  const vendorCount = new Set(
                    Object.entries(next)
                      .filter(([idx]) => !skippedLines[Number(idx)])
                      .flatMap(([, ids]) => ids)
                  ).size;
                  toast.success(
                    vendorCount > 1
                      ? `Split across ${vendorCount} vendors — separate POs on submit`
                      : 'All lines assigned to suggested vendors'
                  );
                }}
              />
              <Button
                className="mt-4"
                variant="accent"
                size="lg"
                accentColor={accent}
                disabled={!allActiveLinesHaveRatesForCompare}
                onClick={runCompare}
              >
                Compare
              </Button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <PurchaseHistoryPanel history={purchaseHistory} className="mb-4" />
              <PoProductCompareStep
                lineItems={lineItems}
                activeLineIndexes={activeLineIndexes}
                skippedLines={skippedLines}
                offersForLineIndex={offersForLineIndex}
                vendorQuotesByLineIndex={lineVendorQuotesByIndex}
                lineVendorsByIndex={lineVendorsByIndex}
                onSelectVendor={(lineIndex, vendorId) =>
                  setLineVendorsByIndex((prev) => ({ ...prev, [lineIndex]: [vendorId] }))
                }
                vendorReasons={vendorSelectionReasons}
                onVendorReasonChange={(vendorId, reason) =>
                  setVendorSelectionReasons((prev) => ({ ...prev, [vendorId]: reason }))
                }
              />
              <Button
                className="mt-4"
                variant="accent"
                size="lg"
                accentColor={accent}
                disabled={
                  !allActiveLinesHaveVendorSelected || !allSelectedVendorsHaveReasons
                }
                onClick={confirmVendorSelection}
              >
                Continue with selected vendors
              </Button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <p className="text-xs text-ink-secondary mb-2">
                Line items from Material Master — GST 5% or 18% per line.
              </p>
              <div className="procurement-landscape-scroll panel overflow-hidden">
                <table className="data-table min-w-[900px]">
                  <thead>
                    <tr className="bg-surface-muted/40">
                      <th>Item</th>
                      <th className="w-20">Code</th>
                      <th className="w-20">HSN</th>
                      <th className="min-w-[140px]">Vendor</th>
                      <th className="w-16">Qty</th>
                      <th className="w-24">Rate</th>
                      <th className="w-20">GST</th>
                      <th className="w-28">Total</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((row, i) => {
                      const vendor = vendorsForLineIndex(i).find((v) => v.id === lineVendorByIndex[i]);
                      const totals = computePoLineTotals(row.quantity, row.rate, row.gstPercent ?? 18);
                      return (
                        <tr key={i}>
                          <td className="max-w-[180px]">
                            <p className="font-medium truncate" title={row.description}>
                              {row.description}
                            </p>
                          </td>
                          <td className="tabular-nums text-[11px]">{row.itemCode || '—'}</td>
                          <td className="text-[11px]">{row.hsnCode || '—'}</td>
                          <td>
                            {vendor ? (
                              <span className="text-[11px]">{vendor.name}</span>
                            ) : vendorsForLineIndex(i).length > 0 ? (
                              <SearchSelect
                                compact
                                value={null}
                                onChange={(id) =>
                                  setLineVendorByIndex((prev) => ({ ...prev, [i]: id }))
                                }
                                options={vendorsForLineIndex(i).map((v) => ({
                                  id: v.id,
                                  label: v.name,
                                  sublabel: v.gstNumber ? `GST ${v.gstNumber}` : undefined,
                                }))}
                                placeholder="Vendor…"
                                emptyMessage="No vendors"
                              />
                            ) : (
                              <span className="text-[10px] text-ink-muted">—</span>
                            )}
                          </td>
                          <td>
                            <Input
                              type="number"
                              className="input-compact"
                              value={row.quantity}
                              onChange={(e) =>
                                updateLineItem(i, { quantity: parseFloat(e.target.value) || 0 })
                              }
                            />
                          </td>
                          <td>
                            <Input
                              type="number"
                              className="input-compact"
                              value={row.rate}
                              onChange={(e) =>
                                updateLineItem(i, { rate: parseFloat(e.target.value) || 0 })
                              }
                            />
                          </td>
                          <td>
                            <GstPercentSelect
                              compact
                              value={row.gstPercent}
                              onChange={(gstPercent) => updateLineItem(i, { gstPercent })}
                            />
                          </td>
                          <td className="tabular-nums font-semibold whitespace-nowrap">
                            {formatCurrency(totals.grandTotal)}
                          </td>
                          <td>
                            {lineItems.length > 1 && (
                              <button
                                type="button"
                                className="text-[10px] text-ink-muted hover:text-danger"
                                onClick={() => removeLineItem(i)}
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 border border-dashed border-surface-border rounded-lg p-2">
                <p className="text-[10px] font-semibold text-ink-muted mb-1">Add line from Material Master</p>
                <SearchSelect<MaterialSearchResultDto & { id: string; label: string }>
                  compact
                  value={null}
                  onChange={(id, option) => addLineFromMaterial(id, option as MaterialSearchResultDto)}
                  searchPath="/materials/search"
                  mapResult={(raw) => {
                    const m = raw as MaterialSearchResultDto;
                    return {
                      ...m,
                      id: m.id,
                      label: m.description || m.name || m.itemCode,
                      sublabel: [m.itemCode, m.hsnCode ? `HSN ${m.hsnCode}` : '', `${m.gstRate ?? 18}% GST`]
                        .filter(Boolean)
                        .join(' · '),
                    };
                  }}
                  placeholder="Search material…"
                  emptyMessage="No materials found"
                />
              </div>
              <div className="mt-2 panel p-2 text-xs">
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 tabular-nums">
                  <span>
                    Subtotal{' '}
                    <strong>
                      {formatCurrency(
                        lineItems.reduce(
                          (s, row) =>
                            s + computePoLineTotals(row.quantity, row.rate, row.gstPercent ?? 18).lineTotal,
                          0
                        )
                      )}
                    </strong>
                  </span>
                  <span>
                    GST{' '}
                    <strong>
                      {formatCurrency(
                        lineItems.reduce(
                          (s, row) =>
                            s + computePoLineTotals(row.quantity, row.rate, row.gstPercent ?? 18).tax,
                          0
                        )
                      )}
                    </strong>
                  </span>
                  <span>
                    Final{' '}
                    <strong className="text-bekem-navy">{formatCurrency(grandTotalAll(lineItems))}</strong>
                  </span>
                </div>
              </div>
              <Button
                className="mt-4"
                variant="accent"
                size="lg"
                accentColor={accent}
                disabled={!lineItems.length || !allActiveLinesHaveVendor}
                onClick={() => {
                  if (!allActiveLinesHaveVendor) {
                    toast.error('Assign a vendor to every line item before continuing');
                    return;
                  }
                  setStep(4);
                }}
              >
                Continue
              </Button>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="s4" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <label className="text-sm font-medium text-ink-secondary">Payment terms</label>
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="mt-2"
              />

              <label className="text-sm font-medium text-ink-secondary mt-4 block">
                Additional terms <span className="text-ink-muted font-normal">(optional)</span>
              </label>
              <Textarea
                value={additionalTerms}
                onChange={(e) => setAdditionalTerms(e.target.value)}
                className="mt-2 min-h-[96px]"
                placeholder="Add project-specific clauses without changing the standard terms…"
              />

              <label className="text-sm font-medium text-ink-secondary mt-4 block">
                Billing address
              </label>
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  className={cn(
                    'rounded-xl px-3 py-2 text-sm border',
                    billingAddressType === 'registered_office'
                      ? 'border-bekem-accent bg-bekem-accent/10 font-semibold'
                      : 'border-surface-border'
                  )}
                  onClick={() => {
                    setBillingAddressType('registered_office');
                    setBillingAddress(registeredOfficeAddress || billingAddress);
                  }}
                >
                  Registered Office
                </button>
                <button
                  type="button"
                  disabled={!hasProjectBilling}
                  className={cn(
                    'rounded-xl px-3 py-2 text-sm border',
                    billingAddressType === 'project_billing'
                      ? 'border-bekem-accent bg-bekem-accent/10 font-semibold'
                      : 'border-surface-border',
                    !hasProjectBilling && 'opacity-50 cursor-not-allowed'
                  )}
                  onClick={() => {
                    if (projectBillingAddress) {
                      setBillingAddressType('project_billing');
                      setBillingAddress(projectBillingAddress);
                    }
                  }}
                >
                  Project billing address
                </button>
              </div>
              {!hasProjectBilling && (
                <p className="text-xs text-ink-muted mt-1">
                  Project billing address not configured — using Registered Office only.
                </p>
              )}
              <div className="field-readonly mt-2 min-h-[80px] whitespace-pre-wrap text-xs">
                {billingAddress}
              </div>

              <label className="text-sm font-medium text-ink-secondary mt-4 block">
                Delivery address
              </label>
              <div className="flex flex-wrap gap-2 mt-2">
                {(['site', 'workshop', 'global', 'other'] as DeliveryAddressType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={cn(
                      'rounded-xl px-3 py-2 text-sm border capitalize',
                      deliveryAddressType === t
                        ? 'border-bekem-accent bg-bekem-accent/10 font-semibold'
                        : 'border-surface-border'
                    )}
                    onClick={() => setDeliveryAddressType(t)}
                  >
                    {t === 'site' ? 'Site' : t === 'other' ? 'Other' : t}
                  </button>
                ))}
              </div>
              {deliveryAddressType === 'other' ? (
                <textarea
                  className="mt-2 w-full rounded-xl border border-border px-3 py-2 text-sm min-h-[80px]"
                  value={deliveryAddressOtherText}
                  onChange={(e) => setDeliveryAddressOtherText(e.target.value)}
                  placeholder="Enter delivery location…"
                />
              ) : (
                <p className="text-xs text-ink-muted mt-2">
                  {deliveryAddressType === 'site' && (deliveryAddress || 'Site address from indent')}
                  {deliveryAddressType === 'workshop' && 'Central workshop (auto-filled on save)'}
                  {deliveryAddressType === 'global' && 'Global warehouse (auto-filled on save)'}
                </p>
              )}

              <label className="text-sm font-medium text-ink-secondary mt-4 block">
                Expected delivery date
              </label>
              <Input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className="mt-2"
              />
              <p className="text-xs text-ink-muted mt-1">
                If actual delivery is after this date, Live stock balance shows the row in red and Store
                Manager must enter a delay reason (visible to Coordinator and Chairman).
              </p>

              <label className="text-sm font-medium text-ink-secondary mt-4 block">Reference note</label>
              <Input
                value={referenceNote}
                onChange={(e) => setReferenceNote(e.target.value)}
                placeholder="e.g. Indent number or site note"
                className="mt-2"
              />

              <label className="text-sm font-medium text-ink-secondary mt-4 block">
                Upload quotation / supporting documents
              </label>
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                className="mt-2 block w-full text-sm"
                onChange={(e) => pickFiles(e.target.files)}
              />
              {attachments.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {attachments.map((a, i) => (
                    <li key={i} className="text-xs text-ink-secondary flex justify-between gap-2">
                      <span>{a.name}</span>
                      <button
                        type="button"
                        className="text-danger"
                        onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-ink-muted mt-1">
                Document names are recorded on the PO for coordinator review.
              </p>

              <Button
                className="mt-4"
                variant="accent"
                size="lg"
                accentColor={accent}
                disabled={
                  !paymentTerms.trim() || !expectedDeliveryDate || !allActiveLinesHaveVendor
                }
                onClick={() => {
                  if (!allActiveLinesHaveVendor) {
                    toast.error('Assign a vendor to every line item before reviewing');
                    return;
                  }
                  setStep(5);
                }}
              >
                Continue
              </Button>
            </motion.div>
          )}

          {step === 5 && selectedPr && !allActiveLinesHaveVendor && (
            <motion.div key="s5-missing" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <EmptyState
                title="Missing vendor on one or more lines"
                description="Every line item needs a vendor before you can review the purchase order."
                actionLabel="Back to line items"
                onAction={() => setStep(3)}
              />
            </motion.div>
          )}

          {step === 5 && selectedPr && allActiveLinesHaveVendor && (
            <motion.div key="s5" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <Card className="mb-4">
                <DetailFieldGrid>
                  {(selectedPr?.project || selectedMr?.project) && (
                    <DetailField label="Project" labelClassName="text-ink-secondary">
                      {formatProjectLabel(selectedPr?.project || selectedMr?.project)}
                    </DetailField>
                  )}
                  <DetailField label="Indent" labelClassName="text-ink-secondary">
                    {selectedMr?.indentNumber ?? '—'}
                  </DetailField>
                  <DetailField label="Purchase request" labelClassName="text-ink-secondary">
                    {selectedPr?.prNumber}
                  </DetailField>
                  <DetailField label="Payment terms" labelClassName="text-ink-secondary">
                    {paymentTerms}
                  </DetailField>
                  <DetailField label="Expected delivery date" labelClassName="text-ink-secondary">
                    {expectedDeliveryDate || '—'}
                  </DetailField>
                  {attachments.length > 0 && (
                    <DetailField label="Documents" fullWidth labelClassName="text-ink-secondary" valueClassName="text-sm font-normal">
                      {attachments.map((a) => a.name).join(', ')}
                    </DetailField>
                  )}
                </DetailFieldGrid>
              </Card>

              {assignedVendorIds.map((vendorId) => {
                const vendor =
                  vendorRows.flatMap((r) => r.vendors).find((v) => v.id === vendorId) ||
                  quotations.find((q) => q.vendorId === vendorId)?.vendor;
                const vendorLines = lineItems
                  .map((row, i) => ({ row, i }))
                  .filter(({ i }) => lineVendorByIndex[i] === vendorId);
                const vendorSubtotal = vendorLines.reduce((s, { row }) => s + lineTotal(row), 0);
                return (
                  <Card key={vendorId} className="mb-3">
                    <DetailFieldGrid>
                      <DetailField label="PO for vendor" labelClassName="text-ink-secondary">
                        {vendor?.name ?? 'Vendor'}
                      </DetailField>
                      {vendor?.address && (
                        <DetailField
                          label="Address"
                          fullWidth
                          labelClassName="text-ink-secondary"
                          valueClassName="text-xs text-ink-muted font-normal whitespace-pre-line"
                        >
                          {vendor.address}
                        </DetailField>
                      )}
                      {vendorLines.map(({ row, i }) => (
                        <DetailField
                          key={i}
                          label={row.description}
                          labelClassName="text-ink-secondary"
                          valueClassName="text-sm"
                        >
                          {row.quantity} × {formatCurrency(row.rate)}
                        </DetailField>
                      ))}
                      <DetailField label="Subtotal" valueClassName="text-sm font-semibold">
                        {formatCurrency(vendorSubtotal)}
                      </DetailField>
                    </DetailFieldGrid>
                  </Card>
                );
              })}

              <p className="text-sm text-ink-secondary mb-3">
                {assignedVendorIds.length > 1
                  ? `${assignedVendorIds.length} separate purchase orders will be created.`
                  : 'One purchase order will be created.'}
              </p>
              <Button
                className="mt-2"
                variant="accent"
                size="lg"
                accentColor={accent}
                onClick={() => setStep(6)}
              >
                Continue to preview
              </Button>
            </motion.div>
          )}

          {step === 6 && selectedPr && !allActiveLinesHaveVendor && (
            <motion.div key="s6-missing" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <EmptyState
                title="Missing vendor on one or more lines"
                description="Go back and assign a vendor to every line item before previewing the PO."
                actionLabel="Back to line items"
                onAction={() => setStep(3)}
              />
            </motion.div>
          )}

          {step === 6 && selectedPr && allActiveLinesHaveVendor && (
            <motion.div key="s6" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <p className="text-sm text-ink-secondary mb-3">
                Review the purchase order exactly as the vendor will receive it. Confirm only when
                every line, address, and total is correct.
              </p>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {assignedVendorIds.map((vendorId) => {
                  const vendor =
                    vendorRows.flatMap((r) => r.vendors).find((v) => v.id === vendorId) ||
                    quotations.find((q) => q.vendorId === vendorId)?.vendor;
                  const vendorLines = lineItems
                    .map((row, i) => ({ row, i }))
                    .filter(({ i }) => lineVendorByIndex[i] === vendorId)
                    .map(({ row }) => row);
                  return (
                    <PoPreviewDocument
                      key={vendorId}
                      data={{
                        vendorName: vendor?.name || 'Vendor',
                        vendorAddress: vendor?.address,
                        vendorGst: vendor?.gstNumber,
                        vendorEmail: vendor?.email,
                        vendorContact: vendor?.contactPerson,
                        vendorPhone: vendor?.phone,
                        paymentTerms,
                        additionalTerms,
                        poAmount: vendorLines.reduce((s, row) => s + (row.amount || 0), 0),
                        billingAddress,
                        deliveryAddress:
                          deliveryAddressType === 'other'
                            ? deliveryAddressOtherText
                            : deliveryAddress,
                        referenceNote:
                          referenceNote ||
                          selectedMr?.indentNumber ||
                          selectedPr?.prNumber ||
                          '',
                        expectedDeliveryDate,
                        lineItems: vendorLines,
                      }}
                    />
                  );
                })}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <Button variant="secondary" size="lg" onClick={() => setStep(4)}>
                  Back to edit
                </Button>
                <Button
                  variant="accent"
                  size="lg"
                  accentColor={accent}
                  disabled={createPo.isPending || !allSelectedVendorsHaveReasons}
                  onClick={() => createPo.mutate()}
                >
                  {createPo.isPending
                    ? 'Forwarding…'
                    : assignedVendorIds.length > 1
                      ? `Forward ${assignedVendorIds.length} POs for approval`
                      : 'Forward for approval'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
    )
  );
}
