import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';

import { DataFilePreview, DataFileSummary } from '../../core/models/api.models';
import { DataFileService } from '../../core/services/data-file.service';

/** Read-only, bounded file preview for the data management page. */
@Component({
  selector: 'app-data-file-preview-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" role="presentation" (click)="close.emit()">
      <section
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-file-preview-title"
        (click)="$event.stopPropagation()"
      >
        <header class="dialog-header">
          <div>
            <p class="eyebrow">只读预览</p>
            <h2 id="data-file-preview-title">{{ file?.name || '文件预览' }}</h2>
          </div>
          <div class="dialog-actions">
            <button type="button" class="close" aria-label="关闭预览" (click)="close.emit()">
              ×
            </button>
          </div>
        </header>

        @if (file; as currentFile) {
          <dl class="metadata">
            <div>
              <dt>格式</dt>
              <dd>{{ (currentFile.format || '未知').toUpperCase() }}</dd>
            </div>
            <div>
              <dt>上传时间</dt>
              <dd>{{ formatDateTime(currentFile.created_at) }}</dd>
            </div>
            <div>
              <dt>文件大小</dt>
              <dd>{{ formatBytes(currentFile.size_bytes) }}</dd>
            </div>
          </dl>
        }

        @if (loading()) {
          <p class="state">正在读取前 50 行…</p>
        } @else if (error()) {
          <p class="state error" role="alert">{{ error() }}</p>
        } @else if (!file?.current_version_id) {
          <p class="state">该文件还没有可以预览的已完成版本。</p>
        } @else if (blockedPreviewMessage(); as message) {
          <p class="state">{{ message }}</p>
        } @else if (preview(); as value) {
          <div class="table-wrap" aria-label="可横向滚动的数据预览表格">
            <table>
              <thead>
                <tr>
                  @for (column of value.columns; track column.name) {
                    <th>{{ column.name }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of value.rows; track $index) {
                  <tr>
                    @for (column of value.columns; track column.name) {
                      <td>{{ displayValue(row[column.name]) }}</td>
                    }
                  </tr>
                } @empty {
                  <tr>
                    <td class="empty" [attr.colspan]="value.columns.length || 1">
                      没有可预览的数据行。
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="hint">{{ previewSummary(value) }}</p>
        }
      </section>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 1000;
    }
    .backdrop {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      padding: 20px;
      background: color-mix(in srgb, var(--sw-text-primary) 48%, transparent);
      backdrop-filter: blur(3px);
    }
    .dialog {
      display: grid;
      gap: 0;
      width: min(960px, 100%);
      max-height: min(760px, 92vh);
      overflow: hidden;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-xl);
      background: var(--sw-surface-raised);
      box-shadow: var(--sw-shadow-lg);
    }
    .dialog-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 18px 20px 14px;
      border-bottom: 1px solid var(--sw-border);
      background: linear-gradient(120deg, var(--sw-surface-raised), var(--sw-color-primary-faint));
    }
    .eyebrow {
      margin: 0 0 3px;
      color: var(--sw-color-primary);
      font-size: 11px;
      font-weight: 800;
    }
    h2 {
      margin: 0;
      color: var(--sw-text-primary);
      font-size: 19px;
    }
    .close {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border: 0;
      border-radius: var(--sw-radius-sm);
      background: var(--sw-surface-muted);
      color: var(--sw-text-muted);
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
    }
    .dialog-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .close:hover,
    .close:focus-visible {
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary-strong);
      outline: 2px solid var(--sw-focus);
      outline-offset: 2px;
    }
    .metadata {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 24px;
      margin: 0;
      padding: 12px 20px;
      border-bottom: 1px solid var(--sw-border);
      background: var(--sw-surface-muted);
      color: var(--sw-text-secondary);
      font-size: 12px;
    }
    .metadata div {
      display: flex;
      gap: 5px;
      min-width: 110px;
    }
    dt {
      color: var(--sw-text-muted);
    }
    dd {
      margin: 0;
      color: var(--sw-text-primary);
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .table-wrap {
      width: 100%;
      height: min(52vh, 600px);
      min-height: 0;
      min-width: 0;
      overflow-x: scroll;
      overflow-y: auto;
      scrollbar-gutter: stable;
      margin: 16px 20px 0;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-sm);
    }
    .table-wrap::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    .table-wrap::-webkit-scrollbar-track {
      border-radius: 8px;
      background: var(--sw-surface-muted);
    }
    .table-wrap::-webkit-scrollbar-thumb {
      border: 2px solid var(--sw-surface-muted);
      border-radius: 8px;
      background: var(--sw-border-strong);
    }
    .table-wrap::-webkit-scrollbar-thumb:hover {
      background: var(--sw-text-muted);
    }
    table {
      width: max-content;
      min-width: max(1200px, 120%);
      border-collapse: separate;
      border-spacing: 0;
      font-size: 12px;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 1;
      padding: 8px;
      border-bottom: 2px solid var(--sw-border-strong);
      background: var(--sw-surface-muted);
      color: var(--sw-text-primary);
      text-align: left;
      white-space: nowrap;
      min-width: 140px;
    }
    td {
      max-width: 260px;
      padding: 7px 8px;
      border-bottom: 1px solid var(--sw-border);
      color: var(--sw-text-secondary);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    tbody tr:nth-child(even) {
      background: var(--sw-surface-sunken);
    }
    tbody tr:hover {
      background: var(--sw-color-primary-faint);
    }
    .empty,
    .state {
      margin: 16px 20px;
      padding: 32px 22px;
      border: 1px dashed var(--sw-border-strong);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-sunken);
      color: var(--sw-text-muted);
      text-align: center;
    }
    .state.error {
      border-color: color-mix(in srgb, var(--sw-color-danger) 25%, var(--sw-border));
      background: var(--sw-color-danger-soft);
      color: var(--sw-color-danger);
    }
    .hint {
      margin: 10px 20px 16px;
      color: var(--sw-text-muted);
      font-size: 11px;
    }
    @media (max-width: 600px) {
      .backdrop {
        padding: 8px;
      }
      .dialog {
        max-height: 96vh;
        border-radius: var(--sw-radius-md);
      }
      .metadata {
        gap: 6px 12px;
        padding-inline: 14px;
      }
      .dialog-header {
        padding-inline: 14px;
      }
      .table-wrap {
        margin-inline: 14px;
      }
      .hint {
        margin-inline: 14px;
      }
    }
  `,
})
export class DataFilePreviewDialogComponent implements OnChanges, OnDestroy {
  private readonly service = inject(DataFileService);
  private request?: Subscription;

  @Input() file: DataFileSummary | null = null;
  @Output() readonly close = new EventEmitter<void>();
  readonly preview = signal<DataFilePreview | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  ngOnChanges(changes: SimpleChanges): void {
    if ('file' in changes) this.load();
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }

  displayValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  formatBytes(value: number): string {
    if (!value) return '0 B';
    if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) return '暂无上传时间';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '上传时间未知';
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  previewSummary(value: DataFilePreview): string {
    return value.truncated
      ? '仅显示前 50 行，文件内容未被修改。'
      : `共 ${value.total_rows ?? value.rows.length} 行`;
  }

  blockedPreviewMessage(): string {
    if (this.file?.profile_status === 'pending' || this.file?.profile_status === 'running')
      return '文件正在解析，完成后才能预览。';
    if (this.file?.profile_status === 'failed') return '文件解析失败，暂时无法预览。';
    if (this.file?.profile_status === 'unsupported') return '该文件格式暂不支持结构化预览。';
    return '';
  }

  private load(): void {
    this.request?.unsubscribe();
    this.preview.set(null);
    this.error.set('');
    const versionId = this.file?.current_version_id || this.file?.current_version?.id;
    if (
      !versionId ||
      ['pending', 'running', 'failed', 'unsupported'].includes(this.file?.profile_status || '')
    ) {
      this.loading.set(false);
      if (!versionId && this.file) this.error.set('未找到可预览的文件版本。');
      return;
    }
    this.loading.set(true);
    this.request = this.service.getPreview(versionId, 50).subscribe({
      next: (value) => {
        this.preview.set({
          ...value,
          rows: (value.rows || []).slice(0, 50),
          preview_limit: Math.min(value.preview_limit || 50, 50),
        });
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('无法读取文件预览，请稍后重试。');
      },
    });
  }
}
