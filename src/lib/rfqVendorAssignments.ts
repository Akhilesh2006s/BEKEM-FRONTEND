import type { RfqComparisonDto } from '@afios/shared';
import type { VendorQuotationDraft } from '@/components/VendorQuotationEditor';

export function draftsFromComparison(data: RfqComparisonDto): VendorQuotationDraft[] {
  const itemIds = data.items.map((it) => it.materialId);
  const rows: VendorQuotationDraft[] = [];

  for (const v of data.comparison.vendors) {
    const selectedMaterialIds = (v.selectedMaterialIds ?? []).filter((id: string) =>
      itemIds.includes(id)
    );
    if (!v.vendorId || !selectedMaterialIds.length) continue;

    rows.push({
      vendorId: v.vendorId,
      vendorName: v.vendorName || '',
      rate: v.rate,
      gstPercent: v.gstPercent,
      paymentTerms: v.paymentTerms,
      deliveryTerms: v.deliveryTerms || v.deliveryTime || '',
      transportation: v.transportation || '',
      deliveryTime: v.deliveryTime || v.deliveryTerms || '',
      make: v.make || '',
      selectedMaterialIds,
      itemRates:
        v.itemRates?.map((it) => ({
          materialId: it.materialId,
          rate: it.rate,
          gstPercent: it.gstPercent,
        })) ||
        data.items.map((it) => ({
          materialId: it.materialId,
          rate: v.rate,
          gstPercent: v.gstPercent,
        })),
    });
  }

  const byVendor = new Map<string, VendorQuotationDraft>();
  for (const row of rows) {
    byVendor.set(row.vendorId, row);
  }
  return Array.from(byVendor.values());
}

export function onlyAssignedDrafts(rows: VendorQuotationDraft[]) {
  const map = new Map<string, VendorQuotationDraft>();
  for (const row of rows) {
    if (!row.vendorId || !(row.selectedMaterialIds?.length ?? 0)) continue;
    map.set(row.vendorId, row);
  }
  return Array.from(map.values());
}

/** True when the executive actually assigned vendors (not a preview-only RFQ). */
export function hasSavedRfqVendors(data: {
  comparison?: { vendors?: Array<{ vendorId?: string; selectedMaterialIds?: string[] }> };
  quotations?: Array<{ vendorId?: string; selectedMaterialIds?: string[] }>;
} | null | undefined): boolean {
  const vendors = data?.comparison?.vendors || data?.quotations || [];
  return vendors.some((v) => Boolean(v.vendorId));
}
