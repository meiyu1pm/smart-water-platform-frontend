import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FengtaiStage } from './fengtai-leakage.models';

@Component({
  selector: 'app-fengtai-process-rail',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rail" aria-label="漏损分析过程">
      @for (
        stage of stages;
        track stage.id ?? stage.name ?? $index;
        let last = $last;
        let index = $index
      ) {
        <div class="stage">
          <div class="marker" [class.done]="stage.status !== 'pending'">{{ index + 1 }}</div>
          <div class="copy">
            <strong>{{ stage.title || stage.name || '分析环节' }}</strong>
            <span>{{ stage.purpose || '核验本阶段输入。' }}</span>
            @if (stage.result) {
              <em>{{ stage.result }}</em>
            }
          </div>
        </div>
        @if (!last) {
          <div class="connector"></div>
        }
      }
    </section>
  `,
  styles: `
    .rail {
      display: flex;
      gap: 10px;
      align-items: stretch;
      overflow-x: auto;
      padding: 4px 0;
    }
    .stage {
      display: flex;
      gap: 9px;
      min-width: 190px;
      flex: 1;
    }
    .marker {
      flex: 0 0 25px;
      height: 25px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: #e2e8f0;
      color: #475569;
      font-size: 12px;
      font-weight: 700;
    }
    .marker.done {
      background: #0f766e;
      color: white;
    }
    .copy {
      display: grid;
      gap: 2px;
      color: #64748b;
      font-size: 12px;
      line-height: 1.45;
    }
    strong {
      color: #1e293b;
      font-size: 13px;
    }
    em {
      color: #0f766e;
      font-style: normal;
    }
    .connector {
      width: 1px;
      align-self: stretch;
      background: #cbd5e1;
    }
  `,
})
export class FengtaiProcessRailComponent {
  @Input() stages: FengtaiStage[] = [];
}
