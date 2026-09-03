import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import { TaskDetail, TaskPage } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { BeijingTimePipe } from '../../shared/pipes/beijing-time.pipe';

export function taskUpdatedAt(task: TaskDetail): string | null {
  return task.heartbeat_at ?? task.finished_at ?? task.started_at ?? task.created_at ?? null;
}

@Component({
  selector: 'app-task-center-page',
  imports: [
    BeijingTimePipe,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    StatusChipComponent,
  ],
  template: `
    <header class="head page-header">
      <div>
        <p class="eyebrow">统一任务中心</p>
        <h1>任务记录</h1>
        <p>查询导入、算法与工作流任务，并从历史记录安全地重新运行。</p>
      </div>
      <button mat-stroked-button (click)="load()">刷新</button>
    </header>
    <section class="filters" aria-label="任务筛选">
      <mat-form-field appearance="outline">
        <mat-label>任务类型</mat-label>
        <input matInput [(ngModel)]="taskType" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>状态</mat-label>
        <mat-select [(ngModel)]="status">
          <mat-option value="">全部</mat-option>
          @for (item of statuses; track item) {
            <mat-option [value]="item">{{ item }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <button mat-flat-button (click)="applyFilters()">查询</button>
    </section>
    <section class="panel" [attr.aria-busy]="loading()">
      <div class="panel-head">
        <div>
          <strong>任务列表</strong>
          <span>共 {{ pageData().total }} 条记录</span>
        </div>
        @if (taskType || status) {
          <span class="filter-state">已应用筛选</span>
        }
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>任务类型和名称</th>
              <th>状态</th>
              <th>进度</th>
              <th class="secondary">尝试次数</th>
              <th class="secondary">创建时间</th>
              <th class="secondary">更新时间</th>
              <th class="audit">trace_id</th>
              <th class="actions-column">操作</th>
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              <tr>
                <td class="empty" colspan="8">
                  <span class="loading-indicator" aria-hidden="true"></span>
                  <strong>正在读取任务记录</strong>
                  <small>任务状态准备就绪后会自动显示在这里。</small>
                </td>
              </tr>
            } @else {
              @for (task of pageData().items; track task.task_id) {
                <tr>
                  <td class="task-type">
                    <strong>{{ task.task_type }}</strong>
                    <small>{{ task.task_id }}</small>
                  </td>
                  <td><app-status-chip [status]="task.status" /></td>
                  <td>
                    <div
                      class="progress-cell"
                      role="progressbar"
                      [attr.aria-valuenow]="task.progress"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <span><i [style.width.%]="task.progress"></i></span>
                      <b>{{ task.progress }}%</b>
                    </div>
                  </td>
                  <td class="secondary">{{ task.attempt_no ?? 0 }}/{{ task.max_attempts ?? 0 }}</td>
                  <td class="secondary">{{ task.created_at | beijingTime }}</td>
                  <td class="secondary">{{ updatedAt(task) | beijingTime }}</td>
                  <td class="audit trace">{{ task.trace_id }}</td>
                  <td class="actions-column">
                    <div class="actions">
                      <button mat-button type="button" (click)="open(task)">详情</button>
                      @if (canRerun(task)) {
                        <button mat-button type="button" (click)="rerun(task)">重新运行</button>
                      }
                      @if (auth.hasPermission('task:delete')) {
                        <button class="danger-action" mat-button type="button" (click)="remove(task)">
                          删除
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td class="empty" colspan="8">
                    <strong>暂无匹配任务</strong>
                    <small>调整任务类型或状态筛选后重试。</small>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      <footer>
        <span>共 {{ pageData().total }} 条</span>
        <button mat-button [disabled]="page() <= 1" (click)="changePage(-1)">上一页</button>
        <span>第 {{ page() }} 页</span>
        <button
          mat-button
          [disabled]="page() * pageData().page_size >= pageData().total"
          (click)="changePage(1)"
        >
          下一页
        </button>
      </footer>
    </section>
  `,
  styles: `
    .head,
    .filters,
    footer,
    .actions {
      display: flex;
      align-items: center;
      gap: var(--sw-space-3);
    }
    .head {
      justify-content: space-between;
      margin-bottom: var(--sw-space-5);
    }
    .eyebrow {
      color: var(--sw-color-primary);
      font-weight: 800;
      font-size: 12px;
      letter-spacing: 0.08em;
      margin: 0;
      margin-bottom: 4px;
    }
    h1 {
      margin: 0 0 var(--sw-space-1);
      font-size: clamp(26px, 3vw, 34px);
      letter-spacing: -0.025em;
    }
    .head p:not(.eyebrow) {
      margin: 0;
      color: var(--sw-text-secondary);
    }
    .filters {
      margin: 0 0 var(--sw-space-4);
      flex-wrap: wrap;
      padding: var(--sw-space-3) var(--sw-space-4);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-sm);
    }
    .filters mat-form-field {
      width: 220px;
      margin-bottom: -20px;
    }
    .panel {
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      overflow: hidden;
      box-shadow: var(--sw-shadow-sm);
    }
    .panel-head {
      min-height: 58px;
      padding: 0 var(--sw-space-4);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sw-space-3);
      border-bottom: 1px solid var(--sw-border);
      background: var(--sw-surface-muted);
    }
    .panel-head > div {
      display: flex;
      align-items: baseline;
      gap: var(--sw-space-2);
    }
    .panel-head span {
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .filter-state {
      padding: 4px 9px;
      border-radius: 999px;
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary-strong) !important;
      font-weight: 700;
    }
    .table-scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
      min-width: 1040px;
      border-collapse: collapse;
    }
    th,
    td {
      height: 52px;
      padding: 0 var(--sw-space-3);
      border-bottom: 1px solid var(--sw-border);
      text-align: left;
      vertical-align: middle;
      white-space: nowrap;
    }
    th {
      height: 48px;
      background: var(--sw-surface-muted);
      color: var(--sw-text-muted);
      font-size: 13px;
      font-weight: 700;
    }
    tbody tr:hover {
      background: var(--sw-color-primary-faint);
    }
    .task-type {
      min-width: 230px;
    }
    .task-type strong,
    .task-type small {
      display: block;
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .task-type strong {
      color: var(--sw-color-primary-strong);
      font-weight: 750;
    }
    .task-type small {
      margin-top: 3px;
      color: var(--sw-text-muted);
      font-size: 11px;
    }
    .progress-cell {
      min-width: 112px;
      display: grid;
      grid-template-columns: minmax(58px, 1fr) 34px;
      align-items: center;
      gap: var(--sw-space-2);
    }
    .progress-cell > span {
      height: 6px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--sw-surface-sunken);
    }
    .progress-cell i {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--sw-color-primary);
    }
    .progress-cell b {
      color: var(--sw-text-secondary);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .trace {
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .actions-column {
      position: sticky;
      right: 0;
      background: var(--sw-surface);
    }
    th.actions-column {
      background: var(--sw-surface-muted);
    }
    .actions {
      gap: 2px;
    }
    .empty {
      height: 160px;
      color: var(--sw-text-muted);
      text-align: center;
    }
    .empty strong,
    .empty small {
      display: block;
    }
    .empty strong {
      margin-bottom: var(--sw-space-1);
      color: var(--sw-text-secondary);
    }
    .loading-indicator {
      width: 22px;
      height: 22px;
      display: inline-block;
      margin-bottom: var(--sw-space-2);
      border: 2px solid var(--sw-border);
      border-top-color: var(--sw-color-primary);
      border-radius: 50%;
      animation: task-loading 0.8s linear infinite;
    }
    .danger-action {
      color: var(--sw-color-danger) !important;
    }
    footer {
      justify-content: flex-end;
      padding: var(--sw-space-3) var(--sw-space-4);
      color: var(--sw-text-muted);
    }
    @media (max-width: 900px) {
      table {
        min-width: 650px;
      }
      .secondary,
      .audit {
        display: none;
      }
      .head {
        align-items: flex-start;
        flex-direction: column;
      }
      .filters mat-form-field {
        width: min(100%, 260px);
      }
      footer {
        justify-content: center;
        flex-wrap: wrap;
      }
    }
    @keyframes task-loading {
      to {
        rotate: 360deg;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .loading-indicator {
        animation: none;
      }
    }
  `,
})
export class TaskCenterPage {
  private readonly api = inject(ApiClient);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  readonly pageData = signal<TaskPage>({ items: [], page: 1, page_size: 20, total: 0 });
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly statuses = [
    'pending',
    'queued',
    'running',
    'retrying',
    'success',
    'failed',
    'cancelled',
  ];
  taskType = '';
  status = '';

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .get<TaskPage>('/api/v1/tasks', {
        page: this.page(),
        page_size: 20,
        task_type: this.taskType || null,
        status: this.status || null,
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (value) => this.pageData.set(value),
        error: (error) => this.notifications.error(error, '无法读取任务记录。'),
      });
  }

  applyFilters(): void {
    this.page.set(1);
    this.load();
  }
  changePage(offset: number): void {
    this.page.update((value) => Math.max(1, value + offset));
    this.load();
  }
  updatedAt(task: TaskDetail): string | null {
    return taskUpdatedAt(task);
  }
  open(task: TaskDetail): void {
    void this.router.navigate(['/tasks', task.task_id]);
  }

  canRerun(task: TaskDetail): boolean {
    return (
      this.auth.hasPermission('task:rerun') &&
      ['success', 'failed', 'cancelled'].includes(task.status)
    );
  }

  rerun(task: TaskDetail): void {
    if (!window.confirm('将基于原始快照创建一条全新任务，是否继续？')) return;
    this.api
      .post<{ run_id: string; task_id: string }, object>(`/api/v1/tasks/${task.task_id}/rerun`, {})
      .subscribe({
        next: (run) => void this.router.navigate(['/workflow-runs', run.run_id]),
        error: (error) => this.notifications.error(error, '重新运行失败。'),
      });
  }

  remove(task: TaskDetail): void {
    const message = ['success', 'failed', 'cancelled'].includes(task.status)
      ? '任务将进入回收站并保留 14 天，是否继续？'
      : '系统将先请求取消任务，再将其移入回收站，是否继续？';
    if (!window.confirm(message)) return;
    this.api.delete<{ task_id: string }>(`/api/v1/tasks/${task.task_id}`).subscribe({
      next: () => {
        this.notifications.success('任务已从列表中移除。');
        this.load();
      },
      error: (error) => this.notifications.error(error, '删除任务失败。'),
    });
  }
}
