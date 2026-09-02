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
} from '@angular/core';
import * as echarts from 'echarts';

import { FengtaiCandidate, FengtaiTopology } from './fengtai-leakage.models';

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
  @ViewChild('host') private host?: ElementRef<HTMLDivElement>;
  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  ngAfterViewInit(): void {
    if (!this.host) return;
    this.chart = echarts.init(this.host.nativeElement, null, { renderer: 'svg' });
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.host.nativeElement);
    this.render();
  }
  ngOnChanges(_changes: SimpleChanges): void {
    this.render();
  }
  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }

  private render(): void {
    if (!this.chart) return;
    const nodes = (this.topology?.nodes ?? []).map((node) => ({
      id: node.id,
      name: node.name ?? node.id,
      x: node.x,
      y: node.y,
      symbol: node.type === 'valve' ? 'diamond' : node.type === 'hydrant' ? 'triangle' : 'circle',
      symbolSize: node.type === 'valve' || node.type === 'hydrant' ? 15 : 9,
      itemStyle: {
        color: node.type === 'valve' ? '#0f766e' : node.type === 'hydrant' ? '#dc2626' : '#475569',
      },
      label: {
        show: node.type === 'valve' || node.type === 'hydrant',
        position: 'right',
        color: '#475569',
        fontSize: 10,
      },
      value: node.type ?? '节点',
    }));
    const candidateByPipe = new Map(
      this.candidates
        .filter((candidate) => candidate.pipe_id)
        .map((candidate) => [candidate.pipe_id!, candidate]),
    );
    const pipes = this.topology?.pipes ?? this.topology?.links ?? [];
    const links = pipes.map((pipe) => {
      const candidate = candidateByPipe.get(pipe.id ?? '');
      const risk = candidate?.score ?? candidate?.risk ?? pipe.risk;
      return {
        source: pipe.source,
        target: pipe.target,
        name: pipe.name ?? pipe.id ?? '管段',
        lineStyle: { color: this.riskColor(risk), width: candidate ? 4 : 2.5 },
        value: candidate ? `候选 ${this.riskText(risk)}` : this.riskText(risk),
      };
    });
    this.chart.setOption(
      {
        animation: false,
        title: {
          text: '管网风险概览',
          subtext: '滚轮缩放；悬停查看管段与设备',
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
