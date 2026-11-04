import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  formatCurrency,
  type BillingAddressType,
  type DeliveryAddressType,
  type MaterialSearchResultDto,
  type PoLineItemDto,
  type PurchaseOrderDto,
} from '@afios/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { SearchSelect } from '@/components/SearchSelect';
import { GstPercentSelect } from '@/components/GstPercentSelect';
import { Modal } from '@/components/ui/Modal';
import { computePoLineTotals } from '@/lib/poLineTotals';
import { cn } from '@/lib/utils';

interface GrnEditWarning {
  lineIndex: number;
  description?: string;
  cumulativeReceived?: number;
  message?: string;
}

interface PoEditFormProps {
  po: PurchaseOrderDto;
  onCancel: () => void;
  onSaved: () => void;
}

function lineGrandTotal(item: PoLineItemDto) {
  return computePoLineTotals(item.quantity, item.rate, item.gstPercent ?? 18).grandTotal;
}

function toDateInput(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function PoEditForm({ po, onCancel, onSaved }: PoEditFormProps) {
  const [vendorId, setVendorId] = useState(po.vendorId || po.vendor?.id || '');
  const [vendorName, setVendorName] = useState(po.vendor?.name || '');
  const [vendorSelectionReason, setVendorSelectionReason] = useState(po.vendorSelectionReason || '');
  const [paymentTerms, setPaymentTerms] = useState(po.paymentTerms || '');
  const [additionalTerms, setAdditionalTerms] = useState(po.additionalTerms || '');
  const [billingAddressType, setBillingAddressType] = useState<BillingAddressType>(
    po.billingAddressType || 'registered_office'
  );
  const [billingAddress, setBillingAddress] = useState(po.billingAddress || '');
  const [deliveryAddressType, setDeliveryAddressType] = useState<DeliveryAddressType>(
    po.deliveryAddressType || 'site'
  );
  const [deliveryAddress, setDeliveryAddress] = useState(po.deliveryAddress || '');
  const [deliveryAddressOtherText, setDeliveryAddressOtherText] = useState(
    po.deliveryAddressOtherText || ''
  );
  const [referenceNote, setReferenceNote] = useState(po.referenceNote || '');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(toDateInput(po.expectedDeliveryDate));
  const [lineItems, setLineItems] = useState<PoLineItemDto[]>(
    (po.lineItems ?? []).map((row) => ({ ...row, gstPercent: row.gstPercent ?? 18 }))
  );
  const [registeredOfficeAddress, setRegisteredOfficeAddress] = useState('');
  const [projectBillingAddress, setProjectBillingAddress] = useState('');
  const [hasProjectBilling, setHasProjectBilling] = useState(false);
  const [grnWarnings, setGrnWarnings] = useState<GrnEditWarning[]>([]);
  const [showGrnModal, setShowGrnModal] = useState(false);

  const projectId = po.purchaseRequest?.projectId;

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const res = await api.get<{
          data: {
            hasProjectBillingAddress: boolean;
            billingAddress: string | null;
            registeredOfficeAddress: string;
          };
        }>(`/projects/${projectId}/billing-address`);
        const { hasProjectBillingAddress, billingAddress: projAddr, registeredOfficeAddress: reg } =
          res.data.data;
        setHasProjectBilling(hasProjectBillingAddress);
        setProjectBillingAddress(projAddr || '');
        setRegisteredOfficeAddress(reg || '');
      } catch {
        setHasProjectBilling(false);
      }
    })();
  }, [projectId]);

  const vendorChanged = vendorId !== (po.vendorId || po.vendor?.id);
  const totalAmount = useMemo(
    () => lineItems.reduce((sum, row) => sum + lineGrandTotal(row), 0),
    [lineItems]
  );

  const updateLineItem = (index: number, patch: Partial<PoLineItemDto>) => {
    setLineItems((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        return { ...next, amount: lineGrandTotal(next) };
      })
    );
  };

  const removeLineItem = (index: number) => {
    setLineItems((rows) => rows.filter((_, i) => i !== index));
  };

  const addLineFromMaterial = (materialId: string, option?: MaterialSearchResultDto) => {
    if (!option) return;
    const rate = option.unitPrice || 0;
    const gstPercent = option.gstRate ?? 18;
    setLineItems((rows) => [
      ...rows,
      {
        materialId,
        description: option.description || option.name || 'Item',
        itemCode: option.itemCode || '',
        hsnCode: option.hsnCode || '',
        quantity: 1,
        rate,
        gstPercent,
        amount: computePoLineTotals(1, rate, gstPercent).grandTotal,
      },
    ]);
  };

  const buildPayload = (acknowledgeGrnWarnings = false) => ({
    vendorId: vendorChanged ? vendorId : undefined,
    vendorSelectionReason: vendorChanged && vendorSelectionReason.trim() ? vendorSelectionReason.trim() : undefined,
    paymentTerms,
    additionalTerms,
    billingAddress,
    billingAddressType,
    deliveryAddress:
      deliveryAddressType === 'other' ? deliveryAddressOtherText.trim() : deliveryAddress,
    deliveryAddressType,
    deliveryAddressOtherText,
    referenceNote,
    expectedDeliveryDate: expectedDeliveryDate || null,
    lineItems: lineItems.map((row) => ({
      materialId: row.materialId,
      description: row.description,
      itemCode: row.itemCode,
      hsnCode: row.hsnCode,
      quantity: Number(row.quantity),
      rate: Number(row.rate),
      gstPercent: row.gstPercent ?? 18,
    })),
    acknowledgeGrnWarnings,
  });

  const save = useMutation({
    mutationFn: async (acknowledgeGrnWarnings?: boolean) => {
      const res = await api.patch<{ data: PurchaseOrderDto; warnings?: GrnEditWarning[] }>(
        `/purchase-orders/${po.id}`,
        buildPayload(!!acknowledgeGrnWarnings)
      );
      return res.data;
    },
    onSuccess: () => {
      toast.success(['CHAIRMAN_PENDING', 'PENDING_APPROVAL', 'APPROVED'].includes(po.status)
        ? 'PO updated and returned to Coordinator for verification'
        : 'PO updated');
      setShowGrnModal(false);
      onSaved();
    },
    onError: (err: Error & { response?: { status?: number; data?: { message?: string; warnings?: GrnEditWarning[] } } }) => {
      if (err.response?.status === 409 && err.response.data?.warnings?.length) {
        setGrnWarnings(err.response.data.warnings);
        setShowGrnModal(true);
        return;
      }
      toast.error(err.response?.data?.message || 'Could not save changes');
    },
  });

  const handleSubmit = () => {
    if (!paymentTerms.trim()) {
      toast.error('Payment terms are required');
      return;
    }
    if (!lineItems.length) {
      toast.error('At least one line item is required');
      return;
    }
    if (vendorChanged && !vendorId) {
      toast.error('Select a vendor');
      return;
    }
    save.mutate(undefined);
  };

  return (
    <div className="space-y-4 rounded-xl border border-bekem-accent/30 bg-white p-3">
      <div>
        <p className="text-sm font-semibold text-ink">Edit purchase order</p>
        <p className="text-xs text-ink-secondary mt-0.5">
          Update vendor, line items, terms, and addresses before approving.
        </p>
      </div>

      <div>
        <label className="text-xs font-semibold text-ink-muted">Vendor (To)</label>
        <SearchSelect
          className="mt-1"
          value={vendorId || null}
          onChange={(id, option) => {
            setVendorId(id);
            setVendorName(option?.label || '');
          }}
          searchPath="/vendors"
          mapResult={(raw) => {
            const v = raw as { id: string; name: string; gstNumber?: string };
            return {
              id: v.id,
              label: v.name,
              sublabel: v.gstNumber ? `GST ${v.gstNumber}` : undefined,
            };
          }}
          placeholder={vendorName || 'Search vendor…'}
          emptyMessage="No vendors found"
        />
        {vendorChanged && (
          <div className="mt-2">
            <label className="text-xs font-semibold text-ink-muted">
              Reason for vendor change (required if not L1)
            </label>
            <Textarea
              value={vendorSelectionReason}
              onChange={(e) => setVendorSelectionReason(e.target.value)}
              rows={2}
              className="mt-1"
              placeholder="Explain why this vendor was selected…"
            />
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <label className="text-xs font-semibold text-ink-muted">Line items</label>
          <span className="text-xs font-semibold text-ink tabular-nums">
            Total {formatCurrency(totalAmount)}
          </span>
        </div>
        <div className="procurement-landscape-scroll panel overflow-hidden">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr className="bg-surface-muted/40">
                <th>Description</th>
                <th className="w-16">Qty</th>
                <th className="w-24">Rate</th>
                <th className="w-20">GST</th>
                <th className="w-28">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lineItems.map((row, i) => {
                const totals = computePoLineTotals(row.quantity, row.rate, row.gstPercent ?? 18);
                return (
                  <tr key={row.id || i}>
                    <td>
                      <Input
                        value={row.description}
                        onChange={(e) => updateLineItem(i, { description: e.target.value })}
                        className="text-xs"
                      />
                      <p className="text-[10px] text-ink-muted mt-0.5">
                        {[row.itemCode, row.hsnCode ? `HSN ${row.hsnCode}` : ''].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={row.quantity}
                        onChange={(e) => updateLineItem(i, { quantity: Number(e.target.value) })}
                        className="text-xs tabular-nums"
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={row.rate}
                        onChange={(e) => updateLineItem(i, { rate: Number(e.target.value) })}
                        className="text-xs tabular-nums"
                      />
                    </td>
                    <td>
                      <GstPercentSelect
                        value={row.gstPercent ?? 18}
                        onChange={(gstPercent) => updateLineItem(i, { gstPercent })}
                        compact
                      />
                    </td>
                    <td className="text-xs tabular-nums font-medium">{formatCurrency(totals.grandTotal)}</td>
                    <td>
                      <button
                        type="button"
                        className="text-ink-muted hover:text-danger text-sm"
                        onClick={() => removeLineItem(i)}
                        aria-label="Remove line"
                      >
                        ✕
                      </button>
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
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-ink-muted">Payment terms</label>
          <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink-muted">Expected delivery date</label>
          <Input
            type="date"
            value={expectedDeliveryDate}
            onChange={(e) => setExpectedDeliveryDate(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-ink-muted">Additional terms</label>
        <Textarea
          value={additionalTerms}
          onChange={(e) => setAdditionalTerms(e.target.value)}
          rows={3}
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-ink-muted">Billing address</label>
        <div className="flex flex-wrap gap-2 mt-1">
          <button
            type="button"
            className={cn(
              'rounded-lg px-2 py-1 text-xs border',
              billingAddressType === 'registered_office'
                ? 'border-bekem-accent bg-bekem-accent/10 font-semibold'
                : 'border-surface-border'
            )}
            onClick={() => {
              setBillingAddressType('registered_office');
              if (registeredOfficeAddress) setBillingAddress(registeredOfficeAddress);
            }}
          >
            Registered office
          </button>
          <button
            type="button"
            disabled={!hasProjectBilling}
            className={cn(
              'rounded-lg px-2 py-1 text-xs border',
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
            Project billing
          </button>
        </div>
        <Textarea
          value={billingAddress}
          onChange={(e) => setBillingAddress(e.target.value)}
          rows={3}
          className="mt-2 text-xs"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-ink-muted">Delivery address</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {(['site', 'workshop', 'global', 'other'] as DeliveryAddressType[]).map((t) => (
            <button
              key={t}
              type="button"
              className={cn(
                'rounded-lg px-2 py-1 text-xs border capitalize',
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
          <Textarea
            value={deliveryAddressOtherText}
            onChange={(e) => setDeliveryAddressOtherText(e.target.value)}
            rows={3}
            className="mt-2 text-xs"
            placeholder="Enter delivery location…"
          />
        ) : (
          <Textarea
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            rows={3}
            className="mt-2 text-xs"
          />
        )}
      </div>

      <div>
        <label className="text-xs font-semibold text-ink-muted">Reference note</label>
        <Input
          value={referenceNote}
          onChange={(e) => setReferenceNote(e.target.value)}
          className="mt-1"
          placeholder="e.g. Indent number or site note"
        />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" disabled={save.isPending} onClick={handleSubmit}>
          Save changes
        </Button>
      </div>

      <Modal
        open={showGrnModal}
        onClose={() => setShowGrnModal(false)}
        title="GRN conflict warning"
        subtitle="Recorded receipts may no longer match if you continue."
      >
        <ul className="text-sm text-ink-secondary space-y-2 mb-4">
          {grnWarnings.map((w) => (
            <li key={w.lineIndex} className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs">
              {w.message || w.description}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setShowGrnModal(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={save.isPending}
            onClick={() => save.mutate(true)}
          >
            Save anyway
          </Button>
        </div>
      </Modal>
    </div>
  );
}
