import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
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
      @if (!available) {
        <div class="locked" role="status">
          <span class="lock-mark" aria-hidden="true"></span>
          <div>
            <strong>{{ selectedTitle || '当前阶段' }}尚未生成分析结果</strong>
            <p>运行闭环分析后，这里将显示该阶段生成的图层、指标与可追溯证据。</p>
          </div>
        </div>
      } @else {
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
            @if (analysis) {
              <app-fengtai-analysis-chart
                mode="source"
                [series]="analysis.series"
              ></app-fengtai-analysis-chart>
            } @else {
              <p class="intake-note">
                基础拓扑与数据范围已解析。运行分析后将补充所选窗口的原始时序。
              </p>
            }
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
              (candidateSelected)="candidateSelected.emit($event)"
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
      }
    </section>
  `,
  styles: `
    .result {
      min-width: 0;
      display: grid;
      gap: 14px;
    }
    .locked {
      min-height: 150px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 24px;
      border: 1px dashed var(--sw-border-strong);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-muted);
      color: var(--sw-text-muted);
      text-align: left;
    }
    .lock-mark {
      width: 12px;
      height: 12px;
      flex: 0 0 auto;
      border: 2px solid var(--sw-text-muted);
      border-radius: 50%;
    }
    .locked strong {
      color: var(--sw-text-primary);
      font-size: 14px;
    }
    .locked p {
      margin: 5px 0 0;
      max-width: 560px;
      font-size: 12px;
      line-height: 1.65;
    }
    .overview {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .overview article {
      min-height: 66px;
      padding: 11px 12px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-sm);
      background: var(--sw-surface-muted);
      display: grid;
      align-content: center;
      gap: 4px;
    }
    .overview span {
      color: var(--sw-text-muted);
      font-size: 11px;
    }
    .overview strong {
      color: var(--sw-color-secondary-strong);
      font-size: 15px;
      font-variant-numeric: tabular-nums;
    }
    .intake-note {
      margin: 0;
      padding: 11px 12px;
      border-left: 3px solid var(--sw-color-secondary);
      border-radius: var(--sw-radius-xs);
      background: var(--sw-color-secondary-soft);
      color: var(--sw-text-secondary);
      font-size: 12px;
      line-height: 1.6;
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
  @Input() selectedTitle = '';
  @Input() available = false;
  @Input() analysis: FengtaiAnalysis | null = null;
  @Input() manifest: FengtaiLeakageManifest | null = null;
  @Output() readonly candidateSelected = new EventEmitter<
    import('./fengtai-leakage.models').FengtaiCandidate
  >();

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
