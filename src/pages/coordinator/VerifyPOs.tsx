import { POQueuePage } from '@/pages/shared/POQueuePage';

export function CoordinatorVerifyPOsPage() {
  return (
    <POQueuePage
      title="Verify purchase orders"
      subtitle="Verify each purchase order and send it to the Chairman for final approval."
      queue="coordinator"
      detailPrefix="/coordinator"
      queryKey="po-queue-coordinator"
    />
  );
}
