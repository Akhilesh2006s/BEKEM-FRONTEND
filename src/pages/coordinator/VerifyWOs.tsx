import { WOQueuePage } from '@/pages/shared/WOQueuePage';

export function CoordinatorVerifyWOsPage() {
  return (
    <WOQueuePage
      title="Approve work orders"
      subtitle="Verify work orders and material receipts (GRN) before chairman approval"
      queue="coordinator"
      detailPrefix="/coordinator"
      queryKey="wo-queue-coordinator"
    />
  );
}
