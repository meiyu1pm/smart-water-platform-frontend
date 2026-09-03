import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { RecycleBinItem, RecycleBinPage as RecyclePageData } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';
import { BeijingTimePipe } from '../../shared/pipes/beijing-time.pipe';

@Component({
  selector: 'app-recycle-bin-page',
  imports: [
    BeijingTimePipe,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatSelectModule,
  ],
  template: `
    <header class="head">
      <div>
        <p class="eyebrow">系统管理</p>
        <h1>资源回收站</h1>
        <p>资源保留 14 天，到期后自动清理。恢复和永久清理仅限管理员。</p>
      </div>
      <div class="actions">
        <button mat-stroked-button (click)="load()">刷新</button
        ><button
          class="danger-action"
          mat-stroked-button
          [disabled]="!pageData().total"
          (click)="emptyBin()"
        >
          清空回收站
        </button>
      </div>
    </header>
    <section class="filters">
      <mat-form-field appearance="outline"
        ><mat-label>资源类型</mat-label
        ><mat-select [(ngModel)]="resourceType" (selectionChange)="load(1)"
          ><mat-option value="">全部</mat-option>
          @for (type of resourceTypes; track type.code) {
            <mat-option [value]="type.code">{{ type.label }}</mat-option>
          }
        </mat-select></mat-form-field
      ><mat-form-field appearance="outline"
        ><mat-label>状态</mat-label
        ><mat-select [(ngModel)]="status" (selectionChange)="load(1)"
          ><mat-option value="">待处理</mat-option><mat-option value="trashed">回收中</mat-option
          ><mat-option value="waiting_for_terminal">等待任务结束</mat-option
          ><mat-option value="waiting_for_dependency">等待依赖</mat-option
          ><mat-option value="purge_failed">清理失败</mat-option
          ><mat-option value="purging">清理中</mat-option></mat-select
        ></mat-form-field
      >
    </section>
    @if (selected().size) {
      <div class="batch">
        <span>已选 {{ selected().size }} 项</span
        ><button mat-stroked-button (click)="restoreSelected()">批量恢复</button
        ><button class="danger-action" mat-stroked-button (click)="purgeSelected()">
          永久清理
        </button>
      </div>
    }
    <section class="panel">
      <div class="row heading">
        <span></span><span>资源</span><span>类型</span><span>删除时间</span><span>自动清理</span
        ><span>操作</span>
      </div>
      @for (item of pageData().items; track item.item_id) {
        <div class="row">
          <mat-checkbox
            [checked]="selected().has(item.item_id)"
            [disabled]="!item.can_purge"
            (change)="toggle(item.item_id)"
          />
          <div>
            <b>{{ item.resource_name }}</b
            ><small>所有者 #{{ item.owner_user_id ?? '系统' }}</small>
          </div>
          <span>{{ resourceLabel(item.resource_type) }}</span
          ><span>{{ item.deleted_at | beijingTime }}</span>
          <div>
            <b>{{ item.state_message || statusLabel(item.status) }}</b
            ><small>{{ item.purge_after | beijingTime }}</small>
          </div>
          <div class="actions">
            <button mat-button [disabled]="!item.can_restore" (click)="restore(item)">
              恢复</button
            ><button
              class="danger-link"
              mat-button
              [disabled]="!item.can_purge"
              (click)="purge(item)"
            >
              {{ item.can_retry ? '重新清理' : '清理' }}
            </button>
          </div>
        </div>
      } @empty {
        <div class="empty">回收站中没有资源。</div>
      }
      <footer>
        <span>共 {{ pageData().total }} 项</span
        ><button mat-button [disabled]="pageData().page <= 1" (click)="load(pageData().page - 1)">
          上一页</button
        ><button
          mat-button
          [disabled]="pageData().page * pageData().page_size >= pageData().total"
          (click)="load(pageData().page + 1)"
        >
          下一页
        </button>
      </footer>
    </section>
  `,
  styles: `
    .head,
    .actions,
    .filters,
    .batch,
    footer {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .head {
      justify-content: space-between;
      margin-bottom: var(--sw-space-5);
    }
    .eyebrow {
      margin: 0;
      color: var(--sw-color-primary);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .head h1 {
      margin: 4px 0;
    }
    .head p,
    small {
      color: var(--sw-text-muted);
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
    .batch {
      margin-bottom: var(--sw-space-3);
      padding: var(--sw-space-2) var(--sw-space-4);
      background: var(--sw-color-primary-soft);
      border: 1px solid color-mix(in srgb, var(--sw-color-primary) 28%, var(--sw-border));
      border-radius: var(--sw-radius-md);
      color: var(--sw-color-primary-strong);
    }
    .panel {
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      overflow: hidden;
      box-shadow: var(--sw-shadow-sm);
    }
    .row {
      display: grid;
      grid-template-columns: 42px minmax(220px, 1.5fr) 130px 180px minmax(190px, 1fr) 150px;
      align-items: center;
      gap: 12px;
      padding: 14px 18px;
      border-top: 1px solid var(--sw-border);
      transition: background-color var(--sw-motion-fast) var(--sw-ease-standard);
    }
    .row:not(.heading):hover {
      background: var(--sw-color-primary-faint);
    }
    .heading {
      border: 0;
      background: var(--sw-surface-muted);
      color: var(--sw-text-muted);
      font-size: 12px;
      font-weight: 700;
    }
    .row small {
      display: block;
      margin-top: 4px;
    }
    .row b {
      color: var(--sw-text-primary);
    }
    .actions {
      justify-content: flex-end;
    }
    footer {
      justify-content: flex-end;
      padding: 12px 18px;
      color: var(--sw-text-muted);
      border-top: 1px solid var(--sw-border);
    }
    .empty {
      padding: 48px;
      text-align: center;
      color: var(--sw-text-muted);
    }
    .danger-action,
    .danger-link {
      color: var(--sw-color-danger) !important;
    }
    .danger-action {
      border-color: color-mix(in srgb, var(--sw-color-danger) 45%, var(--sw-border)) !important;
    }
    @media (max-width: 900px) {
      .head {
        align-items: flex-start;
        flex-direction: column;
      }
      .heading {
        display: none;
      }
      .row {
        grid-template-columns: 40px minmax(180px, 1fr) minmax(120px, auto);
        padding: var(--sw-space-3) var(--sw-space-4);
      }
      .row > span:nth-of-type(2),
      .row > div:nth-of-type(2) {
        grid-column: 2 / -1;
      }
      .row > .actions {
        grid-column: 2/-1;
        justify-content: flex-start;
      }
      .filters {
        flex-wrap: wrap;
      }
      .filters mat-form-field {
        width: 100%;
      }
      footer {
        justify-content: center;
        flex-wrap: wrap;
      }
    }
    @media (max-width: 560px) {
      .actions {
        flex-wrap: wrap;
        justify-content: flex-start;
      }
      .row {
        grid-template-columns: 34px minmax(0, 1fr);
      }
      .row > *:not(mat-checkbox) {
        grid-column: 2;
      }
    }
  `,
})
export class RecycleBinPage implements OnDestroy {
  private readonly api = inject(ApiClient);
  private readonly notifications = inject(NotificationService);
  readonly pageData = signal<RecyclePageData>({ items: [], page: 1, page_size: 20, total: 0 });
  readonly selected = signal(new Set<string>());
  readonly resourceTypes = [
    { code: 'dataset', label: '数据资产' },
    { code: 'data_source', label: '数据源' },
    { code: 'csv_upload_draft', label: '上传草稿' },
    { code: 'workflow', label: '工作流' },
    { code: 'task', label: '任务' },
    { code: 'user', label: '用户' },
  ];
  resourceType = '';
  status = '';
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  constructor() {
    this.load();
  }
  load(page = this.pageData().page): void {
    this.api
      .get<RecyclePageData>('/api/v1/recycle-bin', {
        resource_type: this.resourceType || null,
        status: this.status || null,
        page,
        page_size: 20,
      })
      .subscribe({
        next: (value) => {
          this.pageData.set(value);
          this.selected.set(new Set());
          this.scheduleRefresh();
        },
        error: (error) => this.notifications.error(error, '无法读取回收站。'),
      });
  }
  resourceLabel(code: string): string {
    return this.resourceTypes.find((item) => item.code === code)?.label || code;
  }
  statusLabel(status: RecycleBinItem['status']): string {
    return (
      {
        trashed: '等待清理',
        waiting_for_terminal: '等待任务结束',
        waiting_for_dependency: '等待关联资源',
        purging: '正在清理',
        purge_failed: '清理失败',
        restored: '已恢复',
        purged: '已清理',
      }[status] || status
    );
  }
  remaining(item: RecycleBinItem): string {
    const milliseconds = new Date(item.purge_after).getTime() - Date.now();
    if (milliseconds <= 0) return '等待清理';
    return `${Math.ceil(milliseconds / 86_400_000)} 天后`;
  }
  toggle(id: string): void {
    const next = new Set(this.selected());
    next.has(id) ? next.delete(id) : next.add(id);
    this.selected.set(next);
  }
  restore(item: RecycleBinItem): void {
    if (!item.can_restore) return;
    this.api
      .post<RecycleBinItem, object>(`/api/v1/recycle-bin/${item.item_id}/restore`, {})
      .subscribe({
        next: () => {
          this.notifications.success('资源已恢复。');
          this.load();
        },
        error: (error) => this.notifications.error(error),
      });
  }
  purge(item: RecycleBinItem): void {
    if (!item.can_purge) return;
    if (window.confirm(`永久清理“${item.resource_name}”？此操作不可撤销。`))
      this.queuePurge([item.item_id]);
  }
  restoreSelected(): void {
    const itemIds = this.pageData()
      .items.filter((item) => this.selected().has(item.item_id) && item.can_restore)
      .map((item) => item.item_id);
    if (!itemIds.length || !window.confirm(`恢复选中的 ${itemIds.length} 项资源？`)) return;
    this.api
      .post<{ restored: number }, { item_ids: string[] }>('/api/v1/recycle-bin/restore', {
        item_ids: itemIds,
      })
      .subscribe({
        next: () => {
          this.notifications.success('所选资源已恢复。');
          this.load();
        },
        error: (error) => this.notifications.error(error),
      });
  }
  purgeSelected(): void {
    const itemIds = this.pageData()
      .items.filter((item) => this.selected().has(item.item_id) && item.can_purge)
      .map((item) => item.item_id);
    if (itemIds.length && window.confirm(`永久清理选中的 ${itemIds.length} 项资源？`))
      this.queuePurge(itemIds);
  }
  emptyBin(): void {
    const confirmation = window.prompt('输入“清空回收站”以永久清理全部资源。');
    if (confirmation !== '清空回收站') return;
    this.api
      .post<{ queued: number }, { item_ids: string[]; all_items: boolean; confirmation: string }>(
        '/api/v1/recycle-bin/purge',
        { item_ids: [], all_items: true, confirmation },
      )
      .subscribe({
        next: (value) => {
          this.notifications.success(`已提交 ${value.queued} 项清理任务。`);
          this.load();
        },
        error: (error) => this.notifications.error(error),
      });
  }
  private queuePurge(itemIds: string[]): void {
    this.api
      .post<{ queued: number }, { item_ids: string[] }>('/api/v1/recycle-bin/purge', {
        item_ids: itemIds,
      })
      .subscribe({
        next: () => {
          this.notifications.success('永久清理任务已提交。');
          this.load();
        },
        error: (error) => this.notifications.error(error),
      });
  }
  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (!this.pageData().items.some((item) => ['purging', 'waiting_for_terminal', 'waiting_for_dependency'].includes(item.status))) {
      return;
    }
    this.refreshTimer = setTimeout(() => this.load(), 3000);
  }
  ngOnDestroy(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
  }
}
