import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FengtaiAnalysisChartComponent } from './fengtai-analysis-chart.component';
import { FengtaiCandidatesComponent } from './fengtai-candidates.component';
import { FengtaiAnalysis, FengtaiLeakageManifest } from './fengtai-leakage.models';
import { FengtaiQualityPanelComponent } from './fengtai-quality-panel.component';
import { FengtaiRecommendationComponent } from './fengtai-recommendation.component';
import { FengtaiWaterBalanceComponent } from './fengtai-water-balance.component';

@Component({
  selector: 'app-fengtai-stage-result',
  standalone: true,
  imports: [
    CommonModule,
    FengtaiAnalysisChartComponent,
    FengtaiCandidatesComponent,
    FengtaiQualityPanelComponent,
    FengtaiRecommendationComponent,
    FengtaiWaterBalanceComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="result" [attr.id]="'fengtai-stage-' + selectedCode" role="tabpanel">
      @switch (kind()) {
        @case ('data') {
          <div class="overview">
            @for (entry of overview(); track entry.label) {
              <article>
                <span>{{ entry.label }}</span
                ><strong>{{ entry.value }}</strong>
              </article>
            }
          </div>
          <app-fengtai-analysis-chart
            mode="source"
            [series]="analysis?.series"
          ></app-fengtai-analysis-chart>
        }
        @case ('quality') {
          <app-fengtai-quality-panel [quality]="analysis?.quality"></app-fengtai-quality-panel>
        }
        @case ('governance') {
          <app-fengtai-analysis-chart
            mode="governance"
            [series]="analysis?.series"
          ></app-fengtai-analysis-chart>
        }
        @case ('baseline') {
          <app-fengtai-analysis-chart
            mode="baseline"
            [series]="analysis?.series"
          ></app-fengtai-analysis-chart>
        }
        @case ('anomaly') {
          <app-fengtai-analysis-chart
            mode="anomaly"
            [series]="analysis?.series"
            [anomalies]="analysis?.anomalies"
          ></app-fengtai-analysis-chart>
        }
        @case ('balance') {
          <app-fengtai-water-balance
            [balance]="analysis?.water_balance"
          ></app-fengtai-water-balance>
        }
        @case ('candidate') {
          <app-fengtai-candidates
            [candidates]="analysis?.candidates ?? []"
          ></app-fengtai-candidates>
        }
        @case ('recommendation') {
          <app-fengtai-recommendation
            [recommendation]="analysis?.recommendation"
            [limitations]="analysis?.limitations"
          ></app-fengtai-recommendation>
        }
        @default {
          <app-fengtai-analysis-chart
            mode="all"
            [series]="analysis?.series"
            [anomalies]="analysis?.anomalies"
          ></app-fengtai-analysis-chart>
        }
      }
    </section>
  `,
  styles: `
    .result {
      min-width: 0;
      display: grid;
      gap: 14px;
    }
    .overview {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .overview article {
      padding: 12px;
      border: 1px solid #dbe4ea;
      border-radius: 8px;
      background: #f8fafc;
      display: grid;
      gap: 4px;
    }
    .overview span {
      color: #64748b;
      font-size: 11px;
    }
    .overview strong {
      color: #0f766e;
      font-size: 16px;
    }
    @media (max-width: 700px) {
      .overview {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
})
export class FengtaiStageResultComponent {
  @Input() selectedCode = '';
  @Input() analysis: FengtaiAnalysis | null = null;
  @Input() manifest: FengtaiLeakageManifest | null = null;

  kind():
    | 'data'
    | 'quality'
    | 'governance'
    | 'baseline'
    | 'anomaly'
    | 'balance'
    | 'candidate'
    | 'recommendation'
    | 'series' {
    const code = this.selectedCode.toLocaleLowerCase();
    if (code.includes('intake') || code.includes('数据接入')) return 'data';
    if (code.includes('quality') || code.includes('质量')) return 'quality';
    if (code.includes('governance') || code.includes('治理')) return 'governance';
    if (code.includes('seasonal') || code.includes('baseline') || code.includes('基线'))
      return 'baseline';
    if (code.includes('persistent') || code.includes('anomaly') || code.includes('异常'))
      return 'anomaly';
    if (code.includes('balance') || code.includes('水量')) return 'balance';
    if (code.includes('candidate') || code.includes('候选')) return 'candidate';
    if (code.includes('recommend') || code.includes('建议')) return 'recommendation';
    return 'series';
  }

  overview(): Array<{ label: string; value: string }> {
    const counts = this.manifest?.counts ?? {};
    const window = this.analysis?.window;
    const records = window?.full_resolution_points ?? counts['master_meter_rows'] ?? '—';
    return [
      { label: '分析记录', value: `${records} 点` },
      {
        label: '分析时段',
        value: window ? `${window.start_date} 至 ${window.end_date}` : '选择窗口后运行',
      },
      { label: '管网节点', value: `${counts['nodes'] ?? '—'} 个` },
      { label: '管段', value: `${counts['pipes'] ?? '—'} 条` },
      { label: '阀门', value: `${counts['valves'] ?? '—'} 个` },
      { label: '入口测点', value: '1 个' },
    ];
  }
}
