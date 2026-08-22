import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Search, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { previewVendorGstLookup } from '@/lib/vendorGstLookup';
import type { CreateVendorDto, MaterialDto, MsmeCertificateUploadDto, VendorDto } from '@afios/shared';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

const emptyForm: CreateVendorDto = {
  name: '',
  isMsme: false,
  code: '',
  address: '',
  gstNumber: '',
  panNumber: '',
  email: '',
  contactPerson: '',
  phone: '',
  bankName: '',
  bankAccountNumber: '',
  ifscCode: '',
  msmeNumber: '',
  category: '',
  suppliedCategories: [],
  materialIds: [],
};

function readFileAsBase64(file: File): Promise<MsmeCertificateUploadDto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve({ fileName: file.name, mimeType: file.type, dataBase64: base64 });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formFromVendor(v: VendorDto): CreateVendorDto {
  return {
    name: v.name,
    isMsme: !!v.isMsme,
    code: v.code || '',
    address: v.address,
    gstNumber: v.gstNumber,
    panNumber: v.panNumber || '',
    email: v.email,
    contactPerson: v.contactPerson,
    phone: v.phone,
    bankName: v.bankName || '',
    bankAccountNumber: v.bankAccountNumber || '',
    ifscCode: v.ifscCode || '',
    msmeNumber: v.msmeNumber || '',
    category: v.category,
    suppliedCategories: v.suppliedCategories || [],
    materialIds: v.materialIds || [],
  };
}

export interface VendorFormModalProps {
  open: boolean;
  onClose: () => void;
  editTarget?: VendorDto | null;
  /** Prefill vendor name (e.g. RFQ search text). */
  initialName?: string;
  /** Prefill materials supplied (e.g. current RFQ products). */
  initialMaterialIds?: string[];
  onSaved?: (vendor: VendorDto) => void;
}

export function VendorFormModal({
  open,
  onClose,
  editTarget = null,
  initialName = '',
  initialMaterialIds = [],
  onSaved,
}: VendorFormModalProps) {
  const queryClient = useQueryClient();
  const [wizardStep, setWizardStep] = useState(0);
  const [form, setForm] = useState<CreateVendorDto>(emptyForm);
  const [msmeCert, setMsmeCert] = useState<MsmeCertificateUploadDto | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [msmeChoice, setMsmeChoice] = useState<boolean | null>(null);
  const [gstLookupMessage, setGstLookupMessage] = useState<string | null>(null);

  const { data: materials } = useQuery({
    queryKey: ['materials-list'],
    queryFn: async () => {
      const res = await api.get<{ data: MaterialDto[] }>('/materials');
      return res.data.data;
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setMsmeCert(null);
    setUploadProgress(0);
    setGstLookupMessage(null);
    if (editTarget) {
      setForm(formFromVendor(editTarget));
      setMsmeChoice(editTarget.isMsme ? true : false);
      setWizardStep(1);
      return;
    }
    setForm({
      ...emptyForm,
      name: initialName.trim(),
      materialIds: [...initialMaterialIds],
    });
    setMsmeChoice(null);
    setWizardStep(0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when modal opens

  const previewGst = async () => {
    if (!form.gstNumber?.trim()) {
      toast.error('Enter GST number first');
      return;
    }
    try {
      const result = await previewVendorGstLookup(form.gstNumber);
      setGstLookupMessage(result.message || null);
      if (result.available && result.name) {
        setForm((f) => ({
          ...f,
          name: result.name || f.name,
          address: result.address || f.address,
          panNumber: result.panNumber || f.panNumber,
        }));
        toast.success(result.message || 'Vendor details applied from GST registry');
      } else {
        toast.info(result.message || 'No taxpayer found for this GSTIN');
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'GST preview failed');
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        msmeNumber: form.isMsme ? form.msmeNumber : undefined,
        msmeCertificate: form.isMsme ? msmeCert || undefined : undefined,
      };
      if (editTarget) {
        const res = await api.patch<{ data: VendorDto }>(`/vendors/${editTarget.id}`, payload);
        return res.data.data;
      }
      const res = await api.post<{ data: VendorDto }>('/vendors', payload);
      const created = res.data?.data;
      if (!created?.id) {
        throw new Error('Vendor was saved but could not be loaded');
      }
      return created;
    },
    onSuccess: (vendor) => {
      toast.success(editTarget ? 'Vendor updated' : 'Vendor added');
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['vendors-active'] });
      queryClient.invalidateQueries({ queryKey: ['vendors-pending'] });
      onSaved?.(vendor);
      onClose();
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Failed to save vendor');
    },
  });

  const toggleMaterial = (id: string) => {
    const ids = form.materialIds || [];
    setForm({
      ...form,
      materialIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    });
  };

  const onMsmeFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(10);
    try {
      const cert = await readFileAsBase64(file);
      setUploadProgress(100);
      setMsmeCert(cert);
      toast.success('Certificate attached');
    } catch {
      toast.error('Could not read file');
    } finally {
      setUploading(false);
    }
  };

  const canProceedMsme =
    form.isMsme === false ||
    (!!form.msmeNumber?.trim() && (!!msmeCert || !!editTarget?.msmeCertificateUrl));

  const canSave =
    !!form.name?.trim() &&
    !!form.gstNumber?.trim() &&
    !!form.panNumber?.trim() &&
    !!form.contactPerson?.trim() &&
    !!form.phone?.trim() &&
    !!form.bankName?.trim() &&
    !!form.bankAccountNumber?.trim() &&
    !!form.ifscCode?.trim() &&
    canProceedMsme &&
    (editTarget || form.isMsme !== undefined);

  return (
    <Modal
      open={open}
      onClose={() => !save.isPending && onClose()}
      title={editTarget ? 'Edit vendor' : 'Add vendor'}
      subtitle={
        wizardStep === 0 && !editTarget ? 'Step 1 — MSME registration' : 'Step 2 — Vendor details'
      }
      className="max-w-xl"
    >
      {wizardStep === 0 && !editTarget ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-secondary">
            Is this vendor registered under MSME (Udyam)?
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Yes — MSME registered', value: true },
              { label: 'No — not MSME', value: false },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                className={cn(
                  'rounded-xl border px-4 py-6 text-sm font-semibold text-left',
                  msmeChoice === opt.value
                    ? 'border-bekem-accent bg-bekem-accent/10'
                    : 'border-surface-border hover:border-bekem-accent/30'
                )}
                onClick={() => setMsmeChoice(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button
            className="w-full"
            variant="primary"
            disabled={msmeChoice === null}
            onClick={() => {
              setForm({ ...form, isMsme: msmeChoice === true });
              setWizardStep(1);
            }}
          >
            Continue
          </Button>
        </div>
      ) : (
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {form.isMsme && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
              <p className="text-xs font-semibold text-emerald-800">MSME details (required)</p>
              <Input
                placeholder="MSME / Udyam number"
                value={form.msmeNumber || ''}
                onChange={(e) => setForm({ ...form, msmeNumber: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm border border-dashed border-emerald-300 rounded-xl px-3 py-3 cursor-pointer hover:bg-emerald-50">
                <Upload className="h-4 w-4 text-emerald-700" />
                <span>{msmeCert?.fileName || 'Upload MSME certificate (PDF or image)'}</span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => onMsmeFile(e.target.files?.[0] || null)}
                />
              </label>
              {uploading && (
                <div className="h-1.5 rounded-full bg-emerald-100 overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
              {msmeCert && (
                <p className="text-xs text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {msmeCert.fileName} attached
                </p>
              )}
              {editTarget?.msmeCertificateUrl && !msmeCert && (
                <p className="text-xs text-ink-muted">Existing certificate on file</p>
              )}
            </div>
          )}

          <Input
            placeholder="Vendor name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            placeholder="Vendor code (e.g. TATA, CST)"
            value={form.code || ''}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          />
          <Textarea
            placeholder="Full address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Input
                placeholder="GST number *"
                value={form.gstNumber}
                onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
              />
              <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={previewGst}>
                <Search className="h-3.5 w-3.5" />
                Fetch from GST portal
              </Button>
              {gstLookupMessage && (
                <p className="text-[11px] text-ink-muted">{gstLookupMessage}</p>
              )}
            </div>
            <Input
              placeholder="PAN *"
              value={form.panNumber || ''}
              onChange={(e) => setForm({ ...form, panNumber: e.target.value })}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input
              placeholder="Contact person *"
              value={form.contactPerson}
              onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
            />
            <Input
              placeholder="Phone *"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <Input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <div className="grid sm:grid-cols-3 gap-2">
            <Input
              placeholder="Bank name *"
              value={form.bankName || ''}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
            />
            <Input
              placeholder="Account no. *"
              value={form.bankAccountNumber || ''}
              onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
            />
            <Input
              placeholder="IFSC *"
              value={form.ifscCode || ''}
              onChange={(e) => setForm({ ...form, ifscCode: e.target.value })}
            />
          </div>
          <Input
            placeholder="Category"
            value={form.category}
            onChange={(e) =>
              setForm({
                ...form,
                category: e.target.value,
                suppliedCategories: e.target.value.trim() ? [e.target.value.trim()] : [],
              })
            }
          />
          <div>
            <p className="text-xs font-semibold text-ink-muted mb-2">Materials supplied</p>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {materials?.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMaterial(m.id)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium border',
                    form.materialIds?.includes(m.id)
                      ? 'border-bekem-accent bg-bekem-accent-soft text-bekem-accent'
                      : 'border-surface-border text-ink-secondary'
                  )}
                >
                  {m.code}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            {!editTarget && (
              <Button variant="secondary" className="flex-1" onClick={() => setWizardStep(0)}>
                Back
              </Button>
            )}
            <Button
              variant="primary"
              className="flex-1"
              disabled={!canSave || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Saving…' : editTarget ? 'Save changes' : 'Add vendor'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
