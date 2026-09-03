import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as echarts from 'echarts';

import {
  AnomalyResult,
  DmaNightFlowResult,
  ForecastResult,
  QuickTrialResult,
  QuickTrialService,
  TimeSeriesPoint,
  inferIntervalMinutes,
  maxHorizonForAlgorithm,
  parseCsvTextToRows,
} from './quick-trial.service';
import { DataFileService } from '../../core/services/data-file.service';
import {
  DataFilePreview,
  DataFileSummary,
  DataFileViewSelection,
} from '../../core/models/api.models';
import {
  DataFileBindingEcho,
  DataFilePreviewPanelComponent,
} from '../data-sources/data-file-preview-panel.component';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import { LoginDialogService } from '../login/login-dialog.component';
import { SwIconComponent } from '../../shared/components/sw-icon.component';

@Component({
  selector: 'app-quick-trial-page',
  standalone: true,
  imports: [CommonModule, FormsModule, DataFilePreviewPanelComponent, SwIconComponent],
  template: `
    <div class="trial-container">
      <!-- 居中头部：Logo 与品牌标头 -->
      <header class="brand-hero">
        <div class="brand-badge">
          <div class="logo-icon">
            <svg viewBox="0 0 36 36" width="32" height="32" fill="none">
              <rect width="36" height="36" rx="8" fill="var(--sw-color-primary)" />
              <path
                d="M18 7L27 12V24L18 29L9 24V12L18 7Z"
                stroke="white"
                stroke-width="2"
                stroke-linejoin="round"
              />
              <circle cx="18" cy="18" r="4" fill="white" />
              <path
                d="M18 14V11M22 20L25 22M14 20L11 22"
                stroke="white"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </div>
          <div class="brand-text">
            <span class="section-kicker">算法快速试用</span>
            <h1>智慧水务<span>算法平台</span></h1>
            <span class="sub-title">SMART WATER ALGORITHM PLATFORM</span>
          </div>
        </div>
        <p class="hero-desc">选择任务、算法与数据，在一个界面完成配置、运行和结果查看。</p>
      </header>

      <!-- 快速运行输入条 (Quick Run Bar) -->
      <section class="quick-run-bar">
        <div class="input-group task-group">
          <label for="taskSelect">任务</label>
          <div class="select-wrapper">
            <select
              id="taskSelect"
              [ngModel]="selectedTaskId()"
              (ngModelChange)="onTaskChange($event)"
            >
              @for (sc of scenarios; track sc.id) {
                <option [value]="sc.id">{{ sc.name }}</option>
              }
            </select>
            <span class="select-arrow"><app-sw-icon name="chevron-down" [size]="15" /></span>
          </div>
        </div>

        <div class="input-group algo-group">
          <label for="algoSelect">算法</label>
          <div class="select-wrapper">
            <select
              id="algoSelect"
              [ngModel]="selectedAlgorithm()"
              (ngModelChange)="onAlgorithmChange($event)"
            >
              @for (algorithm of currentAlgorithms(); track algorithm.id) {
                <option [value]="algorithm.id">{{ algorithm.name }}</option>
              }
            </select>
            <span class="select-arrow"><app-sw-icon name="chevron-down" [size]="15" /></span>
          </div>
        </div>

        <div class="input-group data-group">
          <label>数据输入与分析窗口</label>
          <button
            type="button"
            class="data-input-box"
            (click)="toggleDataDrawer()"
            [class.active]="drawerOpen()"
            [attr.aria-expanded]="drawerOpen()"
            aria-controls="quick-trial-data-drawer"
            title="点击选择输出列、预览时序波形或调整分析窗口"
          >
            <span class="data-icon"
              ><app-sw-icon [name]="customUploadedFile() ? 'folder' : 'database'" [size]="18"
            /></span>
            <span class="data-summary-text">{{ dataInputDisplay() }}</span>
            <span class="edit-badge">{{ drawerOpen() ? '收起配置' : '调整输入与分析窗口' }}</span>
          </button>
        </div>

        <button type="button" class="run-btn" [disabled]="running()" (click)="runQuickTrial()">
          @if (running()) {
            <span class="spinner"></span>
            <span>计算中...</span>
          } @else {
            <span class="play-icon"><app-sw-icon name="play" [size]="18" /></span>
            <span>运行</span>
          }
        </button>
      </section>

      <!-- 数据选择与上传抽屉 (内嵌标准预览、即时波形图与预测窗口调控) -->
      @if (drawerOpen()) {
        <section id="quick-trial-data-drawer" class="data-drawer-panel" aria-label="数据输入配置">
          <div class="drawer-header">
            <div class="drawer-tabs">
              <button
                type="button"
                [class.active]="dataMode() === 'demo'"
                [attr.aria-pressed]="dataMode() === 'demo'"
                (click)="switchToDemoMode()"
              >
                <app-sw-icon name="flask" [size]="17" />平台示例数据
              </button>
              <button
                type="button"
                [class.active]="dataMode() === 'upload'"
                [attr.aria-pressed]="dataMode() === 'upload'"
                (click)="switchToUploadMode()"
              >
                <app-sw-icon name="upload" [size]="17" />上传本地 CSV
              </button>
            </div>
            <button
              type="button"
              class="close-drawer-btn"
              aria-label="关闭数据输入配置"
              (click)="drawerOpen.set(false)"
            >
              <app-sw-icon name="close" [size]="18" />
            </button>
          </div>

          <!-- 上传本地文件拖拽区 -->
          @if (dataMode() === 'upload' && !customUploadedFile()) {
            <div class="upload-zone">
              <input
                #fileInput
                type="file"
                accept=".csv"
                (change)="onFileSelected($event)"
                class="file-input-hidden"
              />
              @if (uploading()) {
                <div class="upload-loading" role="status" aria-live="polite">
                  <span class="spinner"></span>
                  <span>正在上传并解析文件结构...</span>
                </div>
              } @else {
                <button type="button" class="drop-target" (click)="fileInput.click()">
                  <span class="upload-icon"><app-sw-icon name="upload" [size]="28" /></span>
                  <strong>点击或拖拽上传本地 CSV 时序数据文件</strong>
                  <span class="drop-description"
                    >上传后可在下方交互式预览并点选输入列，运行完成后将自动清理回收该临时文件。</span
                  >
                </button>
              }
            </div>
          }

          @if (dataMode() === 'upload' && customUploadedFile(); as file) {
            <div class="uploaded-banner">
              <div class="file-info-line">
                <span
                  ><app-sw-icon name="file" [size]="16" />临时试用文件：<strong>{{
                    file.name
                  }}</strong></span
                >
                <button type="button" class="remove-file-btn" (click)="clearCustomFile()">
                  移除并恢复示例
                </button>
              </div>
              <small class="temp-note"
                ><app-sw-icon
                  name="info"
                  [size]="15"
                />此文件为临时试用文件，算法运行完成后将自动清理回收。</small
              >
            </div>
          }

          <!-- 标准文件预览与列选择面板组件 (DataFilePreviewPanelComponent) -->
          @if (activeVersionId(); as verId) {
            <div class="preview-panel-host">
              <app-data-file-preview-panel
                [fileVersionId]="verId"
                [profileStatus]="activeProfileStatus()"
                [canCreateView]="true"
                [initialBinding]="currentBindingEcho()"
                (viewChange)="onViewSelectionChange($event)"
                (previewLoaded)="onPreviewLoaded($event)"
              />
            </div>
          }

          <!-- 即时时序数据预览与预测窗口交互调优卡片 (基于原文件完整数据) -->
          @if (parsedTimeSeries().length > 0) {
            <div class="timeseries-tuner-card">
              <div class="tuner-header">
                <div class="tuner-title">
                  <span class="wave-icon"><app-sw-icon name="chart" [size]="18" /></span>
                  <strong
                    >已选时序波形完整预览与输入区间调优 (原文件全量
                    {{ parsedTimeSeries().length }} 点)</strong
                  >
                </div>
                <div class="tuner-chips">
                  <span class="tuner-chip"
                    >原文件总点数: {{ parsedTimeSeries().length }} 点 (约
                    {{ totalDurationHours() }} 小时)</span
                  >
                  <span class="tuner-chip highlight">
                    选定输入历史: {{ contextPointsCount() }} 点 (约
                    {{ contextDurationHours() }} 小时)
                  </span>
                  <span class="tuner-chip">采样间隔: {{ detectedIntervalMinutes() }} 分钟</span>
                </div>
              </div>

              <!-- 抽屉内 Mini ECharts 时序波形与滑动窗口选择 -->
              <div class="drawer-chart-box">
                <div #drawerChartHost class="drawer-chart-canvas"></div>
              </div>
              <p class="slider-hint">
                <app-sw-icon name="info" [size]="15" />
                <strong>滑动上方图表底部的区间滑块</strong
                >，可自由在大文件全量时序中框选送入算法的历史输入序列（起始位置与时长）。
              </p>

              @if (selectedTaskId() === 'timeseries-forecast') {
                <!-- 预测时长 / 步长调节栏 -->
                <div class="horizon-control-bar">
                  <div class="horizon-input-group">
                    <label for="horizonInput">
                      <strong>未来预测步长 (Horizon)</strong>
                    </label>
                    <div class="horizon-input-wrapper">
                      <input
                        id="horizonInput"
                        type="number"
                        [min]="4"
                        [max]="maxHorizonSteps()"
                        [step]="4"
                        [ngModel]="horizonSteps()"
                        (ngModelChange)="setHorizonSteps($event)"
                        class="horizon-num-input"
                      />
                      <span class="unit-tag"
                        >步 ({{ (horizonSteps() * detectedIntervalMinutes()) / 60 }} 小时)</span
                      >
                    </div>
                  </div>

                  <div class="preset-buttons">
                    <span class="preset-label">快捷预设:</span>
                    <button
                      type="button"
                      class="preset-btn"
                      [class.active]="horizonSteps() === 16"
                      (click)="setHorizonSteps(16)"
                    >
                      4 小时 (16步)
                    </button>
                    <button
                      type="button"
                      class="preset-btn"
                      [class.active]="horizonSteps() === 32"
                      (click)="setHorizonSteps(32)"
                    >
                      8 小时 (32步)
                    </button>
                    <button
                      type="button"
                      class="preset-btn"
                      [class.active]="horizonSteps() === 96"
                      (click)="setHorizonSteps(96)"
                    >
                      24 小时 (96步)
                    </button>
                    <button
                      type="button"
                      class="preset-btn"
                      [class.active]="horizonSteps() === 192"
                      [disabled]="maxHorizonSteps() < 192"
                      (click)="setHorizonSteps(192)"
                    >
                      48 小时 (192步)
                    </button>
                  </div>
                </div>

                <div class="window-summary-alert">
                  <span>
                    <app-sw-icon name="info" [size]="16" />
                    <strong>执行配置：</strong>将以 <code>{{ contextStartTime() }}</code> 至
                    <code>{{ contextEndTime() }}</code
                    >（共 {{ contextPointsCount() }} 点）作为输入特征，向后外推预测未来
                    <strong
                      >{{ horizonSteps() }} 步（{{
                        (horizonSteps() * detectedIntervalMinutes()) / 60
                      }}
                      小时）</strong
                    >的时序趋势。</span
                  >
                </div>
              } @else {
                <div class="window-summary-alert">
                  <span>
                    <app-sw-icon name="info" [size]="16" />
                    <strong>执行配置：</strong>分析 <code>{{ contextStartTime() }}</code> 至
                    <code>{{ contextEndTime() }}</code> 的 {{ contextPointsCount() }} 个真实观测点。
                    @if (selectedTaskId() === 'dma-leakage') {
                      当前为总表夜间流量初筛，不替代完整水量平衡。
                    }
                  </span>
                </div>
              }
            </div>
          }
        </section>
      }

      <!-- 运行中状态动画 -->
      @if (running()) {
        <section class="running-state-card" role="status" aria-live="polite">
          <header>
            <span class="running-mark"><app-sw-icon name="activity" [size]="18" /></span>
            <div>
              <strong>正在执行 {{ selectedTaskName() }}</strong>
              <span>完成后将在此处展示指标和可视化结果</span>
            </div>
          </header>
          <div class="progress-bar-track">
            <div class="progress-bar-fill"></div>
          </div>
          <div class="step-badges">
            <span class="step-item active">准备分析任务</span>
            <span class="step-item active">读取时序数据</span>
            <span class="step-item active">执行算法计算</span>
            <span class="step-item">整理可视化结果</span>
          </div>
        </section>
      }

      <!-- 结果与可视化面板 -->
      @if (result(); as res) {
        <section class="result-dashboard">
          <header class="result-header">
            <div class="header-left">
              <div class="task-tag">
                <span class="dot"></span>
                <strong>{{ res.task }} 结果</strong>
              </div>
              <span class="algo-tag">{{ res.algorithm }}</span>
              <span class="file-tag"
                >{{ res.fileName }} ({{ res.timeColumn }} ➔ {{ res.valueColumn }})</span
              >
            </div>
            <div class="header-actions">
              <button type="button" class="action-btn download-btn" (click)="downloadResultCsv()">
                <app-sw-icon name="file" [size]="17" />导出结果数据
              </button>
              <button
                type="button"
                class="action-btn deep-edit-btn"
                (click)="openInWorkflowEditor()"
              >
                <app-sw-icon name="settings" [size]="17" />在工作流中深度调优
              </button>
            </div>
          </header>

          <!-- 各任务独立统计指标 -->
          <div class="metrics-strip">
            <div class="metric-card">
              <span class="metric-lbl">输入历史序列 (Context)</span>
              <strong class="metric-val"
                >{{ res.historyPoints.length }} 点 (约
                {{ (res.historyPoints.length * res.intervalMinutes) / 60 }} 小时)</strong
              >
            </div>
            <div class="metric-card">
              <span class="metric-lbl">采样频率</span>
              <strong class="metric-val">{{ res.intervalMinutes }} 分钟 / 点</strong>
            </div>
            @if (res.kind === 'forecast') {
              <div class="metric-card">
                <span class="metric-lbl">预测步长 (Horizon)</span>
                <strong class="metric-val highlight"
                  >未来 {{ (res.horizonSteps * res.intervalMinutes) / 60 }} 小时 ({{
                    res.horizonSteps
                  }}点)</strong
                >
              </div>
              <div class="metric-card">
                <span class="metric-lbl">检测主周期 / 置信度</span>
                <strong class="metric-val">{{ res.seasonalitySteps }} 步长 · 95% CI</strong>
              </div>
              @if (res.actualFuturePoints && res.actualFuturePoints.length > 0) {
                <div class="metric-card actual-match-card">
                  <span class="metric-lbl">未来真实值对比</span>
                  <strong class="metric-val actual-match"
                    >已对齐 {{ res.actualFuturePoints.length }} 点真实观测</strong
                  >
                </div>
              }
            } @else if (res.kind === 'anomaly') {
              <div class="metric-card">
                <span class="metric-lbl">异常点数量</span>
                <strong class="metric-val highlight">{{ res.anomalyCount }} 点</strong>
              </div>
              <div class="metric-card">
                <span class="metric-lbl">Hampel 阈值</span>
                <strong class="metric-val">{{ res.threshold }}</strong>
              </div>
            } @else {
              <div class="metric-card">
                <span class="metric-lbl">有效夜间窗口</span>
                <strong class="metric-val">{{ res.nightlyPoints.length }} 天</strong>
              </div>
              <div class="metric-card">
                <span class="metric-lbl">高夜间流量候选</span>
                <strong class="metric-val highlight">{{ res.candidatePoints.length }} 天</strong>
              </div>
              <div class="metric-card">
                <span class="metric-lbl">历史基线 / 展示阈值</span>
                <strong class="metric-val">{{ res.baseline }} / {{ res.displayThreshold }}</strong>
              </div>
            }
          </div>

          @if (res.kind === 'dma-night-flow') {
            <div class="result-notice">{{ res.notice }}</div>
          }

          <!-- ECharts 图表容器 -->
          <div class="chart-container">
            <div #chartHost class="chart-canvas"></div>
          </div>
        </section>
      } @else if (!running()) {
        <!-- 初始场景指引卡片 -->
        <section class="scenario-showcase">
          <div class="showcase-header">
            <h2><app-sw-icon name="flask" [size]="19" />常用试用场景</h2>
            <p>选择推荐场景，快速体验水务算法精准分析能力</p>
          </div>
          <div class="showcase-grid">
            <button type="button" class="showcase-card" (click)="onTaskChange('timeseries-forecast')">
              <span class="sc-icon"><app-sw-icon name="chart" [size]="22" /></span>
              <span class="sc-title">时序预测</span>
              <span class="sc-copy">供水量外推、水厂进水流量趋势分析，辅助调度决策与峰谷平衡。</span>
              <span class="sc-action">载入配置 <span aria-hidden="true">→</span></span>
            </button>

            <button type="button" class="showcase-card" (click)="onTaskChange('anomaly-detection')">
              <span class="sc-icon"><app-sw-icon name="search" [size]="22" /></span>
              <span class="sc-title">异常突变检测</span>
              <span class="sc-copy">水质浊度突升、管网水压突降智能识别，快速定位异常工况。</span>
              <span class="sc-action">载入配置 <span aria-hidden="true">→</span></span>
            </button>

            <button type="button" class="showcase-card" (click)="onTaskChange('dma-leakage')">
              <span class="sc-icon"><app-sw-icon name="droplet" [size]="22" /></span>
              <span class="sc-title">DMA 夜间流量初筛</span>
              <span class="sc-copy">执行最小夜间流量分析，筛选持续高流量日期并呈现研判依据。</span>
              <span class="sc-action">载入配置 <span aria-hidden="true">→</span></span>
            </button>
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      color: #0f172a;
      min-height: calc(100vh - 120px);
    }
    .trial-container {
      margin: 0 auto;
      display: flex;
      flex-direction: column;
    }
    /* 居中 Hero 品牌区 */
    .brand-hero {
      display: flex;
      flex-direction: column;
    }
    .brand-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
    }
    .logo-icon {
      display: flex;
      align-items: center;
    }
    .brand-text h1 {
      margin: 0;
      font-size: 26px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
    }
    .brand-text h1 span {
      color: #0284c7;
      margin-left: 4px;
    }
    .sub-title {
      display: block;
      font-size: 10px;
      font-weight: 700;
      color: #0284c7;
      letter-spacing: 1.2px;
      margin-top: 2px;
    }
    .hero-desc {
      margin: 0;
      color: #64748b;
      font-size: 14px;
    }
    /* 快速运行输入条 */
    .quick-run-bar {
      display: flex;
      align-items: center;
      border: 1px solid;
      transition: all 0.2s ease;
    }
    .input-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .input-group label {
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      margin-left: 2px;
    }
    .task-group {
      width: 140px;
      flex-shrink: 0;
    }
    .algo-group {
      width: 180px;
      flex-shrink: 0;
    }
    .data-group {
      flex: 1;
      min-width: 0;
    }
    .select-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }
    .select-wrapper select {
      width: 100%;
      height: 38px;
      padding: 0 28px 0 10px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
      font-size: 13px;
      font-weight: 600;
      color: #1e293b;
      appearance: none;
      cursor: pointer;
      outline: none;
      transition: all 0.15s ease;
    }
    .select-wrapper select:hover {
      border-color: #cbd5e1;
      background: #ffffff;
    }
    .select-wrapper select:focus {
      border-color: #0284c7;
      background: #ffffff;
    }
    .select-arrow {
      position: absolute;
      right: 10px;
      font-size: 10px;
      color: #94a3b8;
      pointer-events: none;
    }
    /* 数据输入框 */
    .data-input-box {
      height: 38px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .data-input-box:hover,
    .data-input-box.active {
      border-color: #0284c7;
      background: #ffffff;
    }
    .data-icon {
      font-size: 14px;
    }
    .data-summary-text {
      flex: 1;
      font-size: 13px;
      color: #334155;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .edit-badge {
      font-size: 11px;
      font-weight: 600;
      color: #0284c7;
      background: #e0f2fe;
      padding: 2px 8px;
      border-radius: 6px;
      white-space: nowrap;
    }
    /* 运行按钮 */
    .run-btn {
      height: 42px;
      padding: 0 24px;
      border: none;
      border-radius: 10px;
      background: #0f172a;
      color: #ffffff;
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;
      margin-top: 18px;
    }
    .run-btn:hover:not(:disabled) {
      background: #0284c7;
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(2, 132, 199, 0.25);
    }
    .run-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    .play-icon {
      font-size: 14px;
    }
    /* 抽屉面板 */
    .data-drawer-panel {
      border: 1px solid;
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      animation: slideDown 0.2s ease-out;
    }
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .drawer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .drawer-tabs {
      display: flex;
      gap: 8px;
    }
    .drawer-tabs button {
      padding: 7px 16px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
      color: #475569;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .drawer-tabs button.active {
      border-color: #0284c7;
      background: #f0f9ff;
      color: #0369a1;
    }
    .close-drawer-btn {
      border: none;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
      font-size: 16px;
    }
    /* 上传拖拽区域 */
    .file-input-hidden {
      display: none;
    }
    .drop-target {
      padding: 22px;
      border: 2px dashed #cbd5e1;
      border-radius: 10px;
      text-align: center;
      cursor: pointer;
      background: #f8fafc;
      transition: all 0.15s ease;
    }
    .drop-target:hover {
      border-color: #0284c7;
      background: #f0f9ff;
    }
    .upload-icon {
      font-size: 28px;
      display: block;
      margin-bottom: 6px;
    }
    .drop-target strong {
      display: block;
      font-size: 13px;
      color: #1e293b;
    }
    .drop-description {
      display: block;
      margin: 4px 0 0;
      font-size: 11px;
      color: #94a3b8;
    }
    .upload-loading {
      padding: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      font-size: 13px;
      color: #0284c7;
      font-weight: 600;
      background: #f0f9ff;
      border-radius: 8px;
    }
    .uploaded-banner {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 10px 14px;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .file-info-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      color: #0f172a;
    }
    .remove-file-btn {
      border: none;
      background: transparent;
      color: #ef4444;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .temp-note {
      color: #64748b;
      font-size: 11px;
    }
    .preview-panel-host {
      border-top: 1px solid #f1f5f9;
      padding-top: 10px;
    }

    /* 时序波形即时预览与预测调控卡片 */
    .timeseries-tuner-card {
      margin-top: 12px;
      padding: 16px;
      background: #f8fafc;
      border: 1.5px solid #e2e8f0;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .tuner-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .tuner-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: #0f172a;
    }
    .wave-icon {
      font-size: 16px;
    }
    .tuner-chips {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .tuner-chip {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 6px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #475569;
    }
    .tuner-chip.highlight {
      background: #e0f2fe;
      border-color: #0284c7;
      color: #0369a1;
      font-weight: 600;
    }
    .drawer-chart-box {
      width: 100%;
      height: 200px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
    }
    .drawer-chart-canvas {
      width: 100%;
      height: 100%;
    }
    .slider-hint {
      margin: 0;
      font-size: 11px;
      color: #64748b;
    }
    .slider-hint app-sw-icon {
      margin-right: 4px;
      color: var(--sw-color-primary);
      vertical-align: -2px;
    }
    .horizon-control-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .horizon-input-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .horizon-input-group label {
      font-size: 12px;
      color: #1e293b;
    }
    .horizon-input-wrapper {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .horizon-num-input {
      width: 70px;
      height: 32px;
      padding: 0 8px;
      border: 1.5px solid #cbd5e1;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 700;
      color: #0284c7;
      text-align: center;
      outline: none;
    }
    .horizon-num-input:focus {
      border-color: #0284c7;
    }
    .unit-tag {
      font-size: 12px;
      color: #64748b;
    }
    .preset-buttons {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .preset-label {
      font-size: 11px;
      color: #64748b;
    }
    .preset-btn {
      padding: 4px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      color: #334155;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .preset-btn:hover {
      border-color: #0284c7;
      color: #0284c7;
    }
    .preset-btn.active {
      border-color: #0284c7;
      background: #0284c7;
      color: #ffffff;
      font-weight: 600;
    }
    .window-summary-alert {
      padding: 8px 12px;
      background: #f0f9ff;
      border-left: 3px solid #0284c7;
      border-radius: 4px;
      font-size: 12px;
      color: #0369a1;
    }
    .window-summary-alert code {
      font-family: monospace;
      font-weight: 600;
      background: rgba(2, 132, 199, 0.1);
      padding: 1px 4px;
      border-radius: 4px;
    }

    /* 运行状态卡片 */
    .running-state-card {
      padding: 24px;
      border: 1px solid;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .progress-bar-track {
      width: 100%;
      height: 6px;
      background: #f1f5f9;
      border-radius: 4px;
      overflow: hidden;
    }
    .progress-bar-fill {
      width: 60%;
      height: 100%;
      background: linear-gradient(90deg, #0284c7, #38bdf8);
      border-radius: 4px;
      animation: pulseMove 1.5s infinite ease-in-out;
    }
    @keyframes pulseMove {
      0% {
        transform: translateX(-100%);
      }
      100% {
        transform: translateX(200%);
      }
    }
    .step-badges {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #94a3b8;
    }
    .step-item.active {
      color: #0284c7;
      font-weight: 700;
    }
    /* 结果面板 */
    .result-dashboard {
      border: 1px solid;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .task-tag {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 15px;
      color: #0f172a;
    }
    .task-tag .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
    }
    .algo-tag {
      font-size: 11px;
      background: #ede9fe;
      color: #6d28d9;
      padding: 2px 8px;
      border-radius: 6px;
      font-weight: 600;
    }
    .file-tag {
      font-size: 11px;
      background: #f1f5f9;
      color: #475569;
      padding: 2px 8px;
      border-radius: 6px;
    }
    .header-actions {
      display: flex;
      gap: 10px;
    }
    .action-btn {
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .download-btn {
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #334155;
    }
    .download-btn:hover {
      border-color: #0284c7;
      color: #0284c7;
    }
    .deep-edit-btn {
      border: 1px solid #0284c7;
      background: #f0f9ff;
      color: #0369a1;
    }
    .deep-edit-btn:hover {
      background: #0284c7;
      color: #ffffff;
    }
    /* 指标带 */
    .metrics-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
    }
    .metric-card {
      padding: 12px 14px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .actual-match-card {
      background: #f0fdf4;
      border-color: #bbf7d0;
    }
    .metric-lbl {
      display: block;
      font-size: 11px;
      color: #64748b;
      margin-bottom: 4px;
    }
    .metric-val {
      display: block;
      font-size: 14px;
      color: #0f172a;
    }
    .metric-val.highlight {
      color: #0284c7;
    }
    .metric-val.actual-match {
      color: #059669;
      font-weight: 700;
    }
    .result-notice {
      margin: 0 20px;
      padding: 10px 12px;
      border-left: 3px solid #f59e0b;
      border-radius: 6px;
      background: #fffbeb;
      color: #92400e;
      font-size: 12px;
      line-height: 1.6;
    }
    /* 图表容器 */
    .chart-container {
      width: 100%;
      height: 380px;
      min-height: 340px;
    }
    .chart-canvas {
      width: 100%;
      height: 100%;
      min-height: 340px;
    }
    /* 初始场景展示 */
    .scenario-showcase {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-top: 10px;
    }
    .showcase-header h2 {
      display: flex;
      align-items: center;
      gap: 7px;
      margin: 0;
      font-size: 18px;
      color: #0f172a;
    }
    .showcase-header p {
      margin: 4px 0 0;
      font-size: 12px;
      color: #64748b;
    }
    .showcase-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .showcase-card {
      padding: 18px;
      border: 1px solid;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sc-action {
      font-size: 12px;
      font-weight: 700;
      color: #0284c7;
      margin-top: 6px;
    }
    /* ui-ux-pro-max：以平台语义 Token 收敛快速试用的主要视觉层级。 */
    :host {
      color: var(--sw-text-primary);
    }
    .trial-container {
      max-width: 1180px;
      padding: 32px 24px 52px;
      gap: 24px;
    }
    .brand-hero {
      align-items: flex-start;
      gap: 7px;
      padding: 22px 24px;
      text-align: left;
      border: 1px solid color-mix(in srgb, var(--sw-color-primary) 18%, var(--sw-border));
      border-radius: var(--sw-radius-lg);
      background:
        radial-gradient(
          circle at 88% 0%,
          color-mix(in srgb, var(--sw-color-secondary) 14%, transparent),
          transparent 20rem
        ),
        var(--sw-surface);
      box-shadow: var(--sw-shadow-sm);
    }
    .brand-badge {
      justify-content: flex-start;
    }
    .section-kicker {
      display: block;
      margin-bottom: 3px;
      color: var(--sw-color-secondary-strong);
      font-size: 11px;
      font-weight: 750;
      letter-spacing: 0.08em;
    }
    .brand-text h1,
    .task-tag,
    .showcase-header h2,
    .drop-target strong,
    .file-info-line,
    .metric-val,
    .tuner-title,
    .horizon-input-group label {
      color: var(--sw-text-primary);
    }
    .brand-text h1 span,
    .sub-title,
    .edit-badge,
    .upload-loading,
    .step-item.active,
    .metric-val.highlight,
    .sc-action {
      color: var(--sw-color-primary);
    }
    .hero-desc,
    .input-group label,
    .drawer-tabs button,
    .drop-description,
    .temp-note,
    .slider-hint,
    .unit-tag,
    .preset-label,
    .metric-lbl,
    .showcase-header p,
    .step-badges {
      color: var(--sw-text-muted);
    }
    .quick-run-bar,
    .data-drawer-panel,
    .running-state-card,
    .result-dashboard,
    .showcase-card {
      border-color: var(--sw-border);
      border-radius: var(--sw-radius-lg);
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-sm);
    }
    .quick-run-bar {
      padding: 14px 16px;
      gap: 14px;
    }
    .quick-run-bar:focus-within {
      border-color: var(--sw-focus);
      box-shadow: var(--sw-shadow-focus), var(--sw-shadow-sm);
    }
    .select-wrapper select,
    .data-input-box,
    .drawer-tabs button,
    .uploaded-banner,
    .timeseries-tuner-card,
    .metric-card {
      border-color: var(--sw-border);
      background: var(--sw-surface-muted);
      color: var(--sw-text-primary);
    }
    .select-wrapper select,
    .data-input-box {
      min-height: 42px;
    }
    .data-input-box {
      width: 100%;
      height: 42px;
      box-sizing: border-box;
      text-align: left;
      font: inherit;
    }
    .select-wrapper select:hover,
    .select-wrapper select:focus,
    .data-input-box:hover,
    .data-input-box.active {
      border-color: var(--sw-color-primary);
      background: var(--sw-surface);
    }
    .edit-badge,
    .drawer-tabs button.active,
    .tuner-chip.highlight,
    .window-summary-alert,
    .deep-edit-btn {
      border-color: color-mix(in srgb, var(--sw-color-primary) 35%, var(--sw-border));
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary-strong);
    }
    .run-btn {
      min-height: 44px;
      background: var(--sw-color-primary-strong);
      box-shadow: 0 1px 2px rgb(0 38 54 / 18%);
    }
    .run-btn:hover:not(:disabled) {
      background: var(--sw-color-primary);
      transform: none;
      box-shadow: 0 5px 14px rgb(8 119 164 / 20%);
    }
    .drop-target {
      width: 100%;
      color: inherit;
      font: inherit;
      border-color: var(--sw-border-strong);
      background: var(--sw-surface-muted);
    }
    .drop-target:hover {
      border-color: var(--sw-color-primary);
      background: var(--sw-color-primary-faint);
    }
    .drawer-chart-box,
    .horizon-control-bar,
    .tuner-chip,
    .download-btn {
      border-color: var(--sw-border);
      background: var(--sw-surface);
    }
    .close-drawer-btn {
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      border-radius: var(--sw-radius-sm);
    }
    .close-drawer-btn:hover {
      color: var(--sw-text-primary);
      background: var(--sw-surface-muted);
    }
    .window-summary-alert > span {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      line-height: 1.6;
    }
    .window-summary-alert app-sw-icon {
      margin-top: 1px;
      flex: 0 0 auto;
    }
    .running-state-card {
      gap: 14px;
      padding: 18px 20px;
      border-color: color-mix(in srgb, var(--sw-color-primary) 24%, var(--sw-border));
      background:
        linear-gradient(90deg, var(--sw-color-primary-faint), transparent 62%),
        var(--sw-surface);
    }
    .running-state-card header {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .running-state-card header > div {
      display: grid;
      gap: 2px;
    }
    .running-state-card header strong {
      font-size: 14px;
    }
    .running-state-card header span:not(.running-mark) {
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .running-mark {
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary-strong);
    }
    .step-badges {
      gap: 8px;
    }
    .step-item {
      flex: 1;
      min-width: 0;
      padding-left: 15px;
      position: relative;
    }
    .step-item::before {
      content: '';
      width: 7px;
      height: 7px;
      position: absolute;
      top: 4px;
      left: 0;
      border: 2px solid var(--sw-border-strong);
      border-radius: 50%;
      background: var(--sw-surface);
    }
    .step-item.active::before {
      border-color: var(--sw-color-primary);
      background: var(--sw-color-primary);
    }
    .progress-bar-track {
      background: var(--sw-surface-sunken);
    }
    .progress-bar-fill {
      background: linear-gradient(90deg, var(--sw-color-primary), var(--sw-color-secondary));
    }
    .actual-match-card {
      border-color: color-mix(in srgb, var(--sw-color-success) 25%, var(--sw-border));
      background: var(--sw-color-success-soft);
    }
    .result-notice {
      border-left-color: var(--sw-color-accent);
      background: var(--sw-color-accent-soft);
      color: var(--sw-color-warning);
    }
    .showcase-card:hover {
      border-color: var(--sw-color-primary);
      box-shadow: var(--sw-shadow-md);
      transform: none;
    }
    .showcase-card {
      min-width: 0;
      white-space: normal;
      text-align: left;
      color: inherit;
      font: inherit;
    }
    .sc-title {
      color: var(--sw-text-primary);
      font-size: 15px;
      font-weight: 750;
    }
    .sc-copy {
      min-height: 3.6em;
      color: var(--sw-text-secondary);
      font-size: 12px;
      line-height: 1.6;
    }
    .sc-action {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 38px;
    }
    .data-input-box:focus-visible,
    .drawer-tabs button:focus-visible,
    .close-drawer-btn:focus-visible,
    .drop-target:focus-visible,
    .preset-btn:focus-visible,
    .action-btn:focus-visible,
    .showcase-card:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--sw-focus) 30%, transparent);
      outline-offset: 2px;
    }
    .drawer-tabs button,
    .file-info-line > span,
    .temp-note,
    .deep-edit-btn,
    .data-icon,
    .play-icon,
    .sc-icon {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .data-icon,
    .sc-icon,
    .upload-icon {
      color: var(--sw-color-primary);
    }
    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (max-width: 900px) {
      .quick-run-bar {
        flex-direction: column;
        align-items: stretch;
      }
      .task-group,
      .algo-group {
        width: 100%;
      }
      .run-btn {
        margin-top: 4px;
        justify-content: center;
      }
      .metrics-strip,
      .showcase-grid {
        grid-template-columns: 1fr 1fr;
      }
      .step-badges {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }
    }
    @media (max-width: 560px) {
      .trial-container {
        padding: 26px 20px 42px;
      }
      .brand-badge {
        gap: 10px;
      }
      .brand-hero {
        padding: 18px;
      }
      .brand-text h1 {
        font-size: 22px;
      }
      .sub-title {
        letter-spacing: 0.75px;
      }
      .quick-run-bar,
      .data-drawer-panel,
      .result-dashboard {
        padding: 14px;
      }
      .metrics-strip,
      .showcase-grid {
        grid-template-columns: 1fr;
      }
      .drawer-header,
      .result-header,
      .file-info-line {
        align-items: stretch;
        flex-direction: column;
      }
      .drawer-tabs,
      .header-actions {
        width: 100%;
      }
      .drawer-tabs button,
      .header-actions button {
        flex: 1;
      }
      .data-input-box {
        height: auto;
        min-height: 48px;
        flex-wrap: wrap;
        padding-block: 8px;
      }
      .data-summary-text {
        flex-basis: calc(100% - 30px);
      }
      .edit-badge {
        margin-left: 26px;
      }
      .step-badges {
        grid-template-columns: 1fr;
      }
      .sc-copy {
        min-height: 0;
      }
    }
  `,
})
export class QuickTrialPage implements OnInit, AfterViewInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly quickTrial = inject(QuickTrialService);
  private readonly dataFiles = inject(DataFileService);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly loginDialog = inject(LoginDialogService);

  readonly scenarios = this.quickTrial.availableScenarios;
  readonly selectedTaskId = signal('timeseries-forecast');
  readonly selectedAlgorithm = signal('auto');
  readonly currentAlgorithms = computed(() =>
    this.quickTrial.algorithmsForTask(this.selectedTaskId()),
  );
  readonly dataMode = signal<'demo' | 'upload'>('demo');
  readonly drawerOpen = signal(false);

  // Built-in demo version is resolved by its stable backend identity; database
  // ids differ between environments and must not be hard-coded in the page.
  readonly demoVersionId = signal<number | null>(null);
  readonly demoFileName = signal('示例小区_2024-01.csv');
  readonly customUploadedFile = signal<DataFileSummary | null>(null);
  readonly customCollectionId = signal<number | null>(null);
  readonly customVersionId = signal<number | null>(null);
  readonly activeProfileStatus = computed(() => {
    if (this.dataMode() === 'upload') {
      // uploadTemporaryFile resolves only after the asynchronous profile is
      // readable, so the embedded preview can use the ready state directly.
      return this.customUploadedFile() ? 'ready' : 'pending';
    }
    return 'ready';
  });

  // 列选择状态
  readonly selectedTimeCol = signal('record_time');
  readonly selectedValueCol = signal('inlet_flow');
  readonly selectedPointCol = signal<string | undefined>(undefined);
  readonly demoSampleRows = signal<Array<Record<string, unknown>>>([]);
  readonly sampleRows = signal<Array<Record<string, unknown>>>([]);
  readonly fullFileRows = signal<Array<Record<string, unknown>>>([]);
  readonly uploading = signal(false);

  // 时序窗口与预测步长调控状态
  readonly horizonSteps = signal<number>(32); // 预测步长 (默认 32 点 / 8小时)
  readonly contextStartPercent = signal<number>(0); // 历史输入起始百分比 (0 ~ 100)
  readonly contextEndPercent = signal<number>(100); // 历史输入结束百分比 (0 ~ 100)

  // 运行与结果状态
  readonly running = signal(false);
  readonly result = signal<QuickTrialResult | null>(null);

  // 抽屉内 Mini 波形图与主结果图
  private _chartHost?: ElementRef<HTMLDivElement>;
  @ViewChild('chartHost') set chartHost(el: ElementRef<HTMLDivElement> | undefined) {
    this._chartHost = el;
    if (el?.nativeElement && this.result()) {
      setTimeout(() => this.initChart(), 20);
    }
  }
  get chartHost(): ElementRef<HTMLDivElement> | undefined {
    return this._chartHost;
  }

  private _drawerChartHost?: ElementRef<HTMLDivElement>;
  @ViewChild('drawerChartHost') set drawerChartHost(el: ElementRef<HTMLDivElement> | undefined) {
    this._drawerChartHost = el;
    if (el?.nativeElement && this.parsedTimeSeries().length > 0) {
      setTimeout(() => this.initDrawerChart(), 20);
    }
  }

  private chart: echarts.ECharts | null = null;
  private drawerChart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private drawerResizeObserver: ResizeObserver | null = null;

  readonly activeVersionId = computed(() => {
    if (this.dataMode() === 'upload') {
      return this.customVersionId();
    }
    return this.demoVersionId();
  });

  readonly currentBindingEcho = computed<DataFileBindingEcho>(() => ({
    output_mode: 'timeseries',
    time_column: this.selectedTimeCol(),
    value_column: this.selectedValueCol(),
    point_column: this.selectedPointCol(),
  }));

  // 解析出的完整时序点（优先使用原文件全量数据，若正在加载则使用前50行样本）
  readonly parsedTimeSeries = computed<TimeSeriesPoint[]>(() => {
    const full = this.fullFileRows();
    const sample = this.sampleRows();
    const rows = full.length > 0 ? full : sample;
    const timeCol = this.selectedTimeCol();
    const valCol = this.selectedValueCol();
    if (!rows.length || !timeCol || !valCol) return [];
    return this.quickTrial.parseTimeSeriesPoints(rows, timeCol, valCol);
  });

  // 检测采样间隔
  readonly detectedIntervalMinutes = computed<number>(() => {
    return inferIntervalMinutes(this.parsedTimeSeries());
  });

  readonly maxHorizonSteps = computed(() => maxHorizonForAlgorithm(this.selectedAlgorithm()));

  // 原文件总时长小时数
  readonly totalDurationHours = computed<string>(() => {
    const count = this.parsedTimeSeries().length;
    const interval = this.detectedIntervalMinutes();
    return ((count * interval) / 60).toFixed(1);
  });

  // 选中的输入历史序列切片
  readonly selectedContextSlice = computed<{ startIdx: number; endIdx: number }>(() => {
    const pts = this.parsedTimeSeries();
    if (!pts.length) return { startIdx: 0, endIdx: 0 };
    const total = pts.length;
    const startIdx = Math.max(0, Math.floor((this.contextStartPercent() / 100) * total));
    const rawEnd = Math.ceil((this.contextEndPercent() / 100) * total) - 1;
    const endIdx = Math.min(total - 1, Math.max(startIdx + 3, rawEnd));
    return { startIdx, endIdx };
  });

  readonly contextPointsCount = computed<number>(() => {
    const { startIdx, endIdx } = this.selectedContextSlice();
    return Math.max(0, endIdx - startIdx + 1);
  });

  readonly contextDurationHours = computed<string>(() => {
    const count = this.contextPointsCount();
    const interval = this.detectedIntervalMinutes();
    return ((count * interval) / 60).toFixed(1);
  });

  readonly contextStartTime = computed<string>(() => {
    const pts = this.parsedTimeSeries();
    const { startIdx } = this.selectedContextSlice();
    return pts[startIdx]?.time || '起始点';
  });

  readonly contextEndTime = computed<string>(() => {
    const pts = this.parsedTimeSeries();
    const { endIdx } = this.selectedContextSlice();
    return pts[endIdx]?.time || '结束点';
  });

  readonly dataInputDisplay = computed(() => {
    const fileLabel = this.customUploadedFile()
      ? this.customUploadedFile()?.name
      : `${this.demoFileName()} (示例)`;
    const ctxCount = this.contextPointsCount() || 48;
    if (this.selectedTaskId() === 'timeseries-forecast') {
      const horizon = this.horizonSteps();
      const hrs = ((horizon * this.detectedIntervalMinutes()) / 60).toFixed(0);
      return `${fileLabel} (${this.selectedTimeCol()} ➔ ${this.selectedValueCol()} · 输入 ${ctxCount}点 ➔ 预测 ${horizon}点/${hrs}h)`;
    }
    return `${fileLabel} (${this.selectedTimeCol()} ➔ ${this.selectedValueCol()} · 分析 ${ctxCount}点)`;
  });
  readonly selectedTaskName = computed(
    () => this.scenarios.find((item) => item.id === this.selectedTaskId())?.name ?? '试用任务',
  );

  ngOnInit(): void {
    // Resolve the platform-owned demo by its stable application identity.
    // Never choose the first collection/file: a user's upload can change that
    // ordering and must not replace the built-in example.
    this.dataFiles.getBuiltinDemo().subscribe({
      next: ({ file, version }) => {
        const versionId = version.id || file.current_version_id;
        if (!versionId) return;
        this.demoVersionId.set(versionId);
        this.demoFileName.set(file.name || '示例小区_2024-01.csv');
        this.dataFiles.getPreview(versionId).subscribe({
          next: (preview) => {
            const rows = preview.rows || [];
            this.demoSampleRows.set(rows);
            this.sampleRows.set(rows);
            this.applyDemoColumnDefaults(preview.columns.map((column) => column.name));
          },
        });
        this.loadFullFileVersion(versionId);
      },
      error: () => {
        // The rest of the portal remains usable when the optional demo seed is
        // missing; runQuickTrial will show a clear data-unavailable message.
        this.demoVersionId.set(null);
      },
    });
  }

  private applyDemoColumnDefaults(columnNames: string[]): void {
    const scenario = this.scenarios.find((item) => item.id === this.selectedTaskId());
    const timeColumn = scenario?.timeColumn;
    const valueColumn = scenario?.valueColumn;
    if (timeColumn && columnNames.includes(timeColumn)) {
      this.selectedTimeCol.set(timeColumn);
    } else if (columnNames.length > 0) {
      this.selectedTimeCol.set(
        columnNames.find((name) => /time|date|timestamp|时间|日期/i.test(name)) || columnNames[0],
      );
    }
    if (valueColumn && columnNames.includes(valueColumn)) {
      this.selectedValueCol.set(valueColumn);
    } else if (columnNames.length > 0) {
      this.selectedValueCol.set(
        columnNames.find((name) => /flow|pressure|value|metric|流量|压力/i.test(name)) ||
          columnNames[Math.min(1, columnNames.length - 1)],
      );
    }
  }

  ngAfterViewInit(): void {
    if (this.result()) {
      this.initChart();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.drawerResizeObserver?.disconnect();
    this.chart?.dispose();
    this.drawerChart?.dispose();
    this.chart = null;
    this.drawerChart = null;
  }

  /**
   * 下载并完整解析原文件全量数据
   */
  private loadFullFileVersion(versionId: number): void {
    this.dataFiles.downloadFileVersion(versionId).subscribe({
      next: (blob) => {
        void blob.text().then((text) => {
          const full = parseCsvTextToRows(text);
          if (full.length > 0) {
            this.fullFileRows.set(full);
            setTimeout(() => this.initDrawerChart(), 40);
          }
        });
      },
      error: () => {
        // Fallback gracefully
      },
    });
  }

  toggleDataDrawer(): void {
    const next = !this.drawerOpen();
    this.drawerOpen.set(next);
    if (next && this.parsedTimeSeries().length > 0) {
      setTimeout(() => this.initDrawerChart(), 40);
    }
  }

  setHorizonSteps(steps: number): void {
    const val = Math.max(4, Math.min(Number(steps) || 32, this.maxHorizonSteps()));
    this.horizonSteps.set(val);
  }

  onAlgorithmChange(algorithm: string): void {
    this.selectedAlgorithm.set(algorithm);
    this.setHorizonSteps(this.horizonSteps());
  }

  switchToDemoMode(): void {
    this.dataMode.set('demo');
    this.sampleRows.set(this.demoSampleRows());
    this.applyDemoColumnDefaults(Object.keys(this.demoSampleRows()[0] || {}));
    const demoVer = this.demoVersionId();
    if (demoVer) {
      this.loadFullFileVersion(demoVer);
    }
    setTimeout(() => this.initDrawerChart(), 40);
  }

  switchToUploadMode(): void {
    this.dataMode.set('upload');
  }

  onTaskChange(taskId: string): void {
    this.selectedTaskId.set(taskId);
    const scenario = this.scenarios.find((item) => item.id === taskId);
    this.selectedAlgorithm.set(scenario?.defaultAlgorithm || 'auto');
    this.result.set(null);
    if (this.dataMode() === 'demo') {
      this.applyDemoColumnDefaults(Object.keys(this.sampleRows()[0] || {}));
    } else {
      const columns = Object.keys(this.fullFileRows()[0] || this.sampleRows()[0] || {});
      const preferred = taskId === 'anomaly-detection' ? /pressure|压力/i : /flow|流量|value|数值/i;
      const valueColumn = columns.find((name) => preferred.test(name));
      if (valueColumn) {
        this.selectedValueCol.set(valueColumn);
      }
    }
    setTimeout(() => this.initDrawerChart(), 40);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!this.auth.isAuthenticated()) {
      this.loginDialog.requireLogin().subscribe((ready) => {
        if (ready) this.uploadSelectedFile(file);
        else input.value = '';
      });
      return;
    }
    this.uploadSelectedFile(file);
  }

  private uploadSelectedFile(file: File): void {
    // 直接从本地 File 对象异步解析全量时序行
    void file.text().then((text) => {
      const full = parseCsvTextToRows(text);
      if (full.length > 0) {
        this.fullFileRows.set(full);
      }
    });

    this.uploading.set(true);
    this.quickTrial.uploadTemporaryFile(file).subscribe({
      next: (res) => {
        this.customUploadedFile.set(res.file);
        this.customCollectionId.set(res.collectionId);
        this.customVersionId.set(res.versionId);
        this.sampleRows.set(res.preview.rows || []);

        const colNames = res.preview.columns.map((c) => c.name);
        const timeCol =
          colNames.find((c) => /time|date|timestamp|时间/i.test(c)) || colNames[0] || '';
        const valCol =
          colNames.find((c) => /flow|val|pressure|metric|num|流量|压力/i.test(c)) ||
          colNames[1] ||
          colNames[0] ||
          '';
        this.selectedTimeCol.set(timeCol);
        this.selectedValueCol.set(valCol);
        this.uploading.set(false);
        this.notifications.success(
          `临时数据 ${file.name} 上传成功，请在下方点选输出列与调整分析窗口`,
        );
        setTimeout(() => this.initDrawerChart(), 40);
      },
      error: (err) => {
        this.uploading.set(false);
        this.notifications.error(err, '上传临时试用数据失败');
      },
    });
  }

  clearCustomFile(): void {
    const file = this.customUploadedFile();
    const colId = this.customCollectionId();
    if (file) {
      this.quickTrial.cleanupTemporaryFile(colId, file.id).subscribe();
    }
    this.resetCustomFileState();
    this.switchToDemoMode();
  }

  private resetCustomFileState(): void {
    this.customUploadedFile.set(null);
    this.customCollectionId.set(null);
    this.customVersionId.set(null);
    this.fullFileRows.set([]);
    this.sampleRows.set(this.demoSampleRows());
  }

  private cleanupCustomFileAfterRun(): void {
    const file = this.customUploadedFile();
    if (!file) return;
    const fileId = file.id;
    this.quickTrial.cleanupTemporaryFile(this.customCollectionId(), fileId).subscribe((cleaned) => {
      if (cleaned && this.customUploadedFile()?.id === fileId) {
        this.resetCustomFileState();
        this.switchToDemoMode();
      }
    });
  }

  onViewSelectionChange(selection: DataFileViewSelection): void {
    if (selection.output_mode === 'timeseries') {
      if (selection.time_column) this.selectedTimeCol.set(selection.time_column);
      if (selection.value_column) this.selectedValueCol.set(selection.value_column);
      this.selectedPointCol.set(selection.point_column);
      this.notifications.success(
        `已选定输入列：时间[${selection.time_column}] · 分析目标[${selection.value_column}]`,
      );
      setTimeout(() => this.initDrawerChart(), 40);
    }
  }

  onPreviewLoaded(event: {
    preview: DataFilePreview;
    sampleRows: Array<Record<string, unknown>>;
  }): void {
    this.sampleRows.set(event.sampleRows || []);
    if (event.preview.file_version_id && this.fullFileRows().length === 0) {
      this.loadFullFileVersion(event.preview.file_version_id);
    }
    setTimeout(() => this.initDrawerChart(), 40);
  }

  /**
   * 初始化抽屉内 Mini 时序波形与区间滑动选择器
   */
  private initDrawerChart(): void {
    const host = this._drawerChartHost?.nativeElement;
    const pts = this.parsedTimeSeries();
    if (!host || !pts.length) return;

    try {
      if (this.drawerChart) {
        this.drawerChart.dispose();
        this.drawerChart = null;
      }
      this.drawerChart = echarts.init(host, null, { renderer: 'svg' });

      if (typeof ResizeObserver !== 'undefined') {
        this.drawerResizeObserver?.disconnect();
        this.drawerResizeObserver = new ResizeObserver(() => {
          this.drawerChart?.resize();
        });
        this.drawerResizeObserver.observe(host);
      }

      const chartData = pts.map((p) => [p.time, p.value]);
      const option: echarts.EChartsOption = {
        title: {
          text: `时序波形即时预览 (${this.selectedValueCol()})`,
          left: 10,
          top: 4,
          textStyle: { fontSize: 12, fontWeight: 'bold', color: '#334155' },
        },
        grid: {
          top: 28,
          left: 45,
          right: 20,
          bottom: 30,
        },
        tooltip: {
          trigger: 'axis',
          textStyle: { fontSize: 11 },
        },
        xAxis: {
          type: 'time',
          boundaryGap: ['0%', '0%'] as any,
          axisLabel: { fontSize: 9, color: '#64748b' },
          axisLine: { lineStyle: { color: '#cbd5e1' } },
          splitLine: { show: false },
        },
        yAxis: {
          type: 'value',
          scale: true,
          axisLabel: { fontSize: 9, color: '#64748b' },
          splitLine: { lineStyle: { color: '#f1f5f9' } },
        },
        dataZoom: [
          {
            type: 'slider',
            height: 14,
            bottom: 2,
            start: this.contextStartPercent(),
            end: this.contextEndPercent(),
            borderColor: '#cbd5e1',
            fillerColor: 'rgba(2, 132, 199, 0.2)',
          },
        ],
        series: [
          {
            name: this.selectedValueCol(),
            type: 'line',
            data: chartData,
            smooth: true,
            showSymbol: false,
            lineStyle: { color: '#0284c7', width: 2 },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(2, 132, 199, 0.2)' },
                { offset: 1, color: 'rgba(2, 132, 199, 0.01)' },
              ]),
            },
          },
        ],
      };

      this.drawerChart.setOption(option, { notMerge: true });

      // 监听用户拖动 DataZoom 区间滑块
      this.drawerChart.on('datazoom', (params: any) => {
        let start = 0;
        let end = 100;
        if (params.batch?.[0]) {
          start = params.batch[0].start ?? 0;
          end = params.batch[0].end ?? 100;
        } else if (params.start !== undefined && params.end !== undefined) {
          start = params.start;
          end = params.end;
        }
        this.contextStartPercent.set(start);
        this.contextEndPercent.set(end);
      });
    } catch {
      // Safe fallback
    }
  }

  runQuickTrial(): void {
    if (!this.auth.isAuthenticated()) {
      this.loginDialog.requireLogin().subscribe((ready) => {
        if (ready) this.runQuickTrial();
      });
      return;
    }
    this.running.set(true);
    this.result.set(null);
    this.drawerOpen.set(false);

    const isCustom = Boolean(this.customUploadedFile());
    const fileName = isCustom ? this.customUploadedFile()!.name : this.demoFileName();
    const timeCol = this.selectedTimeCol();
    const valCol = this.selectedValueCol();
    const pointCol = this.selectedPointCol();
    const fullRows = this.fullFileRows();
    const sampleRows = this.sampleRows();
    const currentRows = fullRows.length > 0 ? fullRows : sampleRows;
    const verId = this.activeVersionId();
    const { startIdx, endIdx } = this.selectedContextSlice();
    const horizon = this.horizonSteps();

    const execute = (effectiveRows: Array<Record<string, unknown>>) => {
      if (verId) {
        this.quickTrial
          .executeEphemeralWorkflow({
            taskId: this.selectedTaskId(),
            task: this.scenarios.find((s) => s.id === this.selectedTaskId())?.name || '时序预测',
            algorithm: this.selectedAlgorithm(),
            fileName,
            fileVersionId: verId,
            timeColumn: timeCol,
            valueColumn: valCol,
            pointColumn: pointCol,
            sampleRows: effectiveRows,
            inputStartIndex: startIdx,
            inputEndIndex: endIdx,
            inputStartTime: this.parsedTimeSeries()[startIdx]?.time,
            inputEndTime: this.parsedTimeSeries()[endIdx]?.time,
            horizonSteps: horizon,
          })
          .subscribe({
            next: (res) => {
              this.result.set(res);
              this.running.set(false);

              // 运行后清理上传的临时试用文件
              this.cleanupCustomFileAfterRun();

              setTimeout(() => {
                this.initChart();
              }, 40);
            },
            error: (err) => {
              this.running.set(false);
              this.cleanupCustomFileAfterRun();
              this.notifications.error(err, '即席工作流执行异常');
            },
          });
      } else {
        this.running.set(false);
        this.notifications.error('未能定位有效的数据文件版本');
      }
    };

    if (currentRows.length === 0 && verId) {
      this.dataFiles.getPreview(verId).subscribe({
        next: (preview) => {
          this.sampleRows.set(preview.rows || []);
          execute(preview.rows || []);
        },
        error: (err) => {
          this.running.set(false);
          this.notifications.error(err, '无法加载选定的数据窗口');
        },
      });
    } else {
      execute(currentRows);
    }
  }

  private initChart(): void {
    const host = this._chartHost?.nativeElement;
    const res = this.result();
    if (!host || !res) return;

    try {
      if (this.chart) {
        this.chart.dispose();
        this.chart = null;
      }
      this.chart = echarts.init(host, null, {
        renderer: 'svg',
      });
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver?.disconnect();
        this.resizeObserver = new ResizeObserver(() => {
          this.chart?.resize();
        });
        this.resizeObserver.observe(host);
      }
      if (res.kind === 'forecast') {
        this.renderForecastChart(res);
      } else if (res.kind === 'anomaly') {
        this.renderAnomalyChart(res);
      } else {
        this.renderDmaNightFlowChart(res);
      }
    } catch {
      // Safe fallback
    }
  }

  private renderAnomalyChart(res: AnomalyResult): void {
    if (!this.chart) return;
    const history = res.historyPoints.map((point) => [point.time, point.value]);
    const anomaly = res.anomalyPoints.map((point) => [point.time, point.value]);
    const scores = res.scorePoints.map((point) => [point.time, point.value]);
    this.chart.setOption(
      {
        animation: true,
        title: {
          text: `${res.fileName} · Hampel 异常突变检测`,
          left: 'center',
          top: 4,
          textStyle: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' },
        },
        legend: {
          top: 28,
          data: ['观测值', '异常点', '异常分数'],
          textStyle: { fontSize: 11, color: '#64748b' },
        },
        grid: { top: 62, left: 56, right: 56, bottom: 44 },
        tooltip: { trigger: 'axis' },
        xAxis: {
          type: 'time',
          axisLabel: { fontSize: 10, color: '#64748b' },
          axisLine: { lineStyle: { color: '#cbd5e1' } },
        },
        yAxis: [
          {
            type: 'value',
            name: res.valueColumn,
            scale: true,
            splitLine: { lineStyle: { color: '#f1f5f9' } },
          },
          {
            type: 'value',
            name: '异常分数',
            min: 0,
            splitLine: { show: false },
          },
        ],
        dataZoom: [
          { type: 'inside' },
          { type: 'slider', height: 16, bottom: 4, borderColor: '#cbd5e1' },
        ],
        series: [
          {
            name: '观测值',
            type: 'line',
            data: history,
            showSymbol: false,
            lineStyle: { color: '#0284c7', width: 2 },
          },
          {
            name: '异常点',
            type: 'scatter',
            data: anomaly,
            symbolSize: 9,
            itemStyle: { color: '#ef4444' },
            z: 5,
          },
          {
            name: '异常分数',
            type: 'line',
            yAxisIndex: 1,
            data: scores,
            showSymbol: false,
            lineStyle: { color: '#f59e0b', width: 1.5, opacity: 0.85 },
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: '#dc2626', type: 'dashed' },
              data: [{ yAxis: res.threshold, name: `阈值 ${res.threshold}` }],
            },
          },
        ],
      },
      { notMerge: true },
    );
  }

  private renderDmaNightFlowChart(res: DmaNightFlowResult): void {
    if (!this.chart) return;
    const nightly = res.nightlyPoints.map((point) => [point.time, point.value]);
    const candidates = res.candidatePoints.map((point) => [point.time, point.value]);
    this.chart.setOption(
      {
        animation: true,
        title: {
          text: `${res.fileName} · DMA 夜间流量初筛`,
          left: 'center',
          top: 4,
          textStyle: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' },
        },
        legend: {
          top: 28,
          data: ['每日夜间流量', '高流量候选'],
          textStyle: { fontSize: 11, color: '#64748b' },
        },
        grid: { top: 62, left: 58, right: 30, bottom: 44 },
        tooltip: { trigger: 'axis' },
        xAxis: {
          type: 'time',
          axisLabel: { fontSize: 10, color: '#64748b' },
          axisLine: { lineStyle: { color: '#cbd5e1' } },
        },
        yAxis: {
          type: 'value',
          name: '夜间流量',
          min: 0,
          splitLine: { lineStyle: { color: '#f1f5f9' } },
        },
        dataZoom: [
          { type: 'inside' },
          { type: 'slider', height: 16, bottom: 4, borderColor: '#cbd5e1' },
        ],
        series: [
          {
            name: '每日夜间流量',
            type: 'bar',
            data: nightly,
            itemStyle: { color: '#38bdf8', borderRadius: [3, 3, 0, 0] },
            markLine: {
              silent: true,
              symbol: 'none',
              data: [
                {
                  yAxis: res.baseline,
                  name: `历史基线 ${res.baseline}`,
                  lineStyle: { color: '#10b981', type: 'dashed' },
                },
                {
                  yAxis: res.displayThreshold,
                  name: `展示阈值 ${res.displayThreshold}`,
                  lineStyle: { color: '#f59e0b', type: 'dashed' },
                },
              ],
            },
          },
          {
            name: '高流量候选',
            type: 'scatter',
            data: candidates,
            symbolSize: 10,
            itemStyle: { color: '#ef4444' },
            z: 5,
          },
        ],
      },
      { notMerge: true },
    );
  }

  private renderForecastChart(res: ForecastResult): void {
    if (!this.chart) return;

    const histData = res.historyPoints.map((p) => [p.time, p.value]);
    const foreData = res.forecastPoints.map((p) => [p.time, p.value]);
    const hasActualFuture = !!res.actualFuturePoints && res.actualFuturePoints.length > 0;
    const actualFutureData = (res.actualFuturePoints || []).map((p) => [p.time, p.value]);

    // 构造堆叠面积置信带：
    // 基底 = lowerData (透明无填充，从 0 堆叠到 lower)
    // 面积 = diffData (upper - lower，从 lower 堆叠到 upper，半透明填充)
    const lowerBaseData: Array<[string, number]> = [];
    const bandDiffData: Array<[string, number]> = [];

    for (let i = 0; i < res.forecastPoints.length; i++) {
      const time = res.forecastPoints[i].time;
      const lower = res.lowerBand[i]?.value ?? 0;
      const upper = res.upperBand[i]?.value ?? 0;
      const diff = Number(Math.max(0, upper - lower).toFixed(3));
      lowerBaseData.push([time, lower]);
      bandDiffData.push([time, diff]);
    }

    if (res.historyPoints.length > 0) {
      const last = res.historyPoints[res.historyPoints.length - 1];
      foreData.unshift([last.time, last.value]);
      lowerBaseData.unshift([last.time, last.value]);
      bandDiffData.unshift([last.time, 0]);
      if (hasActualFuture) {
        actualFutureData.unshift([last.time, last.value]);
      }
    }

    const horizonHours = Math.max(1, Math.round((res.horizonSteps * res.intervalMinutes) / 60));

    const legendData: Array<{ name: string; itemStyle?: { color: string } }> = [
      { name: '历史观测真实值', itemStyle: { color: '#0284c7' } },
      { name: '未来预测趋势值', itemStyle: { color: '#8b5cf6' } },
      { name: '95% 置信区间', itemStyle: { color: 'rgba(139, 92, 246, 0.6)' } },
    ];
    if (hasActualFuture) {
      legendData.push({
        name: '未来真实观测值',
        itemStyle: { color: '#10b981' },
      });
    }

    const seriesList: echarts.SeriesOption[] = [
      {
        name: '置信区间基底',
        type: 'line',
        data: lowerBaseData,
        smooth: true,
        showSymbol: false,
        lineStyle: { opacity: 0 },
        stack: 'confidence-band',
        symbol: 'none',
      },
      {
        name: '95% 置信区间',
        type: 'line',
        data: bandDiffData,
        smooth: true,
        showSymbol: false,
        lineStyle: { opacity: 0.6, color: '#a78bfa', width: 1, type: 'dotted' },
        stack: 'confidence-band',
        symbol: 'none',
        areaStyle: {
          color: 'rgba(139, 92, 246, 0.28)',
        },
      },
      {
        name: '未来预测趋势值',
        type: 'line',
        data: foreData,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#8b5cf6', width: 2.5, type: 'dashed' },
      },
    ];

    if (hasActualFuture) {
      seriesList.push({
        name: '未来真实观测值',
        type: 'line',
        data: actualFutureData,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#10b981', width: 2.5 },
      });
    }

    seriesList.push({
      name: '历史观测真实值',
      type: 'line',
      data: histData,
      smooth: true,
      showSymbol: false,
      lineStyle: { color: '#0284c7', width: 2.5 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(2, 132, 199, 0.25)' },
          { offset: 1, color: 'rgba(2, 132, 199, 0.02)' },
        ]),
      },
    });

    const option: echarts.EChartsOption = {
      animation: true,
      title: {
        text: `${res.fileName} · ${horizonHours}小时外推时序预测`,
        left: 'center',
        top: 4,
        textStyle: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' },
      },
      legend: {
        top: 28,
        textStyle: { fontSize: 11, color: '#64748b' },
        data: legendData,
      },
      grid: {
        top: 60,
        left: 54,
        right: 28,
        bottom: 44,
      },
      tooltip: {
        trigger: 'axis',
        textStyle: { fontSize: 12 },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const timeStr = params[0].axisValueLabel || params[0].name || '';
          let html = `<div style="font-weight: bold; margin-bottom: 4px;">${timeStr}</div>`;
          for (const item of params) {
            if (item.seriesName === '置信区间基底') continue;
            if (item.seriesName === '95% 置信区间') {
              const pointTime = item.value?.[0];
              const idx = res.forecastPoints.findIndex((p) => p.time === pointTime);
              if (idx >= 0) {
                const lower = res.lowerBand[idx]?.value;
                const upper = res.upperBand[idx]?.value;
                html += `<div style="display:flex; align-items:center; gap:6px; margin:2px 0;">
                  <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:rgba(139, 92, 246, 0.6);"></span>
                  <span>95% 置信区间: <b>[${lower} ~ ${upper}]</b></span>
                </div>`;
              }
            } else {
              const val = Array.isArray(item.value) ? item.value[1] : item.value;
              html += `<div style="display:flex; align-items:center; gap:6px; margin:2px 0;">
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${item.color || '#0284c7'};"></span>
                <span>${item.seriesName}: <b>${val}</b></span>
              </div>`;
            }
          }
          return html;
        },
      },
      xAxis: {
        type: 'time',
        boundaryGap: ['0%', '0%'] as any,
        axisLabel: { fontSize: 10, color: '#64748b' },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: `${res.valueColumn}`,
        nameTextStyle: { fontSize: 11, color: '#94a3b8' },
        scale: true,
        axisLabel: { fontSize: 10, color: '#64748b' },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      dataZoom: [
        { type: 'inside' },
        {
          type: 'slider',
          height: 16,
          bottom: 4,
          borderColor: '#cbd5e1',
          fillerColor: 'rgba(2, 132, 199, 0.15)',
        },
      ],
      series: seriesList,
    };

    this.chart.setOption(option, { notMerge: true });
  }

  downloadResultCsv(): void {
    const res = this.result();
    if (!res) return;

    const rows: string[] = [];
    let suffix: string = res.kind;
    if (res.kind === 'forecast') {
      rows.push('timestamp,type,predicted_value,actual_value,lower_bound,upper_bound');
      for (const point of res.historyPoints) {
        rows.push(`${point.time},history,,${point.value},,`);
      }
      const actualByTime = new Map(
        (res.actualFuturePoints || []).map((point) => [point.time, point.value]),
      );
      for (let index = 0; index < res.forecastPoints.length; index++) {
        const point = res.forecastPoints[index];
        const lower = res.lowerBand[index]?.value ?? '';
        const upper = res.upperBand[index]?.value ?? '';
        const actual = actualByTime.get(point.time) ?? '';
        rows.push(`${point.time},forecast,${point.value},${actual},${lower},${upper}`);
      }
      suffix = 'forecast';
    } else if (res.kind === 'anomaly') {
      rows.push('timestamp,value,anomaly_score,is_anomaly');
      const scoreByTime = new Map(res.scorePoints.map((point) => [point.time, point.value]));
      const anomalyTimes = new Set(res.anomalyPoints.map((point) => point.time));
      for (const point of res.historyPoints) {
        rows.push(
          `${point.time},${point.value},${scoreByTime.get(point.time) ?? ''},${anomalyTimes.has(point.time) ? 1 : 0}`,
        );
      }
      suffix = 'anomaly';
    } else {
      rows.push('date,night_flow,is_candidate,baseline,display_threshold');
      const candidateTimes = new Set(res.candidatePoints.map((point) => point.time));
      for (const point of res.nightlyPoints) {
        rows.push(
          `${point.time},${point.value},${candidateTimes.has(point.time) ? 1 : 0},${res.baseline},${res.displayThreshold}`,
        );
      }
      suffix = 'night_flow_screen';
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${res.fileName}_${suffix}_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.notifications.success('算法结果 CSV 已开始下载');
  }

  openInWorkflowEditor(): void {
    const res = this.result();
    if (res?.workflowId) {
      void this.router.navigate(['/workflows', res.workflowId, 'edit']);
    } else {
      void this.router.navigate(['/workflows']);
    }
  }
}
