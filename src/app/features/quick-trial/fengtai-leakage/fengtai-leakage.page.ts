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
import { FengtaiAssetDetailComponent } from './fengtai-asset-detail.component';
import {
  AssetSelection,
  FengtaiAssetDetail,
  FengtaiCandidate,
  FengtaiLeakageManifest,
  FengtaiStage,
} from './fengtai-leakage.models';
import { FengtaiLeakageService } from './fengtai-leakage.service';
import { FengtaiProcessRailComponent } from './fengtai-process-rail.component';
import { FengtaiStageResultComponent } from './fengtai-stage-result.component';
import { FengtaiTopologyComponent } from './fengtai-topology.component';
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
    FengtaiStageResultComponent,
    FengtaiTopologyComponent,
    FengtaiAssetDetailComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <section class="hero">
        <div>
          <span class="eyebrow">专项快速试用</span>
          <h1>{{ manifest()?.community || '丰泰风光苑' }}漏损闭环</h1>
          <p>数据质量、日内变化、水量平衡与重点管段分析。</p>
        </div>
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
          <div><strong>正在分析</strong><span>正在处理所选时间范围的数据。</span></div>
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
          <mat-spinner diameter="30"></mat-spinner><span>正在加载分析数据…</span>
        </section>
      } @else {
        <section class="flow">
          <div>
            <h2>闭环过程</h2>
          </div>
          <app-fengtai-process-rail
            [stages]="stages()"
            [selectedCode]="selectedStageCode()"
            (selectedCodeChange)="selectStage($event)"
          ></app-fengtai-process-rail>
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
        } @else {
          <section class="empty">
            <mat-icon>timeline</mat-icon>
            <div>
              <strong>选择分析窗口并运行</strong>
            </div>
          </section>
        }

        <section class="stage-workspace">
          <app-fengtai-stage-result
            [selectedCode]="selectedStageCode()"
            [analysis]="analysis()"
            [manifest]="manifest()"
          >
            <div
              fengtai-topology-slot
              class="topology-layout"
              [class.detail-open]="!!selectedAsset()"
            >
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
                    (assetSelected)="openAsset($event)"
                  ></app-fengtai-topology>
                }
              </section>
              @if (selectedAsset()) {
                <app-fengtai-asset-detail
                  [selection]="selectedAsset()"
                  [detail]="assetDetail()"
                  [candidate]="selectedCandidate()"
                  [loading]="assetLoading()"
                  [error]="assetError()"
                  (closed)="closeAsset()"
                  (retry)="reloadAsset()"
                ></app-fengtai-asset-detail>
              }
            </div>
          </app-fengtai-stage-result>
        </section>
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
    .stage-workspace {
      border: 1px solid #dbe4ea;
      border-radius: 10px;
      padding: 16px;
      background: #fff;
    }
    .topology-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 14px;
    }
    .topology-layout.detail-open {
      grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
      align-items: start;
    }
    .topology-panel {
      min-height: 326px;
      min-width: 0;
      padding: 12px;
      border: 1px solid #dbe4ea;
      border-radius: 10px;
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
    @media (max-width: 900px) {
      .hero,
      .toolbar {
        align-items: stretch;
        flex-direction: column;
      }
      .topology-layout.detail-open {
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
  readonly selectedStageCode = signal('data_intake');
  readonly selectedAsset = signal<AssetSelection | null>(null);
  readonly assetDetail = signal<FengtaiAssetDetail | null>(null);
  readonly assetLoading = signal(false);
  readonly assetError = signal('');
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
        { code: 'data_intake', title: '数据接入', status: 'pending' },
        { code: 'quality_score', title: '质量检查', status: 'pending' },
        { code: 'data_governance', title: '数据治理', status: 'pending' },
        { code: 'seasonal_96_slot_forecast', title: '日内基线', status: 'pending' },
        {
          code: 'persistent_residual_ewma_cusum',
          title: '持续异常识别',
          status: 'pending',
        },
        {
          code: 'night_flow_water_balance',
          title: '夜间流量与水量平衡',
          status: 'pending',
        },
        { code: 'network_candidates', title: '候选管段', status: 'pending' },
        { code: 'response_advice', title: '处置建议', status: 'pending' },
      ],
  );
  readonly selectedCandidate = computed<FengtaiCandidate | null>(() => {
    const selected = this.selectedAsset();
    if (!selected || selected.type !== 'pipe') return null;
    return (
      this.analysis()?.candidates?.find((candidate) => candidate.pipe_id === selected.id) ?? null
    );
  });
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
        this.topologyError.set('管网概览加载失败。');
      },
    });
  }
  runAnalysis(): void {
    if (!this.requireAuthenticated()) return;
    this.closeAsset();
    this.analyzing.set(true);
    this.error.set('');
    this.service
      .analyze({ start_date: this.startDate, end_date: this.endDate, preset: this.preset })
      .subscribe({
        next: (analysis) => {
          this.analysis.set(analysis);
          this.selectedStageCode.set('persistent_residual_ewma_cusum');
          this.analyzing.set(false);
        },
        error: () => {
          this.analyzing.set(false);
          this.error.set('本次分析未完成，请核对时间窗口后重试。');
        },
      });
  }
  selectStage(code: string): void {
    this.selectedStageCode.set(code);
  }
  openAsset(selection: AssetSelection): void {
    this.selectedAsset.set(selection);
    this.assetDetail.set(null);
    this.assetError.set('');
    this.assetLoading.set(true);
    this.service.getAssetDetail(selection.id, this.startDate, this.endDate).subscribe({
      next: (detail) => {
        if (this.selectedAsset()?.id !== selection.id) return;
        this.assetDetail.set(detail);
        this.assetLoading.set(false);
      },
      error: () => {
        if (this.selectedAsset()?.id !== selection.id) return;
        this.assetLoading.set(false);
        this.assetError.set('资产详情加载失败。');
      },
    });
  }
  reloadAsset(): void {
    const selection = this.selectedAsset();
    if (selection) this.openAsset(selection);
  }
  closeAsset(): void {
    this.selectedAsset.set(null);
    this.assetDetail.set(null);
    this.assetLoading.set(false);
    this.assetError.set('');
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
