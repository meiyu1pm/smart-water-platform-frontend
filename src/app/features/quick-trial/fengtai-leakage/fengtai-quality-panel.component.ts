import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { fengtaiLabel, fengtaiMetricValue } from './fengtai-labels';

@Component({
  selector: 'app-fengtai-quality-panel',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <div class="heading">
        <div>
          <h3>数据质量修复</h3>
          <p>先识别缺失、异常和不连续，再用于后续研判。</p>
        </div>
      </div>
      @if (comparison.length) {
        <div class="compare-head"><span>指标</span><span>修复前</span><span>修复后</span></div>
        <div class="comparison">
          @for (entry of comparison; track entry.key) {
            <div>
              <span>{{ label(entry.key) }}</span
              ><strong>{{ display(entry.key, entry.before) }}</strong
              ><strong class="after">{{ display(entry.key, entry.after) }}</strong>
            </div>
          }
        </div>
      } @else if (entries.length) {
        <div class="metrics">
          @for (entry of entries; track entry.key) {
            <div class="metric">
              <span>{{ label(entry.key) }}</span
              ><strong>{{ display(entry.key, entry.value) }}</strong>
            </div>
          }
        </div>
      } @else {
        <p class="empty">暂无质量分析结果。</p>
      }
    </section>
  `,
  styles: `
    .panel {
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      padding: 16px;
      background: var(--sw-surface);
    }
    h3 {
      margin: 0;
      color: var(--sw-text-primary);
      font-size: 15px;
    }
    p {
      margin: 4px 0 0;
      color: var(--sw-text-muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
      gap: 10px;
      margin-top: 14px;
    }
    .compare-head,
    .comparison div {
      display: grid;
      grid-template-columns: 1.3fr 0.8fr 0.8fr;
      gap: 8px;
      align-items: center;
    }
    .compare-head {
      margin-top: 14px;
      padding: 0 8px 5px;
      color: var(--sw-text-muted);
      font-size: 11px;
    }
    .comparison {
      display: grid;
      gap: 4px;
    }
    .comparison div {
      padding: 8px;
      border: 1px solid var(--sw-border);
      background: var(--sw-surface-muted);
      border-radius: var(--sw-radius-xs);
      color: var(--sw-text-secondary);
      font-size: 12px;
    }
    .comparison strong {
      color: var(--sw-text-secondary);
      font-size: 13px;
    }
    .comparison .after {
      color: var(--sw-color-secondary-strong);
    }
    .metric {
      padding: 10px;
      border: 1px solid var(--sw-border);
      background: var(--sw-surface-muted);
      border-radius: var(--sw-radius-xs);
      display: grid;
      gap: 4px;
    }
    .metric span {
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .metric strong {
      color: var(--sw-color-secondary-strong);
      font-variant-numeric: tabular-nums;
      font-size: 16px;
    }
    .empty {
      padding: 12px 0 2px;
    }
  `,
})
export class FengtaiQualityPanelComponent {
  @Input() quality: Record<string, unknown> | undefined;

  get entries(): Array<{ key: string; value: unknown }> {
    return Object.entries(this.quality ?? {})
      .filter(([, value]) => typeof value !== 'object')
      .slice(0, 6)
      .map(([key, value]) => ({ key, value }));
  }

  get comparison(): Array<{ key: string; before: unknown; after: unknown }> {
    const quality = this.quality ?? {};
    const before = this.record(quality['before'] ?? quality['raw']);
    const after = this.record(quality['after'] ?? quality['repaired'] ?? quality['cleaned']);
    if (!Object.keys(before).length || !Object.keys(after).length) return [];
    return [
      { key: 'record_count', before: before['rows'], after: after['points'] },
      {
        key: 'flow_completeness_percent',
        before: before['flow_completeness_percent'],
        after: after['flow_completeness_percent'],
      },
      {
        key: 'pressure_completeness_percent',
        before: before['pressure_completeness_percent'],
        after: after['pressure_completeness_percent'],
      },
      {
        key: 'timestamp_regularity_percent',
        before: before['timestamp_regularity_percent'],
        after: after['timestamp_regularity_percent'],
      },
      { key: 'score', before: before['score'], after: after['score'] },
    ];
  }

  label(key: string): string {
    return fengtaiLabel(key);
  }

  display(key: string, value: unknown): string {
    return fengtaiMetricValue(key, value);
  }
  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
