import { Mail, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PdfActions } from '@/components/PdfActions';
import { Button } from '@/components/ui/Button';

export interface RfqVendorShareRow {
  vendorId: string;
  vendorName?: string;
  selectedMaterialIds?: string[];
  paymentTerms?: string;
  deliveryTerms?: string;
}

interface RfqVendorShareListProps {
  rfqId: string;
  rfqNumber: string;
  vendors: RfqVendorShareRow[];
  items: Array<{ materialId: string; name: string; quantity: number; unit: string }>;
}

function productNamesForVendor(
  vendor: RfqVendorShareRow,
  items: RfqVendorShareListProps['items']
) {
  return items
    .filter((item) => vendor.selectedMaterialIds?.includes(item.materialId))
    .map((item) => `${item.name} (${item.quantity} ${item.unit})`);
}

export function mergeAssignedVendors(
  drafts: RfqVendorShareRow[],
  comparisonVendors: Array<{
    vendorId: string;
    vendorName?: string;
    selectedMaterialIds?: string[];
    paymentTerms?: string;
    deliveryTerms?: string;
  }> = []
): RfqVendorShareRow[] {
  const map = new Map<string, RfqVendorShareRow>();
  for (const row of drafts) {
    if (!row.vendorId || !(row.selectedMaterialIds?.length ?? 0)) continue;
    map.set(row.vendorId, row);
  }
  for (const vendor of comparisonVendors) {
    if (!vendor.vendorId) continue;
    const existing = map.get(vendor.vendorId);
    const selectedMaterialIds =
      vendor.selectedMaterialIds?.length
        ? vendor.selectedMaterialIds
        : existing?.selectedMaterialIds;
    if (!selectedMaterialIds?.length && !existing) continue;
    map.set(vendor.vendorId, {
      vendorId: vendor.vendorId,
      vendorName: vendor.vendorName || existing?.vendorName,
      selectedMaterialIds: selectedMaterialIds || [],
      paymentTerms: vendor.paymentTerms || existing?.paymentTerms,
      deliveryTerms: vendor.deliveryTerms || existing?.deliveryTerms,
    });
  }
  return Array.from(map.values()).sort((a, b) =>
    (a.vendorName || a.vendorId).localeCompare(b.vendorName || b.vendorId)
  );
}

function safeFilenamePart(value: string) {
  return value.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 40);
}

export function RfqVendorShareList({ rfqId, rfqNumber, vendors, items }: RfqVendorShareListProps) {
  const emailVendor = async (vendor: RfqVendorShareRow) => {
    try {
      const res = await api.post<{ data: { sent: boolean; to?: string } }>(`/rfqs/${rfqId}/email`, {
        vendorId: vendor.vendorId,
      });
      if (res.data.data.sent) {
        toast.success(`RFQ emailed to ${vendor.vendorName || res.data.data.to || 'vendor'}`);
      } else {
        toast.error('Email could not be sent');
      }
    } catch {
      toast.error('Email failed');
    }
  };

  const whatsappVendor = async (vendor: RfqVendorShareRow) => {
    try {
      const res = await api.get<{ data: { url: string } }>(
        `/rfqs/${rfqId}/share/whatsapp?vendorId=${vendor.vendorId}`
      );
      window.open(res.data.data.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Could not open WhatsApp share');
    }
  };

  if (!vendors.length) {
    return (
      <p className="text-sm text-ink-muted py-4 text-center">
        No vendors assigned yet. Assign vendors to products in the previous step.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-secondary">
        Vendors as columns — each receives an RFQ with only their assigned products — scroll
        sideways if needed.
      </p>
      <div className="panel">
        <div className="procurement-landscape-scroll">
          <table className="data-table">
            <thead>
              <tr className="bg-surface-muted/40">
                <th className="sticky left-0 z-[1] bg-slate-100 min-w-[100px]">Metric</th>
                {vendors.map((vendor, index) => (
                  <th key={vendor.vendorId} className="min-w-[160px]">
                    <span className="block">Vendor {index + 1}</span>
                    <span className="block font-normal text-[10px] truncate max-w-[180px] normal-case tracking-normal">
                      {vendor.vendorName || vendor.vendorId}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="sticky left-0 z-[1] bg-white font-medium text-ink-secondary whitespace-nowrap">
                  Products in RFQ
                </td>
                {vendors.map((vendor) => {
                  const products = productNamesForVendor(vendor, items);
                  return (
                    <td key={vendor.vendorId} className="text-[11px] text-ink-secondary align-top">
                      {products.length ? (
                        <ul className="list-disc pl-4 space-y-0.5">
                          {products.map((name) => (
                            <li key={name}>{name}</li>
                          ))}
                        </ul>
                      ) : (
                        '—'
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="sticky left-0 z-[1] bg-white font-medium text-ink-secondary whitespace-nowrap">
                  Share
                </td>
                {vendors.map((vendor) => (
                  <td key={vendor.vendorId}>
                    <div className="flex flex-wrap gap-1">
                      <PdfActions
                        path={`/rfqs/${rfqId}/pdf?vendorId=${vendor.vendorId}`}
                        filename={`${rfqNumber}-${safeFilenamePart(vendor.vendorName || vendor.vendorId)}.pdf`}
                        size="sm"
                        viewLabel="View"
                        downloadLabel="PDF"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void emailVendor(vendor)}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Email
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void whatsappVendor(vendor)}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
                      </Button>
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
