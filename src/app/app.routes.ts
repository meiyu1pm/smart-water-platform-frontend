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
        path: 'datasets/:datasetId',
        loadComponent: () =>
          import('./features/data-sources/dataset-detail.page').then((m) => m.DatasetDetailPage),
        ...routeData('datasetDetail'),
      },
      // ===== 数据中心扩展（占位模块） =====
      {
        path: 'data-center/assessment',
        loadComponent: () =>
          import('./shared/components/module-placeholder.component').then((m) => m.ModulePlaceholderComponent),
        data: {
          moduleCode: 'data_assessment',
          moduleName: '数据评估',
          moduleDesc: '评估数据质量与风险，查看质量报告与规则配置。',
          expectedApi: 'GET /api/v1/data-assessment/results',
        },
      },
      {
        path: 'data-center/cleaning',
        loadComponent: () =>
          import('./shared/components/module-placeholder.component').then((m) => m.ModulePlaceholderComponent),
        data: {
          moduleCode: 'data_cleaning',
          moduleName: '数据清洗',
          moduleDesc: '配置并执行数据清洗任务，查看清洗结果。',
          expectedApi: 'GET /api/v1/data-cleaning/configs',
        },
      },
      {
        path: 'data-center/repair',
        loadComponent: () =>
          import('./shared/components/module-placeholder.component').then((m) => m.ModulePlaceholderComponent),
        data: {
          moduleCode: 'data_repair',
          moduleName: '数据修复',
          moduleDesc: '处理缺失值与异常数据，查看修复结果。',
          expectedApi: 'GET /api/v1/data-repair/configs',
        },
      },
      {
        path: 'data-center/augmentation',
        loadComponent: () =>
          import('./shared/components/module-placeholder.component').then((m) => m.ModulePlaceholderComponent),
        data: {
          moduleCode: 'data_augmentation',
          moduleName: '数据增强',
          moduleDesc: '扩充并优化训练数据，查看增强结果。',
          expectedApi: 'GET /api/v1/data-augmentation/configs',
        },
      },
      {
        path: 'data-center/annotation',
        loadComponent: () =>
          import('./shared/components/module-placeholder.component').then((m) => m.ModulePlaceholderComponent),
        data: {
          moduleCode: 'data_annotation',
          moduleName: '数据标注',
          moduleDesc: '创建和管理标注任务，查看标注结果。',
          expectedApi: 'GET /api/v1/data-annotation/tasks',
        },
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
      // ===== 开发者工具 =====
      {
        path: 'developer/api-keys',
        loadComponent: () =>
          import('./shared/components/module-placeholder.component').then((m) => m.ModulePlaceholderComponent),
        data: {
          moduleCode: 'api_keys',
          moduleName: 'API Key 管理',
          moduleDesc: '创建和管理 API 密钥，用于程序化访问平台接口。',
          expectedApi: 'GET /api/v1/api-keys',
        },
      },
      {
        path: 'developer/docs',
        loadComponent: () =>
          import('./features/developer/dev-docs.page').then((m) => m.DevDocsPage),
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
