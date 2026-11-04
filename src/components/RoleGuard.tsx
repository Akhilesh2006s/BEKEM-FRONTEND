import { Navigate, useLocation } from 'react-router-dom';

import { useAuthStore } from '@/stores/authStore';

import { PERMISSION_MATRIX, UserRole, type Capability } from '@afios/shared';

import { getRoleHomePath } from '@/lib/rolePaths';

interface RoleGuardProps {
  children: React.ReactNode;
  capability?: Capability;
  capabilities?: Capability[];
  match?: 'any' | 'all';
  roles?: UserRole[];
  forbid?: boolean;
  systemAdmin?: boolean;
}

export function RoleGuard({ children, capability, capabilities, match = 'any', roles, forbid, systemAdmin }: RoleGuardProps) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace />;

  const role = user.role as UserRole;
  const caps = PERMISSION_MATRIX[role] || [];
  const home = getRoleHomePath(role);

  const deny = () => {
    return <Navigate to={home} replace state={{ from: location.pathname }} />;
  };

  if (systemAdmin && !user.isSystemAdmin) {
    return deny();
  }

  if (forbid && capability && caps.includes(capability)) {
    return deny();
  }

  if (capability && !caps.includes(capability)) {
    return deny();
  }

  if (capabilities?.length) {
    const ok =
      match === 'all'
        ? capabilities.every((c) => caps.includes(c))
        : capabilities.some((c) => caps.includes(c));
    if (!ok) return deny();
  }

  if (roles && !roles.includes(role)) {
    return deny();
  }

  return <>{children}</>;
}
