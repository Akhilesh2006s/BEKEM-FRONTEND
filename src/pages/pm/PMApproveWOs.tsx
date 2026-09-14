import { WOQueuePage } from '@/pages/shared/WOQueuePage';

export function PMApproveWOsPage() {
  return (
    <WOQueuePage
      title="Approve work orders"
      subtitle="Open a work order to review details, then proceed with allocation at store"
      queue="pm"
      detailPrefix="/work-orders"
      queryKey="wo-queue-pm"
    />
  );
}
