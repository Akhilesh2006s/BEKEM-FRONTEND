import {
  LayoutDashboard,
  Bell,
  User,
  FilePlus,
  FileText,
  Package,
  CheckSquare,
  ShoppingCart,
  Compass,
  FileStack,
  Users,
  HardHat,
  Building2,
  Truck,
  BarChart3,
  Shield,
  ClipboardCheck,
  FileBarChart2,
  type LucideIcon,
} from 'lucide-react';

import { UserRole } from '@afios/shared';
import { reportsHubPath } from '@/lib/reportCatalog';
import { getRoleHomePath } from '@/lib/rolePaths';

/** Sidebar grouping — `po` renders under a dedicated "PO" Workspace column. */
export type NavSection = 'core' | 'po' | 'workspace';

export interface NavShortcut {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  icon: LucideIcon;
  section?: NavSection;
}

function reportsNav(role: UserRole): NavShortcut {
  return {
    id: 'reports',
    label: 'Reports',
    sublabel: 'MIS & registers',
    href: reportsHubPath(role),
    icon: FileBarChart2,
    section: 'workspace',
  };
}

export function getRoleNavShortcuts(
  role: UserRole,
  options?: { isSystemAdmin?: boolean }
): NavShortcut[] {
  const home = getRoleHomePath(role);
  const common: NavShortcut[] = [
    { id: 'home', label: 'Dashboard', sublabel: 'Role home', href: home, icon: LayoutDashboard, section: 'core' },
    { id: 'notifications', label: 'Notifications', href: '/notifications', icon: Bell, section: 'core' },
    { id: 'profile', label: 'Profile', href: '/profile', icon: User, section: 'core' },
  ];

  let shortcuts: NavShortcut[];

  switch (role) {
    case UserRole.SITE_INCHARGE:
      shortcuts = [
        ...common,
        { id: 'new-request', label: 'New indent', href: '/request/new', icon: FilePlus, section: 'workspace' },
        { id: 'my-requests', label: 'My indents', href: '/incidents', icon: FileText, section: 'workspace' },
        reportsNav(role),
        { id: 'explorer', label: 'Explorer', href: '/explorer', icon: Compass, section: 'workspace' },
      ];
      break;

    case UserRole.STORE_INCHARGE:
      shortcuts = [
        ...common,
        { id: 'new-request', label: 'New indent', href: '/request/new', icon: FilePlus, section: 'workspace' },
        { id: 'my-indents', label: 'My indents', href: '/store/requests', icon: FileText, section: 'workspace' },
        { id: 'grn', label: 'Material GRN', href: '/store/grn', icon: Package, section: 'workspace' },
        { id: 'issue', label: 'Issue to site', href: '/store/issue', icon: FilePlus, section: 'workspace' },
        { id: 'stock', label: 'Live stock balance', href: '/store/stock', icon: Package, section: 'workspace' },
        { id: 'registers', label: 'Registers', href: '/store/registers', icon: FileText, section: 'workspace' },
        { id: 'stock-aging', label: 'Stock aging', href: '/store/stock-aging', icon: Package, section: 'workspace' },
        { id: 'add-material', label: 'Product catalog', href: '/materials/new', icon: Package, section: 'workspace' },
        { id: 'finance', label: 'Finance & Tally', href: '/store/finance', icon: BarChart3, section: 'workspace' },
        {
          id: 'purchase-orders',
          label: 'Purchase orders',
          href: '/store/purchase-orders',
          icon: ShoppingCart,
          section: 'po',
        },
        reportsNav(role),
        { id: 'explorer', label: 'Explorer', href: '/explorer', icon: Compass, section: 'workspace' },
      ];
      break;

    case UserRole.PROJECT_MANAGER:
      shortcuts = [
        ...common,
        { id: 'indents', label: 'Indents', href: '/pm/material-indents?tab=all', icon: FileText, section: 'workspace' },
        {
          id: 'purchase-orders',
          label: 'Purchase orders',
          href: '/pm/purchase-orders',
          icon: ShoppingCart,
          section: 'po',
        },
        { id: 'add-material', label: 'Product catalog', href: '/materials/new', icon: Package, section: 'workspace' },
        { id: 'material-lookup', label: 'Material search', href: '/pm/material-lookup', icon: Package, section: 'workspace' },
        { id: 'approve-wos', label: 'Approve work orders', href: '/pm/approve-wos', icon: HardHat, section: 'workspace' },
        { id: 'branch-transfer', label: 'Branch transfer requests', href: '/pm/branch-transfer-requests', icon: Truck, section: 'workspace' },
        { id: 'stock', label: 'Live stock balance', href: '/store/stock', icon: Package, section: 'workspace' },
        { id: 'finance', label: 'Finance & Tally', href: '/pm/finance', icon: BarChart3, section: 'workspace' },
        reportsNav(role),
        { id: 'explorer', label: 'Explorer', href: '/explorer', icon: Compass, section: 'workspace' },
      ];
      break;

    case UserRole.EXECUTIVE:
      shortcuts = [
        ...common,
        { id: 'incidents', label: 'Indents', href: '/executive/material-indents', icon: FileText, section: 'po' },
        {
          id: 'purchase-orders',
          label: 'Purchase orders',
          href: '/executive/purchase-orders',
          icon: ShoppingCart,
          section: 'po',
        },
        { id: 'review-wos', label: 'Review work orders', href: '/executive/review-wos', icon: HardHat, section: 'workspace' },
        { id: 'generate-wo', label: 'Generate work order', href: '/executive/wo/new', icon: FilePlus, section: 'workspace' },
        { id: 'vendors', label: 'Vendors master list', href: '/vendors', icon: Users, section: 'workspace' },
        { id: 'branch-transfers', label: 'Branch transfers', href: '/executive/branch-transfers', icon: Truck, section: 'workspace' },
        { id: 'finance', label: 'Finance & Tally', href: '/executive/finance', icon: BarChart3, section: 'workspace' },
        { id: 'stock', label: 'Live stock balance', href: '/store/stock', icon: Package, section: 'workspace' },
        reportsNav(role),
        { id: 'explorer', label: 'Explorer', href: '/explorer', icon: Compass, section: 'workspace' },
      ];
      break;

    case UserRole.COORDINATOR:
      shortcuts = [
        ...common,
        {
          id: 'procurement-requests',
          label: 'Procurement requests',
          href: '/coordinator/procurement-requests',
          icon: FilePlus,
          section: 'po',
        },
        {
          id: 'purchase-orders',
          label: 'Purchase orders',
          href: '/coordinator/purchase-orders',
          icon: ShoppingCart,
          section: 'po',
        },
        { id: 'verify-po', label: 'Verify POs', href: '/coordinator/verify-pos', icon: Shield, section: 'po' },
        { id: 'procurement-decisions', label: 'Procurement Decisions', href: '/coordinator/procurement-decisions', icon: ClipboardCheck, section: 'po' },
        { id: 'rfq-inbox', label: 'RFQ inbox', href: '/coordinator/rfq/inbox', icon: FileStack, section: 'po' },
        { id: 'ho-indents', label: 'Generate indent (HO)', href: '/coordinator/ho-indents', icon: FilePlus, section: 'workspace' },
        { id: 'grn', label: 'Material receipt (GRN)', href: '/coordinator/grn', icon: Package, section: 'workspace' },
        { id: 'grn-approvals', label: 'GRN on hold', href: '/coordinator/grn-approvals', icon: Shield, section: 'workspace' },
        { id: 'verify-wo', label: 'Approve WOs', href: '/coordinator/verify-wos', icon: HardHat, section: 'workspace' },
        { id: 'branch-transfers', label: 'Branch transfer approvals', href: '/coordinator/branch-transfers', icon: Truck, section: 'workspace' },
        { id: 'projects', label: 'Projects', href: '/admin/projects', icon: Building2, section: 'workspace' },
        { id: 'vendors', label: 'Vendors', href: '/admin/vendors', icon: Truck, section: 'workspace' },
        { id: 'settings', label: 'Admin settings', href: '/admin/settings', icon: Shield, section: 'workspace' },
        { id: 'indent-categories', label: 'Indent categories', href: '/admin/indent-categories', icon: ClipboardCheck, section: 'workspace' },
        { id: 'finance', label: 'Finance & Tally', href: '/coordinator/finance', icon: BarChart3, section: 'workspace' },
        { id: 'incidents', label: 'Material indents', href: '/coordinator/material-indents', icon: FileText, section: 'workspace' },
        { id: 'add-material', label: 'Product catalog', href: '/materials/new', icon: Package, section: 'workspace' },
        { id: 'stock', label: 'Live stock balance', href: '/store/stock', icon: Package, section: 'workspace' },
        reportsNav(role),
        { id: 'audit', label: 'Audit log', href: '/audit-logs', icon: FileStack, section: 'workspace' },
        { id: 'explorer', label: 'Explorer', href: '/explorer', icon: Compass, section: 'workspace' },
      ];
      break;

    case UserRole.CHAIRMAN:
      shortcuts = [
        ...common,
        {
          id: 'procurement-requests',
          label: 'Procurement requests',
          href: '/chairman/procurement-requests',
          icon: FilePlus,
          section: 'po',
        },
        {
          id: 'purchase-orders',
          label: 'Purchase orders',
          href: '/chairman/purchase-orders',
          icon: ShoppingCart,
          section: 'po',
        },
        { id: 'approvals', label: 'Approve POs', href: '/chairman/approve-pos', icon: CheckSquare, section: 'po' },
        { id: 'grn-approvals', label: 'GRN on hold', href: '/chairman/grn-approvals', icon: Package, section: 'workspace' },
        { id: 'approve-wos', label: 'Approve work orders', href: '/chairman/approve-wos', icon: HardHat, section: 'workspace' },
        { id: 'stock', label: 'Live stock balance', href: '/store/stock', icon: Package, section: 'workspace' },
        { id: 'branch-transfers', label: 'Branch transfer monitoring', href: '/chairman/branch-transfers', icon: Truck, section: 'workspace' },
        { id: 'user-analytics', label: 'User analytics', href: '/chairman/user-analytics', icon: BarChart3, section: 'workspace' },
        { id: 'settings', label: 'Admin settings', href: '/admin/settings', icon: Shield, section: 'workspace' },
        { id: 'indent-categories', label: 'Indent categories', href: '/admin/indent-categories', icon: ClipboardCheck, section: 'workspace' },
        { id: 'finance', label: 'Finance & Tally', href: '/chairman/finance', icon: BarChart3, section: 'workspace' },
        reportsNav(role),
        { id: 'explorer', label: 'Explorer', href: '/explorer', icon: Compass, section: 'workspace' },
        { id: 'audit', label: 'Audit log', href: '/audit-logs', icon: FileStack, section: 'workspace' },
      ];
      break;

    default:
      shortcuts = common;
  }

  if (options?.isSystemAdmin) {
    const projectsIdx = shortcuts.findIndex((s) => s.id === 'projects');
    const manageUsers: NavShortcut = {
      id: 'manage-users',
      label: 'Manage users',
      href: '/admin/users',
      icon: Users,
      section: 'workspace',
    };
    if (projectsIdx >= 0) {
      shortcuts = [
        ...shortcuts.slice(0, projectsIdx + 1),
        manageUsers,
        ...shortcuts.slice(projectsIdx + 1),
      ];
    } else {
      shortcuts = [...shortcuts, manageUsers];
    }
  }

  return shortcuts;
}
