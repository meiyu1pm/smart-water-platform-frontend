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
        [class.maximized]="maximized()"
        (click)="$event.stopPropagation()"
      >
        <header class="dialog-header">
          <div>
            <p class="eyebrow">只读预览</p>
            <h2 id="data-file-preview-title">{{ file?.name || '文件预览' }}</h2>
          </div>
          <div class="dialog-actions">
            <button
              type="button"
              class="maximize"
              [attr.aria-label]="maximized() ? '还原预览大小' : '最大化预览'"
              (click)="maximized.set(!maximized())"
            >
              {{ maximized() ? '还原' : '最大化' }}
            </button>
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
              <dt>大小</dt>
              <dd>{{ formatBytes(currentFile.size_bytes) }}</dd>
            </div>
            <div>
              <dt>版本</dt>
              <dd>{{ currentFile.version_count }}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{{ statusLabel(currentFile) }}</dd>
            </div>
            @if (currentFile.current_version?.sha256) {
              <div class="hash">
                <dt>SHA256</dt>
                <dd>{{ currentFile.current_version?.sha256 }}</dd>
              </div>
            }
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
          <div class="table-wrap">
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
      background: rgb(15 23 42 / 48%);
    }
    .dialog {
      display: grid;
      gap: 14px;
      width: min(960px, 100%);
      max-height: min(760px, 92vh);
      overflow: hidden;
      padding: 20px;
      border-radius: 14px;
      background: #fff;
      box-shadow: 0 24px 70px rgb(15 23 42 / 24%);
    }
    .dialog.maximized {
      width: 100%;
      max-height: 100%;
      height: 100%;
      border-radius: 0;
    }
    .dialog-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .eyebrow {
      margin: 0 0 3px;
      color: #0369a1;
      font-size: 11px;
      font-weight: 800;
    }
    h2 {
      margin: 0;
      color: #0f172a;
      font-size: 19px;
    }
    .close {
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 7px;
      background: #f1f5f9;
      color: #334155;
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
    }
    .dialog-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .maximize {
      min-height: 32px;
      padding: 0 9px;
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      background: #fff;
      color: #334155;
      font-size: 12px;
      cursor: pointer;
    }
    .maximize:hover,
    .maximize:focus-visible {
      background: #f8fafc;
      outline: 2px solid #93c5fd;
    }
    .close:hover,
    .close:focus-visible {
      background: #e2e8f0;
      outline: 2px solid #93c5fd;
    }
    .metadata {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 20px;
      margin: 0;
      padding: 10px 12px;
      border-radius: 8px;
      background: #f8fafc;
      color: #475569;
      font-size: 12px;
    }
    .metadata div {
      display: flex;
      gap: 5px;
      min-width: 110px;
    }
    .metadata .hash {
      flex: 1 1 100%;
    }
    dt {
      color: #64748b;
    }
    dd {
      margin: 0;
      color: #1e293b;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .table-wrap {
      min-height: 0;
      max-height: 52vh;
      overflow: auto;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
    }
    .dialog.maximized .table-wrap {
      max-height: calc(100vh - 220px);
    }
    table {
      width: max-content;
      min-width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 12px;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 1;
      padding: 8px;
      border-bottom: 2px solid #cbd5e1;
      background: #f8fafc;
      color: #0f172a;
      text-align: left;
      white-space: nowrap;
    }
    td {
      max-width: 260px;
      padding: 7px 8px;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    tbody tr:nth-child(even) {
      background: #fafafa;
    }
    .empty,
    .state {
      padding: 22px;
      color: #64748b;
      text-align: center;
    }
    .state.error {
      color: #b91c1c;
    }
    .hint {
      margin: 0;
      color: #64748b;
      font-size: 11px;
    }
    @media (max-width: 600px) {
      .backdrop {
        padding: 8px;
      }
      .dialog {
        padding: 14px;
        max-height: 96vh;
      }
      .metadata {
        gap: 6px 12px;
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
  readonly maximized = signal(false);

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

  statusLabel(file: DataFileSummary): string {
    if (file.profile_status === 'pending' || file.profile_status === 'running') return '解析中';
    if (file.profile_status === 'failed') return '解析失败';
    if (file.profile_status === 'unsupported') return '格式不支持';
    if (file.profile_status === 'ready' || file.status === 'ready') return '可用';
    return file.status || '处理中';
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
    const versionId = this.file?.current_version_id;
    if (
      !versionId ||
      ['pending', 'running', 'failed', 'unsupported'].includes(this.file?.profile_status || '')
    ) {
      this.loading.set(false);
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
