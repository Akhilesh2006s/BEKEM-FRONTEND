import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { VendorDto } from '@afios/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/EmptyState';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { VendorFormModal } from '@/components/VendorFormModal';

export function VendorAdminPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<VendorDto | null>(null);

  const { data: vendors, list } = useListQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const res = await api.get<{ data: VendorDto[] }>('/vendors');
      return normalizeListData<VendorDto>(res.data.data);
    },
  });

  const { data: pendingVendors, refetch: refetchPending } = useQuery({
    queryKey: ['vendors-pending'],
    queryFn: async () => {
      const res = await api.get<{ data: VendorDto[] }>('/vendors/pending-authorization');
      return res.data.data;
    },
  });

  const authorize = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'authorize' | 'reject' }) => {
      await api.post(`/vendors/${id}/authorize`, { action });
    },
    onSuccess: () => {
      toast.success('Vendor authorization updated');
      refetchPending();
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Authorization failed');
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/vendors/${id}`),
    onSuccess: () => {
      toast.success('Vendor removed');
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
  });

  const closeModal = () => {
    setShowModal(false);
    setEditTarget(null);
  };

  const openCreate = () => {
    setEditTarget(null);
    setShowModal(true);
  };

  const openEdit = (v: VendorDto) => {
    setEditTarget(v);
    setShowModal(true);
  };

  return (
    <div className="page-container max-w-5xl">
      <PageHeader
        title="Vendors"
        subtitle="Register suppliers — MSME compliance captured at onboarding"
        action={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add vendor
          </Button>
        }
      />

      {!!pendingVendors?.length && (
        <div className="mb-3 panel p-3 border-amber-200 bg-amber-50/50">
          <p className="font-semibold text-ink mb-3">
            Pending authorization ({pendingVendors.length})
          </p>
          <div className="space-y-2">
            {pendingVendors.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white border border-surface-border px-3 py-2">
                <div>
                  <p className="font-medium text-sm">{v.name}</p>
                  <p className="text-xs text-ink-muted">{v.gstNumber || v.code}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="accent"
                    disabled={authorize.isPending}
                    onClick={() => authorize.mutate({ id: v.id, action: 'authorize' })}
                  >
                    Authorize
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    disabled={authorize.isPending}
                    onClick={() => authorize.mutate({ id: v.id, action: 'reject' })}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ListQueryBoundary
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={list.onRetry}
        retrying={list.retrying}
        isEmpty={!vendors?.length}
        skeletonRows={3}
        empty={<EmptyState title="No vendors" description="Add vendors so executives can raise POs." />}
      >
        <div className="space-y-2">
          {(vendors ?? []).map((v) => (
            <div key={v.id} className="panel p-3">
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Truck className="h-4 w-4 text-bekem-accent shrink-0" />
                    <p className="font-semibold text-ink">{v.name}</p>
                    {v.isMsme && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        MSME
                      </span>
                    )}
                    <span className="text-xs text-ink-muted">★ {v.rating.toFixed(1)}</span>
                  </div>
                  <p className="text-sm text-ink-secondary mt-1 whitespace-pre-line">{v.address}</p>
                  <p className="text-xs text-ink-muted mt-2">
                    {v.gstNumber && `GST ${v.gstNumber} · `}
                    {v.contactPerson}
                    {v.phone ? ` · ${v.phone}` : ''}
                  </p>
                  {v.materials?.length ? (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {v.materials.map((m) => (
                        <span
                          key={m.id}
                          className="text-xs font-medium px-2 py-0.5 rounded-full bg-bekem-accent-soft text-bekem-accent"
                        >
                          {m.code}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-ink-muted mt-2">{v.category || 'General supplier'}</p>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(v)}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-surface-border hover:border-bekem-accent/30"
                    aria-label="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove.mutate(v.id)}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-surface-border hover:text-danger"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ListQueryBoundary>

      <VendorFormModal open={showModal} onClose={closeModal} editTarget={editTarget} />
    </div>
  );
}
