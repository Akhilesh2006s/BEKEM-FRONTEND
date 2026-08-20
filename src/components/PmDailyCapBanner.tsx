import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DailyCapDto, PmDailyCapDto } from '@afios/shared';
import { cn } from '@/lib/utils';

function fmtInr(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

interface DailyCapBannerProps {
  cap?: DailyCapDto;
  queryKey: string[];
  path: string;
  barClassName?: string;
  overCapMessage: string;
}

function DailyCapBanner({
  cap,
  queryKey,
  path,
  barClassName = 'bg-pm',
  overCapMessage,
}: DailyCapBannerProps) {
  const { data: fetched } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await api.get<{ data: DailyCapDto }>(path);
      return res.data.data;
    },
    enabled: !cap,
    refetchInterval: 30_000,
  });

  const daily = cap || fetched;
  if (!daily) return null;

  const { dailyApprovedTotal, dailyCap, remaining } = daily;
  const pct = dailyCap > 0 ? Math.min(100, Math.round((dailyApprovedTotal / dailyCap) * 100)) : 0;
  const nearCap = remaining <= Math.min(500, dailyCap * 0.1);
  const overCap = dailyApprovedTotal >= dailyCap;

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 mb-3',
        overCap
          ? 'border-danger/40 bg-danger/5'
          : nearCap
            ? 'border-warning/40 bg-warning/5'
            : 'border-surface-border bg-surface-muted/30'
      )}
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-ink">
          Approved today: {fmtInr(dailyApprovedTotal)} of {fmtInr(dailyCap)}
        </span>
        <span
          className={cn(
            'text-xs font-semibold tabular-nums',
            overCap ? 'text-danger' : nearCap ? 'text-warning' : 'text-ink-muted'
          )}
        >
          {fmtInr(remaining)} left
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-surface-border overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            overCap ? 'bg-danger' : nearCap ? 'bg-warning' : barClassName
          )}
          style={{ width: `${Math.max(pct, dailyApprovedTotal > 0 ? 2 : 0)}%` }}
        />
      </div>
      {overCap && <p className="text-xs text-danger mt-2">{overCapMessage}</p>}
    </div>
  );
}

export function PmDailyCapBanner({ cap }: { cap?: PmDailyCapDto }) {
  return (
    <DailyCapBanner
      cap={cap}
      queryKey={['pm-daily-cap']}
      path="/material-requests/pm/daily-cap"
      barClassName="bg-pm"
      overCapMessage="Daily cap reached — further approvals will escalate to Head Office."
    />
  );
}

export function CoordinatorDailyCapBanner({ cap }: { cap?: DailyCapDto }) {
  return (
    <DailyCapBanner
      cap={cap}
      queryKey={['coordinator-daily-cap']}
      path="/material-requests/coordinator/daily-cap"
      barClassName="bg-coordinator"
      overCapMessage="Daily cap reached — further approvals will escalate to MD / Chairman."
    />
  );
}
