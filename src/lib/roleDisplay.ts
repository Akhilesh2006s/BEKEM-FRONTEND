import { ROLE_LABELS, UserRole } from '@afios/shared';

export function roleDisplayLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}
