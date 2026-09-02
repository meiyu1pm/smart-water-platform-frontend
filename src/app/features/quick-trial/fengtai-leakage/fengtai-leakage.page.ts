import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';

import { AuthService } from '../../../core/services/auth.service';
import { FengtaiAnalysisChartComponent } from './fengtai-analysis-chart.component';
import { FengtaiCandidatesComponent } from './fengtai-candidates.component';
import { FengtaiLeakageManifest, FengtaiStage } from './fengtai-leakage.models';
import { FengtaiLeakageService } from './fengtai-leakage.service';
import { FengtaiProcessRailComponent } from './fengtai-process-rail.component';
import { FengtaiQualityPanelComponent } from './fengtai-quality-panel.component';
import { FengtaiRecommendationComponent } from './fengtai-recommendation.component';
import { FengtaiTopologyComponent } from './fengtai-topology.component';
import { FengtaiWaterBalanceComponent } from './fengtai-water-balance.component';
import { fengtaiLabel, fengtaiMetricValue } from './fengtai-labels';

@Component({
  selector: 'app-fengtai-leakage-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatSelectModule,
    FengtaiProcessRailComponent,
    FengtaiQualityPanelComponent,
    FengtaiAnalysisChartComponent,
    FengtaiWaterBalanceComponent,
    FengtaiTopologyComponent,
    FengtaiCandidatesComponent,
    FengtaiRecommendationComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <section class="hero">
        <div>
          <span class="eyebrow">专项快速试用</span>
          <h1>{{ manifest()?.community || '丰泰风光苑' }}漏损闭环</h1>
          <p>围绕数据治理、趋势基线与现场复核，形成可讨论的候选管段和巡检建议。</p>
        </div>
        <div class="scope">面向管网运行与检漏人员<br />候选结果需结合现场复核</div>
      </section>

      <section class="toolbar" aria-label="分析策略与窗口选择">
        <mat-form-field appearance="outline"
          ><mat-label>分析策略</mat-label
          ><mat-select [(ngModel)]="preset">
            @for (item of presets(); track item.id) {
              <mat-option [value]="item.id">{{ item.label }}</mat-option>
            }
          </mat-select></mat-form-field
        >
        <label>开始日期<input type="date" [(ngModel)]="startDate" /></label>
        <label>结束日期<input type="date" [(ngModel)]="endDate" /></label>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="analyzing()"
          (click)="runAnalysis()"
        >
          <mat-icon>play_arrow</mat-icon>{{ analyzing() ? '正在分析…' : '运行分析' }}
        </button>
      </section>
      @if (analyzing()) {
        <section class="running">
          <div>
            <strong>正在完成数据治理与趋势研判</strong
            ><span>将依次生成质量检查、水量平衡和候选管段结果。</span>
          </div>
          <mat-progress-bar mode="indeterminate"></mat-progress-bar>
        </section>
      }
      @if (error()) {
        <div class="error">
          <mat-icon>info</mat-icon><span>{{ error() }}</span
          ><button mat-button type="button" (click)="loadInitial()">重试</button>
        </div>
      }

      @if (initialLoading()) {
        <section class="loading">
          <mat-spinner diameter="30"></mat-spinner><span>正在加载试用范围与管网概览…</span>
        </section>
      } @else {
        <section class="flow">
          <div>
            <h2>闭环过程</h2>
            <p>从数据接入到建议，每一步均保留可说明的结果。</p>
          </div>
          <app-fengtai-process-rail [stages]="stages()"></app-fengtai-process-rail>
        </section>
        @if (analysis()) {
          <section class="kpis" aria-label="分析摘要">
            @for (entry of summaryEntries(); track entry.key) {
              <article>
                <span>{{ label(entry.key) }}</span
                ><strong>{{ display(entry.key, entry.value) }}</strong>
              </article>
            }
          </section>
          <section class="method-note">
            <strong>本次结果由后台实时计算</strong>
            <span
              >已执行数据治理、日内稳健基线、持续异常识别、最小夜间流量、水量平衡和管网候选排序，不是预置图片或固定分数。</span
            >
          </section>
        } @else {
          <section class="empty">
            <mat-icon>timeline</mat-icon>
            <div>
              <strong>选择一个时间窗口并运行分析</strong
              ><span>结果将展示数据质量、流量趋势、候选管段及处置建议。</span>
            </div>
          </section>
        }

        <section class="content" [class.has-analysis]="!!analysis()">
          <div class="main-column">
            <app-fengtai-analysis-chart
              [series]="analysis()?.series"
              [anomalies]="analysis()?.anomalies"
            ></app-fengtai-analysis-chart>
            <section class="topology-panel">
              @if (topologyLoading()) {
                <div class="topology-status">
                  <mat-spinner diameter="24"></mat-spinner><span>正在加载管网概览…</span>
                </div>
              } @else if (topologyError()) {
                <div class="topology-status topology-warning">
                  <span>{{ topologyError() }}</span>
                  <button mat-button type="button" (click)="loadTopology()">重新加载</button>
                </div>
              } @else {
                <app-fengtai-topology
                  [topology]="topology() ?? undefined"
                  [candidates]="analysis()?.candidates ?? []"
                ></app-fengtai-topology>
              }
            </section>
          </div>
          <aside>
            <app-fengtai-quality-panel [quality]="analysis()?.quality"></app-fengtai-quality-panel>
            <app-fengtai-water-balance
              [balance]="analysis()?.water_balance"
            ></app-fengtai-water-balance>
            <app-fengtai-candidates
              [candidates]="analysis()?.candidates ?? []"
            ></app-fengtai-candidates>
          </aside>
        </section>
        @if (analysis()) {
          <app-fengtai-recommendation
            [recommendation]="analysis()?.recommendation"
            [limitations]="analysis()?.limitations"
          ></app-fengtai-recommendation>
        }
      }
    </main>
  `,
  styles: `
    :host {
      display: block;
    }
    .page {
      max-width: 1440px;
      margin: 0 auto;
      padding: 24px;
      display: grid;
      gap: 18px;
      color: #1e293b;
    }
    .hero {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      padding: 22px 24px;
      border-radius: 12px;
      background: linear-gradient(115deg, #073b4c, #0f766e);
      color: white;
    }
    .eyebrow {
      color: #99f6e4;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
    }
    h1 {
      margin: 6px 0;
      font-size: 25px;
      letter-spacing: 0.01em;
    }
    .hero p {
      margin: 0;
      max-width: 720px;
      color: #d5f5ee;
      font-size: 14px;
      line-height: 1.65;
    }
    .scope {
      align-self: center;
      border-left: 1px solid rgba(255, 255, 255, 0.32);
      padding-left: 20px;
      color: #d5f5ee;
      font-size: 12px;
      line-height: 1.7;
      white-space: nowrap;
    }
    .toolbar {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 14px 16px;
      border: 1px solid #dbe4ea;
      border-radius: 10px;
      background: #fff;
    }
    mat-form-field {
      min-width: 185px;
      margin-bottom: -1.25em;
    }
    label {
      display: grid;
      gap: 4px;
      color: #64748b;
      font-size: 11px;
    }
    input {
      height: 34px;
      padding: 0 8px;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      color: #334155;
      font: inherit;
    }
    button mat-icon {
      margin-right: 4px;
    }
    .running {
      display: grid;
      gap: 9px;
      padding: 12px 16px;
      border: 1px solid #bae6fd;
      border-radius: 9px;
      background: #f0f9ff;
    }
    .running div {
      display: grid;
      gap: 3px;
    }
    .running strong {
      color: #075985;
      font-size: 13px;
    }
    .running span {
      color: #64748b;
      font-size: 12px;
    }
    .error {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 10px 12px;
      border: 1px solid #fed7aa;
      background: #fff7ed;
      color: #9a3412;
      border-radius: 8px;
      font-size: 13px;
    }
    .loading,
    .empty {
      min-height: 160px;
      display: flex;
      gap: 12px;
      justify-content: center;
      align-items: center;
      border: 1px dashed #cbd5e1;
      border-radius: 10px;
      color: #64748b;
      font-size: 13px;
    }
    .empty {
      justify-content: flex-start;
      padding: 0 28px;
    }
    .empty mat-icon {
      color: #0f766e;
      transform: scale(1.25);
    }
    .empty div {
      display: grid;
      gap: 4px;
    }
    .empty strong {
      color: #334155;
    }
    .empty span {
      font-size: 12px;
    }
    .flow {
      display: grid;
      gap: 12px;
      padding: 16px;
      border: 1px solid #dbe4ea;
      border-radius: 10px;
      background: #fff;
    }
    h2 {
      font-size: 15px;
      margin: 0;
    }
    .flow p {
      margin: 4px 0 0;
      color: #64748b;
      font-size: 12px;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
      gap: 10px;
    }
    .kpis article {
      padding: 13px;
      border: 1px solid #dbe4ea;
      border-radius: 8px;
      background: #fff;
      display: grid;
      gap: 5px;
    }
    .kpis span {
      color: #64748b;
      font-size: 12px;
    }
    .kpis strong {
      color: #0f766e;
      font-size: 18px;
      font-variant-numeric: tabular-nums;
    }
    .method-note {
      padding: 12px 16px;
      border-left: 4px solid #0f766e;
      border-radius: 7px;
      background: #ecfdf5;
      display: grid;
      gap: 4px;
    }
    .method-note strong {
      color: #065f46;
      font-size: 13px;
    }
    .method-note span {
      color: #475569;
      font-size: 12px;
      line-height: 1.6;
    }
    .content {
      display: grid;
      grid-template-columns: minmax(0, 2.1fr) minmax(280px, 0.9fr);
      gap: 16px;
    }
    .main-column,
    aside {
      display: grid;
      align-content: start;
      gap: 16px;
    }
    .main-column > * {
      border: 1px solid #dbe4ea;
      border-radius: 10px;
      padding: 12px;
      background: #fff;
    }
    .topology-panel {
      min-height: 326px;
    }
    .topology-status {
      min-height: 300px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: #64748b;
      font-size: 13px;
    }
    .topology-warning {
      flex-direction: column;
      color: #9a3412;
    }
    aside > * {
      min-width: 0;
    }
    app-fengtai-recommendation {
      display: block;
    }
    @media (max-width: 900px) {
      .hero,
      .toolbar {
        align-items: stretch;
        flex-direction: column;
      }
      .scope {
        border-left: 0;
        border-top: 1px solid rgba(255, 255, 255, 0.32);
        padding: 10px 0 0;
        white-space: normal;
      }
      .content {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 600px) {
      .page {
        padding: 14px;
      }
      .toolbar {
        gap: 10px;
      }
      h1 {
        font-size: 21px;
      }
      mat-form-field {
        width: 100%;
      }
    }
  `,
})
export class FengtaiLeakagePage implements OnInit {
  private readonly service = inject(FengtaiLeakageService);
  private readonly auth = inject(AuthService);
  @Output() readonly requiresLogin = new EventEmitter<void>();

  readonly manifest = signal<FengtaiLeakageManifest | null>(null);
  readonly topology = signal<import('./fengtai-leakage.models').FengtaiTopology | null>(null);
  readonly analysis = signal<import('./fengtai-leakage.models').FengtaiAnalysis | null>(null);
  readonly initialLoading = signal(true);
  readonly topologyLoading = signal(true);
  readonly topologyError = signal('');
  readonly analyzing = signal(false);
  readonly error = signal('');
  preset = 'custom';
  startDate = this.monthStart();
  endDate = this.today();
  readonly presets = computed(() => {
    const manifest = this.manifest();
    const selected: Array<{ id: string; label: string; start_date?: string; end_date?: string }> =
      [];
    const add = (id: string, item: Record<string, unknown>, label: string) =>
      selected.push({
        id,
        label: typeof item['label'] === 'string' ? item['label'] : label,
        start_date: this.dateValue(item['start_date'] ?? item['start']),
        end_date: this.dateValue(item['end_date'] ?? item['end']),
      });
    const presets = manifest?.presets;
    if (Array.isArray(presets))
      presets.forEach((item) =>
        add(item.id, item as unknown as Record<string, unknown>, item.label),
      );
    else if (presets && typeof presets === 'object')
      Object.entries(presets).forEach(([id, item]) => {
        if (item && typeof item === 'object')
          add(
            id,
            item as Record<string, unknown>,
            id === 'balanced' ? '平衡研判' : id === 'sensitive' ? '敏感筛查' : '可用窗口',
          );
      });
    return selected.length
      ? selected
      : [
          { id: 'balanced', label: '平衡研判' },
          { id: 'sensitive', label: '敏感筛查' },
        ];
  });
  readonly stages = computed<FengtaiStage[]>(
    () =>
      this.analysis()?.stages ?? [
        { title: '数据接入', purpose: '核对试用窗口内的监测数据。', status: 'pending' },
        { title: '质量检查', purpose: '识别缺失、异常和不连续记录。', status: 'pending' },
        { title: '趋势基线', purpose: '形成夜间流量和压力变化参考。', status: 'pending' },
        { title: '候选管段', purpose: '依据综合证据排序重点复核位置。', status: 'pending' },
        { title: '建议', purpose: '输出可供现场讨论的下一步建议。', status: 'pending' },
      ],
  );
  readonly summaryEntries = computed(() =>
    Object.entries(this.analysis()?.summary ?? {})
      .slice(0, 6)
      .map(([key, value]) => ({ key, value })),
  );

  ngOnInit(): void {
    this.loadInitial();
  }
  loadInitial(): void {
    this.initialLoading.set(true);
    this.error.set('');
    this.loadTopology();
    this.service.getManifest().subscribe({
      next: (manifest) => {
        this.manifest.set(manifest);
        this.applyManifestWindow(manifest);
        this.initialLoading.set(false);
      },
      error: () => {
        this.initialLoading.set(false);
        this.error.set('暂时无法加载试用范围，请稍后重试。');
      },
    });
  }
  loadTopology(): void {
    this.topologyLoading.set(true);
    this.topologyError.set('');
    this.service.getTopology().subscribe({
      next: (topology) => {
        this.topology.set(topology);
        this.topologyLoading.set(false);
      },
      error: () => {
        this.topologyLoading.set(false);
        this.topologyError.set('管网概览暂时未能加载，其他分析功能仍可使用。');
      },
    });
  }
  runAnalysis(): void {
    if (!this.requireAuthenticated()) return;
    this.analyzing.set(true);
    this.error.set('');
    this.service
      .analyze({ start_date: this.startDate, end_date: this.endDate, preset: this.preset })
      .subscribe({
        next: (analysis) => {
          this.analysis.set(analysis);
          this.analyzing.set(false);
        },
        error: () => {
          this.analyzing.set(false);
          this.error.set('本次分析未完成，请核对时间窗口后重试。');
        },
      });
  }
  label(key: string): string {
    return fengtaiLabel(key);
  }
  display(key: string, value: unknown): string {
    return fengtaiMetricValue(key, value);
  }
  private requireAuthenticated(): boolean {
    if (this.auth.isAuthenticated()) return true;
    this.error.set('请先登录后再运行分析。');
    this.requiresLogin.emit();
    return false;
  }
  private applyManifestWindow(manifest: FengtaiLeakageManifest): void {
    const options = this.presets();
    const requestedPreset = manifest.default_preset ?? 'balanced';
    this.preset = options.some((item) => item.id === requestedPreset)
      ? requestedPreset
      : (options[0]?.id ?? 'balanced');
    const window = manifest.default_window;
    if (window) {
      this.startDate = this.dateValue(window.start_date ?? window.start) ?? this.startDate;
      this.endDate = this.dateValue(window.end_date ?? window.end) ?? this.endDate;
    }
  }
  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
  private monthStart(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  }
  private dateValue(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }
}
