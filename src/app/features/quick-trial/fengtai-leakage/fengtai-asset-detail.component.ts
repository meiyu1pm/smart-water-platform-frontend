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

@Component({
  selector: 'app-fengtai-asset-detail',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<aside class="panel" role="dialog" aria-label="资产详情">
    <header>
      <div>
        <p class="eyebrow">资产详情</p>
        <h2>{{ detail?.asset?.name || selection?.name || '资产' }}</h2>
      </div>
      <button type="button" (click)="closed.emit()" aria-label="关闭">×</button>
    </header>
    @if (loading) {
      <p class="state">正在加载资产详情…</p>
    } @else if (error) {
      <p class="state error">{{ error }}</p>
      <button type="button" class="retry" (click)="retry.emit()">重试</button>
    } @else if (detail) {
      <dl class="facts">
        @for (entry of facts(); track entry[0]) {
          <div>
            <dt>{{ entry[0] }}</dt>
            <dd>{{ entry[1] }}</dd>
          </div>
        }
      </dl>
      @if (candidate?.score !== undefined) {
        <div class="risk">
          <span>综合评分</span><strong>{{ candidate?.score?.toFixed(1) }} 分</strong>
        </div>
      }
      <span class="scope" [class.reference]="detail.measurement.scope === 'community_reference'">{{
        detail.measurement.scope === 'community_reference' ? '小区级参考' : '直接测量'
      }}</span>
      <p class="scope-note">数据来源：{{ detail.measurement.source_label }}</p>
      <div #chartHost class="chart" aria-label="分析窗口流量压力曲线"></div>
      <h3>邻接关系</h3>
      <div class="adjacent">
        @for (connection of connections(); track connection) {
          <span>{{ connection }}</span>
        } @empty {
          <span>暂无邻接资产</span>
        }
      </div>
    }
  </aside>`,
  styles: `
    .panel {
      background: #fff;
      border: 1px solid #dbe4ee;
      border-radius: 16px;
      padding: 18px;
      max-width: 460px;
      width: min(100%, 460px);
      box-sizing: border-box;
      box-shadow: 0 12px 32px #0f172a18;
    }
    .panel header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .panel h2 {
      margin: 0;
      color: #172033;
      font-size: 18px;
    }
    .eyebrow {
      margin: 0 0 4px;
      color: #64748b;
      font-size: 11px;
    }
    .panel header button {
      border: 0;
      background: transparent;
      font-size: 25px;
      color: #64748b;
      cursor: pointer;
    }
    .facts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin: 16px 0;
    }
    .facts div {
      background: #f8fafc;
      border-radius: 8px;
      padding: 8px;
    }
    .facts dt {
      font-size: 11px;
      color: #64748b;
    }
    .facts dd {
      margin: 3px 0 0;
      color: #1e293b;
      word-break: break-word;
    }
    .scope {
      display: inline-block;
      padding: 4px 9px;
      border-radius: 999px;
      background: #dcfce7;
      color: #166534;
      font-size: 12px;
    }
    .scope.reference {
      background: #fef3c7;
      color: #92400e;
    }
    .scope-note,
    .state {
      font-size: 12px;
      color: #64748b;
    }
    .risk {
      margin-bottom: 10px;
      padding: 9px 10px;
      border-radius: 8px;
      background: #fff7ed;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #9a3412;
      font-size: 12px;
    }
    .error {
      color: #b91c1c;
    }
    .retry {
      border: 1px solid #cbd5e1;
      background: #fff;
      border-radius: 7px;
      padding: 6px 12px;
    }
    .chart {
      height: 220px;
      margin: 8px 0 14px;
    }
    .panel h3 {
      font-size: 13px;
      color: #334155;
    }
    .adjacent {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .adjacent span {
      padding: 4px 8px;
      background: #f1f5f9;
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
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly retry = new EventEmitter<void>();
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
  ngOnChanges(_: SimpleChanges): void {
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
    const series = this.detail?.measurement.series;
    if (!this.host || !series?.timestamps.length) {
      this.chart?.clear();
      return;
    }
    this.chart ??= echarts.init(this.host.nativeElement, null, { renderer: 'svg' });
    this.chart.setOption(
      {
        animation: false,
        tooltip: { trigger: 'axis' },
        legend: { data: ['流量', '压力'] },
        xAxis: { type: 'category', data: series.timestamps },
        yAxis: [
          { type: 'value', name: '流量 m³/h' },
          { type: 'value', name: '压力 MPa' },
        ],
        dataZoom: [{ type: 'inside' }, { type: 'slider', height: 14, bottom: 4 }],
        grid: { left: 46, right: 46, top: 38, bottom: 36 },
        series: [
          { name: '流量', type: 'line', showSymbol: false, data: series.flow },
          {
            name: '压力',
            type: 'line',
            yAxisIndex: 1,
            showSymbol: false,
            data: series.pressure,
          },
        ],
      },
      { notMerge: true },
    );
  }
}
