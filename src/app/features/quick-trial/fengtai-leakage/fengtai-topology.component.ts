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

import { AssetSelection, FengtaiCandidate, FengtaiTopology } from './fengtai-leakage.models';

@Component({
  selector: 'app-fengtai-topology',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="host" aria-label="丰泰风光苑管网拓扑图"></div>`,
  styles: `
    .host {
      width: 100%;
      height: 410px;
      min-height: 300px;
    }
  `,
})
export class FengtaiTopologyComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() topology: FengtaiTopology | undefined;
  @Input() candidates: FengtaiCandidate[] = [];
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
  ngOnChanges(_changes: SimpleChanges): void {
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
    const nodes = (this.topology?.nodes ?? []).map((node) => ({
      id: node.id,
      name: node.name ?? node.id,
      type: node.type ?? 'node',
      x: node.x,
      y: node.y,
      symbol: node.type === 'valve' ? 'diamond' : node.type === 'hydrant' ? 'triangle' : 'circle',
      symbolSize:
        (node.type === 'valve' || node.type === 'hydrant' ? 15 : 9) +
        (this.selectedId === node.id ? 4 : 0),
      label: {
        show: node.type === 'valve' || node.type === 'hydrant',
        position: 'right',
        color: '#475569',
        fontSize: 10,
      },
      value: node.type ?? '节点',
      itemStyle: {
        color: node.type === 'valve' ? '#0f766e' : node.type === 'hydrant' ? '#dc2626' : '#475569',
        borderColor: this.selectedId === node.id ? '#f59e0b' : 'transparent',
        borderWidth: this.selectedId === node.id ? 3 : 0,
        opacity:
          this.selectedId && node.id !== this.selectedId && !adjacent.has(node.id) ? 0.18 : 1,
      },
    }));
    const candidateByPipe = new Map(
      this.candidates
        .filter((candidate) => candidate.pipe_id)
        .map((candidate) => [candidate.pipe_id!, candidate]),
    );
    const links = pipes.map((pipe) => {
      const candidate = candidateByPipe.get(pipe.id ?? '');
      const risk = candidate?.score ?? candidate?.risk ?? pipe.risk;
      return {
        id: pipe.id,
        source: pipe.source,
        target: pipe.target,
        name: pipe.name ?? pipe.id ?? '管段',
        lineStyle: {
          color: this.selectedId === pipe.id ? '#f59e0b' : this.riskColor(risk),
          width: this.selectedId === pipe.id ? 6 : candidate ? 4 : 2.5,
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
        value: candidate ? `候选 ${this.riskText(risk)}` : this.riskText(risk),
      };
    });
    this.chart.setOption(
      {
        animation: false,
        title: {
          text: '管网风险概览',
          subtext: '点击资产查看详情 · 滚轮缩放',
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
    this.selectedId = String(params.dataType === 'edge' ? (data.id ?? data.name) : data.id);
    this.assetSelected.emit({
      type,
      id: this.selectedId,
      name: data.name ?? this.selectedId,
    } as AssetSelection);
    this.render();
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
}
