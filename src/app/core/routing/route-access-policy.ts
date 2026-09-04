import { Route } from '@angular/router';

import type { SwIconName } from '../../shared/components/sw-icon.component';

export type RouteAccess = 'public' | 'authenticated';

export interface PlatformRoutePolicy {
  access: RouteAccess;
  permission?: string;
  guestNavigation?: 'locked' | 'hidden';
}

interface NavigationDescriptor extends PlatformRoutePolicy {
  route: string;
  label?: string;
  icon?: SwIconName;
}

/** The only frontend policy registry for route protection and navigation. */
export const platformRoutePolicies = {
  quickTrial: { route: '/quick-trial', access: 'public', label: '快速试用', icon: 'flask' },
  dashboard: {
    route: '/dashboard',
    access: 'authenticated',
    guestNavigation: 'locked',
    label: '平台概览',
    icon: 'dashboard',
  },
  scenes: {
    route: '/scenes',
    access: 'authenticated',
    permission: 'workflow:read',
    guestNavigation: 'locked',
    label: '场景中心',
    icon: 'scene',
  },
  dataSources: {
    route: '/data-sources',
    access: 'authenticated',
    permission: 'data_source:read',
    guestNavigation: 'locked',
    label: '数据源与导入',
    icon: 'database',
  },
  dataCollections: {
    route: '/data-collections',
    access: 'authenticated',
    permission: 'data_source:read',
    guestNavigation: 'hidden',
    label: '数据集管理',
    icon: 'folder',
  },
  operatorImport: {
    route: '/operators/import',
    access: 'authenticated',
    permission: 'algorithm:publish',
  },
  operators: {
    route: '/operators',
    access: 'authenticated',
    permission: 'operator:read',
    guestNavigation: 'hidden',
    label: '算子中心',
    icon: 'operators',
  },
  datasetDetail: {
    route: '/datasets/:datasetId',
    access: 'authenticated',
    permission: 'dataset:read',
  },
  tasks: {
    route: '/tasks',
    access: 'authenticated',
    permission: 'task:read',
    guestNavigation: 'hidden',
    label: '任务中心',
    icon: 'tasks',
  },
  taskDetail: { route: '/tasks/:taskId', access: 'authenticated', permission: 'task:read' },
  result: { route: '/results/:taskId', access: 'authenticated', permission: 'result:read' },
  s01Leakage: { route: '/s01-leakage', access: 'authenticated', permission: 'workflow:edit' },
  s01Run: { route: '/s01/runs/:runId', access: 'authenticated', permission: 'workflow:read' },
  workflows: {
    route: '/workflows',
    access: 'authenticated',
    permission: 'workflow:read',
    guestNavigation: 'locked',
    label: '工作流',
    icon: 'workflow',
  },
  workflowNew: { route: '/workflows/new', access: 'authenticated', permission: 'workflow:edit' },
  workflowEditor: {
    route: '/workflows/:workflowId/edit',
    access: 'authenticated',
    permission: 'workflow:read',
  },
  workflowRuns: {
    route: '/workflow-runs',
    access: 'authenticated',
    permission: 'workflow:read',
    guestNavigation: 'hidden',
    label: '运行记录',
    icon: 'history',
  },
  workflowRunDetail: {
    route: '/workflow-runs/:runId',
    access: 'authenticated',
    permission: 'workflow:read',
  },
  users: {
    route: '/users',
    access: 'authenticated',
    permission: 'user:manage',
    guestNavigation: 'hidden',
    label: '用户管理',
    icon: 'users',
  },
  recycleBin: {
    route: '/recycle-bin',
    access: 'authenticated',
    permission: 'recycle:manage',
    guestNavigation: 'hidden',
    label: '资源回收站',
    icon: 'recycle',
  },
} as const satisfies Record<string, NavigationDescriptor>;

export type PlatformRouteKey = keyof typeof platformRoutePolicies;

export function safeInternalRedirect(url: string | undefined): string | undefined {
  return url && /^\/(?!\/)/.test(url) ? url : undefined;
}

export function routeData(
  key: PlatformRouteKey,
  extra: Record<string, unknown> = {},
): Pick<Route, 'data'> {
  const { access, permission, guestNavigation } = platformRoutePolicies[
    key
  ] as NavigationDescriptor;
  return { data: { access, permission, guestNavigation, ...extra } };
}

export function policyForRoute(route: Pick<Route, 'data'>): PlatformRoutePolicy {
  const data = route.data ?? {};
  return {
    access: data['access'] === 'public' ? 'public' : 'authenticated',
    permission: typeof data['permission'] === 'string' ? data['permission'] : undefined,
    guestNavigation: data['guestNavigation'] === 'locked' ? 'locked' : 'hidden',
  };
}

export function navigationItem(
  key: PlatformRouteKey,
): NavigationDescriptor & Required<Pick<NavigationDescriptor, 'label' | 'icon'>> {
  const item = platformRoutePolicies[key] as NavigationDescriptor;
  if (!item.label || !item.icon) throw new Error(`Route ${key} is not a navigation item.`);
  return { ...item, label: item.label, icon: item.icon };
}
