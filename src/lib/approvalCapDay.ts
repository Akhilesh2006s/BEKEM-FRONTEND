/** Calendar day used to cache daily-cap queries so leftover yesterday usage cannot stick. */
export function approvalCapDayKey(timeZone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export type CapTotalsPatch = {
  dailyApprovedTotal?: number;
  dailyCap?: number;
};

/** Prefer server totals from local-approve response so the bar updates immediately. */
export function applyCoordinatorDailyCapPatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryClient: { setQueryData: (key: unknown[], data: unknown) => void; invalidateQueries: (opts: { queryKey: string[] }) => void },
  totals?: CapTotalsPatch
) {
  if (
    totals &&
    typeof totals.dailyApprovedTotal === 'number' &&
    typeof totals.dailyCap === 'number'
  ) {
    const day = approvalCapDayKey();
    queryClient.setQueryData(['coordinator-daily-cap', day], {
      day,
      dailyApprovedTotal: totals.dailyApprovedTotal,
      dailyCap: totals.dailyCap,
      remaining: Math.max(0, totals.dailyCap - totals.dailyApprovedTotal),
    });
  }
  queryClient.invalidateQueries({ queryKey: ['coordinator-daily-cap'] });
}
