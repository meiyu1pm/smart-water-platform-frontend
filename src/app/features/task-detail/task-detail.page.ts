import { Component, OnDestroy, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { TaskDetail } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { TaskTrackerService, TaskTrackingHandle } from '../../core/services/task-tracker.service';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { BeijingTimePipe } from '../../shared/pipes/beijing-time.pipe';

@Component({
  selector: 'app-task-detail-page',
  imports: [BeijingTimePipe, MatButtonModule, MatCardModule, RouterLink, StatusChipComponent],
  template: `
    @if (handle?.task(); as task) {
      <header class="page-head">
        <div>
          <p class="eyebrow">异步任务</p>
          <h1>{{ taskTypeLabel(task.task_type) }}</h1>
          <p class="mono">{{ task.task_id }}</p>
        </div>
        <div class="buttons">
          @if (task.status === 'success' && task.target_resource) {
            <a mat-stroked-button [routerLink]="[task.target_resource.route]">
              {{ task.target_resource.label || '查看结果' }}
            </a>
          }
          @if (canCancel(task)) {
            <button class="danger-action" mat-stroked-button type="button" (click)="cancel(task)">
              请求取消
            </button>
          }
          @if (canRerun(task) && task.task_type !== 's01_assessment') {
            <button mat-flat-button type="button" (click)="rerun(task)">重新运行</button>
          }
        </div>
      </header>
      <section class="grid" aria-label="任务执行概览">
        <mat-card class="status-card"
          ><div class="status-line">
            <app-status-chip [status]="task.status" /><strong>{{ task.progress }}%</strong>
          </div>
          <div class="progress"><span [style.width.%]="task.progress"></span></div>
          <p>实时通道：{{ connectionLabel() }}</p>
          <small>trace_id：{{ task.trace_id }}</small></mat-card
        ><mat-card
          ><p>创建时间</p>
          <strong>{{ task.created_at | beijingTime }}</strong>
          <p>开始：{{ task.started_at | beijingTime: 'HH:mm:ss' }}</p>
          <p>结束：{{ task.finished_at | beijingTime: 'HH:mm:ss' }}</p></mat-card
        >
        <mat-card>
          <p>执行尝试</p>
          <strong>{{ task.attempt_no ?? 0 }} / {{ task.max_attempts ?? 0 }}</strong>
          <p>Worker：{{ task.worker_id || '尚未领取' }}</p>
          <p>心跳：{{ task.heartbeat_at | beijingTime: 'HH:mm:ss' }}</p>
          @if (task.rerun_of_task_id) {
            <p>
              来源任务：<a [routerLink]="['/tasks', task.rerun_of_task_id]">{{
                task.rerun_of_task_id
              }}</a>
            </p>
          }
          @if (task.next_retry_at) {
            <p>下次恢复：{{ task.next_retry_at | beijingTime }}</p>
          }
        </mat-card>
      </section>
      @if (task.error_code || task.error_message) {
        <section class="error" role="alert">
          <strong>{{ task.error_code || '任务失败' }}</strong>
          <p>{{ task.error_message }}</p>
        </section>
      }
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>任务日志</h2>
            <p>按时间顺序记录调度、执行和状态变化。</p>
          </div>
          <span>{{ handle?.logs()?.length ?? 0 }} 条</span>
        </div>
        @for (log of handle?.logs() ?? []; track log.created_at + log.message) {
          <div class="log">
            <time>{{ log.created_at | beijingTime: 'HH:mm:ss' }}</time
            ><app-status-chip [status]="log.event_type" /><span>{{ log.message }}</span>
          </div>
        } @empty {
          <div class="empty">正在读取日志…</div>
        }
      </section>
    } @else {
      <div class="empty">正在读取任务状态…</div>
    }
  `,
  styles: `
    .page-head,
    .status-line,
    .buttons,
    .panel-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--sw-space-4);
    }
    .page-head {
      margin-bottom: var(--sw-space-5);
    }
    .eyebrow {
      margin: 0;
      color: var(--sw-color-primary);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    h1,
    h2,
    p {
      margin-top: 0;
    }
    h1 {
      margin-bottom: var(--sw-space-1);
      font-size: clamp(26px, 3vw, 34px);
      letter-spacing: -0.025em;
    }
    .mono {
      font-family: ui-monospace, monospace;
      color: var(--sw-text-muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.25fr repeat(2, minmax(0, 1fr));
      gap: var(--sw-space-4);
    }
    .grid mat-card,
    .panel {
      padding: var(--sw-space-5);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-sm);
    }
    .grid mat-card p {
      margin-bottom: var(--sw-space-2);
      color: var(--sw-text-muted);
      font-size: 13px;
    }
    .grid mat-card > strong {
      display: block;
      margin-bottom: var(--sw-space-4);
      color: var(--sw-text-primary);
      font-size: 18px;
      font-variant-numeric: tabular-nums;
    }
    .status-line strong {
      font-size: 30px;
      color: var(--sw-text-primary);
      font-variant-numeric: tabular-nums;
    }
    .progress {
      height: 10px;
      border-radius: 999px;
      background: var(--sw-surface-sunken);
      margin: 16px 0;
    }
    .progress span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--sw-color-primary);
      transition: width var(--sw-motion-panel) var(--sw-ease-standard);
    }
    .status-card p,
    small {
      color: var(--sw-text-muted);
    }
    .panel {
      margin-top: var(--sw-space-4);
    }
    .panel-head {
      align-items: flex-start;
      margin-bottom: var(--sw-space-3);
    }
    .panel-head h2 {
      margin-bottom: var(--sw-space-1);
      font-size: 18px;
    }
    .panel-head p,
    .panel-head span {
      margin: 0;
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .panel-head span {
      padding: 4px 8px;
      border-radius: 999px;
      background: var(--sw-surface-muted);
      white-space: nowrap;
    }
    .log {
      display: grid;
      grid-template-columns: 76px auto 1fr;
      gap: 12px;
      align-items: center;
      padding: 10px 0;
      border-top: 1px solid var(--sw-border);
    }
    .log time {
      color: var(--sw-text-muted);
      font-family: ui-monospace, monospace;
    }
    .error {
      margin-top: 16px;
      padding: 16px;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--sw-color-danger) 30%, var(--sw-border));
      background: var(--sw-color-danger-soft);
      color: var(--sw-color-danger);
    }
    .empty {
      padding: 30px;
      color: var(--sw-text-muted);
      text-align: center;
    }
    .danger-action {
      color: var(--sw-color-danger) !important;
      border-color: color-mix(in srgb, var(--sw-color-danger) 45%, var(--sw-border)) !important;
    }
    @media (max-width: 1000px) {
      .grid {
        grid-template-columns: 1fr 1fr;
      }
      .status-card {
        grid-column: 1 / -1;
      }
    }
    @media (max-width: 700px) {
      .grid {
        grid-template-columns: 1fr;
      }
      .status-card {
        grid-column: auto;
      }
      .page-head {
        align-items: flex-start;
        flex-direction: column;
      }
      .buttons {
        width: 100%;
        flex-wrap: wrap;
        justify-content: flex-start;
      }
      .log {
        grid-template-columns: 64px auto;
      }
      .log > span:last-child {
        grid-column: 1 / -1;
      }
    }
  `,
})
export class TaskDetailPage implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly tracker = inject(TaskTrackerService);
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  readonly taskId = this.route.snapshot.paramMap.get('taskId') ?? '';
  readonly handle: TaskTrackingHandle | null = this.taskId ? this.tracker.track(this.taskId) : null;

  connectionLabel(): string {
    const state = this.handle?.connection() ?? 'connecting';
    return state === 'connected'
      ? 'WebSocket 已连接'
      : state === 'polling'
        ? '轮询回退（每 2 秒）'
        : state === 'closed'
          ? '任务已结束'
          : '正在连接';
  }
  canCancel(task: TaskDetail): boolean {
    return (
      this.auth.hasPermission('task:cancel') &&
      !['success', 'failed', 'cancelled'].includes(task.status)
    );
  }
  canRerun(task: TaskDetail): boolean {
    return (
      this.auth.hasPermission('task:rerun') &&
      ['success', 'failed', 'cancelled'].includes(task.status)
    );
  }

  taskTypeLabel(type: string): string {
    const map: Record<string, string> = {
      workflow: '工作流运行',
      workflow_node: '工作流节点',
      ingestion: '数据导入',
      algorithm: '算法运行',
      s01_assessment: 'DMA 分区漏损评估',
      algorithm_package_validation: '算法包校验',
      algorithm_environment_provision: '算法环境制备',
    };
    return map[type] || type;
  }
  rerun(task: TaskDetail): void {
    if (!window.confirm('将从原始工作流快照创建一条新任务，是否继续？')) return;
    this.api
      .post<{ run_id: string }, Record<string, never>>(`/api/v1/tasks/${task.task_id}/rerun`, {})
      .subscribe({
        next: (run) => void this.router.navigate(['/workflow-runs', run.run_id]),
        error: (error: unknown) => this.notifications.error(error, '重新运行失败。'),
      });
  }
  cancel(task: TaskDetail): void {
    this.api
      .post<TaskDetail, Record<string, never>>(`/api/v1/tasks/${task.task_id}/cancel`, {})
      .subscribe({
        next: () => this.notifications.success('已提交取消请求，任务会在安全检查点结束。'),
        error: (error: unknown) => this.notifications.error(error),
      });
  }
  ngOnDestroy(): void {
    if (this.taskId) this.tracker.stop(this.taskId);
  }
}
