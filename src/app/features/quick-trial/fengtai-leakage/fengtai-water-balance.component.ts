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
import { CommonModule } from '@angular/common';
import * as echarts from 'echarts';

import { fengtaiLabel, fengtaiValue } from './fengtai-labels';

interface DailyBalance {
  date?: string;
  master_volume_m3?: unknown;
  household_consumption_proxy_m3?: unknown;
  unaccounted_volume_proxy_m3?: unknown;
}

@Component({
  selector: 'app-fengtai-water-balance',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <div>
        <h3>水量平衡</h3>
        <p>对比每日总表供水、住户用水估算与未计量水量估算。</p>
      </div>
      <div #host class="chart" aria-label="每日水量平衡图"></div>
      @if (summaryEntries.length) {
        <div class="summary">
          @for (entry of summaryEntries; track entry.key) {
            <span
              >{{ label(entry.key) }}<strong>{{ value(entry.value) }}</strong></span
            >
          }
        </div>
      }
      @if (notice) {
        <p class="notice">{{ notice }}</p>
      }
    </section>
  `,
  styles: `
    .panel {
      border: 1px solid #dbe4ea;
      border-radius: 10px;
      padding: 16px;
      background: #fff;
    }
    h3 {
      margin: 0;
      font-size: 15px;
      color: #0f172a;
    }
    p {
      margin: 4px 0 0;
      color: #64748b;
      font-size: 12px;
      line-height: 1.5;
    }
    .chart {
      height: 245px;
      margin-top: 8px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
      margin-top: 5px;
    }
    .summary span {
      display: grid;
      gap: 3px;
      padding: 7px;
      color: #64748b;
      background: #f8fafc;
      border-radius: 6px;
      font-size: 11px;
    }
    .summary strong {
      color: #0f172a;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }
    .notice {
      margin-top: 9px;
      color: #9a3412;
    }
    @media (max-width: 520px) {
      .summary {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class FengtaiWaterBalanceComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() balance: Record<string, unknown> | undefined;
  @ViewChild('host') private host?: ElementRef<HTMLDivElement>;
  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;

  get summaryEntries(): Array<{ key: string; value: unknown }> {
    const summary = this.record(this.balance?.['summary']);
    return [
      'total_master_volume_m3',
      'total_household_consumption_proxy_m3',
      'total_unaccounted_volume_proxy_m3',
      'unaccounted_ratio',
    ]
      .filter((key) => summary[key] !== undefined)
      .slice(0, 3)
      .map((key) => ({ key, value: summary[key] }));
  }
  get notice(): string {
    const value = this.balance?.['notice'];
    return typeof value === 'string' ? value : '';
  }
  label(key: string): string {
    return fengtaiLabel(key);
  }
  value(value: unknown): string {
    return fengtaiValue(value);
  }
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
    const daily = Array.isArray(this.balance?.['daily'])
      ? (this.balance?.['daily'] as DailyBalance[])
      : [];
    const dates = daily.map((item) => item.date ?? '');
    const data = (key: keyof DailyBalance) => daily.map((item) => this.number(item[key]));
    this.chart.setOption(
      {
        animation: false,
        grid: { top: 42, left: 48, right: 12, bottom: 38 },
        tooltip: { trigger: 'axis' },
        legend: { top: 3, textStyle: { color: '#64748b', fontSize: 10 } },
        xAxis: { type: 'category', data: dates, axisLabel: { color: '#64748b', fontSize: 10 } },
        yAxis: {
          type: 'value',
          name: 'm³',
          axisLabel: { color: '#64748b', fontSize: 10 },
          splitLine: { lineStyle: { color: '#eef2f7' } },
        },
        series: [
          {
            name: '总表供水量',
            type: 'line',
            data: data('master_volume_m3'),
            showSymbol: false,
            lineStyle: { color: '#0284c7', width: 2 },
          },
          {
            name: '住户用水估算',
            type: 'line',
            data: data('household_consumption_proxy_m3'),
            showSymbol: false,
            lineStyle: { color: '#0f766e', width: 2 },
          },
          {
            name: '未计量水量估算',
            type: 'bar',
            data: data('unaccounted_volume_proxy_m3'),
            itemStyle: { color: '#d97706' },
          },
        ],
        graphic: !daily.length
          ? [
              {
                type: 'text',
                left: 'center',
                top: 'middle',
                style: { text: '完成分析后显示每日水量平衡', fill: '#64748b', fontSize: 12 },
              },
            ]
          : [],
      } as echarts.EChartsOption,
      { notMerge: true },
    );
  }
  private number(value: unknown): number | null {
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }
  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
