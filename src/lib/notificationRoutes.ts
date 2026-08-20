import { UserRole } from '@afios/shared';
import type { NotificationDto } from '@afios/shared';

function procurementDecisionPath(role: UserRole, id: string): string | null {
  if (role === UserRole.EXECUTIVE) return `/executive/procurement-decisions/${id}`;
  if (role === UserRole.COORDINATOR) return `/coordinator/procurement-decisions/${id}`;
  if (role === UserRole.CHAIRMAN) return `/coordinator/procurement-decisions/${id}`;
  return null;
}

/** Role-safe destination when tapping a notification. Returns null if no in-app view exists. */
export function getNotificationPath(
  n: NotificationDto,
  role: UserRole
): string | null {
  if (n.relatedEntityType === 'ProcurementDecision') {
    return procurementDecisionPath(role, n.relatedEntityId);
  }

  if (n.relatedEntityType === 'MaterialRequest') {
    if (role === UserRole.STORE_INCHARGE) {
      return `/requests/${n.relatedEntityId}`;
    }
    if (role === UserRole.SITE_INCHARGE) {
      return `/requests/${n.relatedEntityId}`;
    }
    if (role === UserRole.PROJECT_MANAGER) {
      return `/pm/mobile-approve/${n.relatedEntityId}`;
    }
    if (role === UserRole.EXECUTIVE) {
      return `/requests/${n.relatedEntityId}`;
    }
    if (role === UserRole.COORDINATOR) {
      return procurementDecisionPath(role, n.relatedEntityId);
    }
    return null;
  }

  if (n.relatedEntityType === 'RFQ') {
    if (
      role === UserRole.EXECUTIVE ||
      role === UserRole.COORDINATOR ||
      role === UserRole.CHAIRMAN
    ) {
      return `/rfqs/${n.relatedEntityId}`;
    }
    return null;
  }

  if (n.relatedEntityType === 'PurchaseRequest') {
    if (role === UserRole.EXECUTIVE) return `/executive/purchase-requests/${n.relatedEntityId}`;
    if (role === UserRole.COORDINATOR) return '/coordinator/rfq/inbox';
    return null;
  }

  if (n.relatedEntityType === 'PurchaseOrder') {
    if (role === UserRole.EXECUTIVE) return `/purchase-orders/${n.relatedEntityId}`;
    if (role === UserRole.PROJECT_MANAGER) {
      return `/pm/mobile-po-approve/${n.relatedEntityId}`;
    }
    if (role === UserRole.COORDINATOR) return `/coordinator/po/${n.relatedEntityId}`;
    if (role === UserRole.CHAIRMAN) return `/chairman/po/${n.relatedEntityId}`;
    return null;
  }

  if (n.relatedEntityType === 'WorkOrder') {
    if (role === UserRole.EXECUTIVE) return `/work-orders/${n.relatedEntityId}`;
    if (role === UserRole.COORDINATOR) return `/coordinator/wo/${n.relatedEntityId}`;
    if (role === UserRole.CHAIRMAN) return `/chairman/wo/${n.relatedEntityId}`;
    if (role === UserRole.PROJECT_MANAGER) return `/work-orders/${n.relatedEntityId}`;
    return null;
  }

  if (n.relatedEntityType === 'GoodsReceiptNote') {
    if (role === UserRole.COORDINATOR) return '/coordinator/verify-wos';
    if (role === UserRole.CHAIRMAN) return '/chairman/approve-wos';
    return null;
  }

  return null;
}
