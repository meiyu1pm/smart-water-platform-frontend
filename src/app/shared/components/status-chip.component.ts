import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-status-chip',
  template: `<span [class]="'status-chip status-' + normalized()">{{ displayLabel() }}</span>`,
  styles: `
    .status-chip {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.2;
    }
    .status-success,
    .status-ready,
    .status-ok,
    .status-active,
    .status-published {
      background: var(--sw-color-success-soft);
      color: var(--sw-color-success);
    }
    .status-running,
    .status-queued,
    .status-pending,
    .status-mapping,
    .status-importing,
    .status-draft {
      background: var(--sw-color-info-soft);
      color: var(--sw-color-info);
    }
    .status-failed,
    .status-degraded,
    .status-error {
      background: var(--sw-color-danger-soft);
      color: var(--sw-color-danger);
    }
    .status-cancelled,
    .status-retired,
    .status-trashed {
      background: var(--sw-color-neutral-soft);
      color: var(--sw-text-secondary);
    }
    .status-gpu,
    .status-warning {
      background: var(--sw-color-warning-soft);
      color: var(--sw-color-warning);
    }
  `,
})
export class StatusChipComponent {
  readonly status = input.required<string>();
  readonly label = input<string>();
  readonly normalized = computed(() =>
    this.status()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-'),
  );

  private readonly labelMap: Record<string, string> = {
    active: '正常可用',
    ready: '就绪',
    ok: '正常',
    success: '成功',
    running: '运行中',
    queued: '排队中',
    pending: '待处理',
    mapping: '字段映射中',
    importing: '正在导入',
    draft: '草稿',
    published: '已发布',
    failed: '执行失败',
    degraded: '性能降级',
    error: '异常',
    cancelled: '已取消',
    retired: '已归档',
    trashed: '回收站',
    warning: '存在警告',
  };

  readonly displayLabel = computed(() => {
    if (this.label()) return this.label();
    const raw = this.status().toLowerCase();
    return this.labelMap[raw] || this.status();
  });
}

