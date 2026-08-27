import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    loadComponent: () => import('./layout/app-shell.component').then((m) => m.AppShellComponent),
    canActivate: [authGuard],
    children: [
      // ===== 工作台 =====
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },

      // ===== 数据中心 =====
      // 数据集管理 → 复用现有数据源页面
      {
        path: 'data-sources',
        loadComponent: () =>
          import('./features/data-sources/data-sources.page').then((m) => m.DataSourcesPage),
        canActivate: [permissionGuard],
        data: { permission: 'data_source:read' },
      },
      {
        path: 'datasets/:datasetId',
        loadComponent: () =>
          import('./features/data-sources/dataset-detail.page').then((m) => m.DatasetDetailPage),
        canActivate: [permissionGuard],
        data: { permission: 'dataset:read' },
      },
      // 数据评估 → 占位（后端可复用 SwDataQualityReport）
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
      // 数据清洗 → 占位（待后端）
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
      // 数据修复 → 占位（待后端）
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
      // 数据增强 → 占位（待后端）
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
      // 数据标注 → 占位（待后端）
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

      // ===== 算法中控（复用算子中心） =====
      {
        path: 'operators/import',
        loadComponent: () =>
          import('./features/operators/algorithm-package.page').then((m) => m.AlgorithmPackagePage),
        canActivate: [permissionGuard],
        data: { permission: 'algorithm:publish' },
      },
      {
        path: 'operators',
        loadComponent: () =>
          import('./features/operators/operator-center.page').then((m) => m.OperatorCenterPage),
        canActivate: [permissionGuard],
        data: { permission: 'operator:read' },
      },
      { path: 'algorithms', redirectTo: 'operators?kind=algorithm', pathMatch: 'full' },

      // ===== 场景编排（复用工作流） =====
      {
        path: 'workflows',
        loadComponent: () =>
          import('./features/workflows/workflow-library.page').then((m) => m.WorkflowLibraryPage),
        canActivate: [permissionGuard],
        data: { permission: 'workflow:read' },
      },
      {
        path: 'workflows/new',
        loadComponent: () =>
          import('./features/workflows/workflow-starter.page').then((m) => m.WorkflowStarterPage),
        canActivate: [permissionGuard],
        data: { permission: 'workflow:edit' },
      },
      {
        path: 'workflows/:workflowId/edit',
        loadComponent: () =>
          import('./features/workflows/workflow-editor-workspace.page').then(
            (m) => m.WorkflowEditorWorkspacePage,
          ),
        canActivate: [permissionGuard],
        data: { permission: 'workflow:read', workspace: true },
      },
      {
        path: 'workflow-runs',
        loadComponent: () =>
          import('./features/workflows/workflow-runs.page').then((m) => m.WorkflowRunsPage),
        canActivate: [permissionGuard],
        data: { permission: 'workflow:read' },
      },
      {
        path: 'workflow-runs/:runId',
        loadComponent: () =>
          import('./features/workflows/workflow-run-detail.page').then(
            (m) => m.WorkflowRunDetailPage,
          ),
        canActivate: [permissionGuard],
        data: { permission: 'workflow:read' },
      },

      // ===== 场景中心（保留旧入口） =====
      {
        path: 'scenes',
        loadComponent: () =>
          import('./features/scenes/scenes.page').then((m) => m.ScenesPage),
        canActivate: [permissionGuard],
        data: { permission: 'workflow:read' },
      },
      {
        path: 's01-leakage',
        loadComponent: () =>
          import('./features/scenes/s01-leakage-scene.page').then((m) => m.S01LeakageScenePage),
        canActivate: [permissionGuard],
        data: { permission: 'workflow:edit' },
      },
      {
        path: 's01/runs/:runId',
        loadComponent: () =>
          import('./features/scenes/s01-run-result.page').then((m) => m.S01RunResultPage),
        canActivate: [permissionGuard],
        data: { permission: 'workflow:read' },
      },

      // ===== 任务中心 =====
      {
        path: 'tasks',
        loadComponent: () =>
          import('./features/task-detail/task-center.page').then((m) => m.TaskCenterPage),
        canActivate: [permissionGuard],
        data: { permission: 'task:read' },
      },
      {
        path: 'tasks/:taskId',
        loadComponent: () =>
          import('./features/task-detail/task-detail.page').then((m) => m.TaskDetailPage),
        canActivate: [permissionGuard],
        data: { permission: 'task:read' },
      },
      {
        path: 'results/:taskId',
        loadComponent: () => import('./features/results/result.page').then((m) => m.ResultPage),
        canActivate: [permissionGuard],
        data: { permission: 'result:read' },
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

      // ===== 系统管理（保留） =====
      {
        path: 'users',
        loadComponent: () => import('./features/users/users.page').then((m) => m.UsersPage),
        canActivate: [permissionGuard],
        data: { permission: 'user:manage' },
      },
      {
        path: 'recycle-bin',
        loadComponent: () =>
          import('./features/recycle-bin/recycle-bin.page').then((m) => m.RecycleBinPage),
        canActivate: [permissionGuard],
        data: { permission: 'recycle:manage' },
      },

      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];
