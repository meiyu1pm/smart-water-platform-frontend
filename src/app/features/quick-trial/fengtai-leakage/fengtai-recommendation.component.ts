import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-fengtai-recommendation',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card">
      <div>
        <span class="eyebrow">处置建议</span>
        <h3>{{ title }}</h3>
        <p>{{ detail }}</p>
      </div>
      <div class="warning">分析结果及压力模拟用于安排复核，候选不等同于已确认漏点。</div>
      @if (limitations?.length) {
        <p class="limits"><strong>使用边界：</strong>{{ limitations?.join('；') }}</p>
      }
    </section>
  `,
  styles: `
    .card {
      border-left: 4px solid #0f766e;
      padding: 16px 18px;
      border-radius: 8px;
      background: #f0fdfa;
      display: grid;
      gap: 11px;
    }
    .eyebrow {
      color: #0f766e;
      font-weight: 700;
      font-size: 12px;
    }
    h3 {
      margin: 3px 0 0;
      font-size: 16px;
      color: #134e4a;
    }
    p {
      margin: 5px 0 0;
      color: #365a57;
      font-size: 13px;
      line-height: 1.6;
    }
    .warning {
      padding: 8px 10px;
      border-radius: 6px;
      background: #fffbeb;
      color: #92400e;
      font-size: 12px;
      line-height: 1.5;
    }
    .limits {
      color: #64748b;
      font-size: 12px;
    }
    .limits strong {
      color: #475569;
    }
  `,
})
export class FengtaiRecommendationComponent {
  @Input() recommendation: Record<string, unknown> | string | undefined;
  @Input() limitations: string[] | undefined;
  get title(): string {
    return typeof this.recommendation === 'object' && this.recommendation
      ? String(this.recommendation['title'] ?? this.recommendation['action'] ?? '建议安排现场复核')
      : '建议安排现场复核';
  }
  get detail(): string {
    return typeof this.recommendation === 'string'
      ? this.recommendation
      : typeof this.recommendation === 'object' && this.recommendation
        ? String(
            this.recommendation['detail'] ??
              this.recommendation['message'] ??
              '结合候选排序、夜间流量和现场工况，制定复核顺序。',
          )
        : '结合候选排序、夜间流量和现场工况，制定复核顺序。';
  }
}
