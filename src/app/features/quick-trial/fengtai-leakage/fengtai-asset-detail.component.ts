import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import * as echarts from 'echarts';
import { AssetSelection, FengtaiAssetDetail, FengtaiCandidate } from './fengtai-leakage.models';
import { SwIconComponent } from '../../../shared/components/sw-icon.component';

@Component({
  selector: 'app-fengtai-asset-detail',
  standalone: true,
  imports: [CommonModule, SwIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<aside class="panel" aria-label="资产检查器">
    <header>
      <div>
        <p class="eyebrow">资产检查器</p>
        <h2>{{ detail?.asset?.name || selection?.name || '资产' }}</h2>
      </div>
      <button type="button" (click)="closed.emit()" aria-label="关闭资产详情">
        <app-sw-icon name="close" [size]="18" />
      </button>
    </header>
    <nav class="tabs" role="tablist" aria-label="资产信息分类">
      @for (tab of tabs; track tab.id) {
        <button
          type="button"
          role="tab"
          [class.active]="activeTab === tab.id"
          [attr.aria-selected]="activeTab === tab.id"
          (click)="selectTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      }
    </nav>
    <section class="tab-body" role="tabpanel">
      @if (loading) {
        <p class="state">正在加载资产详情…</p>
      } @else if (error) {
        <p class="state error">{{ error }}</p>
        <button type="button" class="retry" (click)="retry.emit()">重试</button>
      } @else if (activeTab === 'overview') {
        @if (detail) {
          <dl class="facts">
            @for (entry of facts(); track entry[0]) {
              <div>
                <dt>{{ entry[0] }}</dt>
                <dd>{{ entry[1] }}</dd>
              </div>
            }
          </dl>
          @if (candidate && candidate.score !== undefined) {
            <div class="risk">
              <span>综合评分</span><strong>{{ candidate.score.toFixed(2) }} 分</strong>
            </div>
          }
        } @else {
          <div class="selection-overview">
            <span>{{ assetTypeLabel(selection?.type) }}</span>
            <strong>{{ selection?.id }}</strong>
            <p>基础拓扑已载入。运行分析后可继续查看时序、证据和相邻对象。</p>
          </div>
        }
      } @else if (activeTab === 'series') {
        @if (hasSeries()) {
          @if (stateEntries().length) {
            <h3>当前时刻状态</h3>
            <dl class="state-facts">
              @for (entry of stateEntries(); track entry.label) {
                <div>
                  <dt>{{ entry.label }}</dt>
                  <dd>{{ entry.value }}</dd>
                </div>
              }
            </dl>
          }
          <div #chartHost class="chart" aria-label="分析窗口流量压力曲线"></div>
        } @else {
          <p class="tab-empty">完成分析后可查看该资产在当前时间窗口内的时序变化。</p>
        }
      } @else if (activeTab === 'evidence') {
        @if (detail?.calculation; as calculation) {
          <span
            class="scope"
            [class.reference]="calculation.evidence_scope !== 'node_history_aggregate'"
            >{{ scopeLabel(calculation.evidence_scope) }}</span
          >
          <p class="scope-note">
            计算方法：{{ calculation.method }} · 置信度
            {{ (calculation.confidence * 100).toFixed(0) }}%
          </p>
        } @else if (detail?.measurement; as measurement) {
          <span class="scope" [class.reference]="measurement.scope === 'community_reference'">{{
            measurement.scope === 'community_reference' ? '小区级参考' : '直接测量'
          }}</span>
          <p class="scope-note">数据来源：{{ measurement.source_label }}</p>
        } @else {
          <p class="tab-empty">当前资产尚未生成可追溯的分析证据。</p>
        }
        @if (candidate?.reason) {
          <p class="evidence-reason">{{ candidate?.reason }}</p>
        }
      } @else {
        <h3>邻接关系</h3>
        <div class="adjacent">
          @for (connection of connections(); track connection) {
            <span>{{ connection }}</span>
          } @empty {
            <span>{{ detail ? '暂无邻接资产' : '完成分析后加载邻接关系' }}</span>
          }
        </div>
      }
    </section>
  </aside>`,
  styles: `
    .panel {
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      padding: 18px;
      max-width: 460px;
      width: min(100%, 460px);
      box-sizing: border-box;
      box-shadow: var(--sw-shadow-md);
    }
    .panel header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .panel h2 {
      margin: 0;
      color: var(--sw-text-primary);
      font-size: 18px;
    }
    .eyebrow {
      margin: 0 0 4px;
      color: var(--sw-text-muted);
      font-size: 11px;
    }
    .panel header button {
      border: 0;
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border-radius: var(--sw-radius-sm);
      background: transparent;
      color: var(--sw-text-muted);
      cursor: pointer;
    }
    .panel header button:hover {
      color: var(--sw-text-primary);
      background: var(--sw-surface-muted);
    }
    .tabs {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px;
      margin: 14px 0;
      padding: 4px;
      border-radius: var(--sw-radius-sm);
      background: var(--sw-surface-muted);
    }
    .tabs button {
      min-height: 32px;
      padding: 0 5px;
      border: 0;
      border-radius: var(--sw-radius-xs);
      background: transparent;
      color: var(--sw-text-muted);
      font: inherit;
      font-size: 11px;
      cursor: pointer;
    }
    .tabs button.active {
      background: var(--sw-surface);
      color: var(--sw-color-primary-strong);
      box-shadow: var(--sw-shadow-sm);
      font-weight: 700;
    }
    .tabs button:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--sw-focus) 28%, transparent);
      outline-offset: 1px;
    }
    .tab-body {
      min-height: 180px;
    }
    .selection-overview,
    .tab-empty {
      padding: 14px;
      border: 1px dashed var(--sw-border-strong);
      border-radius: var(--sw-radius-sm);
      background: var(--sw-surface-muted);
    }
    .selection-overview {
      display: grid;
      gap: 5px;
    }
    .selection-overview span,
    .selection-overview p,
    .tab-empty {
      color: var(--sw-text-muted);
      font-size: 12px;
      line-height: 1.6;
    }
    .selection-overview strong {
      color: var(--sw-text-primary);
      font-variant-numeric: tabular-nums;
    }
    .selection-overview p,
    .tab-empty {
      margin: 0;
    }
    .evidence-reason {
      margin-top: 10px;
      color: var(--sw-text-secondary);
      font-size: 12px;
      line-height: 1.6;
    }
    .facts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin: 16px 0;
    }
    .facts div {
      border: 1px solid var(--sw-border);
      background: var(--sw-surface-muted);
      border-radius: var(--sw-radius-sm);
      padding: 8px;
    }
    .facts dt {
      font-size: 11px;
      color: var(--sw-text-muted);
    }
    .facts dd {
      margin: 3px 0 0;
      color: var(--sw-text-primary);
      word-break: break-word;
    }
    .scope {
      display: inline-block;
      padding: 4px 9px;
      border-radius: 999px;
      background: var(--sw-color-success-soft);
      color: var(--sw-color-success);
      font-size: 12px;
    }
    .scope.reference {
      background: var(--sw-color-warning-soft);
      color: var(--sw-color-warning);
    }
    .scope-note,
    .state {
      font-size: 12px;
      color: var(--sw-text-muted);
    }
    .state-facts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 7px;
      margin: 8px 0;
    }
    .state-facts div {
      padding: 7px;
      border: 1px solid var(--sw-border);
      background: var(--sw-surface-muted);
      border-radius: var(--sw-radius-xs);
    }
    .state-facts dt {
      color: var(--sw-text-muted);
      font-size: 11px;
    }
    .state-facts dd {
      margin: 3px 0 0;
      color: var(--sw-text-primary);
      font-size: 12px;
    }
    .risk {
      margin-bottom: 10px;
      padding: 9px 10px;
      border-radius: 8px;
      border: 1px solid color-mix(in srgb, var(--sw-color-accent) 26%, var(--sw-border));
      background: var(--sw-color-accent-soft);
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--sw-color-warning);
      font-size: 12px;
    }
    .error {
      color: var(--sw-color-danger);
    }
    .retry {
      border: 1px solid var(--sw-border-strong);
      background: var(--sw-surface);
      border-radius: var(--sw-radius-xs);
      padding: 6px 12px;
    }
    .chart {
      height: 220px;
      margin: 8px 0 14px;
    }
    .panel h3 {
      font-size: 13px;
      color: var(--sw-text-secondary);
    }
    .adjacent {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .adjacent span {
      padding: 4px 8px;
      border: 1px solid var(--sw-border);
      background: var(--sw-surface-muted);
      border-radius: 999px;
      font-size: 12px;
    }
    @media (max-width: 600px) {
      .panel {
        max-width: none;
        border-radius: 12px;
        padding: 14px;
      }
      .chart {
        height: 190px;
      }
    }
  `,
})
export class FengtaiAssetDetailComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() selection: AssetSelection | null = null;
  @Input() detail: FengtaiAssetDetail | null = null;
  @Input() candidate: FengtaiCandidate | null = null;
  @Input() loading = false;
  @Input() error = '';
  @Input() activeTimestamp: string | null = null;
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly retry = new EventEmitter<void>();
  readonly tabs = [
    { id: 'overview', label: '概览' },
    { id: 'series', label: '时序' },
    { id: 'evidence', label: '证据' },
    { id: 'adjacent', label: '相邻对象' },
  ] as const;
  activeTab: (typeof this.tabs)[number]['id'] = 'overview';
  private host?: ElementRef<HTMLDivElement>;
  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  @ViewChild('chartHost')
  set chartHost(value: ElementRef<HTMLDivElement> | undefined) {
    if (this.host?.nativeElement !== value?.nativeElement) {
      this.chart?.dispose();
      this.chart = null;
    }
    this.host = value;
    this.resizeObserver?.disconnect();
    if (!value) return;
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(value.nativeElement);
    queueMicrotask(() => this.renderChart());
  }
  ngAfterViewInit(): void {
    this.renderChart();
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selection'] && !changes['selection'].firstChange) this.activeTab = 'overview';
    this.renderChart();
  }
  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }
  facts(): [string, string][] {
    const a = this.detail?.asset ?? {};
    return Object.entries(a)
      .filter(
        ([k, v]) =>
          !['name', 'type', 'id'].includes(k) &&
          !(k === 'elevation' && a['elevation_m'] !== null && a['elevation_m'] !== undefined) &&
          v !== null &&
          v !== undefined &&
          typeof v !== 'object',
      )
      .slice(0, 8)
      .map(([k, v]) => [this.factLabel(k), this.factValue(k, v)]);
  }
  connections(): string[] {
    if (!this.detail) return [];
    return [
      ...this.detail.connections.node_ids.map((id) => `节点 ${id}`),
      ...this.detail.connections.pipe_ids.map((id) => `管段 ${id}`),
    ];
  }
  selectTab(tab: (typeof this.tabs)[number]['id']): void {
    this.activeTab = tab;
    queueMicrotask(() => this.renderChart());
  }
  hasSeries(): boolean {
    return !!(
      this.detail?.measurement?.series?.timestamps?.length ||
      this.detail?.state_series?.timestamps?.length
    );
  }
  assetTypeLabel(type: AssetSelection['type'] | undefined): string {
    return (
      (
        { node: '节点', pipe: '管段', valve: '阀门', hydrant: '消火栓', meter: '测点' } as Record<
          string,
          string
        >
      )[type ?? ''] ?? '管网资产'
    );
  }
  stateEntries(): Array<{ label: string; value: string }> {
    const state = this.detail?.state_series;
    if (!state?.timestamps.length || !this.activeTimestamp) return [];
    const index = state.timestamps.indexOf(this.activeTimestamp);
    if (index < 0) return [];
    return state.metrics
      .map((metric) => {
        const value = metric.values[index];
        if (value === null || value === undefined) return null;
        const kind =
          (
            {
              observed: '实测',
              cleaned: '清洗后实测',
              estimated: '估算',
              derived: '推导',
              synthetic: '合成',
            } as const
          )[metric.value_kind] ?? metric.value_kind;
        return {
          label: `${metric.name}（${kind}）`,
          value: `${Number.isInteger(value) ? value : value.toFixed(2)} ${metric.unit}`,
        };
      })
      .filter((entry): entry is { label: string; value: string } => entry !== null);
  }
  scopeLabel(scope: string): string {
    return (
      (
        {
          node_history_aggregate: '节点观测与拓扑汇总',
          topology_proxy: '拓扑代理估算',
          direct: '直接测量',
          community_reference: '小区级参考',
        } as Record<string, string>
      )[scope] ?? scope
    );
  }
  private factLabel(key: string): string {
    return (
      (
        {
          asset_id: '资产编号',
          asset_type: '资产类型',
          node_type: '节点类型',
          material: '材质',
          diameter_mm: '管径（mm）',
          length_m: '长度（m）',
          status: '状态',
          start_node_id: '起点',
          end_node_id: '终点',
          elevation_m: '高程（m）',
          x: '平面 X 坐标',
          y: '平面 Y 坐标',
        } as Record<string, string>
      )[key] ?? key
    );
  }
  private factValue(key: string, value: unknown): string {
    if (key === 'asset_type') {
      return (
        (
          {
            node: '节点',
            pipe: '管段',
            valve: '阀门',
            hydrant: '消火栓',
            meter: '测点',
          } as Record<string, string>
        )[String(value)] ?? String(value)
      );
    }
    return String(value);
  }
  private renderChart(): void {
    if (this.activeTab !== 'series') {
      this.chart?.clear();
      return;
    }
    const measurement = this.detail?.measurement?.series;
    const state = this.detail?.state_series;
    const timestamps = measurement?.timestamps ?? state?.timestamps ?? [];
    if (!this.host || !timestamps.length) {
      this.chart?.clear();
      return;
    }
    const chartSeries = measurement
      ? [
          {
            name: '流量',
            type: 'line',
            showSymbol: false,
            data: measurement.flow,
            yAxisIndex: 0,
            markLine: this.cursorMarkLine(),
          },
          {
            name: '压力',
            type: 'line',
            yAxisIndex: 1,
            showSymbol: false,
            data: measurement.pressure,
          },
        ]
      : (state?.metrics ?? []).map((metric, index) => ({
          name: metric.name,
          type: 'line',
          showSymbol: false,
          data: metric.values,
          yAxisIndex: index === 0 ? 0 : 1,
          markLine: index === 0 ? this.cursorMarkLine() : undefined,
        }));
    const legend = measurement
      ? ['流量', '压力']
      : (state?.metrics ?? []).map((metric) => metric.name);
    const units = measurement
      ? ['流量 m³/h', '压力 MPa']
      : [state?.metrics[0]?.unit ?? '', state?.metrics[1]?.unit ?? ''];
    this.chart ??= echarts.init(this.host.nativeElement, null, { renderer: 'svg' });
    this.chart.setOption(
      {
        animation: false,
        tooltip: { trigger: 'axis' },
        legend: { data: legend },
        xAxis: { type: 'category', data: timestamps },
        yAxis: [
          { type: 'value', name: units[0] },
          { type: 'value', name: units[1] },
        ],
        dataZoom: [{ type: 'inside' }, { type: 'slider', height: 14, bottom: 4 }],
        grid: { left: 46, right: 46, top: 38, bottom: 36 },
        series: chartSeries,
      },
      { notMerge: true },
    );
  }
  private cursorMarkLine(): object | undefined {
    return this.activeTimestamp
      ? {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#f59e0b' },
          data: [{ xAxis: this.activeTimestamp }],
        }
      : undefined;
  }
}
