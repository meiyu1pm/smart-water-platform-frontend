import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';

import { FengtaiSimulation, FengtaiTopologyNode } from './fengtai-leakage.models';
import { fengtaiLabel, fengtaiValue } from './fengtai-labels';

@Component({
  selector: 'app-fengtai-simulation',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSliderModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <div>
        <h3>压力调节模拟</h3>
        <p>比较阀门调节条件下的趋势变化，作为运行讨论参考。</p>
      </div>
      <div class="controls">
        <mat-form-field appearance="outline"
          ><mat-label>调节阀门</mat-label
          ><mat-select [(ngModel)]="valveId"
            ><mat-option value="">请选择</mat-option>
            @for (valve of valves; track valve.id) {
              <mat-option [value]="valve.id">{{ valve.name || valve.id }}</mat-option>
            }
          </mat-select></mat-form-field
        >
        <div class="slider">
          <span>压力下调 {{ reduction }}%</span
          ><mat-slider min="1" max="20" step="1"
            ><input matSliderThumb [(ngModel)]="reduction"
          /></mat-slider>
        </div>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="!valveId || running"
          (click)="simulate.emit({ valveId: valveId, reduction: reduction })"
        >
          {{ running ? '正在模拟…' : '开始模拟' }}
        </button>
      </div>
      @if (result) {
        <div class="result">
          @for (entry of entries; track entry.key) {
            <span
              >{{ label(entry.key) }}<strong>{{ display(entry.value) }}</strong></span
            >
          }
        </div>
      }
      <p class="disclaimer">模拟结果不代表现场已执行调节，需结合供水服务与现场工况复核。</p>
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
    .controls {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) auto;
      gap: 14px;
      align-items: center;
      margin-top: 14px;
    }
    mat-form-field {
      width: 100%;
    }
    .slider {
      display: grid;
      gap: 4px;
      color: #475569;
      font-size: 12px;
    }
    mat-slider {
      width: 100%;
    }
    button {
      min-width: 100px;
    }
    .result {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 11px;
    }
    .result span {
      padding: 6px 8px;
      background: #f1f5f9;
      border-radius: 5px;
      color: #64748b;
      font-size: 12px;
    }
    .result strong {
      color: #0f172a;
      margin-left: 4px;
    }
    .disclaimer {
      margin-top: 11px;
      color: #9a3412;
    }
    @media (max-width: 720px) {
      .controls {
        grid-template-columns: 1fr;
      }
      button {
        justify-self: start;
      }
    }
  `,
})
export class FengtaiSimulationComponent {
  @Input() valves: FengtaiTopologyNode[] = [];
  @Input() running = false;
  @Input() result: FengtaiSimulation | null = null;
  @Output() simulate = new EventEmitter<{ valveId: string; reduction: number }>();
  valveId = '';
  reduction = 10;
  get entries(): Array<{ key: string; value: unknown }> {
    const result = this.result as Record<string, unknown> | null;
    if (!result) return [];
    return [
      'baseline_leakage_proxy_m3d',
      'adjusted_leakage_proxy_m3d',
      'affected_pipe_ids',
      'service_pressure_warning',
    ]
      .filter((key) => result[key] !== undefined)
      .slice(0, 3)
      .map((key) => ({ key, value: result[key] }));
  }
  label(key: string): string {
    return fengtaiLabel(key);
  }
  display(value: unknown): string {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const range = value as Record<string, unknown>;
      if (range['low'] !== undefined || range['high'] !== undefined)
        return `${fengtaiValue(range['low'])}–${fengtaiValue(range['high'])} m³/日`;
    }
    return fengtaiValue(value);
  }
}
