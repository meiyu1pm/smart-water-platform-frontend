import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
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
          <h3>重点复核管段</h3>
          <p>按异常、水量和管网特征综合排序。</p>
        </div>
      </div>
      @if (candidates.length) {
        <ol>
          @for (candidate of candidates; track candidate.id ?? candidate.pipe_id ?? $index) {
            <li>
              <button type="button" (click)="candidateSelected.emit(candidate)">
                <div>
                  <strong>{{ candidate.name || candidate.pipe_id || '管段候选' }}</strong
                  ><span>{{ reason(candidate) }}</span>
                </div>
                <b>{{ score(candidate) }}</b>
              </button>
            </li>
          }
        </ol>
      } @else {
        <p class="empty">暂无重点复核管段。</p>
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
    ol {
      margin: 13px 0 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 9px;
    }
    li {
      border-top: 1px solid #edf2f7;
      padding-top: 9px;
    }
    li button {
      width: 100%;
      display: flex;
      gap: 12px;
      justify-content: space-between;
      text-align: left;
      border: 0;
      padding: 0;
      background: transparent;
      cursor: pointer;
      font: inherit;
    }
    li button:hover strong,
    li button:focus-visible strong {
      color: #0f766e;
    }
    li button:focus-visible {
      outline: 2px solid #0f766e;
      outline-offset: 3px;
      border-radius: 4px;
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
  @Output() readonly candidateSelected = new EventEmitter<FengtaiCandidate>();
  score(candidate: FengtaiCandidate): string {
    return typeof candidate.score === 'number'
      ? `${candidate.score.toFixed(2)} 分`
      : candidate.risk || '复核';
  }
  reason(candidate: FengtaiCandidate): string {
    if (candidate.reason) return candidate.reason;
    const evidence =
      candidate.evidence && !Array.isArray(candidate.evidence) ? candidate.evidence : {};
    const values = { ...evidence, ...candidate } as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof values['material'] === 'string') parts.push(`材质：${values['material']}`);
    if (values['diameter'] !== undefined || values['diameter_mm'] !== undefined)
      parts.push(`管径：${values['diameter'] ?? values['diameter_mm']} mm`);
    if (values['topology'] !== undefined || values['topology_weight'] !== undefined)
      parts.push('管网连通关系');
    return parts.join('；') || '夜间流量、压力和管网关系综合评分';
  }
}
