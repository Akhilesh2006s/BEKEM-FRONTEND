import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { ExpenseCategoryApprovalDto, OrgSettingsDto } from '@afios/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';

function fmtInr(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

export function SettingsAdminPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<OrgSettingsDto | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['org-settings'],
    queryFn: async () => {
      const res = await api.get<{ data: OrgSettingsDto }>('/admin/org-settings');
      const settings = res.data.data;
      setDraft(settings);
      return settings;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const res = await api.patch<{ data: OrgSettingsDto }>('/admin/org-settings', {
        poPmMaxInr: draft.poPmMaxInr,
        poCoordinatorMaxInr: draft.poCoordinatorMaxInr,
        mrPmDailyMaxInr: draft.mrPmDailyMaxInr,
        mrCoordinatorDailyMaxInr: draft.mrCoordinatorDailyMaxInr ?? 10000,
        timezone: draft.timezone,
        expenseCategories: draft.expenseCategories,
      });
      return res.data.data;
    },
    onSuccess: (updated) => {
      if (updated) setDraft(updated);
      queryClient.invalidateQueries({ queryKey: ['org-settings'] });
      queryClient.invalidateQueries({ queryKey: ['approval-limits'] });
      queryClient.invalidateQueries({ queryKey: ['pm-daily-cap'] });
      queryClient.invalidateQueries({ queryKey: ['coordinator-daily-cap'] });
      toast.success('Settings saved');
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Save failed');
    },
  });

  const settings = draft || data;

  const updateExpense = (index: number, patch: Partial<ExpenseCategoryApprovalDto>) => {
    if (!settings) return;
    const next = settings.expenseCategories.map((row, i) =>
      i === index ? { ...row, ...patch } : row
    );
    setDraft({ ...settings, expenseCategories: next });
  };

  return (
    <div className="page-container max-w-4xl">
      <PageHeader
        title="Admin settings"
        subtitle="Approval limits and expense categories — not hardcoded"
      />

      <ListQueryBoundary isLoading={isLoading} isError={isError} onRetry={() => refetch()} empty={<></>}>
        {settings && (
          <div className="space-y-3">
            <section className="panel p-3 space-y-3">
              <h2 className="text-sm font-semibold text-ink">PO approval limits (INR)</h2>
              <p className="text-xs text-ink-muted">{settings.approvalRoutingNote}</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <p className="text-[11px] font-medium text-ink-muted mb-1">PM final approval up to</p>
                  <Input
                    type="number"
                    min={0}
                    value={settings.poPmMaxInr}
                    onChange={(e) =>
                      setDraft({
                        ...settings,
                        poPmMaxInr: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-ink-muted mb-1">Coordinator final up to</p>
                  <Input
                    type="number"
                    min={0}
                    value={settings.poCoordinatorMaxInr}
                    onChange={(e) =>
                      setDraft({
                        ...settings,
                        poCoordinatorMaxInr: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-ink-muted mb-1">PM daily indent cap</p>
                  <Input
                    type="number"
                    min={0}
                    value={settings.mrPmDailyMaxInr}
                    onChange={(e) =>
                      setDraft({
                        ...settings,
                        mrPmDailyMaxInr: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-ink-muted mb-1">
                    Coordinator daily indent cap
                  </p>
                  <Input
                    type="number"
                    min={0}
                    value={settings.mrCoordinatorDailyMaxInr ?? 10000}
                    onChange={(e) =>
                      setDraft({
                        ...settings,
                        mrCoordinatorDailyMaxInr: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
            </section>

            <section className="panel p-3 space-y-3">
              <h2 className="text-sm font-semibold text-ink">Expense categories</h2>
              <p className="text-xs text-ink-muted">
                Grocery, Mess, Office, and Emergency paths — with or without PO per category.
              </p>
              <div className="procurement-landscape-scroll">
                <table className="data-table min-w-[640px]">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Requires PO</th>
                      <th>PM max</th>
                      <th>Coordinator max</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.expenseCategories.map((row, i) => (
                      <tr key={row.key}>
                        <td className="font-medium">{row.label}</td>
                        <td>
                          <input
                            type="checkbox"
                            checked={row.requiresPo}
                            onChange={(e) => updateExpense(i, { requiresPo: e.target.checked })}
                            className="rounded border-surface-border"
                          />
                        </td>
                        <td>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 text-xs"
                            value={row.pmMaxInr}
                            onChange={(e) =>
                              updateExpense(i, { pmMaxInr: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </td>
                        <td>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 text-xs"
                            value={row.coordinatorMaxInr}
                            onChange={(e) =>
                              updateExpense(i, {
                                coordinatorMaxInr: parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="text-[11px] text-ink-muted max-w-[180px]">{row.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel p-3 text-xs text-ink-secondary space-y-2">
              <p className="font-semibold text-ink">Role summary</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <strong>Executive</strong> — generate indent, RFQ, prepare PO
                </li>
                <li>
                  <strong>Coordinator</strong> — executive actions plus modify, correct, approve
                </li>
                <li>
                  <strong>Chairman / MD</strong> — view all, final approval above{' '}
                  {fmtInr(settings.poCoordinatorMaxInr)}
                </li>
              </ul>
            </section>

            <Button
              variant="primary"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              Save settings
            </Button>
          </div>
        )}
      </ListQueryBoundary>
    </div>
  );
}
