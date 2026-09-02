import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { fengtaiLabel, fengtaiValue } from './fengtai-labels';

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
              ><strong>{{ display(entry.before) }}</strong
              ><strong class="after">{{ display(entry.after) }}</strong>
            </div>
          }
        </div>
      } @else if (entries.length) {
        <div class="metrics">
          @for (entry of entries; track entry.key) {
            <div class="metric">
              <span>{{ label(entry.key) }}</span
              ><strong>{{ display(entry.value) }}</strong>
            </div>
          }
        </div>
      } @else {
        <p class="empty">完成分析后显示修复前后的质量情况。</p>
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
      color: #0f172a;
      font-size: 15px;
    }
    p {
      margin: 4px 0 0;
      color: #64748b;
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
      color: #64748b;
      font-size: 11px;
    }
    .comparison {
      display: grid;
      gap: 4px;
    }
    .comparison div {
      padding: 8px;
      background: #f8fafc;
      border-radius: 6px;
      color: #475569;
      font-size: 12px;
    }
    .comparison strong {
      color: #475569;
      font-size: 13px;
    }
    .comparison .after {
      color: #0f766e;
    }
    .metric {
      padding: 10px;
      background: #f8fafc;
      border-radius: 7px;
      display: grid;
      gap: 4px;
    }
    .metric span {
      color: #64748b;
      font-size: 12px;
    }
    .metric strong {
      color: #0f766e;
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
    return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
      .slice(0, 6)
      .map((key) => ({ key, before: before[key], after: after[key] }));
  }

  label(key: string): string {
    return fengtaiLabel(key);
  }

  display(value: unknown): string {
    return fengtaiValue(value);
  }
  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
