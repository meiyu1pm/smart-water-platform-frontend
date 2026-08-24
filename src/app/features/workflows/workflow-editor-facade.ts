import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { WorkflowCacheService } from '../../core/services/workflow-cache.service';
import { Graph } from './workflow-editor.models';

/**
 * 架构边界：上游是 Workspace 的用户意图与 Store Graph，下游是 API、IndexedDB Cache 和通知服务。
 * Facade 独占 load/save/publish/run、缓存、乐观锁和通知；不访问 DOM/Rete/Dockview，也不拥有图编辑状态。
 * 销毁由 Angular 注入作用域负责，Facade 不自行销毁视图资源。
 */
@Injectable()
export class WorkflowEditorFacade {
  constructor(
    private readonly api: ApiClient,
    private readonly auth: AuthService,
    private readonly cache: WorkflowCacheService,
    private readonly notice: NotificationService,
  ) {}

  load<T = Record<string, unknown>>(workflowId: number): Observable<T> { return this.api.get<T>(`/api/v1/workflows/${workflowId}`); }
  loadVersions<T = Array<Record<string, unknown>>>(workflowId: number): Observable<T> { return this.api.get<T>(`/api/v1/workflows/${workflowId}/versions`); }
  save(workflowId: number, graph: Graph, baseRevision: number): Observable<Record<string, unknown>> {
    return this.api.put<Record<string, unknown>, { graph: Graph; base_revision: number }>(`/api/v1/workflows/${workflowId}/draft`, { graph, base_revision: baseRevision });
  }
  validate(workflowId: number): Observable<Record<string, unknown>> { return this.api.post<Record<string, unknown>, Record<string, never>>(`/api/v1/workflows/${workflowId}/validate`, {}); }
  publish(workflowId: number): Observable<Record<string, unknown>> { return this.api.post<Record<string, unknown>, Record<string, never>>(`/api/v1/workflows/${workflowId}/publish`, {}); }
  run(versionId: number, inputBindings: Record<string, unknown>, parameterOverrides: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.api.post<Record<string, unknown>, { input_bindings: Record<string, unknown>; parameter_overrides: Record<string, unknown> }>(`/api/v1/workflow-versions/${versionId}/runs`, { input_bindings: inputBindings, parameter_overrides: parameterOverrides });
  }
  async cacheDraft(workflowId: number, graph: Graph, baseRevision: number, workflowName?: string): Promise<void> {
    const userId = Number(this.auth.user()?.id ?? 0); if (userId) await this.cache.put({ key: `${userId}:${workflowId}`, userId, workflowId, workflowName, graph: graph as unknown as Record<string, unknown>, baseRevision, updatedAt: Date.now() });
  }
  async clearCache(workflowId: number): Promise<void> { const userId = Number(this.auth.user()?.id ?? 0); if (userId) await this.cache.remove(userId, workflowId); }
  notifySuccess(message: string): void { this.notice.success(message); }
  notifyError(message: string): void { this.notice.error(message); }
}
