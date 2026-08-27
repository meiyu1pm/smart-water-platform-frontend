import {
  AfterViewChecked,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';

import {
  DataFileColumnPreview,
  DataFilePreview,
  DataFileViewSelection,
  DataFileViewOutputMode,
} from '../../core/models/api.models';
import { DataFileService } from '../../core/services/data-file.service';

export interface DataFileBindingEcho {
  output_mode?: DataFileViewOutputMode;
  selected_columns?: string[];
  time_column?: string;
  value_column?: string;
  point_column?: string;
  view_summary?: string;
}

/**
 * 显示数据文件的有界预览并构造不可变 DataView。
 * 限制 6 行显示高度、表头固定置顶、顶部同步横向滚动条，支持已有绑定回显。
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
          <p class="hint">预览展示前 50 行，实际运行读取选定文件版本。</p>
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
      } @else if (!profileReady()) {
        <p class="state" aria-live="polite">{{ profileStateMessage() }}</p>
      } @else if (preview(); as value) {
        <div class="mode-switch" role="group" aria-label="输出模式">
          <button
            type="button"
            [class.active]="outputMode() === 'table'"
            (click)="setMode('table')"
          >
            表格输出 (Table)
          </button>
          <button
            type="button"
            [class.active]="outputMode() === 'timeseries'"
            (click)="setMode('timeseries')"
          >
            时序输出 (Series)
          </button>
        </div>

        @if (outputMode() === 'table') {
          <p class="selection-hint">点击列名选择或取消表格输出列（高亮即为选定字段）。</p>
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
          <p class="selection-hint">先选择上方角色，再点击下方表头；时间列和数值列为必选。</p>
        }

        <!-- 顶部横向滚动条 -->
        <div
          class="top-scrollbar-track"
          #topScroll
          (scroll)="syncScroll(topScroll, tableScroll)"
          aria-hidden="true"
        >
          <div class="top-scrollbar-thumb" [style.width.px]="tableScrollWidth()"></div>
        </div>

        <!-- 表格容器：限制 6 行高度，表头 sticky 固定 -->
        <div
          class="table-scroll"
          #tableScroll
          (scroll)="syncScroll(tableScroll, topScroll)"
        >
          <table #previewTable>
            <thead>
              <tr>
                @for (column of value.columns; track column.name) {
                  <th>
                    <button
                      type="button"
                      class="column-button"
                      [class.selected]="isSelected(column.name)"
                      [class.warning]="(column.warnings?.length ?? 0) > 0"
                      [attr.aria-pressed]="isSelected(column.name)"
                      [attr.title]="column.warnings?.join('；') || column.inferred_type"
                      (click)="selectColumn(column.name)"
                    >
                      <span class="col-name">{{ column.name }}</span>
                      <small class="col-type">{{ column.inferred_type }}</small>
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
          <p class="state warning-state">请选择时间列和数值列后再使用时序输出。</p>
        }
        <footer class="selection-footer">
          <span class="summary-text">{{ selectionSummary() }}</span>
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
      gap: 12px;
      padding: 14px;
      border: 1px solid #dbe4ef;
      border-radius: 10px;
      background: #ffffff;
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
      color: #0284c7;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }
    h2 {
      margin: 2px 0 0;
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
    }
    .hint,
    .selection-hint {
      margin: 2px 0 0;
      color: #64748b;
      font-size: 11px;
      line-height: 1.4;
    }
    .preview-count {
      color: #64748b;
      font-size: 11px;
      font-weight: 600;
      background: #f1f5f9;
      padding: 2px 8px;
      border-radius: 12px;
      white-space: nowrap;
    }
    .mode-switch,
    .role-picker {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .mode-switch button,
    .role-picker button,
    .apply-button {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      color: #334155;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .mode-switch button.active,
    .role-picker button.active {
      border-color: #0284c7;
      background: #f0f9ff;
      color: #0369a1;
      font-weight: 600;
    }
    /* 顶部滚动条轨道：完整高度展示，防止被截断 */
    .top-scrollbar-track {
      width: 100%;
      height: 16px;
      overflow-x: auto;
      overflow-y: hidden;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-bottom: none;
      border-radius: 6px 6px 0 0;
      scrollbar-width: thin;
    }
    .top-scrollbar-track::-webkit-scrollbar {
      height: 12px;
    }
    .top-scrollbar-track::-webkit-scrollbar-track {
      background: #f1f5f9;
    }
    .top-scrollbar-track::-webkit-scrollbar-thumb {
      background: #94a3b8;
      border-radius: 6px;
      border: 2px solid #f1f5f9;
    }
    .top-scrollbar-thumb {
      height: 1px;
    }
    /* 表格滚动容器：固定 6 行高度 (约 220px)，表头 sticky，隐藏下方重复的横向滚动条 */
    .table-scroll {
      max-width: 100%;
      max-height: 220px;
      overflow-x: auto;
      overflow-y: auto;
      border: 1px solid #cbd5e1;
      border-radius: 0 0 6px 6px;
      background: #ffffff;
    }
    .table-scroll::-webkit-scrollbar:horizontal {
      display: none;
      height: 0;
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
      z-index: 2;
      background: #f8fafc;
      border-bottom: 2px solid #cbd5e1;
      padding: 4px 6px;
      text-align: left;
    }
    td {
      max-width: 220px;
      padding: 6px 8px;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
      text-align: left;
      vertical-align: top;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    tbody tr:nth-child(even) {
      background: #fafafa;
    }
    tbody tr:hover {
      background: #f0fdf4;
    }
    .column-button {
      display: grid;
      gap: 2px;
      width: 100%;
      border: 1.5px solid #e2e8f0;
      border-radius: 6px;
      background: #ffffff;
      color: #0f172a;
      padding: 5px 8px;
      text-align: left;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .column-button:hover {
      border-color: #0284c7;
      background: #f0f9ff;
    }
    .column-button.selected {
      border-color: #0284c7;
      background: #e0f2fe;
      box-shadow: inset 0 0 0 1px #0284c7;
    }
    .column-button.selected .col-name {
      color: #0369a1;
      font-weight: 700;
    }
    .column-button.warning {
      color: #b45309;
    }
    .col-name {
      font-size: 12px;
      font-weight: 600;
    }
    .col-type {
      color: #64748b;
      font-size: 10px;
    }
    .state {
      margin: 0;
      padding: 16px;
      border-radius: 8px;
      background: #f8fafc;
      color: #64748b;
      text-align: center;
      font-size: 12px;
    }
    .state.error {
      background: #fef2f2;
      color: #dc2626;
    }
    .warning-state {
      background: #fffbeb;
      color: #b45309;
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 12px;
    }
    .empty-cell {
      padding: 18px;
      color: #94a3b8;
      text-align: center;
    }
    .selection-footer {
      padding-top: 4px;
      color: #475569;
      font-size: 12px;
    }
    .summary-text {
      font-weight: 500;
      color: #0f172a;
    }
    .apply-button {
      border-color: #0284c7;
      background: #0284c7;
      color: #ffffff;
      font-weight: 600;
      padding: 7px 14px;
    }
    .apply-button:hover:not(:disabled) {
      background: #0369a1;
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
export class DataFilePreviewPanelComponent
  implements OnChanges, OnDestroy, AfterViewChecked
{
  private readonly files = inject(DataFileService);
  private request?: Subscription;
  private requestGeneration = 0;
  private isSyncingScroll = false;

  @ViewChild('previewTable') previewTable?: ElementRef<HTMLTableElement>;

  @Input() fileVersionId: number | null = null;
  @Input() profileStatus: string | null = null;
  @Input() canCreateView = true;
  @Input() initialBinding?: DataFileBindingEcho | null = null;

  @Output() readonly viewChange = new EventEmitter<DataFileViewSelection>();
  @Output() readonly previewLoaded = new EventEmitter<{
    preview: DataFilePreview;
    sampleRows: Array<Record<string, unknown>>;
  }>();

  readonly preview = signal<DataFilePreview | null>(null);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly outputMode = signal<DataFileViewOutputMode>('table');
  readonly selectedColumns = signal<string[]>([]);
  readonly timeColumn = signal('');
  readonly valueColumn = signal('');
  readonly pointColumn = signal('');
  readonly activeRole = signal<'time' | 'value' | 'point'>('time');
  readonly profileReady = signal(true);
  readonly tableScrollWidth = signal(0);

  readonly roles = [
    { key: 'time' as const, label: '时间列' },
    { key: 'value' as const, label: '数值列' },
    { key: 'point' as const, label: '点位列（可选）' },
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (
      'fileVersionId' in changes ||
      'profileStatus' in changes ||
      'initialBinding' in changes
    ) {
      this.loadPreview();
    }
  }

  ngAfterViewChecked(): void {
    if (this.previewTable?.nativeElement) {
      const width = this.previewTable.nativeElement.scrollWidth;
      if (width !== this.tableScrollWidth()) {
        this.tableScrollWidth.set(width);
      }
    }
  }

  ngOnDestroy(): void {
    this.requestGeneration += 1;
    this.request?.unsubscribe();
  }

  syncScroll(source: HTMLElement, target: HTMLElement): void {
    if (this.isSyncingScroll) return;
    this.isSyncingScroll = true;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => {
      this.isSyncingScroll = false;
    });
  }

  setMode(mode: DataFileViewOutputMode): void {
    this.outputMode.set(mode);
    if (mode === 'table' && !this.selectedColumns().length) {
      this.selectedColumns.set(
        this.preview()?.columns.map((column) => column.name) ?? [],
      );
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
    if (this.outputMode() === 'table') {
      return `已选 ${this.selectedColumns().length} 列`;
    }
    return `时间：${this.timeColumn() || '未选'} · 数值：${this.valueColumn() || '未选'}${this.pointColumn() ? ` · 点位：${this.pointColumn()}` : ''}`;
  }

  canApply(): boolean {
    if (!this.profileReady() || !this.canCreateView) return false;
    return this.outputMode() === 'table'
      ? this.selectedColumns().length > 0
      : Boolean(this.timeColumn() && this.valueColumn());
  }

  apply(): void {
    if (!this.fileVersionId || !this.canApply()) return;
    const selection: DataFileViewSelection = {
      file_version_id: this.fileVersionId,
      output_mode: this.outputMode(),
      ...(this.outputMode() === 'table'
        ? { selected_columns: this.selectedColumns() }
        : {
            time_column: this.timeColumn(),
            value_column: this.valueColumn(),
            ...(this.pointColumn() ? { point_column: this.pointColumn() } : {}),
          }),
    };
    this.viewChange.emit(selection);
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
    const status = this.profileStatus?.toLowerCase() || '';
    this.profileReady.set(!status || status === 'ready');
    if (!versionId) {
      this.loading.set(false);
      return;
    }
    if (!this.profileReady()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.request = this.files.getPreview(versionId).subscribe({
      next: (value) => {
        if (generation !== this.requestGeneration) return;
        this.preview.set(value);
        this.applyInitialBinding(value);
        this.loading.set(false);
        this.previewLoaded.emit({
          preview: value,
          sampleRows: value.rows || [],
        });
      },
      error: () => {
        if (generation !== this.requestGeneration) return;
        this.loading.set(false);
        this.errorMessage.set('无法读取文件预览，请稍后重试。');
      },
    });
  }

  private applyInitialBinding(preview: DataFilePreview): void {
    const allCols = preview.columns.map((c) => c.name);
    const initial = this.initialBinding;
    if (!initial) {
      this.selectedColumns.set(allCols);
      return;
    }

    if (initial.output_mode) {
      this.outputMode.set(initial.output_mode);
    }

    if (initial.output_mode === 'timeseries') {
      if (initial.time_column) this.timeColumn.set(initial.time_column);
      if (initial.value_column) this.valueColumn.set(initial.value_column);
      if (initial.point_column) this.pointColumn.set(initial.point_column);

      if (!this.timeColumn() && initial.view_summary) {
        const parts = initial.view_summary.split(' → ').map((s) => s.trim());
        if (parts[0]) this.timeColumn.set(parts[0]);
        if (parts[1]) this.valueColumn.set(parts[1]);
        if (parts[2]) this.pointColumn.set(parts[2]);
      }
    } else {
      if (initial.selected_columns && initial.selected_columns.length > 0) {
        this.selectedColumns.set(
          initial.selected_columns.filter((col) => allCols.includes(col)),
        );
      } else if (initial.view_summary) {
        const parsed = initial.view_summary
          .split('、')
          .map((s) => s.trim())
          .filter((col) => allCols.includes(col));
        this.selectedColumns.set(parsed.length > 0 ? parsed : allCols);
      } else {
        this.selectedColumns.set(allCols);
      }
    }
  }

  profileStateMessage(): string {
    const status = this.profileStatus?.toLowerCase();
    if (status === 'pending' || status === 'running')
      return '文件正在解析，完成后才能预览和创建数据视图。';
    if (status === 'failed')
      return '文件解析失败，暂时无法预览。请重新上传或稍后重试。';
    if (status === 'unsupported') return '该文件格式暂不支持结构化预览。';
    return '文件尚未完成解析，暂时无法预览。';
  }
}
