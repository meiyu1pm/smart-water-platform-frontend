import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  Output,
  EventEmitter,
} from '@angular/core';
import * as echarts from 'echarts';

import {
  AssetSelection,
  FengtaiCandidate,
  FengtaiNetworkLayer,
  FengtaiTopology,
} from './fengtai-leakage.models';

@Component({
  selector: 'app-fengtai-topology',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="host" aria-label="管网拓扑图"></div>`,
  styles: `
    .host {
      width: 100%;
      height: 410px;
      min-height: 300px;
    }
    @media (max-width: 600px) {
      .host {
        height: 340px;
      }
    }
  `,
})
export class FengtaiTopologyComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() topology: FengtaiTopology | undefined;
  @Input() candidates: FengtaiCandidate[] = [];
  @Input() activeLayer: FengtaiNetworkLayer | null = null;
  @Input() activeFrameValues: Record<string, number | null> = {};
  @Input() selectedAsset: AssetSelection | null = null;
  @Output() readonly assetSelected = new EventEmitter<AssetSelection>();
  @ViewChild('host') private host?: ElementRef<HTMLDivElement>;
  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private selectedId: string | null = null;
  ngAfterViewInit(): void {
    if (!this.host) return;
    this.chart = echarts.init(this.host.nativeElement, null, { renderer: 'svg' });
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.host.nativeElement);
    this.render();
    this.chart.on('click', (params: any) => this.selectAsset(params));
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedAsset']) this.selectedId = this.selectedAsset?.id ?? null;
    this.render();
  }
  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.off('click');
    this.chart?.dispose();
  }

  private render(): void {
    if (!this.chart) return;
    const pipes = this.topology?.pipes ?? this.topology?.links ?? [];
    const adjacent = new Set<string>();
    if (this.selectedId)
      pipes.forEach((p) => {
        if (p.id === this.selectedId) {
          adjacent.add(p.source);
          adjacent.add(p.target);
        }
        if (p.source === this.selectedId) adjacent.add(p.target);
        if (p.target === this.selectedId) adjacent.add(p.source);
      });
    const nodes = (this.topology?.nodes ?? []).map((node) => {
      const active = this.activeState(
        node.id,
        node.type === 'valve' ? 'valve' : node.type === 'pipe' ? 'pipe' : 'node',
      );
      return {
        id: node.id,
        name: node.name ?? node.id,
        type: node.type ?? 'node',
        x: node.x,
        y: node.y,
        symbol: node.type === 'valve' ? 'diamond' : node.type === 'hydrant' ? 'triangle' : 'circle',
        symbolSize:
          (node.type === 'valve' || node.type === 'hydrant' ? 15 : 9) +
          (this.selectedId === node.id ? 4 : 0) +
          (active?.size ?? 0),
        label: {
          show: node.type === 'valve' || node.type === 'hydrant',
          position: 'right',
          color: '#475569',
          fontSize: 10,
        },
        value: active?.label ?? node.type ?? '节点',
        itemStyle: {
          color:
            active?.color ??
            (node.type === 'valve' ? '#0f766e' : node.type === 'hydrant' ? '#dc2626' : '#475569'),
          borderColor: this.selectedId === node.id ? '#f59e0b' : 'transparent',
          borderWidth: this.selectedId === node.id ? 3 : 0,
          opacity:
            this.selectedId && node.id !== this.selectedId && !adjacent.has(node.id) ? 0.18 : 1,
        },
      };
    });
    const candidateByPipe = new Map(
      this.candidates
        .filter((candidate) => candidate.pipe_id)
        .map((candidate) => [candidate.pipe_id!, candidate]),
    );
    const links = pipes.map((pipe) => {
      const candidate = candidateByPipe.get(pipe.id ?? '');
      const risk = candidate?.score ?? candidate?.risk ?? pipe.risk;
      const active = this.activeState(pipe.id ?? '', 'pipe');
      return {
        id: pipe.id,
        source: pipe.source,
        target: pipe.target,
        name: pipe.name ?? pipe.id ?? '管段',
        lineStyle: {
          color: this.selectedId === pipe.id ? '#f59e0b' : (active?.color ?? this.riskColor(risk)),
          width: this.selectedId === pipe.id ? 6 : (active?.width ?? (candidate ? 4 : 2.5)),
          type: active?.lineType,
          opacity:
            this.selectedId &&
            pipe.id !== this.selectedId &&
            pipe.source !== this.selectedId &&
            pipe.target !== this.selectedId &&
            !adjacent.has(pipe.source) &&
            !adjacent.has(pipe.target)
              ? 0.12
              : 0.9,
        },
        value: active?.label ?? (candidate ? `候选 ${this.riskText(risk)}` : this.riskText(risk)),
      };
    });
    this.chart.setOption(
      {
        animation: false,
        title: {
          text: '管网风险概览',
          subtext: this.activeLayer
            ? `${this.layerKindLabel(this.activeLayer.value_kind)}：${this.activeLayer.name}（${this.activeLayer.unit}） · 点击资产查看详情 · 滚轮缩放`
            : '点击资产查看详情 · 滚轮缩放',
          left: 0,
          textStyle: { color: '#1e293b', fontSize: 14, fontWeight: 'normal' },
          subtextStyle: { color: '#64748b', fontSize: 11 },
        },
        tooltip: {
          formatter: (item: any) =>
            item.dataType === 'edge'
              ? `${item.data.name}<br/>风险：${item.data.value}`
              : `${item.data.name}<br/>${item.data.value}`,
        },
        series: [
          {
            type: 'graph',
            layout: 'none',
            roam: true,
            data: nodes,
            links,
            edgeSymbol: ['none', 'none'],
            label: { show: false },
            lineStyle: { opacity: 0.9 },
            emphasis: {
              focus: 'adjacency',
              label: { show: true, position: 'right', color: '#1e293b', fontSize: 10 },
            },
          },
        ],
        graphic: !nodes.length
          ? [
              {
                type: 'text',
                left: 'center',
                top: 'middle',
                style: { text: '正在等待管网拓扑数据', fill: '#64748b', fontSize: 13 },
              },
            ]
          : [],
      } as echarts.EChartsOption,
      { notMerge: true },
    );
  }
  private selectAsset(params: any): void {
    const data = params?.data;
    if (!data) return;
    const type = params.dataType === 'edge' ? 'pipe' : (data.type ?? 'node');
    const selectedId = String(params.dataType === 'edge' ? (data.id ?? data.name) : data.id);
    queueMicrotask(() => {
      this.selectedId = selectedId;
      this.assetSelected.emit({
        type,
        id: selectedId,
        name: data.name ?? selectedId,
      } as AssetSelection);
      this.render();
    });
  }
  private riskColor(value: unknown): string {
    const valueAsNumber = typeof value === 'number' ? value : Number(value);
    const risk = valueAsNumber > 1 ? valueAsNumber / 100 : valueAsNumber;
    if (Number.isFinite(risk)) return risk >= 0.7 ? '#dc2626' : risk >= 0.4 ? '#d97706' : '#0f766e';
    return String(value).includes('高')
      ? '#dc2626'
      : String(value).includes('中')
        ? '#d97706'
        : '#0f766e';
  }
  private riskText(value: unknown): string {
    if (typeof value !== 'number') return String(value ?? '常规');
    return `${Math.round((value > 1 ? value / 100 : value) * 100)}%`;
  }

  private activeState(
    assetId: string,
    assetType: string,
  ): {
    color: string;
    width?: number;
    size?: number;
    lineType?: 'solid' | 'dashed';
    label: string;
  } | null {
    const layer = this.activeLayer;
    if (
      !layer ||
      layer.asset_type !== assetType ||
      !Object.prototype.hasOwnProperty.call(this.activeFrameValues, assetId)
    )
      return null;
    const value = this.activeFrameValues[assetId];
    const label = `${layer.name}：${value === null ? '无数据' : `${this.valueText(value)} ${layer.unit}`}`;
    if (value === null) return { color: '#94a3b8', width: 2.5, size: 0, lineType: 'dashed', label };
    const ratio = this.valueRatio(value, layer);
    return {
      color: ratio >= 0.7 ? '#dc2626' : ratio >= 0.4 ? '#d97706' : '#0f766e',
      width: 2.5 + ratio * 3.5,
      size: Math.round(ratio * 5),
      label,
    };
  }

  private valueRatio(value: number, layer: FengtaiNetworkLayer): number {
    const min = typeof layer.min === 'number' ? layer.min : value;
    const max = typeof layer.max === 'number' ? layer.max : value;
    if (max <= min) return 0.5;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  private valueText(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  private layerKindLabel(kind: FengtaiNetworkLayer['value_kind']): string {
    return (
      (
        {
          observed: '实测',
          cleaned: '清洗后实测',
          estimated: '估算',
          derived: '推导',
          synthetic: '合成',
        } as const
      )[kind] ?? kind
    );
  }
}
