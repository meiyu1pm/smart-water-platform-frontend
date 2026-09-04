import { DecimalPipe } from '@angular/common';
import { Component, Input } from '@angular/core';

import { WorkflowArtifact } from '../../core/models/api.models';
import {
  TimeSeriesChartComponent,
  TimeSeriesLine,
} from '../../shared/components/time-series-chart.component';
import { candidateMeanRisk, candidateRisk } from './s01-leakage-report';

@Component({
  selector: 'app-c1-anomaly-result',
  imports: [DecimalPipe, TimeSeriesChartComponent],
  template: `
    <section class="summary-grid">
      <div><span>检测点数</span><strong>{{ reportNumber('total_points') | number }}</strong></div>
      <div><span>异常点数</span><strong>{{ reportNumber('anomaly_points') | number }}</strong></div>
      <div><span>候选区间</span><strong>{{ candidates().length | number }}</strong></div>
      <div>
        <span>最高异常倍数</span
        ><strong>{{ reportNumber('maximum_score_ratio') | number: '1.2-2' }}×</strong>
      </div>
    </section>

    <app-time-series-chart
      title="C1 自适应异常分数"
      yAxisName="阈值倍数"
      [lines]="scoreLines()"
    />

    @if (evidenceLines().length) {
      <app-time-series-chart
        title="异常证据分解"
        yAxisName="证据强度"
        [lines]="evidenceLines()"
      />
    }

    <section class="candidate-panel">
      <header><h3>异常候选区间</h3><span>分数大于 1 表示超过模型阈值</span></header>
      @if (!candidates().length) {
        <p class="empty">当前结果没有形成连续异常区间。</p>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>开始</th><th>结束</th><th>最高倍数</th><th>平均倍数</th><th>点数</th></tr>
            </thead>
            <tbody>
              @for (row of candidates(); track $index) {
                <tr>
                  <td>{{ row['start_time'] }}</td>
                  <td>{{ row['end_time'] }}</td>
                  <td>{{ risk(row) | number: '1.2-2' }}×</td>
                  <td>{{ meanRisk(row) | number: '1.2-2' }}×</td>
                  <td>{{ number(row['point_count']) | number }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: `
    :host { display: grid; gap: 16px; min-width: 0; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .summary-grid div { padding: 13px; border: 1px solid #dbe7f5; border-radius: 10px; background: linear-gradient(145deg, #f8fbff, #fff); }
    .summary-grid span { display: block; color: #667085; font-size: 12px; }
    .summary-grid strong { display: block; margin-top: 5px; color: #173b67; font-size: 22px; }
    .candidate-panel { border-top: 1px solid #eaecf0; padding-top: 13px; }
    .candidate-panel header { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 9px; }
    h3 { margin: 0; font-size: 14px; }
    header span, .empty { color: #667085; font-size: 12px; }
    .table-wrap { overflow: auto; max-height: 300px; border: 1px solid #eaecf0; border-radius: 9px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #f2f4f7; text-align: left; white-space: nowrap; }
    th { position: sticky; top: 0; background: #f8fafc; color: #667085; }
    @media (max-width: 700px) { .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `,
})
export class C1AnomalyResultComponent {
  @Input() artifacts: WorkflowArtifact[] = [];

  risk = candidateRisk;
  meanRisk = candidateMeanRisk;

  private artifact(port: string): WorkflowArtifact | undefined {
    return this.artifacts.find((item) => item.port_key === port);
  }

  private content(item: WorkflowArtifact | undefined): Record<string, unknown> {
    return (item?.payload ?? item?.preview ?? {}) as Record<string, unknown>;
  }

  private nestedPayload(item: WorkflowArtifact | undefined): unknown {
    const content = this.content(item);
    return content['payload'] ?? content;
  }

  private rows(port: string): Array<Record<string, unknown>> {
    const content = this.content(this.artifact(port));
    const rows = content['rows'];
    return Array.isArray(rows)
      ? rows.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      : [];
  }

  candidates(): Array<Record<string, unknown>> {
    const value = this.nestedPayload(this.artifact('candidates'));
    return Array.isArray(value)
      ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      : [];
  }

  reportNumber(key: string): number {
    const value = this.nestedPayload(this.artifact('report'));
    return this.number(value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : 0);
  }

  number(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  scoreLines(): TimeSeriesLine[] {
    const scoreRows = this.rows('scores');
    const scores: Array<[string, number | null]> = scoreRows.flatMap((row) =>
      typeof row['time'] === 'string'
        ? [[row['time'], Number.isFinite(Number(row['value'])) ? Number(row['value']) : null]]
        : [],
    );
    const threshold: Array<[string, number | null]> = scores.map(([time]) => [time, 1]);
    return [
      { name: '异常分数', data: scores, color: '#7c3aed', area: true },
      { name: '模型阈值', data: threshold, color: '#dc2626', dashed: true },
    ];
  }

  evidenceLines(): TimeSeriesLine[] {
    const rows = this.rows('evidence');
    const line = (name: string, key: string, color: string): TimeSeriesLine => ({
      name,
      color,
      data: rows.flatMap((row) =>
        typeof row['time'] === 'string'
          ? [[row['time'], Number.isFinite(Number(row[key])) ? Number(row[key]) : null]]
          : [],
      ),
    });
    if (!rows.length) return [];
    return [
      line('重构与边界', 'reconstruction_boundary', '#2563eb'),
      line('一步预测', 'prediction', '#f59e0b'),
      line('分布漂移', 'distribution_shift', '#10b981'),
    ];
  }
}
