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

type Point = [string, number | null];

@Component({
  selector: 'app-fengtai-analysis-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="host" aria-label="漏损分析时序图"></div>`,
  styles: `
    .host {
      width: 100%;
      height: 390px;
      min-height: 300px;
    }
  `,
})
export class FengtaiAnalysisChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() series: Record<string, unknown> | undefined;
  @Input() anomalies: unknown[] | undefined;
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
    const series = this.series ?? {};
    const raw = this.seriesPoints(
      series,
      'raw_flow',
      series['raw'] ?? series['observed'] ?? series['flow'],
    );
    const repaired = this.seriesPoints(
      series,
      'repaired_flow',
      series['repaired'] ?? series['cleaned'],
    );
    const forecast = this.seriesPoints(series, 'forecast', series['predicted']);
    const lower = this.seriesPoints(series, 'lower', series['forecast_lower']);
    const upper = this.seriesPoints(series, 'upper', series['forecast_upper']);
    const pressure = this.seriesPoints(series, 'pressure');
    const anomalies = this.points(this.anomalies).filter((point) => point[1] !== null);
    const bandBase = lower;
    const bandRange = upper.map(
      (point, index) =>
        [
          point[0],
          point[1] !== null && lower[index]?.[1] !== null
            ? Number(point[1]) - Number(lower[index][1])
            : null,
        ] as Point,
    );
    const chartSeries: any[] = [];
    if (bandBase.length && bandRange.length) {
      chartSeries.push({
        name: '预测区间基底',
        type: 'line',
        data: bandBase,
        stack: 'forecast',
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0 },
      });
      chartSeries.push({
        name: '预测区间',
        type: 'line',
        data: bandRange,
        stack: 'forecast',
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { color: 'rgba(14,165,233,.18)' },
      });
    }
    if (raw.length)
      chartSeries.push({
        name: '原始流量',
        type: 'line',
        data: raw,
        showSymbol: false,
        lineStyle: { color: '#64748b', width: 1.3 },
      });
    if (repaired.length)
      chartSeries.push({
        name: '修复后流量',
        type: 'line',
        data: repaired,
        showSymbol: false,
        lineStyle: { color: '#0f766e', width: 2 },
      });
    if (forecast.length)
      chartSeries.push({
        name: '预测流量',
        type: 'line',
        data: forecast,
        showSymbol: false,
        lineStyle: { color: '#0284c7', type: 'dashed', width: 2 },
      });
    if (pressure.length)
      chartSeries.push({
        name: '压力',
        type: 'line',
        yAxisIndex: 1,
        data: pressure,
        showSymbol: false,
        lineStyle: { color: '#a16207', width: 1.5 },
      });
    if (anomalies.length)
      chartSeries.push({
        name: '异常标记',
        type: 'scatter',
        data: anomalies,
        symbolSize: 9,
        itemStyle: { color: '#dc2626' },
        z: 9,
      });
    this.chart.setOption(
      {
        animation: false,
        title: {
          text: '入口总表流量、压力与异常变化',
          subtext: '丰泰风光苑入口总表：小区边界进水及同点压力，不是全管网平均值',
          left: 0,
          textStyle: { color: '#1e293b', fontSize: 14, fontWeight: 'normal' },
          subtextStyle: { color: '#64748b', fontSize: 11 },
        },
        legend: { top: 45, type: 'scroll', textStyle: { color: '#64748b', fontSize: 11 } },
        tooltip: { trigger: 'axis' },
        grid: { top: 84, left: 54, right: 54, bottom: 48 },
        xAxis: {
          type: 'time',
          axisLabel: { color: '#64748b', fontSize: 10 },
          axisLine: { lineStyle: { color: '#cbd5e1' } },
        },
        yAxis: [
          {
            type: 'value',
            name: '流量',
            scale: true,
            splitLine: { lineStyle: { color: '#eef2f7' } },
          },
          { type: 'value', name: '压力', scale: true, splitLine: { show: false } },
        ],
        dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 8 }],
        series: chartSeries,
        graphic: !chartSeries.length
          ? [
              {
                type: 'text',
                left: 'center',
                top: 'middle',
                style: { text: '完成分析后显示时序结果', fill: '#64748b', fontSize: 13 },
              },
            ]
          : [],
      } as echarts.EChartsOption,
      { notMerge: true },
    );
  }

  private points(value: unknown): Point[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (Array.isArray(item)) return [String(item[0]), this.number(item[1])] as Point;
        if (typeof item === 'object' && item) {
          const record = item as Record<string, unknown>;
          return [
            String(record['time'] ?? record['timestamp'] ?? record['date'] ?? ''),
            this.number(record['value'] ?? record['flow'] ?? record['pressure']),
          ] as Point;
        }
        return ['', null] as Point;
      })
      .filter((item) => item[0]);
  }
  private seriesPoints(series: Record<string, unknown>, key: string, fallback?: unknown): Point[] {
    const values = series[key] ?? fallback;
    if (!Array.isArray(values)) return this.points(values);
    const timestamps = Array.isArray(series['timestamps']) ? series['timestamps'] : [];
    if (timestamps.length && values.every((item) => typeof item !== 'object'))
      return values
        .map((value, index) => [String(timestamps[index] ?? ''), this.number(value)] as Point)
        .filter((item) => item[0]);
    return this.points(values);
  }
  private number(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
}
