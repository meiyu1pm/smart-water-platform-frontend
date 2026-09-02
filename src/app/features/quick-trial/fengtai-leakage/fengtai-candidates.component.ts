import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FengtaiCandidate } from './fengtai-leakage.models';

@Component({
  selector: 'app-fengtai-candidates',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <div class="heading">
        <div>
          <h3>重点复核候选</h3>
          <p>按综合证据排序，需由现场复核确认。</p>
        </div>
        <span class="notice">候选，非已确认漏点</span>
      </div>
      @if (candidates.length) {
        <ol>
          @for (candidate of candidates; track candidate.id ?? candidate.pipe_id ?? $index) {
            <li>
              <div>
                <strong>{{ candidate.name || candidate.pipe_id || '管段候选' }}</strong
                ><span>{{ reason(candidate) }}</span>
              </div>
              <b>{{ score(candidate) }}</b>
            </li>
          }
        </ol>
      } @else {
        <p class="empty">本次窗口尚未形成需要优先复核的候选。</p>
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
    .heading {
      display: flex;
      gap: 12px;
      justify-content: space-between;
      align-items: start;
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
    .notice {
      color: #9a3412;
      background: #fff7ed;
      border-radius: 12px;
      padding: 3px 8px;
      font-size: 11px;
      white-space: nowrap;
    }
    ol {
      margin: 13px 0 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 9px;
    }
    li {
      display: flex;
      gap: 12px;
      justify-content: space-between;
      border-top: 1px solid #edf2f7;
      padding-top: 9px;
    }
    li div {
      display: grid;
      gap: 3px;
    }
    li strong {
      color: #1e293b;
      font-size: 13px;
    }
    li span {
      color: #64748b;
      font-size: 12px;
      line-height: 1.45;
    }
    b {
      color: #b45309;
      font-size: 13px;
    }
    .empty {
      padding: 11px 0 2px;
    }
  `,
})
export class FengtaiCandidatesComponent {
  @Input() candidates: FengtaiCandidate[] = [];
  score(candidate: FengtaiCandidate): string {
    return typeof candidate.score === 'number'
      ? `${candidate.score.toFixed(1)} 分`
      : candidate.risk || '复核';
  }
  reason(candidate: FengtaiCandidate): string {
    if (candidate.reason) return candidate.reason;
    const evidence =
      candidate.evidence && !Array.isArray(candidate.evidence) ? candidate.evidence : {};
    const values = { ...evidence, ...candidate } as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof values['rank_type'] === 'string') parts.push(`按${values['rank_type']}排序`);
    if (typeof values['material'] === 'string') parts.push(`材质：${values['material']}`);
    if (values['diameter'] !== undefined || values['diameter_mm'] !== undefined)
      parts.push(`管径：${values['diameter'] ?? values['diameter_mm']} mm`);
    if (values['topology'] !== undefined || values['topology_weight'] !== undefined)
      parts.push('已纳入管网连通关系核验');
    return parts.join('；') || '综合夜间流量、压力和管网关系，建议结合现场巡检复核。';
  }
}
