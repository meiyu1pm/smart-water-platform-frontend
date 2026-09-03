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
  FengtaiNetworkFrames,
  FengtaiNetworkLayer,
  FengtaiStage,
} from './fengtai-leakage.models';
import { FengtaiLeakageService } from './fengtai-leakage.service';
import { FengtaiProcessRailComponent } from './fengtai-process-rail.component';
import { FengtaiStageResultComponent } from './fengtai-stage-result.component';
import { LeakageNetwork3dComponent } from './leakage-network-3d.component';
import { FengtaiTimelineControlComponent } from './fengtai-timeline-control.component';
import { fengtaiLabel, fengtaiMetricValue } from './fengtai-labels';
import { SwIconComponent } from '../../../shared/components/sw-icon.component';

@Component({
  selector: 'app-fengtai-leakage-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatSelectModule,
    FengtaiProcessRailComponent,
    FengtaiStageResultComponent,
    LeakageNetwork3dComponent,
    FengtaiAssetDetailComponent,
    FengtaiTimelineControlComponent,
    SwIconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <section class="hero">
        <div>
          <span class="eyebrow">专项快速试用</span>
          <h1>管网漏损闭环研判</h1>
          <p>从数据解析到异常定位，在同一管网时空视图中追踪每一步分析证据。</p>
        </div>
        <div class="hero-context" aria-label="闭环分析能力">
          <span><app-sw-icon name="workflow" [size]="16" />8 步分析闭环</span>
          <span><app-sw-icon name="scene" [size]="16" />{{ sceneName() }}</span>
        </div>
      </section>

      <section class="toolbar" aria-label="分析策略与窗口选择">
        <div class="toolbar-heading">
          <strong>分析窗口</strong>
          <span>选择策略和日期范围后运行</span>
        </div>
        <div class="toolbar-fields">
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
            [attr.aria-busy]="analyzing()"
            (click)="runAnalysis()"
          >
            <app-sw-icon name="play" [size]="17" />{{ analyzing() ? '正在分析…' : '运行分析' }}
          </button>
        </div>
      </section>
      @if (analyzing()) {
        <section class="running" role="status" aria-live="polite">
          <div><strong>正在分析</strong><span>正在处理所选时间范围的数据。</span></div>
          <mat-progress-bar mode="indeterminate"></mat-progress-bar>
        </section>
      }
      @if (error()) {
        <div class="error" role="alert">
          <app-sw-icon name="info" [size]="18" /><span>{{ error() }}</span
          ><button mat-button type="button" (click)="loadInitial()">重试</button>
        </div>
      }

      @if (initialLoading()) {
        <section class="loading" role="status" aria-live="polite">
          <mat-spinner diameter="30"></mat-spinner>
          <div class="loading-copy">
            <strong>正在准备漏损闭环</strong>
            <span>加载试用范围与管网概览…</span>
          </div>
        </section>
      } @else {
        <section class="data-context" aria-labelledby="data-context-title">
          <header>
            <div>
              <span class="section-kicker">当前数据场景</span>
              <h2 id="data-context-title">{{ sceneName() }}</h2>
              <p>{{ sourceLabel() }}</p>
            </div>
            <button mat-stroked-button type="button" (click)="reloadScene()">
              <app-sw-icon name="recycle" [size]="16" />重新载入
            </button>
          </header>
          <div class="parse-summary" aria-label="数据解析摘要">
            @for (entry of importSummaryEntries(); track entry.label) {
              <article>
                <span>{{ entry.label }}</span>
                <strong>{{ entry.value }}</strong>
                <small>{{ entry.detail }}</small>
              </article>
            }
          </div>
        </section>

        <section id="leakage-network-workbench" class="network-workbench">
          <header class="network-heading">
            <div>
              <span class="section-kicker">全管网时空态势</span>
              <h2>管网运行总览</h2>
              <p>选择节点或管段查看详情；时间与图层会同步更新场景及资产检查器。</p>
            </div>
            @if (activeLayer(); as layer) {
              <span class="active-layer-badge"
                >{{ layer.name }} · {{ layerKindLabel(layer.value_kind) }}</span
              >
            } @else {
              <span class="active-layer-badge neutral">基础拓扑</span>
            }
          </header>
          <div class="topology-layout" [class.detail-open]="!!selectedAsset()">
            <section class="topology-panel" aria-label="管网三维场景">
              @if (topologyLoading()) {
                <div class="topology-status" role="status">
                  <mat-spinner diameter="24"></mat-spinner><span>正在解析管网拓扑…</span>
                </div>
              } @else if (topologyError()) {
                <div class="topology-status topology-warning">
                  <span>{{ topologyError() }}</span>
                  <button mat-button type="button" (click)="loadTopology()">重新加载</button>
                </div>
              } @else {
                <div class="scene-controls">
                  <mat-form-field appearance="outline">
                    <mat-label>分析图层</mat-label>
                    <mat-select
                      [ngModel]="selectedLayerCode()"
                      (ngModelChange)="selectLayer($event)"
                      [disabled]="!networkFrames()"
                    >
                      @if (!networkFrames()) {
                        <mat-option value="">基础拓扑（分析后开放图层）</mat-option>
                      }
                      @for (layer of networkFrames()?.layers ?? []; track layer.code) {
                        <mat-option [value]="layer.code" [disabled]="!isLayerAvailable(layer)">
                          {{ layer.name }}（{{ layer.unit }}）{{
                            isLayerAvailable(layer) ? '' : ' · 待分析'
                          }}
                        </mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  @if (activeLayer()) {
                    <p class="layer-legend">
                      <span class="legend-swatch"></span>
                      {{
                        activeLayer()!.asset_type === 'pipe'
                          ? '管段'
                          : activeLayer()!.asset_type === 'valve'
                            ? '阀门'
                            : '节点'
                      }}
                      · 数值由低至高
                    </p>
                  } @else {
                    <p class="layer-legend">
                      基础拓扑可直接浏览，运行分析后将逐步开放质量、压力与风险图层。
                    </p>
                  }
                </div>
                <app-leakage-network-3d
                  [topology]="topology() ?? undefined"
                  [activeLayer]="activeLayer()"
                  [activeFrameValues]="activeFrameValues()"
                  [selectedAsset]="selectedAsset()"
                  [lockedLayerCodes]="lockedLayerCodes()"
                  (assetSelected)="openAsset($event)"
                  (assetSelectionCleared)="closeAsset()"
                ></app-leakage-network-3d>
                <div class="timeline-region" [attr.aria-busy]="framesLoading()">
                  @if (framesLoading()) {
                    <div class="timeline-message" role="status">
                      <mat-spinner diameter="18"></mat-spinner><span>正在读取分析时间帧…</span>
                    </div>
                  } @else if (framesError()) {
                    <div class="timeline-message warning">
                      <span>{{ framesError() }}</span>
                      <button mat-button type="button" (click)="reloadFrames()">重试</button>
                    </div>
                  } @else {
                    <app-fengtai-timeline-control
                      [timestamps]="networkFrames()?.timestamps ?? []"
                      [activeTimestamp]="activeTimestamp()"
                      [intervalMinutes]="networkFrames()?.interval_minutes ?? null"
                      (activeTimestampChange)="selectTimestamp($event)"
                    ></app-fengtai-timeline-control>
                  }
                </div>
              }
            </section>
            @if (selectedAsset()) {
              <app-fengtai-asset-detail
                [selection]="selectedAsset()"
                [detail]="assetDetail()"
                [candidate]="selectedCandidate()"
                [loading]="assetLoading()"
                [error]="assetError()"
                [activeTimestamp]="activeTimestamp()"
                (closed)="closeAsset()"
                (retry)="reloadAsset()"
              ></app-fengtai-asset-detail>
            }
          </div>
        </section>

        <section class="flow">
          <div>
            <h2>闭环过程</h2>
            <p>选择步骤查看对应的分析结果</p>
          </div>
          <app-fengtai-process-rail
            [stages]="stages()"
            [selectedCode]="selectedStageCode()"
            [availableCodes]="availableStageCodes()"
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
            <div>
              <strong>选择分析窗口并运行</strong>
              <span>分析完成后将展示质量、异常、水量平衡与重点管段结果。</span>
            </div>
          </section>
        }

        <section class="stage-workspace">
          <header class="workspace-heading">
            <div>
              <span>当前步骤</span>
              <h2>{{ selectedStageTitle() }}</h2>
            </div>
            <span class="stage-position"
              >{{ selectedStagePosition() }} / {{ stages().length }}</span
            >
          </header>
          <app-fengtai-stage-result
            [selectedCode]="selectedStageCode()"
            [selectedTitle]="selectedStageTitle()"
            [available]="isStageAvailable(selectedStageCode())"
            [analysis]="analysis()"
            [manifest]="manifest()"
            (candidateSelected)="jumpToCandidate($event)"
          ></app-fengtai-stage-result>
        </section>
      }
    </main>
  `,
  styles: `
    :host {
      display: block;
    }
    .page {
      max-width: var(--sw-content-max);
      margin: 0 auto;
      padding: 24px;
      display: grid;
      gap: 18px;
      color: var(--sw-text-primary);
    }
    .hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding: 22px 24px;
      position: relative;
      overflow: hidden;
      border: 1px solid color-mix(in srgb, var(--sw-color-secondary) 35%, transparent);
      border-radius: var(--sw-radius-lg);
      background:
        radial-gradient(circle at 88% -20%, rgb(104 229 216 / 26%), transparent 280px),
        linear-gradient(118deg, #063747, #0b655f 72%, #0f7b72);
      color: white;
      box-shadow: var(--sw-shadow-md);
    }
    .eyebrow {
      color: #a7f3e7;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
    }
    h1 {
      margin: 6px 0;
      font-size: 25px;
      letter-spacing: 0.01em;
    }
    .hero h1 {
      color: white;
    }
    .hero p {
      margin: 0;
      max-width: 720px;
      color: #d8f5ef;
      font-size: 14px;
      line-height: 1.65;
    }
    .hero-context {
      min-width: 180px;
      display: grid;
      gap: 7px;
      padding-left: 20px;
      border-left: 1px solid rgb(216 245 239 / 35%);
    }
    .hero-context span {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: #d8f5ef;
      font-size: 12px;
      font-weight: 650;
    }
    .toolbar {
      display: grid;
      grid-template-columns: 155px minmax(0, 1fr);
      gap: 16px;
      align-items: center;
      padding: 14px 16px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-sm);
    }
    .toolbar-heading {
      display: grid;
      gap: 3px;
    }
    .toolbar-heading strong {
      font-size: 14px;
    }
    .toolbar-heading span {
      color: var(--sw-text-muted);
      font-size: 11px;
    }
    .toolbar-fields {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      min-width: 0;
    }
    mat-form-field {
      min-width: 185px;
      margin-bottom: -1.25em;
    }
    label {
      display: grid;
      gap: 4px;
      color: var(--sw-text-muted);
      font-size: 11px;
    }
    input {
      height: 34px;
      padding: 0 8px;
      border: 1px solid var(--sw-border-strong);
      border-radius: var(--sw-radius-xs);
      color: var(--sw-text-primary);
      background: var(--sw-surface);
      font: inherit;
    }
    button app-sw-icon {
      margin-right: 6px;
    }
    .running {
      display: grid;
      gap: 9px;
      padding: 12px 16px;
      border: 1px solid color-mix(in srgb, var(--sw-color-info) 28%, var(--sw-border));
      border-radius: var(--sw-radius-sm);
      background: var(--sw-color-info-soft);
    }
    .running div {
      display: grid;
      gap: 3px;
    }
    .running strong {
      color: var(--sw-color-primary-strong);
      font-size: 13px;
    }
    .running span {
      color: var(--sw-text-secondary);
      font-size: 12px;
    }
    .error {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 10px 12px;
      border: 1px solid color-mix(in srgb, var(--sw-color-warning) 32%, var(--sw-border));
      background: var(--sw-color-warning-soft);
      color: var(--sw-color-warning);
      border-radius: var(--sw-radius-sm);
      font-size: 13px;
    }
    .loading,
    .empty {
      min-height: 160px;
      display: flex;
      gap: 12px;
      justify-content: center;
      align-items: center;
      border: 1px dashed var(--sw-border-strong);
      border-radius: var(--sw-radius-md);
      color: var(--sw-text-muted);
      background: var(--sw-surface-muted);
      font-size: 13px;
    }
    .loading-copy {
      display: grid;
      gap: 3px;
    }
    .loading-copy strong {
      color: var(--sw-text-primary);
    }
    .loading-copy span {
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .empty {
      justify-content: flex-start;
      padding: 0 28px;
    }
    .empty div {
      display: grid;
      gap: 4px;
    }
    .empty strong {
      color: var(--sw-text-primary);
    }
    .empty span {
      font-size: 12px;
    }
    .data-context,
    .network-workbench {
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-sm);
    }
    .data-context {
      padding: 16px;
    }
    .data-context > header,
    .network-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .data-context h2,
    .network-heading h2 {
      margin: 3px 0 0;
      font-size: 17px;
    }
    .data-context p,
    .network-heading p {
      margin: 4px 0 0;
      color: var(--sw-text-muted);
      font-size: 12px;
      line-height: 1.55;
    }
    .section-kicker {
      color: var(--sw-color-secondary-strong);
      font-size: 11px;
      font-weight: 750;
      letter-spacing: 0.05em;
    }
    .parse-summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-top: 14px;
    }
    .parse-summary article {
      min-width: 0;
      padding: 10px 12px;
      display: grid;
      gap: 3px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-sm);
      background: var(--sw-surface-muted);
    }
    .parse-summary span,
    .parse-summary small {
      color: var(--sw-text-muted);
      font-size: 11px;
    }
    .parse-summary strong {
      color: var(--sw-text-primary);
      font-size: 14px;
      font-variant-numeric: tabular-nums;
    }
    .network-workbench {
      overflow: hidden;
    }
    .network-heading {
      padding: 15px 16px;
      border-bottom: 1px solid var(--sw-border);
    }
    .active-layer-badge {
      flex: 0 0 auto;
      padding: 5px 10px;
      border-radius: 999px;
      background: var(--sw-color-secondary-soft);
      color: var(--sw-color-secondary-strong);
      font-size: 11px;
      font-weight: 700;
    }
    .active-layer-badge.neutral {
      background: var(--sw-surface-muted);
      color: var(--sw-text-secondary);
    }
    .flow {
      display: grid;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-sm);
    }
    h2 {
      font-size: 15px;
      margin: 0;
    }
    .flow p {
      margin: 4px 0 0;
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
      gap: 10px;
    }
    .kpis article {
      min-height: 76px;
      padding: 13px 14px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-sm);
      display: grid;
      align-content: center;
      gap: 5px;
    }
    .kpis span {
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .kpis strong {
      color: var(--sw-color-secondary-strong);
      font-size: 18px;
      font-variant-numeric: tabular-nums;
    }
    .stage-workspace {
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      padding: 16px;
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-sm);
    }
    .workspace-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 12px;
      margin-bottom: 14px;
      border-bottom: 1px solid var(--sw-border);
    }
    .workspace-heading > div {
      display: grid;
      gap: 3px;
    }
    .workspace-heading > div > span {
      color: var(--sw-text-muted);
      font-size: 11px;
      font-weight: 650;
      letter-spacing: 0.05em;
    }
    .stage-position {
      padding: 4px 9px;
      border: 1px solid var(--sw-border);
      border-radius: 999px;
      color: var(--sw-text-muted);
      background: var(--sw-surface-muted);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
    .topology-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 14px;
      padding: 14px;
    }
    .topology-layout.detail-open {
      grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
      align-items: start;
    }
    .topology-panel {
      min-height: 520px;
      min-width: 0;
      padding: 12px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-canvas-bg);
    }
    .scene-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }
    .scene-controls mat-form-field {
      width: min(310px, 100%);
      margin: 0;
    }
    .topology-controls {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(180px, 0.42fr);
      gap: 10px;
      align-items: start;
      margin-bottom: 10px;
    }
    .topology-controls mat-form-field {
      margin: 0;
    }
    .layer-legend {
      margin: 0;
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .legend-swatch {
      display: inline-block;
      width: 18px;
      height: 8px;
      margin-right: 6px;
      border-radius: 999px;
      background: linear-gradient(
        90deg,
        var(--sw-color-secondary),
        var(--sw-color-accent),
        var(--sw-color-danger)
      );
      vertical-align: middle;
    }
    .topology-status {
      min-height: 480px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: var(--sw-text-muted);
      font-size: 13px;
    }
    .topology-warning {
      flex-direction: column;
      color: var(--sw-color-warning);
    }
    .timeline-region {
      min-height: 88px;
      margin-top: 10px;
    }
    .timeline-message {
      min-height: 82px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-sm);
      background: var(--sw-surface-muted);
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .timeline-message.warning {
      color: var(--sw-color-warning);
    }
    @media (max-width: 900px) {
      .hero,
      .toolbar-fields {
        align-items: stretch;
        flex-direction: column;
      }
      .hero-context {
        min-width: 0;
        padding: 12px 0 0;
        border-top: 1px solid rgb(216 245 239 / 35%);
        border-left: 0;
      }
      .toolbar {
        grid-template-columns: 1fr;
      }
      .topology-layout.detail-open {
        grid-template-columns: 1fr;
      }
      .topology-controls {
        grid-template-columns: 1fr;
      }
      .parse-summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .scene-controls,
      .network-heading {
        align-items: flex-start;
        flex-direction: column;
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
      .hero,
      .stage-workspace,
      .flow {
        padding: 14px;
      }
      .data-context > header {
        align-items: flex-start;
        flex-direction: column;
      }
      .parse-summary {
        grid-template-columns: 1fr 1fr;
      }
      .topology-layout {
        padding: 8px;
      }
      .topology-panel {
        min-height: 440px;
        padding: 8px;
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
  readonly networkFrames = signal<FengtaiNetworkFrames | null>(null);
  readonly activeTimestamp = signal<string | null>(null);
  readonly selectedLayerCode = signal<string | null>(null);
  readonly selectedStageCode = signal('data_intake');
  readonly selectedAsset = signal<AssetSelection | null>(null);
  readonly assetDetail = signal<FengtaiAssetDetail | null>(null);
  readonly assetLoading = signal(false);
  readonly assetError = signal('');
  readonly initialLoading = signal(true);
  readonly topologyLoading = signal(true);
  readonly topologyError = signal('');
  readonly framesLoading = signal(false);
  readonly framesError = signal('');
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
  readonly stages = computed<FengtaiStage[]>(() => {
    const analysis = this.analysis();
    return (
      analysis?.stages ?? [
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
      ]
    ).map((stage) => (analysis && !analysis.stages ? { ...stage, status: 'complete' } : stage));
  });
  readonly availableStageCodes = computed<ReadonlySet<string>>(() => {
    const available = new Set<string>();
    if (this.manifest() && this.topology() && !this.topologyLoading()) available.add('data_intake');
    this.stages().forEach((stage, index) => {
      if (this.stageComplete(stage)) available.add(this.stageCode(stage, index));
    });
    return available;
  });
  readonly importSummaryEntries = computed(() => {
    const manifest = this.manifest();
    const topology = this.topology();
    const imported = manifest?.import_summary ?? {};
    const importedTopology = this.recordValue(imported['topology']);
    const nodes =
      (typeof importedTopology['nodes'] === 'number' ? importedTopology['nodes'] : null) ??
      this.metricCount('nodes', 'node_count') ??
      topology?.nodes?.filter((node) => node.type !== 'valve' && node.type !== 'hydrant').length;
    const pipes =
      (typeof importedTopology['pipes'] === 'number' ? importedTopology['pipes'] : null) ??
      this.metricCount('pipes', 'pipe_count') ??
      (topology?.pipes ?? topology?.links)?.length;
    const records = this.metricCount(
      'full_resolution_points',
      'time_series_rows',
      'master_meter_rows',
      'records',
    );
    const mapping = {
      ...this.recordValue(imported['measurement_mapping']),
      ...(manifest?.mapping_summary ?? {}),
    };
    const coverageValue =
      mapping['coverage_percent'] ??
      mapping['mapping_coverage_percent'] ??
      manifest?.topology_summary?.['mapping_coverage_percent'];
    const coverage =
      typeof coverageValue === 'number'
        ? coverageValue
        : typeof mapping['mapped_nodes'] === 'number' &&
            typeof mapping['topology_nodes'] === 'number' &&
            mapping['topology_nodes'] > 0
          ? (mapping['mapped_nodes'] / mapping['topology_nodes']) * 100
          : null;
    return [
      {
        label: '拓扑结构',
        value: this.topologyLoading()
          ? '解析中'
          : `${nodes ?? importedTopology['nodes'] ?? '—'} 节点 · ${pipes ?? importedTopology['pipes'] ?? '—'} 管段`,
        detail: this.topologyLoading() ? '正在读取坐标与连接关系' : '坐标、连接与高程已建立',
      },
      {
        label: '时序数据',
        value:
          records || typeof mapping['records'] === 'number'
            ? `${Number(records ?? mapping['records']).toLocaleString('zh-CN')} 条`
            : '可用窗口',
        detail: manifest?.default_window ? '时间范围与采样间隔已识别' : '等待读取时间范围',
      },
      {
        label: '对象映射',
        value: coverage !== null ? `${coverage.toFixed(1)}%` : '已建立',
        detail: '测点、节点与管段对照关系',
      },
      {
        label: '数据状态',
        value: this.topologyError() ? '部分可用' : '可研判',
        detail: manifest?.source_label ?? manifest?.community ?? '平台示例数据',
      },
    ];
  });
  readonly selectedCandidate = computed<FengtaiCandidate | null>(() => {
    const selected = this.selectedAsset();
    if (!selected || selected.type !== 'pipe') return null;
    return (
      this.analysis()?.candidates?.find((candidate) => candidate.pipe_id === selected.id) ?? null
    );
  });
  readonly activeLayer = computed<FengtaiNetworkLayer | null>(() => {
    const frames = this.networkFrames();
    if (!frames) return null;
    const selected = this.selectedLayerCode() ?? frames.default_layer;
    const layers = frames.layers.filter((layer) => this.isLayerAvailable(layer));
    return layers.find((layer) => layer.code === selected) ?? layers[0] ?? null;
  });
  readonly lockedLayerCodes = computed(() =>
    (this.networkFrames()?.layers ?? [])
      .filter((layer) => !this.isLayerAvailable(layer))
      .map((layer) => layer.code),
  );
  readonly activeFrameValues = computed<Record<string, number | null>>(() => {
    const frames = this.networkFrames();
    const layer = this.activeLayer();
    const timestamp = this.activeTimestamp();
    if (!frames || !layer || !timestamp) return {};
    const index = frames.timestamps.indexOf(timestamp);
    if (index < 0) return {};
    const values = layer.values[index] ?? [];
    return Object.fromEntries(
      layer.asset_ids.map((assetId, assetIndex) => [assetId, values[assetIndex] ?? null]),
    );
  });
  readonly summaryEntries = computed(() =>
    Object.entries(this.analysis()?.summary ?? {})
      .slice(0, 6)
      .map(([key, value]) => ({ key, value })),
  );
  private assetRequestSequence = 0;
  private framesRequestSequence = 0;

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
  reloadScene(): void {
    this.closeAsset();
    this.analysis.set(null);
    this.selectedStageCode.set('data_intake');
    this.clearFrames();
    this.loadInitial();
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
    this.assetRequestSequence += 1;
    this.assetDetail.set(null);
    this.assetLoading.set(false);
    this.assetError.set('');
    this.analyzing.set(true);
    this.error.set('');
    this.clearFrames();
    this.service
      .analyze({ start_date: this.startDate, end_date: this.endDate, preset: this.preset })
      .subscribe({
        next: (analysis) => {
          this.analyzing.set(false);
          this.analysis.set(analysis);
          this.selectedStageCode.set('persistent_residual_ewma_cusum');
          this.loadFrames(analysis);
          this.reloadAsset();
        },
        error: () => {
          this.analyzing.set(false);
          this.error.set('本次分析未完成，请核对时间窗口后重试。');
        },
      });
  }
  selectStage(code: string): void {
    this.selectedStageCode.set(code);
    const stageLayer = (this.networkFrames()?.layers ?? []).find(
      (layer) => String(layer.available_after_stage ?? '') === code && this.isLayerAvailable(layer),
    );
    if (stageLayer) this.selectedLayerCode.set(stageLayer.code);
  }
  selectedStageTitle(): string {
    const selected = this.selectedStageCode();
    const stage = this.stages().find((item, index) => this.stageCode(item, index) === selected);
    return stage?.title || stage?.name || '分析结果';
  }
  selectedStagePosition(): number {
    const selected = this.selectedStageCode();
    const index = this.stages().findIndex(
      (item, itemIndex) => this.stageCode(item, itemIndex) === selected,
    );
    return index >= 0 ? index + 1 : 1;
  }
  selectTimestamp(timestamp: string): void {
    if (this.networkFrames()?.timestamps.includes(timestamp)) this.activeTimestamp.set(timestamp);
  }
  selectLayer(code: string): void {
    const layer = this.networkFrames()?.layers.find((item) => item.code === code);
    if (layer && this.isLayerAvailable(layer)) this.selectedLayerCode.set(code);
  }
  openAsset(selection: AssetSelection): void {
    this.selectedAsset.set(selection);
    this.assetDetail.set(null);
    this.assetError.set('');
    this.assetLoading.set(true);
    const analysisId = this.analysis()?.analysis_id;
    const requestSequence = ++this.assetRequestSequence;
    const detailRequest = analysisId
      ? this.service.getAssetDetail(
          analysisId,
          selection.id,
          this.startDate,
          this.endDate,
          this.preset,
        )
      : this.service.getReferenceAssetDetail(selection.id, this.startDate, this.endDate);
    detailRequest.subscribe({
        next: (detail) => {
          if (
            requestSequence !== this.assetRequestSequence ||
            this.selectedAsset()?.id !== selection.id ||
            this.selectedAsset()?.type !== selection.type
          )
            return;
          this.assetDetail.set(detail);
          this.assetLoading.set(false);
        },
        error: () => {
          if (
            requestSequence !== this.assetRequestSequence ||
            this.selectedAsset()?.id !== selection.id
          )
            return;
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
    this.assetRequestSequence += 1;
    this.selectedAsset.set(null);
    this.assetDetail.set(null);
    this.assetLoading.set(false);
    this.assetError.set('');
  }
  jumpToCandidate(candidate: FengtaiCandidate): void {
    const frames = this.networkFrames();
    if (candidate.peak_at && frames?.timestamps.includes(candidate.peak_at))
      this.activeTimestamp.set(candidate.peak_at);
    if (frames?.layers.some((layer) => layer.code === 'pipe_leak_risk'))
      this.selectedLayerCode.set('pipe_leak_risk');
    this.selectedStageCode.set('network_candidates');
    const id = candidate.pipe_id ?? candidate.id;
    if (!id) return;
    this.openAsset({ type: 'pipe', id, name: candidate.name ?? id });
    queueMicrotask(() =>
      document
        .getElementById('leakage-network-workbench')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
  }
  reloadFrames(): void {
    const analysis = this.analysis();
    if (analysis) this.loadFrames(analysis);
  }
  label(key: string): string {
    return fengtaiLabel(key);
  }
  display(key: string, value: unknown): string {
    return fengtaiMetricValue(key, value);
  }
  layerKindLabel(kind: FengtaiNetworkLayer['value_kind']): string {
    return (
      (
        {
          observed: '实测',
          cleaned: '清洗后实测',
          estimated: '估算',
          derived: '推导',
          synthetic: '合成',
        } as const
      )[kind] ?? kind
    );
  }
  sceneName(): string {
    return (
      this.manifest()?.scenario?.name ??
      this.manifest()?.scenario_name ??
      this.manifest()?.community ??
      '平台示例管网'
    );
  }
  sourceLabel(): string {
    const sources =
      this.manifest()
        ?.data_sources?.map((item) => item.name)
        .slice(0, 3) ?? [];
    return (
      this.manifest()?.source_label ??
      (sources.length
        ? `平台示例数据 · ${sources.join('、')}`
        : '平台示例数据 · 拓扑、时序与对象对照关系')
    );
  }
  isStageAvailable(code: string): boolean {
    return this.availableStageCodes().has(code);
  }
  isLayerAvailable(layer: FengtaiNetworkLayer): boolean {
    const requirement = layer.available_after_stage;
    if (requirement === undefined || requirement === null || requirement === '') return true;
    if (typeof requirement === 'number') {
      return this.stages()
        .slice(0, requirement)
        .every((stage) => this.stageComplete(stage));
    }
    return this.availableStageCodes().has(String(requirement));
  }
  private requireAuthenticated(): boolean {
    if (this.auth.isAuthenticated()) return true;
    this.error.set('请先登录后再运行分析。');
    this.requiresLogin.emit();
    return false;
  }
  private loadFrames(analysis: import('./fengtai-leakage.models').FengtaiAnalysis): void {
    const analysisId = analysis.analysis_id;
    if (!analysisId) {
      this.framesError.set('分析结果未返回时间帧标识，无法加载管网状态。');
      return;
    }
    const requestSequence = ++this.framesRequestSequence;
    this.framesLoading.set(true);
    this.framesError.set('');
    this.service.getNetworkFrames(analysisId, this.startDate, this.endDate, this.preset).subscribe({
      next: (frames) => {
        if (
          requestSequence !== this.framesRequestSequence ||
          this.analysis()?.analysis_id !== analysisId
        )
          return;
        this.networkFrames.set(frames);
        this.activeTimestamp.set(
          frames.timestamps.includes(frames.default_timestamp)
            ? frames.default_timestamp
            : (frames.timestamps[0] ?? null),
        );
        this.selectedLayerCode.set(
          frames.layers.some((layer) => layer.code === frames.default_layer)
            ? frames.default_layer
            : (frames.layers[0]?.code ?? null),
        );
        this.framesLoading.set(false);
      },
      error: () => {
        if (requestSequence !== this.framesRequestSequence) return;
        this.framesLoading.set(false);
        this.framesError.set('管网时间帧加载失败。');
      },
    });
  }
  private clearFrames(): void {
    this.framesRequestSequence += 1;
    this.networkFrames.set(null);
    this.activeTimestamp.set(null);
    this.selectedLayerCode.set(null);
    this.framesLoading.set(false);
    this.framesError.set('');
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
  private metricCount(...keys: string[]): number | null {
    const counts = this.manifest()?.counts ?? {};
    for (const key of keys) {
      const value = counts[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return null;
  }
  private recordValue(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
  private stageComplete(stage: FengtaiStage): boolean {
    return ['complete', 'completed', 'done', 'success'].includes(
      String(stage.status ?? '').toLowerCase(),
    );
  }
  private stageCode(stage: FengtaiStage, index: number): string {
    return String(stage.code ?? stage.id ?? stage.name ?? stage.title ?? `stage-${index}`);
  }
}
