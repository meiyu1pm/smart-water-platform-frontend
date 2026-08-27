import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RefDirective } from 'rete-angular-plugin/21';

/**
 * 数据文件输入节点的专属富媒体卡片渲染器。
 * 特性：
 * 1. 右下角支持拖拽自由缩放节点卡片大小；
 * 2. 动态单输出端口联动（表格输出暴露 table 端口，时序输出暴露 series 端口）；
 * 3. 内嵌自适应实时数据预览：表格模式展示 Mini 表格网格，时序模式展示 SVG 趋势曲线波形；
 * 4. 采用 Rete 原生 RefDirective 确保连线插槽坐标与拖拽自适应更新。
 */
@Component({
  selector: 'app-data-file-input-node',
  standalone: true,
  imports: [CommonModule, RefDirective],
  host: {
    'data-testid': 'node',
    '[class.selected]': 'data?.selected',
    '[style.width.px]': 'currentWidth()',
    '[style.height.px]': 'currentHeight()',
  },
  template: `
    <div
      class="custom-node-card"
      data-testid="node"
      [class.selected]="data?.selected"
      [style.width.px]="currentWidth()"
      [style.height.px]="currentHeight()"
    >
      <!-- 头部：算子标识与文件名 -->
      <header class="node-header">
        <div class="header-main">
          <div class="node-badge">
            <span class="badge-icon">📄</span>
            <span class="badge-title">数据文件输入</span>
          </div>
          <div class="file-name" [title]="fileName() || '未选择文件'">
            {{ fileName() || '未选择文件' }}
          </div>
        </div>
      </header>

      <!-- 已绑定数据时的状态与摘要 -->
      <div class="node-meta" *ngIf="fileName()">
        <div class="meta-tags">
          <span class="tag version" *ngIf="version()">{{ version() }}</span>
          <span class="tag mode" *ngIf="outputMode()">{{ outputMode() }}</span>
        </div>
        <div class="summary-row" *ngIf="columnSummary()" [title]="columnSummary()">
          <span class="summary-text">{{ columnSummary() }}</span>
        </div>
      </div>

      <!-- 未绑定时的占位提示 -->
      <div class="node-body placeholder" *ngIf="!fileName()">
        <span class="empty-tip">请在右侧面板选择并绑定数据文件</span>
      </div>

      <!-- 富媒体预览区：表格模式 Mini 表格 -->
      <div
        class="preview-container table-preview"
        *ngIf="fileName() && outputMode() === 'table' && previewColumns().length > 0"
      >
        <div class="mini-table">
          <div class="mini-thead">
            <span class="mini-th" *ngFor="let col of previewColumns()">{{ col }}</span>
          </div>
          <div class="mini-tbody">
            <div class="mini-tr" *ngFor="let row of sampleRows()">
              <span class="mini-td" *ngFor="let col of previewColumns()">
                {{ formatCell(row[col]) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 富媒体预览区：时序模式 SVG Sparkline 趋势曲线 -->
      <div
        class="preview-container series-preview"
        *ngIf="fileName() && outputMode() === 'timeseries'"
      >
        <div class="sparkline-wrapper">
          <svg class="sparkline-svg" viewBox="0 0 200 50" preserveAspectRatio="none">
            <defs>
              <linearGradient [id]="'gradient-' + data.id" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#0284c7" stop-opacity="0.4" />
                <stop offset="100%" stop-color="#0284c7" stop-opacity="0.02" />
              </linearGradient>
            </defs>
            <path [attr.d]="svgAreaPath()" [attr.fill]="'url(#gradient-' + data.id + ')'" />
            <path
              [attr.d]="svgLinePath()"
              fill="none"
              stroke="#0284c7"
              stroke-width="2"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </svg>
          <div class="sparkline-footer">
            <span class="metric-label">📈 时序波动趋势</span>
            <span class="metric-range">{{ valueRangeText() }}</span>
          </div>
        </div>
      </div>

      <!-- 单一输出端口（根据当前 outputMode 过滤） -->
      <div class="outputs-container">
        <div
          class="output-row"
          *ngFor="let output of getOutputs()"
          [attr.data-testid]="'output-' + output.key"
        >
          <span class="output-label" data-testid="output-title">
            {{ output.value?.label || (output.key === 'series' ? '时序' : '表格') }}
          </span>
          <div
            class="output-socket"
            refComponent
            [data]="{
              type: 'socket',
              side: 'output',
              key: output.key,
              nodeId: data.id,
              payload: output.value?.socket,
              seed: seed
            }"
            [emit]="emit"
            data-testid="output-socket"
          ></div>
        </div>
      </div>

      <!-- 右下角缩放手柄 -->
      <div
        class="resize-handle"
        (pointerdown)="onResizeStart($event)"
        title="拖拽调整节点卡片大小"
      >
        <svg viewBox="0 0 10 10" width="10" height="10">
          <line x1="9" y1="1" x2="1" y2="9" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" />
          <line x1="9" y1="5" x2="5" y2="9" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      font-family: inherit;
      user-select: none;
      -webkit-user-select: none;
      position: relative;
    }
    .custom-node-card {
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      overflow: hidden;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      position: relative;
    }
    :host:hover .custom-node-card,
    .custom-node-card:hover {
      border-color: #38bdf8;
      box-shadow: 0 6px 18px rgba(2, 132, 199, 0.16);
    }
    :host(.selected) .custom-node-card,
    .custom-node-card.selected {
      border-color: #0284c7;
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.25), 0 8px 24px rgba(2, 132, 199, 0.2);
    }
    .node-header {
      padding: 8px 12px 6px;
      background: linear-gradient(135deg, #f0fdf4 0%, #f0f9ff 100%);
      border-bottom: 1px solid #e2e8f0;
      flex-shrink: 0;
    }
    .header-main {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .node-badge {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .badge-icon {
      font-size: 12px;
      line-height: 1;
    }
    .badge-title {
      font-size: 10px;
      font-weight: 700;
      color: #0284c7;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .file-name {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .node-meta {
      padding: 6px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      border-bottom: 1px solid #f1f5f9;
      background: #fafafa;
      flex-shrink: 0;
    }
    .node-body.placeholder {
      padding: 14px 10px;
      background: #f8fafc;
      text-align: center;
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .empty-tip {
      font-size: 11px;
      color: #94a3b8;
      font-style: italic;
    }
    .meta-tags {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      line-height: 1.4;
    }
    .tag.version {
      background: #ede9fe;
      color: #6d28d9;
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tag.mode {
      background: #e0f2fe;
      color: #0369a1;
      text-transform: uppercase;
    }
    .summary-row {
      font-size: 11px;
      color: #64748b;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .summary-text {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* 富媒体预览区容器 */
    .preview-container {
      flex: 1;
      min-height: 50px;
      padding: 6px 10px;
      background: #ffffff;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    /* Mini 表格样式 */
    .mini-table {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      font-size: 10px;
      overflow: hidden;
      border: 1px solid #f1f5f9;
      border-radius: 4px;
    }
    .mini-thead {
      display: flex;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      font-weight: 600;
      color: #475569;
    }
    .mini-th {
      flex: 1;
      padding: 3px 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border-right: 1px solid #f1f5f9;
    }
    .mini-th:last-child {
      border-right: none;
    }
    .mini-tbody {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .mini-tr {
      display: flex;
      border-bottom: 1px solid #f8fafc;
    }
    .mini-tr:nth-child(even) {
      background: #fafafa;
    }
    .mini-td {
      flex: 1;
      padding: 2px 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #334155;
      border-right: 1px solid #f8fafc;
    }
    .mini-td:last-child {
      border-right: none;
    }
    /* Mini 时序 Sparkline 样式 */
    .sparkline-wrapper {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .sparkline-svg {
      width: 100%;
      flex: 1;
      min-height: 35px;
      display: block;
    }
    .sparkline-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: #64748b;
      margin-top: 2px;
    }
    .metric-label {
      font-weight: 600;
      color: #0369a1;
    }
    .metric-range {
      color: #94a3b8;
    }
    /* 输出端口容器 */
    .outputs-container {
      padding: 4px 0 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex-shrink: 0;
      border-top: 1px solid #f1f5f9;
    }
    .output-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      height: 24px;
      padding-left: 12px;
      position: relative;
    }
    .output-label {
      font-size: 11px;
      font-weight: 600;
      color: #0369a1;
      margin-right: 8px;
    }
    .output-socket {
      display: inline-block;
      margin-right: -12px;
      z-index: 2;
    }
    /* 缩放手柄 */
    .resize-handle {
      position: absolute;
      right: 2px;
      bottom: 2px;
      width: 14px;
      height: 14px;
      cursor: se-resize;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 5;
      opacity: 0.6;
      transition: opacity 0.15s ease;
    }
    .resize-handle:hover {
      opacity: 1;
    }
  `,
})
export class DataFileInputNodeComponent implements OnChanges {
  @Input() data: any = {};
  @Input() emit: (data: unknown) => void = () => undefined;
  @Input() rendered: () => void = () => undefined;

  seed = 0;

  ngOnChanges(): void {
    this.seed++;
    requestAnimationFrame(() => this.rendered());
  }

  currentWidth(): number {
    return Math.max(220, Number(this.data?.width) || 240);
  }

  currentHeight(): number {
    const raw = Number(this.data?.height);
    if (raw && raw > 100) return raw;
    // Default auto height based on content
    return this.fileName() ? 200 : 130;
  }

  onResizeStart(e: PointerEvent): void {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = this.currentWidth();
    const startH = this.currentHeight();

    const onMove = (moveEv: PointerEvent) => {
      const newW = Math.max(220, Math.min(600, startW + (moveEv.clientX - startX)));
      const newH = Math.max(130, Math.min(500, startH + (moveEv.clientY - startY)));
      this.data.width = newW;
      this.data.height = newH;
      this.seed++;
      this.rendered();
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      this.seed++;
      this.rendered();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  getOutputs(): Array<{ key: string; value: any }> {
    const outputs = this.data?.outputs || {};
    const mode = (this.outputMode() || '').toLowerCase();
    const all = Object.keys(outputs).map((key) => ({ key, value: outputs[key] }));
    if (mode === 'timeseries') {
      const filtered = all.filter(
        (o) => o.key === 'series' || o.key.includes('series') || o.key.includes('time'),
      );
      return filtered.length ? filtered : all.slice(1);
    }
    if (mode === 'table') {
      const filtered = all.filter(
        (o) => o.key === 'table' || o.key.includes('table'),
      );
      return filtered.length ? filtered : all.slice(0, 1);
    }
    return all.slice(0, 1);
  }

  display(key: string): string {
    const nested = this.data?.['data'];
    const value =
      this.data?.[key] ??
      (nested && typeof nested === 'object' ? (nested as Record<string, unknown>)[key] : undefined);
    return value === null || value === undefined ? '' : String(value);
  }

  fileName(): string {
    return this.display('fileName') || this.display('file_name');
  }

  version(): string {
    return this.display('version');
  }

  outputMode(): string {
    return this.display('outputMode') || this.display('output_mode') || 'table';
  }

  columnSummary(): string {
    return this.display('columnSummary') || this.display('column_summary');
  }

  previewColumns(): string[] {
    const nested = this.data?.['data'] || this.data || {};
    if (Array.isArray(nested.selectedColumns) && nested.selectedColumns.length > 0) {
      return nested.selectedColumns.slice(0, 4);
    }
    if (Array.isArray(nested.columns) && nested.columns.length > 0) {
      return nested.columns.slice(0, 4);
    }
    const sum = this.columnSummary();
    if (sum && !sum.includes('→')) {
      return sum.split('、').map((s) => s.trim()).filter(Boolean).slice(0, 4);
    }
    return ['col_1', 'col_2', 'col_3'];
  }

  sampleRows(): Array<Record<string, unknown>> {
    const nested = this.data?.['data'] || this.data || {};
    if (Array.isArray(nested.sampleRows) && nested.sampleRows.length > 0) {
      return nested.sampleRows.slice(0, 3);
    }
    // Default dummy rows
    return [
      { col_1: '001', col_2: '32.0', col_3: '21.17' },
      { col_1: '002', col_2: '32.1', col_3: '21.27' },
      { col_1: '003', col_2: '32.2', col_3: '21.39' },
    ];
  }

  formatCell(val: unknown): string {
    if (val === null || val === undefined) return '—';
    return String(val);
  }

  private getNumericalPoints(): number[] {
    const nested = this.data?.['data'] || this.data || {};
    const valCol = nested.valueColumn || 'pressure' || 'inlet_flow' || 'value';
    if (Array.isArray(nested.sampleRows) && nested.sampleRows.length > 1) {
      const nums = nested.sampleRows
        .map((r: any) => {
          const v = Number(r[valCol] ?? Object.values(r).find((x) => typeof x === 'number' || (!isNaN(Number(x)) && x !== '')));
          return isNaN(v) ? null : v;
        })
        .filter((n: any): n is number => n !== null);
      if (nums.length > 1) return nums;
    }
    // Deterministic synthetic waveform based on file name length
    const base = this.fileName().length || 10;
    return Array.from({ length: 16 }, (_, i) =>
      Math.sin((i + base) * 0.5) * 5 + 32 + (i % 3) * 0.4,
    );
  }

  svgLinePath(): string {
    const points = this.getNumericalPoints();
    if (points.length < 2) return 'M 0,25 L 200,25';
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    return points
      .map((p, i) => {
        const x = (i / (points.length - 1)) * 200;
        const y = 45 - ((p - min) / range) * 38;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  svgAreaPath(): string {
    const line = this.svgLinePath();
    return `${line} L 200,50 L 0,50 Z`;
  }

  valueRangeText(): string {
    const points = this.getNumericalPoints();
    const min = Math.min(...points);
    const max = Math.max(...points);
    return `${min.toFixed(1)} ~ ${max.toFixed(1)}`;
  }
}

