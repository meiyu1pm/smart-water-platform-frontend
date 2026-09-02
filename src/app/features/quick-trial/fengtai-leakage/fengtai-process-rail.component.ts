import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FengtaiStage } from './fengtai-leakage.models';

@Component({
  selector: 'app-fengtai-process-rail',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="rail" aria-label="漏损分析步骤" role="tablist">
      @for (stage of stages; track code(stage, $index); let index = $index) {
        <button
          type="button"
          class="stage"
          role="tab"
          [class.selected]="isSelected(stage, index)"
          [class.complete]="isComplete(stage)"
          [attr.aria-selected]="isSelected(stage, index)"
          [attr.aria-current]="isSelected(stage, index) ? 'step' : null"
          [attr.aria-controls]="'fengtai-stage-' + code(stage, index)"
          (click)="select(stage, index)"
          (keydown.enter)="selectFromKeyboard(stage, index, $event)"
          (keydown.space)="selectFromKeyboard(stage, index, $event)"
        >
          <span class="ordinal">{{ index + 1 }}</span>
          <span class="title">{{ stage.title || stage.name || '分析环节' }}</span>
          <span class="state">{{ isComplete(stage) ? '已完成' : '待完成' }}</span>
        </button>
      }
    </nav>
  `,
  styles: `
    .rail {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      width: 100%;
    }
    .stage {
      min-width: 0;
      min-height: 70px;
      padding: 9px 8px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-rows: auto auto;
      column-gap: 7px;
      row-gap: 3px;
      text-align: left;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #fff;
      color: #475569;
      cursor: pointer;
      font: inherit;
    }
    .stage:hover {
      border-color: #0f766e;
      background: #f0fdfa;
    }
    .stage:focus-visible {
      outline: 3px solid rgba(13, 148, 136, 0.28);
      outline-offset: 2px;
    }
    .stage.selected {
      border-color: #0f766e;
      background: #ecfdf5;
      box-shadow: inset 0 0 0 1px #0f766e;
    }
    .ordinal {
      grid-row: span 2;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #e2e8f0;
      color: #475569;
      font-size: 12px;
      font-weight: 700;
    }
    .complete .ordinal {
      background: #0f766e;
      color: #fff;
    }
    .title {
      min-width: 0;
      color: #1e293b;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .state {
      color: #64748b;
      font-size: 11px;
      line-height: 1.25;
    }
    .complete .state {
      color: #0f766e;
    }
    @media (max-width: 760px) {
      .rail {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 420px) {
      .rail {
        gap: 5px;
      }
      .stage {
        min-height: 68px;
        padding: 8px 5px;
        column-gap: 5px;
      }
      .ordinal {
        width: 21px;
        height: 21px;
        font-size: 11px;
      }
      .title {
        font-size: 11px;
      }
      .state {
        font-size: 10px;
      }
    }
  `,
})
export class FengtaiProcessRailComponent {
  @Input() stages: FengtaiStage[] = [];
  @Input() selectedCode = '';
  @Output() readonly selectedCodeChange = new EventEmitter<string>();

  code(stage: FengtaiStage, index: number): string {
    return String(stage.code ?? stage.id ?? stage.name ?? stage.title ?? `stage-${index}`);
  }

  isSelected(stage: FengtaiStage, index: number): boolean {
    return this.selectedCode ? this.selectedCode === this.code(stage, index) : index === 0;
  }

  isComplete(stage: FengtaiStage): boolean {
    return ['complete', 'completed', 'done', 'success'].includes(
      String(stage.status ?? '').toLowerCase(),
    );
  }

  select(stage: FengtaiStage, index: number): void {
    this.selectedCodeChange.emit(this.code(stage, index));
  }

  selectFromKeyboard(stage: FengtaiStage, index: number, event: Event): void {
    event.preventDefault();
    this.select(stage, index);
  }
}
