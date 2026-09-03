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
              '按候选排序安排仪表复核、夜间听漏和现场巡检。',
          )
        : '按候选排序安排仪表复核、夜间听漏和现场巡检。';
  }
}
