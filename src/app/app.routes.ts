import { Routes } from '@angular/router';

import { authChildGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { publicRoute } from './core/routing/route-access-policy';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    loadComponent: () => import('./layout/app-shell.component').then((m) => m.AppShellComponent),
    canActivateChild: [authChildGuard],
    children: [
      {
        path: 'quick-trial',
        ...publicRoute(),
        loadComponent: () =>
          import('./features/quick-trial/quick-trial-hub.page').then((m) => m.QuickTrialHubPage),
      },
      {
        path: 'dashboard',
        data: { access: 'authenticated' },
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'scenes',
        loadComponent: () => import('./features/scenes/scenes.page').then((m) => m.ScenesPage),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'workflow:read' },
      },
      {
        path: 'data-sources',
        loadComponent: () =>
          import('./features/data-sources/data-sources.page').then((m) => m.DataSourcesPage),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'data_source:read' },
      },
      {
        path: 'data-collections',
        loadComponent: () =>
          import('./features/data-sources/data-collections.page').then(
            (m) => m.DataCollectionsPage,
          ),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'data_source:read' },
      },
      {
        path: 'operators/import',
        loadComponent: () =>
          import('./features/operators/algorithm-package.page').then((m) => m.AlgorithmPackagePage),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'algorithm:publish' },
      },
      {
        path: 'operators',
        loadComponent: () =>
          import('./features/operators/operator-center.page').then((m) => m.OperatorCenterPage),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'operator:read' },
      },
      { path: 'algorithms', redirectTo: 'operators?kind=algorithm', pathMatch: 'full' },
      {
        path: 'datasets/:datasetId',
        loadComponent: () =>
          import('./features/data-sources/dataset-detail.page').then((m) => m.DatasetDetailPage),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'dataset:read' },
      },
      {
        path: 'tasks',
        loadComponent: () =>
          import('./features/task-detail/task-center.page').then((m) => m.TaskCenterPage),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'task:read' },
      },
      {
        path: 'tasks/:taskId',
        loadComponent: () =>
          import('./features/task-detail/task-detail.page').then((m) => m.TaskDetailPage),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'task:read' },
      },
      {
        path: 'results/:taskId',
        loadComponent: () => import('./features/results/result.page').then((m) => m.ResultPage),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'result:read' },
      },
      {
        path: 's01-leakage',
        loadComponent: () =>
          import('./features/scenes/s01-leakage-scene.page').then((m) => m.S01LeakageScenePage),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'workflow:edit' },
      },
      {
        path: 's01/runs/:runId',
        loadComponent: () =>
          import('./features/scenes/s01-run-result.page').then((m) => m.S01RunResultPage),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'workflow:read' },
      },
      {
        path: 'workflows',
        loadComponent: () =>
          import('./features/workflows/workflow-library.page').then((m) => m.WorkflowLibraryPage),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'workflow:read' },
      },
      {
        path: 'workflows/new',
        loadComponent: () =>
          import('./features/workflows/workflow-starter.page').then((m) => m.WorkflowStarterPage),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'workflow:edit' },
      },
      {
        path: 'workflows/:workflowId/edit',
        loadComponent: () =>
          import('./features/workflows/workflow-editor-workspace.page').then(
            (m) => m.WorkflowEditorWorkspacePage,
          ),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'workflow:read', workspace: true },
      },
      {
        path: 'workflow-runs',
        loadComponent: () =>
          import('./features/workflows/workflow-runs.page').then((m) => m.WorkflowRunsPage),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'workflow:read' },
      },
      {
        path: 'workflow-runs/:runId',
        loadComponent: () =>
          import('./features/workflows/workflow-run-detail.page').then(
            (m) => m.WorkflowRunDetailPage,
          ),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'workflow:read' },
      },
      {
        path: 'users',
        loadComponent: () => import('./features/users/users.page').then((m) => m.UsersPage),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'user:manage' },
      },
      {
        path: 'recycle-bin',
        loadComponent: () =>
          import('./features/recycle-bin/recycle-bin.page').then((m) => m.RecycleBinPage),
        canActivate: [permissionGuard],
        data: { access: 'authenticated', permission: 'recycle:manage' },
      },
      { path: '', pathMatch: 'full', redirectTo: 'quick-trial' },
    ],
  },
  { path: '**', redirectTo: '' },
];
