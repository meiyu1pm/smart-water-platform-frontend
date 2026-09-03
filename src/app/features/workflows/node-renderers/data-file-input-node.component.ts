import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RefDirective } from 'rete-angular-plugin/21';
import * as echarts from 'echarts';
import { SwIconComponent } from '../../../shared/components/sw-icon.component';

/**
 * 数据文件输入节点的专属富媒体卡片渲染器。
 * 特性：
 * 1. 右下角支持拖拽自由实时缩放节点卡片大小（通过 PointerCapture 与 Signal 实时平滑重绘）；
 * 2. 动态单输出端口联动（表格输出暴露 table 端口，时序输出暴露 series 端口）；
 * 3. 内嵌真实时序时间轴曲线图（ECharts 驱动，支持鼠标滚轮缩放时间轴长度与下方滑块区间缩放）；
 * 4. 内嵌表格模式 Mini 表格网格；
 * 5. 采用 Rete 原生 RefDirective 确保连线插槽坐标与拖拽自适应更新。
 */
@Component({
  selector: 'app-data-file-input-node',
  standalone: true,
  imports: [CommonModule, RefDirective, SwIconComponent],
  host: {
    'data-testid': 'node',
    '[class.selected]': 'data?.selected',
  },
  template: `
    <div
      class="custom-node-card"
      data-testid="node"
      [class.selected]="data?.selected"
      [style.width.px]="nodeWidth()"
      [style.height.px]="nodeHeight()"
    >
      <!-- 头部：算子标识与文件名 -->
      <header class="node-header">
        <div class="header-main">
          <div class="node-badge">
            <span class="badge-icon"><app-sw-icon name="file" [size]="18" /></span>
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
          <span class="tag version" *ngIf="version()" [title]="version()">{{ version() }}</span>
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

      <!-- 富媒体预览区：时序模式 ECharts 时序图（时间轴 + 滚轮缩放） -->
      <div
        class="preview-container series-preview"
        *ngIf="fileName() && outputMode() === 'timeseries'"
        (wheel)="$event.stopPropagation()"
        (pointerdown)="$event.stopPropagation()"
      >
        <div #chartHost class="chart-host"></div>
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
        title="拖拽实时调整节点卡片大小"
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
      background: var(--sw-surface);
      border: 1.5px solid var(--sw-border-strong);
      border-radius: 10px;
      box-shadow: var(--sw-shadow-md);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      overflow: hidden;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      position: relative;
    }
    :host:hover .custom-node-card,
    .custom-node-card:hover {
      border-color: var(--sw-color-primary);
      box-shadow: var(--sw-shadow-md);
    }
    :host(.selected) .custom-node-card,
    .custom-node-card.selected {
      border-color: var(--sw-node-selected);
      box-shadow:
        0 0 0 3px color-mix(in srgb, var(--sw-node-selected) 24%, transparent),
        var(--sw-shadow-lg);
    }
    .node-header {
      padding: 8px 12px 6px;
      background: linear-gradient(135deg, var(--sw-color-secondary-soft), var(--sw-color-primary-soft));
      border-bottom: 1px solid var(--sw-border);
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
      color: var(--sw-color-primary);
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .file-name {
      font-size: 13px;
      font-weight: 700;
      color: var(--sw-text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .node-meta {
      padding: 5px 10px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      border-bottom: 1px solid var(--sw-border);
      background: var(--sw-surface-muted);
      flex-shrink: 0;
    }
    .node-body.placeholder {
      padding: 18px 10px;
      background: var(--sw-surface-muted);
      text-align: center;
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .empty-tip {
      font-size: 11px;
      color: var(--sw-text-muted);
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
      background: var(--sw-color-accent-soft);
      color: var(--sw-color-accent);
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tag.mode {
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary-strong);
      text-transform: uppercase;
    }
    .summary-row {
      font-size: 11px;
      color: var(--sw-text-muted);
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
    /* 预览区容器 */
    .preview-container {
      flex: 1;
      min-height: 80px;
      padding: 4px 8px;
      background: var(--sw-surface);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      position: relative;
    }
    .series-preview {
      padding: 0;
    }
    .chart-host {
      width: 100%;
      height: 100%;
      min-height: 100px;
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
    /* 输出端口容器 */
    .outputs-container {
      padding: 3px 0 5px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex-shrink: 0;
      border-top: 1px solid #f1f5f9;
      background: #ffffff;
    }
    .output-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      height: 22px;
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
      z-index: 10;
      opacity: 0.7;
      transition: opacity 0.15s ease;
      touch-action: none;
    }
    .resize-handle:hover {
      opacity: 1;
    }
  `,
})
export class DataFileInputNodeComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  @Input() data: any = {};
  @Input() emit: (data: unknown) => void = () => undefined;
  @Input() rendered: () => void = () => undefined;

  @ViewChild('chartHost') chartHost?: ElementRef<HTMLDivElement>;

  seed = 0;
  readonly nodeWidth = signal(360);
  readonly nodeHeight = signal(240);

  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;

  ngAfterViewInit(): void {
    this.initChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.seed++;
    if (this.data?.width) {
      this.nodeWidth.set(Math.max(260, Number(this.data.width)));
    } else {
      this.nodeWidth.set(this.defaultWidth());
    }
    if (this.data?.height) {
      this.nodeHeight.set(Math.max(140, Number(this.data.height)));
    } else {
      this.nodeHeight.set(this.defaultHeight());
    }

    requestAnimationFrame(() => {
      this.initChart();
      this.rendered();
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
    this.chart = null;
  }

  defaultWidth(): number {
    if (!this.fileName()) return 240;
    return this.outputMode() === 'timeseries' ? 380 : 320;
  }

  defaultHeight(): number {
    if (!this.fileName()) return 130;
    return this.outputMode() === 'timeseries' ? 240 : 200;
  }

  onResizeStart(e: PointerEvent): void {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {}

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = this.nodeWidth();
    const startH = this.nodeHeight();

    const onPointerMove = (ev: PointerEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
      const newW = Math.round(
        Math.max(260, Math.min(800, startW + (ev.clientX - startX))),
      );
      const newH = Math.round(
        Math.max(140, Math.min(600, startH + (ev.clientY - startY))),
      );
      this.nodeWidth.set(newW);
      this.nodeHeight.set(newH);
      this.data.width = newW;
      this.data.height = newH;
      this.chart?.resize();
      this.rendered();
    };

    const onPointerUp = (ev: PointerEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      try {
        target.releasePointerCapture(e.pointerId);
      } catch {}
      this.seed++;
      this.chart?.resize();
      this.rendered();
    };

    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  getOutputs(): Array<{ key: string; value: any }> {
    const outputs = this.data?.outputs || {};
    const mode = (this.outputMode() || '').toLowerCase();
    const all = Object.keys(outputs).map((key) => ({
      key,
      value: outputs[key],
    }));
    if (mode === 'timeseries') {
      const filtered = all.filter(
        (o) =>
          o.key === 'series' ||
          o.key.includes('series') ||
          o.key.includes('time'),
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
      (nested && typeof nested === 'object'
        ? (nested as Record<string, unknown>)[key]
        : undefined);
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
    if (
      Array.isArray(nested.selectedColumns) &&
      nested.selectedColumns.length > 0
    ) {
      return nested.selectedColumns.slice(0, 4);
    }
    if (Array.isArray(nested.columns) && nested.columns.length > 0) {
      return nested.columns.slice(0, 4);
    }
    const sum = this.columnSummary();
    if (sum && !sum.includes('→')) {
      return sum
        .split('、')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 4);
    }
    return ['col_1', 'col_2', 'col_3'];
  }

  sampleRows(): Array<Record<string, unknown>> {
    const nested = this.data?.['data'] || this.data || {};
    if (Array.isArray(nested.sampleRows) && nested.sampleRows.length > 0) {
      return nested.sampleRows.slice(0, 4);
    }
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

  private initChart(): void {
    if (this.outputMode() !== 'timeseries' || !this.fileName()) {
      this.chart?.dispose();
      this.chart = null;
      return;
    }

    if (!this.chartHost?.nativeElement) {
      return;
    }

    try {
      if (!this.chart) {
        this.chart = echarts.init(this.chartHost.nativeElement, null, {
          renderer: 'svg',
        });
        if (typeof ResizeObserver !== 'undefined') {
          this.resizeObserver = new ResizeObserver(() => {
            this.chart?.resize();
          });
          this.resizeObserver.observe(this.chartHost.nativeElement);
        }
      }

      this.renderChart();
    } catch {
      // Safe fallback in headless/test environments
    }
  }

  private renderChart(): void {
    if (!this.chart) return;

    const seriesData = this.getTimeSeriesData();
    const nested = this.data?.['data'] || this.data || {};
    const valColName = nested.valueColumn || 'measurement';

    const option: echarts.EChartsOption = {
      animation: false,
      title: {
        text: '节点时序输出',
        left: 'center',
        top: 2,
        textStyle: { fontSize: 11, fontWeight: 'bold', color: '#334155' },
      },
      legend: {
        top: 16,
        left: 'center',
        textStyle: { fontSize: 10, color: '#64748b' },
        data: [valColName],
      },
      grid: {
        top: 36,
        left: 36,
        right: 12,
        bottom: 24,
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        textStyle: { fontSize: 11 },
      },
      xAxis: {
        type: 'time',
        boundaryGap: ['0%', '0%'] as any,
        axisLabel: { fontSize: 9, color: '#64748b' },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: '数值',
        nameTextStyle: { fontSize: 9, color: '#94a3b8' },
        scale: true,
        axisLabel: { fontSize: 9, color: '#64748b' },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      dataZoom: [
        { type: 'inside' }, // 允许通过鼠标滚轮缩放时间轴
        {
          type: 'slider',
          height: 12,
          bottom: 1,
          borderColor: '#cbd5e1',
          fillerColor: 'rgba(2, 132, 199, 0.15)',
          handleSize: '100%',
          textStyle: { fontSize: 7 },
        },
      ],
      series: [
        {
          name: valColName,
          type: 'line',
          data: seriesData,
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#2563eb', width: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(37, 99, 235, 0.22)' },
              { offset: 1, color: 'rgba(37, 99, 235, 0.01)' },
            ]),
          },
        },
      ],
    };

    this.chart.setOption(option, { notMerge: true });
  }

  private getTimeSeriesData(): Array<[string, number]> {
    const nested = this.data?.['data'] || this.data || {};
    const timeCol = nested.timeColumn || 'record_time' || 'time';
    const valCol = nested.valueColumn || 'inlet_flow' || 'pressure' || 'value';
    const rows = nested.sampleRows || [];
    if (Array.isArray(rows) && rows.length > 0) {
      const points: Array<[string, number]> = [];
      for (const r of rows) {
        const t = String(r[timeCol] ?? r['record_time'] ?? r['time'] ?? '');
        const rawV =
          r[valCol] ?? Object.values(r).find((x) => typeof x === 'number');
        const v = Number(rawV);
        if (t && !isNaN(v)) {
          points.push([t, v]);
        }
      }
      if (points.length > 0) {
        return points;
      }
    }
    // Synthetic realistic sinusoid waveform fallback if no preview rows yet
    const now = new Date('2026-01-01T00:00:00Z').getTime();
    return Array.from({ length: 30 }, (_, i) => {
      const t = new Date(now + i * 15 * 60 * 1000).toISOString();
      const v = Math.sin(i * 0.5) * 5 + 30 + (i % 3) * 0.4;
      return [t, Number(v.toFixed(3))];
    });
  }
}

