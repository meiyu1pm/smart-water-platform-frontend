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
          [class.locked]="!isAvailable(stage, index)"
          [attr.aria-selected]="isSelected(stage, index)"
          [attr.aria-current]="isSelected(stage, index) ? 'step' : null"
          [attr.aria-controls]="'fengtai-stage-' + code(stage, index)"
          (click)="select(stage, index)"
          (keydown.enter)="selectFromKeyboard(stage, index, $event)"
          (keydown.space)="selectFromKeyboard(stage, index, $event)"
        >
          <span class="ordinal">{{ index + 1 }}</span>
          <span class="title">{{ stage.title || stage.name || '分析环节' }}</span>
          <span class="state">{{ stateLabel(stage, index) }}</span>
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
      position: relative;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-sm);
      background: var(--sw-surface);
      color: var(--sw-text-secondary);
      cursor: pointer;
      font: inherit;
      transition:
        border-color 120ms ease,
        background 120ms ease,
        box-shadow 120ms ease;
    }
    .stage:hover {
      border-color: color-mix(in srgb, var(--sw-color-secondary) 55%, var(--sw-border));
      background: var(--sw-color-secondary-soft);
    }
    .stage:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--sw-focus) 28%, transparent);
      outline-offset: 2px;
    }
    .stage.selected {
      border-color: var(--sw-color-secondary);
      background: var(--sw-color-secondary-soft);
      box-shadow:
        inset 3px 0 0 var(--sw-color-secondary),
        0 3px 10px rgb(15 118 110 / 8%);
    }
    .stage.locked:not(.selected) {
      background: var(--sw-surface-muted);
    }
    .stage.locked:not(.selected) .ordinal,
    .stage.locked:not(.selected) .title {
      opacity: 0.72;
    }
    .ordinal {
      grid-row: span 2;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 1px solid var(--sw-border);
      background: var(--sw-surface-sunken);
      color: var(--sw-text-secondary);
      font-size: 12px;
      font-weight: 700;
    }
    .complete .ordinal {
      border-color: var(--sw-color-secondary);
      background: var(--sw-color-secondary);
      color: #fff;
    }
    .title {
      min-width: 0;
      color: var(--sw-text-primary);
      font-size: 12px;
      font-weight: 700;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .state {
      color: var(--sw-text-muted);
      font-size: 11px;
      line-height: 1.25;
    }
    .complete .state {
      color: var(--sw-color-secondary-strong);
    }
    .selected .title,
    .selected .state {
      color: var(--sw-color-secondary-strong);
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
  @Input() availableCodes: ReadonlySet<string> = new Set<string>();
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

  isAvailable(stage: FengtaiStage, index: number): boolean {
    return this.availableCodes.has(this.code(stage, index));
  }

  stateLabel(stage: FengtaiStage, index: number): string {
    const prefix = this.isSelected(stage, index) ? '当前查看 · ' : '';
    if (this.isComplete(stage)) return `${prefix}已完成`;
    return `${prefix}${this.isAvailable(stage, index) ? '可查看' : '待分析'}`;
  }

  select(stage: FengtaiStage, index: number): void {
    this.selectedCodeChange.emit(this.code(stage, index));
  }

  selectFromKeyboard(stage: FengtaiStage, index: number, event: Event): void {
    event.preventDefault();
    this.select(stage, index);
  }
}
