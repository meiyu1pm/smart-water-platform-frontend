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
    <header class="head">
      <div>
        <p class="eyebrow">统一任务中心</p>
        <h1>任务记录</h1>
        <p>查询导入、算法与工作流任务，并从历史记录安全地重新运行。</p>
      </div>
      <button mat-stroked-button (click)="load()">刷新</button>
    </header>
    <section class="filters">
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
                <td class="empty" colspan="8">正在读取任务记录…</td>
              </tr>
            } @else {
              @for (task of pageData().items; track task.task_id) {
                <tr>
                  <td class="task-type">{{ task.task_type }}</td>
                  <td><app-status-chip [status]="task.status" /></td>
                  <td>{{ task.progress }}%</td>
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
                        <button mat-button type="button" (click)="remove(task)">删除</button>
                      }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td class="empty" colspan="8">暂无匹配任务。</td>
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
    }
    .eyebrow {
      color: var(--sw-primary);
      font-weight: 800;
      margin-bottom: 4px;
    }
    h1 {
      margin: 0;
    }
    .filters {
      margin: var(--sw-space-5) 0;
      flex-wrap: wrap;
    }
    .filters mat-form-field {
      width: 220px;
    }
    .panel {
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      overflow: hidden;
      box-shadow: var(--sw-shadow-sm);
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
      background: var(--sw-surface-subtle);
      color: var(--sw-text-muted);
      font-size: 13px;
      font-weight: 700;
    }
    tbody tr:hover {
      background: var(--sw-primary-container);
    }
    .task-type {
      color: var(--sw-primary);
      font-weight: 700;
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
      background: var(--sw-surface-subtle);
    }
    .actions {
      gap: 2px;
    }
    .empty {
      height: 160px;
      color: var(--sw-text-muted);
      text-align: center;
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
      }
      .filters mat-form-field {
        width: min(100%, 260px);
      }
      footer {
        justify-content: center;
        flex-wrap: wrap;
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
