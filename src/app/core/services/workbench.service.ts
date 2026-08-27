import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';

import { ApiClient } from './api-client.service';
import { PortalSummary, TaskDetail } from '../models/api.models';
import {
  ApiKey,
  DataModuleCode,
  DataModuleConfig,
  DataModuleResult,
  DataModuleRun,
  QuickEntry,
  WorkbenchRecentTask,
  WorkbenchStats,
  WorkbenchSummary,
} from '../models/workbench.models';

/**
 * 工作台服务。
 *
 * 当前阶段：复用现有 /api/v1/portal/summary 和 /api/v1/tasks 数据，
 *           映射到工作台需要的格式，缺失字段用合理默认值填充。
 *
 * 后续阶段：后端实现 /api/v1/portal/workbench 后，替换 getWorkbenchSummary()
 *           的实现即可，调用方无需改动。
 *
 * 数据处理四件套（清洗/修复/增强/标注）和 API Key 的方法均已预留，
 * 后端接口就绪后取消注释并实现即可。
 */
@Injectable({ providedIn: 'root' })
export class WorkbenchService {
  private readonly api = inject(ApiClient);

  // ---------------------------------------------------------------------------
  // 工作台统计
  // ---------------------------------------------------------------------------

  /**
   * 获取工作台汇总数据。
   *
   * TODO(backend): 后端实现 GET /api/v1/portal/workbench 后，
   *   改为直接调用 this.api.get<WorkbenchSummary>('/api/v1/portal/workbench')
   */
  getWorkbenchSummary(): Observable<WorkbenchSummary> {
    return this.api.get<PortalSummary>('/api/v1/portal/summary').pipe(
      map((portal) => this.mapPortalToWorkbench(portal)),
    );
  }

  /** 将现有 PortalSummary 映射为工作台格式，缺失字段填默认值 */
  private mapPortalToWorkbench(portal: PortalSummary): WorkbenchSummary {
    const stats: WorkbenchStats = {
      today_tasks: portal.stats.completed_runs_7d,
      today_tasks_delta_pct: null,
      running_tasks: portal.stats.running_tasks,
      running_eta_count: null,
      algorithm_calls_week: 0, // TODO(backend): 后端需提供算法调用次数统计
      algorithm_calls_delta_pct: null,
      abnormal_tasks: portal.stats.failed_tasks_24h,
      abnormal_tasks_delta: null,
    };

    const recent_tasks: WorkbenchRecentTask[] = (portal.recent_tasks ?? []).map((t) => ({
      task_id: t.task_id,
      task_name: this.taskTypeLabel(t.task_type),
      task_type: t.task_type,
      task_type_label: this.taskTypeLabel(t.task_type),
      status: t.status,
      progress: t.progress,
      owner_name: null, // TODO(backend): 后端需在 recent_tasks 中补充负责人
      owner_avatar_text: null,
      started_at: t.updated_at,
      trace_id: t.trace_id,
    }));

    return { stats, recent_tasks };
  }

  /** 任务类型 → 中文显示名 */
  private taskTypeLabel(type: string): string {
    const map: Record<string, string> = {
      ingestion: '数据导入',
      data_import: '数据导入',
      csv_import: 'CSV 导入',
      quality_profile: '质量评估',
      algorithm_run: '算法运行',
      cpu_algorithm: '算法运行',
      gpu_algorithm: 'GPU 算法',
      workflow: '工作流运行',
      workflow_run: '工作流运行',
      s01_assessment: 'S01 漏损评估',
      data_governance: '数据治理',
      algorithm_provisioning: '算法环境制备',
      dataset_management: '数据管理',
      system: '系统维护',
      training: '模型训练',
    };
    return map[type] ?? type;
  }

  // ---------------------------------------------------------------------------
  // 快捷入口（前端静态定义，后续可改为从后端获取）
  // ---------------------------------------------------------------------------

  getQuickEntries(): QuickEntry[] {
    return [
      {
        code: 'algorithm_register',
        name: '算法注册',
        description: '创建算法与版本',
        route: '/operators/import',
        icon: 'memory',
        color: 'purple',
        requiresBackend: false,
      },
      {
        code: 'data_assessment',
        name: '数据评估',
        description: '评估数据质量与风险',
        route: '/data-center/assessment',
        icon: 'assignment_turned_in',
        color: 'success',
        requiresBackend: false,
      },
      {
        code: 'data_cleaning',
        name: '数据清洗',
        description: '配置并执行清洗任务',
        route: '/data-center/cleaning',
        icon: 'cleaning_services',
        color: 'info',
        requiresBackend: true,
      },
      {
        code: 'data_repair',
        name: '数据修复',
        description: '处理缺失值与异常数据',
        route: '/data-center/repair',
        icon: 'handyman',
        color: 'warning',
        requiresBackend: true,
      },
      {
        code: 'data_augmentation',
        name: '数据增强',
        description: '扩充并优化训练数据',
        route: '/data-center/augmentation',
        icon: 'auto_awesome',
        color: 'purple',
        requiresBackend: true,
      },
      {
        code: 'data_annotation',
        name: '数据标注',
        description: '创建和管理标注任务',
        route: '/data-center/annotation',
        icon: 'label',
        color: 'teal',
        requiresBackend: true,
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // 最近任务（增强版：调用任务列表获取更丰富字段）
  // ---------------------------------------------------------------------------

  getRecentTasks(limit = 5): Observable<WorkbenchRecentTask[]> {
    return this.api
      .get<{ items: TaskDetail[]; total: number }>('/api/v1/tasks', {
        page: 1,
        page_size: limit,
      })
      .pipe(
        map((page) =>
          page.items.map((t) => ({
            task_id: t.task_id,
            task_name: this.taskTypeLabel(t.task_type),
            task_type: t.task_type,
            task_type_label: this.taskTypeLabel(t.task_type),
            status: t.status,
            progress: t.progress,
            owner_name: null, // TODO(backend)
            owner_avatar_text: null,
            started_at: t.started_at ?? t.created_at,
            trace_id: t.trace_id,
          })),
        ),
      );
  }

  // ---------------------------------------------------------------------------
  // 数据处理四件套（待后端实现，当前返回空/占位）
  // ---------------------------------------------------------------------------

  /**
   * 获取数据模块配置列表。
   * TODO(backend): GET /api/v1/data-{module}/configs
   */
  getDataModuleConfigs(_module: DataModuleCode): Observable<DataModuleConfig[]> {
    // return this.api.get<DataModuleConfig[]>(`/api/v1/data-${module}/configs`);
    return of([]);
  }

  /**
   * 提交数据模块运行。
   * TODO(backend): POST /api/v1/data-{module}/runs
   */
  submitDataModuleRun(_module: DataModuleCode, _configId: number): Observable<DataModuleRun> {
    // return this.api.post<DataModuleRun, object>(`/api/v1/data-${module}/runs`, { config_id: configId });
    return of({} as DataModuleRun);
  }

  /**
   * 获取数据模块结果。
   * TODO(backend): GET /api/v1/data-{module}/results
   */
  getDataModuleResults(_module: DataModuleCode): Observable<DataModuleResult[]> {
    // return this.api.get<DataModuleResult[]>(`/api/v1/data-${module}/results`);
    return of([]);
  }

  // ---------------------------------------------------------------------------
  // API Key 管理（待后端实现）
  // ---------------------------------------------------------------------------

  /**
   * 获取 API Key 列表。
   * TODO(backend): GET /api/v1/api-keys
   */
  getApiKeys(): Observable<ApiKey[]> {
    // return this.api.get<ApiKey[]>('/api/v1/api-keys');
    return of([]);
  }

  /**
   * 创建 API Key（仅创建时返回完整密钥）。
   * TODO(backend): POST /api/v1/api-keys
   */
  createApiKey(_name: string, _expiresAt?: string): Observable<{ key: string; detail: ApiKey }> {
    // return this.api.post<{ key: string; detail: ApiKey }, object>('/api/v1/api-keys', { name, expires_at: expiresAt });
    return of({} as { key: string; detail: ApiKey });
  }

  /**
   * 吊销 API Key。
   * TODO(backend): DELETE /api/v1/api-keys/{id}
   */
  revokeApiKey(_keyId: string): Observable<void> {
    // return this.api.delete<void>(`/api/v1/api-keys/${keyId}`);
    return of(undefined);
  }
}
