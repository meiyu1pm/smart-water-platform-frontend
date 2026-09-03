import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';

import { WorkflowRunPage } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';
import { BeijingTimePipe } from '../../shared/pipes/beijing-time.pipe';

@Component({
  selector: 'app-workflow-runs-page',
  imports: [BeijingTimePipe, MatButtonModule, MatCardModule, RouterLink],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">工作流运行</p>
        <h1>运行记录</h1>
        <p class="lead">查看当前账号创建的工作流执行和结果。</p>
      </div>
      <a mat-stroked-button routerLink="/workflows">编辑工作流</a>
    </header>
    <section class="panel">
      <div class="toolbar">
        <strong>最近运行</strong><button mat-button (click)="load()">刷新</button>
      </div>
      @if (loading()) {
        <div class="empty">正在读取运行记录…</div>
      } @else if (!page().items.length) {
        <div class="empty">暂无运行记录。先发布一个工作流并运行。</div>
      } @else {
        <div class="run-list">
          @for (run of page().items; track run.run_id) {
            <a class="run-row" [routerLink]="['/workflow-runs', run.run_id]">
              <div class="run-title">
                <strong>{{ run.workflow_name || '未命名工作流' }}</strong
                ><span>v{{ run.workflow_version || '—' }}</span>
              </div>
              <div class="run-meta">
                <span class="status" [attr.data-status]="run.status">{{
                  statusLabel(run.status)
                }}</span
                ><span>{{ run.progress }}%</span
                ><span>{{ run.node_success_count }}/{{ run.node_count }} 节点完成</span
                ><time>{{ run.created_at | beijingTime }}</time>
              </div>
              @if (run.error_message) {
                <p class="error">{{ run.error_code }} · {{ run.error_message }}</p>
              }
            </a>
          }
        </div>
      }
      @if (page().total > page().items.length) {
        <p class="hint">共 {{ page().total }} 条记录，当前显示前 {{ page().items.length }} 条。</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      color: var(--sw-text-primary);
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 20px;
      margin-bottom: 16px;
    }
    h1,
    p {
      margin: 0;
    }
    h1 {
      margin-top: 4px;
      font-size: clamp(27px, 2.4vw, 34px);
      letter-spacing: -0.025em;
    }
    .eyebrow {
      color: var(--sw-color-primary);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .lead,
    .hint {
      color: var(--sw-text-muted);
      font-size: 13px;
      margin-top: 7px;
    }
    .panel {
      overflow: hidden;
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      padding: 16px;
      box-shadow: var(--sw-shadow-sm);
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--sw-border);
      padding-bottom: 12px;
      margin-bottom: 4px;
    }
    .run-row {
      display: block;
      color: inherit;
      text-decoration: none;
      border: 1px solid transparent;
      border-bottom-color: var(--sw-border);
      border-radius: var(--sw-radius-sm);
      padding: 14px 10px;
      transition:
        border-color var(--sw-motion-fast) var(--sw-ease-standard),
        background-color var(--sw-motion-fast) var(--sw-ease-standard);
    }
    .run-row:last-child {
      border-bottom: 0;
    }
    .run-row:hover {
      border-color: color-mix(in srgb, var(--sw-color-primary) 22%, var(--sw-border));
      background: var(--sw-color-primary-faint);
    }
    .run-title,
    .run-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .run-title span,
    .run-meta,
    .error {
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .run-meta {
      margin-top: 7px;
    }
    .run-meta time {
      margin-left: auto;
    }
    .status {
      border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
      border-radius: 999px;
      padding: 3px 8px;
      background: var(--sw-surface-sunken);
    }
    .status[data-status='success'] {
      color: var(--sw-color-success);
      background: var(--sw-color-success-soft);
    }
    .status[data-status='failed'] {
      color: var(--sw-color-danger);
      background: var(--sw-color-danger-soft);
    }
    .status[data-status='running'] {
      color: var(--sw-color-info);
      background: var(--sw-color-info-soft);
    }
    .status[data-status='queued'] {
      color: var(--sw-color-warning);
      background: var(--sw-color-warning-soft);
    }
    .error {
      margin: 8px 0 0;
      overflow-wrap: anywhere;
    }
    .empty {
      padding: 34px;
      color: var(--sw-text-muted);
      background: var(--sw-surface-muted);
      text-align: center;
    }
    .hint {
      margin: 12px 0 0;
    }
    @media (max-width: 700px) {
      .page-header {
        align-items: flex-start;
        flex-direction: column;
      }
      .run-meta time {
        margin-left: 0;
        width: 100%;
      }
    }
  `,
})
export class WorkflowRunsPage {
  private readonly api = inject(ApiClient);
  private readonly notifications = inject(NotificationService);
  readonly loading = signal(false);
  readonly page = signal<WorkflowRunPage>({ items: [], page: 1, page_size: 20, total: 0 });
  constructor() {
    this.load();
  }
  load(): void {
    this.loading.set(true);
    this.api
      .get<WorkflowRunPage>('/api/v1/workflow-runs', {
        page: 1,
        page_size: 50,
        view: 'summary',
      })
      .subscribe({
        next: (page) => {
          this.page.set(page);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.notifications.error(error, '读取运行记录失败。');
        },
      });
  }
  statusLabel(status: string): string {
    return (
      (
        {
          queued: '排队中',
          running: '运行中',
          success: '成功',
          failed: '失败',
          cancelled: '已取消',
        } as Record<string, string>
      )[status] || status
    );
  }
}
