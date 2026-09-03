import { Routes } from '@angular/router';

import { authChildGuard } from './core/guards/auth.guard';
import { routeData } from './core/routing/route-access-policy';

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
        ...routeData('quickTrial'),
        loadComponent: () =>
          import('./features/quick-trial/quick-trial-hub.page').then((m) => m.QuickTrialHubPage),
      },
      {
        path: 'dashboard',
        ...routeData('dashboard'),
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'scenes',
        loadComponent: () => import('./features/scenes/scenes.page').then((m) => m.ScenesPage),
        ...routeData('scenes'),
      },
      {
        path: 'data-sources',
        loadComponent: () =>
          import('./features/data-sources/data-sources.page').then((m) => m.DataSourcesPage),
        ...routeData('dataSources'),
      },
      {
        path: 'data-collections',
        loadComponent: () =>
          import('./features/data-sources/data-collections.page').then(
            (m) => m.DataCollectionsPage,
          ),
        ...routeData('dataCollections'),
      },
      {
        path: 'operators/import',
        loadComponent: () =>
          import('./features/operators/algorithm-package.page').then((m) => m.AlgorithmPackagePage),
        ...routeData('operatorImport'),
      },
      {
        path: 'operators',
        loadComponent: () =>
          import('./features/operators/operator-center.page').then((m) => m.OperatorCenterPage),
        ...routeData('operators'),
      },
      { path: 'algorithms', redirectTo: 'operators?kind=algorithm', pathMatch: 'full' },
      {
        path: 'datasets/:datasetId',
        loadComponent: () =>
          import('./features/data-sources/dataset-detail.page').then((m) => m.DatasetDetailPage),
        ...routeData('datasetDetail'),
      },
      {
        path: 'tasks',
        loadComponent: () =>
          import('./features/task-detail/task-center.page').then((m) => m.TaskCenterPage),
        ...routeData('tasks'),
      },
      {
        path: 'tasks/:taskId',
        loadComponent: () =>
          import('./features/task-detail/task-detail.page').then((m) => m.TaskDetailPage),
        ...routeData('taskDetail'),
      },
      {
        path: 'results/:taskId',
        loadComponent: () => import('./features/results/result.page').then((m) => m.ResultPage),
        ...routeData('result'),
      },
      {
        path: 's01-leakage',
        loadComponent: () =>
          import('./features/scenes/s01-leakage-scene.page').then((m) => m.S01LeakageScenePage),
        ...routeData('s01Leakage'),
      },
      {
        path: 's01/runs/:runId',
        loadComponent: () =>
          import('./features/scenes/s01-run-result.page').then((m) => m.S01RunResultPage),
        ...routeData('s01Run'),
      },
      {
        path: 'workflows',
        loadComponent: () =>
          import('./features/workflows/workflow-library.page').then((m) => m.WorkflowLibraryPage),
        ...routeData('workflows'),
      },
      {
        path: 'workflows/new',
        loadComponent: () =>
          import('./features/workflows/workflow-starter.page').then((m) => m.WorkflowStarterPage),
        ...routeData('workflowNew'),
      },
      {
        path: 'workflows/:workflowId/edit',
        loadComponent: () =>
          import('./features/workflows/workflow-editor-workspace.page').then(
            (m) => m.WorkflowEditorWorkspacePage,
          ),
        ...routeData('workflowEditor', { workspace: true }),
      },
      {
        path: 'workflow-runs',
        loadComponent: () =>
          import('./features/workflows/workflow-runs.page').then((m) => m.WorkflowRunsPage),
        ...routeData('workflowRuns'),
      },
      {
        path: 'workflow-runs/:runId',
        loadComponent: () =>
          import('./features/workflows/workflow-run-detail.page').then(
            (m) => m.WorkflowRunDetailPage,
          ),
        ...routeData('workflowRunDetail'),
      },
      {
        path: 'users',
        loadComponent: () => import('./features/users/users.page').then((m) => m.UsersPage),
        ...routeData('users'),
      },
      {
        path: 'recycle-bin',
        loadComponent: () =>
          import('./features/recycle-bin/recycle-bin.page').then((m) => m.RecycleBinPage),
        ...routeData('recycleBin'),
      },
      { path: '', pathMatch: 'full', redirectTo: 'quick-trial' },
    ],
  },
  { path: '**', redirectTo: '' },
];
