import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';

@Component({
  selector: 'app-fengtai-timeline-control',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="timeline" aria-label="管网状态时间轴">
      <div class="heading">
        <div>
          <strong>状态时间轴</strong>
          <span>{{ currentLabel() }}</span>
        </div>
        <button type="button" (click)="togglePlayback()" [disabled]="timestamps.length < 2">
          {{ playing ? '暂停' : '播放' }}
        </button>
      </div>
      <div class="controls">
        <button type="button" aria-label="上一时刻" (click)="step(-1)" [disabled]="index === 0">
          ‹
        </button>
        <input
          type="range"
          aria-label="选择状态时刻"
          [min]="0"
          [max]="maxIndex()"
          [value]="index"
          [disabled]="!timestamps.length"
          (input)="selectIndex($any($event.target).value)"
        />
        <button
          type="button"
          aria-label="下一时刻"
          (click)="step(1)"
          [disabled]="index >= maxIndex()"
        >
          ›
        </button>
      </div>
    </section>
  `,
  styles: `
    .timeline {
      display: grid;
      gap: 8px;
      padding: 12px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-sm);
      background: var(--sw-surface-muted);
    }
    .heading,
    .heading > div,
    .controls {
      display: flex;
      align-items: center;
    }
    .heading {
      justify-content: space-between;
      gap: 12px;
    }
    .heading > div {
      gap: 9px;
      min-width: 0;
    }
    strong {
      color: var(--sw-text-primary);
      font-size: 13px;
    }
    span {
      color: var(--sw-text-muted);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    button {
      border: 1px solid var(--sw-border-strong);
      border-radius: var(--sw-radius-xs);
      background: var(--sw-surface);
      color: var(--sw-text-secondary);
      min-width: 30px;
      height: 30px;
      cursor: pointer;
    }
    .heading button {
      padding: 0 10px;
      font-size: 12px;
    }
    button:disabled {
      cursor: default;
      opacity: 0.5;
    }
    .controls {
      gap: 8px;
    }
    input {
      flex: 1;
      accent-color: var(--sw-color-secondary);
    }
    button:focus-visible,
    input:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--sw-focus) 28%, transparent);
      outline-offset: 2px;
    }
    @media (max-width: 520px) {
      .heading {
        align-items: flex-start;
      }
      .heading > div {
        align-items: flex-start;
        flex-direction: column;
        gap: 2px;
      }
    }
  `,
})
export class FengtaiTimelineControlComponent implements OnChanges, OnDestroy {
  @Input() timestamps: string[] = [];
  @Input() activeTimestamp: string | null = null;
  @Output() readonly activeTimestampChange = new EventEmitter<string>();

  index = 0;
  playing = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnChanges(_changes: SimpleChanges): void {
    const selected = this.activeTimestamp ? this.timestamps.indexOf(this.activeTimestamp) : -1;
    this.index = selected >= 0 ? selected : Math.min(this.index, this.maxIndex());
    if (this.timestamps.length < 2) this.pause();
  }

  ngOnDestroy(): void {
    this.pause();
  }

  maxIndex(): number {
    return Math.max(0, this.timestamps.length - 1);
  }

  currentLabel(): string {
    const value = this.timestamps[this.index];
    if (!value) return '等待分析时间帧';
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (day) return `${day[1]}年${Number(day[2])}月${Number(day[3])}日`;
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('zh-CN', { hour12: false });
  }

  selectIndex(value: string | number): void {
    const next = Math.max(0, Math.min(this.maxIndex(), Number(value)));
    this.index = Number.isFinite(next) ? next : 0;
    const timestamp = this.timestamps[this.index];
    if (timestamp) this.activeTimestampChange.emit(timestamp);
  }

  step(offset: number): void {
    this.selectIndex(this.index + offset);
  }

  togglePlayback(): void {
    if (this.playing) {
      this.pause();
      return;
    }
    if (this.timestamps.length < 2) return;
    this.playing = true;
    this.timer = setInterval(() => {
      if (this.index >= this.maxIndex()) {
        this.pause();
        return;
      }
      this.step(1);
    }, 700);
  }

  private pause(): void {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
