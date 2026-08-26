import {
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

import {
  DataFileColumnPreview,
  DataFilePreview,
  DataFileView,
  DataFileViewOutputMode,
} from '../../core/models/api.models';
import { DataFileService } from '../../core/services/data-file.service';

/**
 * 显示数据文件的有界预览并构造不可变 DataView。
 * 组件只负责列选择，不执行清洗、插值、对齐或单位转换。
 */
@Component({
  selector: 'app-data-file-preview-panel',
  standalone: true,
  template: `
    <section class="preview-panel" aria-label="数据文件预览">
      <header class="panel-header">
        <div>
          <p class="eyebrow">文件预览</p>
          <h2>选择输出列</h2>
          <p class="hint">预览仅展示有限行，实际运行读取选定文件版本。</p>
        </div>
        @if (preview(); as value) {
          <span class="preview-count">
            {{ value.rows.length }} / {{ value.total_rows ?? '未知' }} 行
          </span>
        }
      </header>

      @if (loading()) {
        <p class="state" aria-live="polite">正在读取文件预览…</p>
      } @else if (errorMessage(); as error) {
        <p class="state error" role="alert">{{ error }}</p>
      } @else if (!fileVersionId) {
        <p class="state">请选择一个文件版本查看预览。</p>
      } @else if (preview(); as value) {
        <div class="mode-switch" role="group" aria-label="输出模式">
          <button
            type="button"
            [class.active]="outputMode() === 'table'"
            (click)="setMode('table')"
          >
            表格输出
          </button>
          <button
            type="button"
            [class.active]="outputMode() === 'timeseries'"
            (click)="setMode('timeseries')"
          >
            时序输出
          </button>
        </div>

        @if (outputMode() === 'table') {
          <p class="selection-hint">点击列名选择或取消表格输出列。</p>
        } @else {
          <div class="role-picker" role="group" aria-label="时序列角色">
            @for (role of roles; track role.key) {
              <button
                type="button"
                [class.active]="activeRole() === role.key"
                (click)="activeRole.set(role.key)"
              >
                {{ role.label }}：{{ roleValue(role.key) || '未选择' }}
              </button>
            }
          </div>
          <p class="selection-hint">先选择角色，再点击下方表头；时间列和值列为必选。</p>
        }

        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                @for (column of value.columns; track column.name) {
                  <th>
                    <button
                      type="button"
                      class="column-button"
                      [class.selected]="isSelected(column.name)"
                      [class.warning]="column.warnings.length > 0"
                      [attr.aria-pressed]="isSelected(column.name)"
                      [attr.title]="column.warnings.join('；') || column.inferred_type"
                      (click)="selectColumn(column.name)"
                    >
                      <span>{{ column.name }}</span>
                      <small>{{ column.inferred_type }}</small>
                    </button>
                  </th>
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
                  <td class="empty-cell" [attr.colspan]="value.columns.length || 1">
                    没有可预览的数据行。
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (value.truncated) {
          <p class="hint">当前为前 {{ value.preview_limit }} 行预览，未加载完整文件。</p>
        }
        @if (outputMode() === 'timeseries' && (!timeColumn() || !valueColumn())) {
          <p class="state warning-state">请选择时间列和值列后再使用时序输出。</p>
        }
        <footer class="selection-footer">
          <span>{{ selectionSummary() }}</span>
          <button type="button" class="apply-button" [disabled]="!canApply()" (click)="apply()">
            应用列映射
          </button>
        </footer>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .preview-panel {
      display: grid;
      gap: 14px;
      padding: 18px;
      border: 1px solid #dbe4ef;
      border-radius: 14px;
      background: #fff;
    }
    .panel-header,
    .selection-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .eyebrow {
      margin: 0;
      color: #0f5f92;
      font-size: 11px;
      font-weight: 800;
    }
    h2 {
      margin: 3px 0 0;
      font-size: 19px;
    }
    .hint,
    .selection-hint {
      margin: 4px 0 0;
      color: #64748b;
      font-size: 12px;
      line-height: 1.5;
    }
    .preview-count {
      color: #475569;
      font-size: 12px;
      white-space: nowrap;
    }
    .mode-switch,
    .role-picker {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
    }
    .mode-switch button,
    .role-picker button,
    .apply-button {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #fff;
      color: #334155;
      padding: 8px 11px;
      cursor: pointer;
    }
    .mode-switch button.active,
    .role-picker button.active {
      border-color: #0f5f92;
      background: #eff6ff;
      color: #0f5f92;
    }
    .table-scroll {
      max-width: 100%;
      overflow: auto;
      border: 1px solid #e2e8f0;
      border-radius: 9px;
    }
    table {
      width: max-content;
      min-width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th,
    td {
      max-width: 220px;
      padding: 8px 10px;
      border-bottom: 1px solid #e2e8f0;
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: #f8fafc;
    }
    .column-button {
      display: grid;
      gap: 3px;
      width: 100%;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: #0f172a;
      padding: 5px 7px;
      text-align: left;
      cursor: pointer;
    }
    .column-button:hover,
    .column-button:focus-visible {
      border-color: #93c5fd;
      outline: none;
    }
    .column-button.selected {
      border-color: #0f5f92;
      background: #dbeafe;
    }
    .column-button.warning {
      color: #9a3412;
    }
    .column-button small {
      color: #64748b;
      font-size: 10px;
    }
    .state {
      margin: 0;
      padding: 22px;
      border-radius: 9px;
      background: #f8fafc;
      color: #64748b;
      text-align: center;
    }
    .state.error {
      background: #fff7ed;
      color: #9a3412;
    }
    .warning-state {
      background: #fffbeb;
      color: #92400e;
      padding: 8px 10px;
      border-radius: 7px;
    }
    .empty-cell {
      padding: 22px;
      color: #94a3b8;
      text-align: center;
    }
    .selection-footer {
      padding-top: 4px;
      color: #475569;
      font-size: 12px;
    }
    .apply-button {
      border-color: #0f5f92;
      background: #0f5f92;
      color: #fff;
    }
    .apply-button:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
    @media (max-width: 640px) {
      .panel-header,
      .selection-footer {
        align-items: flex-start;
        flex-direction: column;
      }
      .apply-button {
        width: 100%;
      }
    }
  `,
})
export class DataFilePreviewPanelComponent implements OnChanges, OnDestroy {
  private readonly files = inject(DataFileService);
  private request?: Subscription;
  private requestGeneration = 0;

  @Input() fileVersionId: string | null = null;
  @Output() readonly viewChange = new EventEmitter<DataFileView>();

  readonly preview = signal<DataFilePreview | null>(null);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly outputMode = signal<DataFileViewOutputMode>('table');
  readonly selectedColumns = signal<string[]>([]);
  readonly timeColumn = signal('');
  readonly valueColumn = signal('');
  readonly pointColumn = signal('');
  readonly activeRole = signal<'time' | 'value' | 'point'>('time');
  readonly roles = [
    { key: 'time' as const, label: '时间列' },
    { key: 'value' as const, label: '数值列' },
    { key: 'point' as const, label: '点位列（可选）' },
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if ('fileVersionId' in changes) this.loadPreview();
  }

  ngOnDestroy(): void {
    this.requestGeneration += 1;
    this.request?.unsubscribe();
  }

  setMode(mode: DataFileViewOutputMode): void {
    this.outputMode.set(mode);
    if (mode === 'table' && !this.selectedColumns().length) {
      this.selectedColumns.set(this.preview()?.columns.map((column) => column.name) ?? []);
    }
  }

  selectColumn(name: string): void {
    if (this.outputMode() === 'table') {
      const selected = new Set(this.selectedColumns());
      if (selected.has(name)) selected.delete(name);
      else selected.add(name);
      this.selectedColumns.set([...selected]);
      return;
    }
    if (this.activeRole() === 'time') this.timeColumn.set(name);
    if (this.activeRole() === 'value') this.valueColumn.set(name);
    if (this.activeRole() === 'point') this.pointColumn.set(name);
  }

  isSelected(name: string): boolean {
    if (this.outputMode() === 'table') return this.selectedColumns().includes(name);
    return [this.timeColumn(), this.valueColumn(), this.pointColumn()].includes(name);
  }

  roleValue(role: 'time' | 'value' | 'point'): string {
    return role === 'time'
      ? this.timeColumn()
      : role === 'value'
        ? this.valueColumn()
        : this.pointColumn();
  }

  selectionSummary(): string {
    if (this.outputMode() === 'table') return `已选择 ${this.selectedColumns().length} 列`;
    return `时间：${this.timeColumn() || '未选择'} · 数值：${this.valueColumn() || '未选择'}${this.pointColumn() ? ` · 点位：${this.pointColumn()}` : ''}`;
  }

  canApply(): boolean {
    return this.outputMode() === 'table'
      ? this.selectedColumns().length > 0
      : Boolean(this.timeColumn() && this.valueColumn());
  }

  apply(): void {
    if (!this.fileVersionId || !this.canApply()) return;
    this.viewChange.emit({
      file_version_id: this.fileVersionId,
      output_mode: this.outputMode(),
      ...(this.outputMode() === 'table'
        ? { selected_columns: this.selectedColumns() }
        : {
            time_column: this.timeColumn(),
            value_column: this.valueColumn(),
            ...(this.pointColumn() ? { point_column: this.pointColumn() } : {}),
          }),
    });
  }

  displayValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  private loadPreview(): void {
    const versionId = this.fileVersionId;
    const generation = ++this.requestGeneration;
    this.request?.unsubscribe();
    this.preview.set(null);
    this.errorMessage.set('');
    this.selectedColumns.set([]);
    this.timeColumn.set('');
    this.valueColumn.set('');
    this.pointColumn.set('');
    if (!versionId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.request = this.files.getPreview(versionId).subscribe({
      next: (value) => {
        if (generation !== this.requestGeneration) return;
        this.preview.set(value);
        this.selectedColumns.set(value.columns.map((column) => column.name));
        this.loading.set(false);
      },
      error: () => {
        if (generation !== this.requestGeneration) return;
        this.loading.set(false);
        this.errorMessage.set('无法读取文件预览，请稍后重试。');
      },
    });
  }
}
