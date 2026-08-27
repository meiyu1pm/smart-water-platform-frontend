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
  ForecastResult,
  QuickTrialService,
  TimeSeriesPoint,
  formatDateStr,
  parseCsvTextToRows,
  parseDateMs,
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

@Component({
  selector: 'app-quick-trial-page',
  standalone: true,
  imports: [CommonModule, FormsModule, DataFilePreviewPanelComponent],
  template: `
    <div class="trial-container">
      <!-- 居中头部：Logo 与品牌标头 -->
      <header class="brand-hero">
        <div class="brand-badge">
          <div class="logo-icon">
            <svg viewBox="0 0 36 36" width="32" height="32" fill="none">
              <rect width="36" height="36" rx="8" fill="#0284c7" />
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
            <h1>智能水务<span>算法平台</span></h1>
            <span class="sub-title">SMART WATER ALGORITHM PLATFORM</span>
          </div>
        </div>
        <p class="hero-desc">
          快速试用与可视化中心 · 零门槛一键体验水务算法
        </p>
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
            <span class="select-arrow">▼</span>
          </div>
        </div>

        <div class="input-group algo-group">
          <label for="algoSelect">算法</label>
          <div class="select-wrapper">
            <select
              id="algoSelect"
              [ngModel]="selectedAlgorithm()"
              (ngModelChange)="selectedAlgorithm.set($event)"
            >
              <option value="auto">auto (智能推荐)</option>
              <option value="seasonal_naive">seasonal_naive (季节性基准)</option>
              <option value="chronos2">chronos2 (深度学习时序大模型)</option>
            </select>
            <span class="select-arrow">▼</span>
          </div>
        </div>

        <div class="input-group data-group">
          <label>数据输入与预测窗口</label>
          <div
            class="data-input-box"
            (click)="toggleDataDrawer()"
            [class.active]="drawerOpen()"
            title="点击选择输出列、预览时序波形或调整预测窗口"
          >
            <span class="data-icon">{{ customUploadedFile() ? '📁' : '📊' }}</span>
            <span class="data-summary-text">{{ dataInputDisplay() }}</span>
            <span class="edit-badge">{{ drawerOpen() ? '收起配置' : '调整输入与预测窗口' }}</span>
          </div>
        </div>

        <button
          type="button"
          class="run-btn"
          [disabled]="running()"
          (click)="runQuickTrial()"
        >
          @if (running()) {
            <span class="spinner"></span>
            <span>计算中...</span>
          } @else {
            <span class="play-icon">▷</span>
            <span>运行</span>
          }
        </button>
      </section>

      <!-- 数据选择与上传抽屉 (内嵌标准预览、即时波形图与预测窗口调控) -->
      @if (drawerOpen()) {
        <section class="data-drawer-panel">
          <div class="drawer-header">
            <div class="drawer-tabs">
              <button
                type="button"
                [class.active]="dataMode() === 'demo'"
                (click)="switchToDemoMode()"
              >
                🌟 平台示例数据
              </button>
              <button
                type="button"
                [class.active]="dataMode() === 'upload'"
                (click)="switchToUploadMode()"
              >
                📤 上传本地 CSV
              </button>
            </div>
            <button
              type="button"
              class="close-drawer-btn"
              (click)="drawerOpen.set(false)"
            >
              ✕
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
                <div class="upload-loading">
                  <span class="spinner"></span>
                  <span>正在上传并解析文件结构...</span>
                </div>
              } @else {
                <div class="drop-target" (click)="fileInput.click()">
                  <span class="upload-icon">☁️</span>
                  <strong>点击或拖拽上传本地 CSV 时序数据文件</strong>
                  <p>上传后可在下方交互式预览并点选输入列，运行完成后将自动清理回收该临时文件。</p>
                </div>
              }
            </div>
          }

          @if (dataMode() === 'upload' && customUploadedFile(); as file) {
            <div class="uploaded-banner">
              <div class="file-info-line">
                <span>📄 临时试用文件：<strong>{{ file.name }}</strong></span>
                <button
                  type="button"
                  class="remove-file-btn"
                  (click)="clearCustomFile()"
                >
                  移除并恢复示例
                </button>
              </div>
              <small class="temp-note">ℹ️ 此文件为临时试用文件，运行得出预测结果后将自动清理回收。</small>
            </div>
          }

          <!-- 标准文件预览与列选择面板组件 (DataFilePreviewPanelComponent) -->
          @if (activeVersionId(); as verId) {
            <div class="preview-panel-host">
              <app-data-file-preview-panel
                [fileVersionId]="verId"
                [profileStatus]="'ready'"
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
                  <span class="wave-icon">📈</span>
                  <strong>已选时序波形完整预览与输入区间调优 (原文件全量 {{ parsedTimeSeries().length }} 点)</strong>
                </div>
                <div class="tuner-chips">
                  <span class="tuner-chip">原文件总点数: {{ parsedTimeSeries().length }} 点 (约 {{ totalDurationHours() }} 小时)</span>
                  <span class="tuner-chip highlight">
                    选定输入历史: {{ contextPointsCount() }} 点 (约 {{ contextDurationHours() }} 小时)
                  </span>
                  <span class="tuner-chip">采样间隔: {{ detectedIntervalMinutes() }} 分钟</span>
                </div>
              </div>

              <!-- 抽屉内 Mini ECharts 时序波形与滑动窗口选择 -->
              <div class="drawer-chart-box">
                <div #drawerChartHost class="drawer-chart-canvas"></div>
              </div>
              <p class="slider-hint">
                💡 <strong>滑动上方图表底部的区间滑块</strong>，可自由在大文件全量时序中框选送入算法的历史输入序列（起始位置与时长）。
              </p>

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
                      [max]="192"
                      [step]="4"
                      [ngModel]="horizonSteps()"
                      (ngModelChange)="setHorizonSteps($event)"
                      class="horizon-num-input"
                    />
                    <span class="unit-tag">步 ({{ (horizonSteps() * detectedIntervalMinutes()) / 60 }} 小时)</span>
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
                    (click)="setHorizonSteps(192)"
                  >
                    48 小时 (192步)
                  </button>
                </div>
              </div>

              <div class="window-summary-alert">
                <span>🎯 <strong>执行配置：</strong>将以 <code>{{ contextStartTime() }}</code> 至 <code>{{ contextEndTime() }}</code>（共 {{ contextPointsCount() }} 点）作为输入特征，向后外推预测未来 <strong>{{ horizonSteps() }} 步（{{ (horizonSteps() * detectedIntervalMinutes()) / 60 }} 小时）</strong>的时序趋势。</span>
              </div>
            </div>
          }
        </section>
      }

      <!-- 运行中状态动画 -->
      @if (running()) {
        <section class="running-state-card">
          <div class="progress-bar-track">
            <div class="progress-bar-fill"></div>
          </div>
          <div class="step-badges">
            <span class="step-item active">1. 截取选定 {{ contextPointsCount() }} 点历史输入序列</span>
            <span class="step-item active">2. 拟合周期与趋势特征</span>
            <span class="step-item active">3. 外推预测未来 {{ horizonSteps() }} 步时序</span>
            <span class="step-item">4. 生成 95% 置信包络区间</span>
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
              <span class="file-tag">{{ res.fileName }} ({{ res.timeColumn }} ➔ {{ res.valueColumn }})</span>
            </div>
            <div class="header-actions">
              <button
                type="button"
                class="action-btn download-btn"
                (click)="downloadResultCsv()"
              >
                📥 导出预测数据
              </button>
              <button
                type="button"
                class="action-btn deep-edit-btn"
                (click)="openInWorkflowEditor()"
              >
                ⚙️ 在工作流中深度调优
              </button>
            </div>
          </header>

          <!-- 统计指标带 -->
          <div class="metrics-strip">
            <div class="metric-card">
              <span class="metric-lbl">输入历史序列 (Context)</span>
              <strong class="metric-val">{{ res.historyPoints.length }} 点 (约 {{ (res.historyPoints.length * res.intervalMinutes) / 60 }} 小时)</strong>
            </div>
            <div class="metric-card">
              <span class="metric-lbl">预测步长 (Horizon)</span>
              <strong class="metric-val highlight"
                >未来 {{ (res.horizonSteps * res.intervalMinutes) / 60 }} 小时 ({{
                  res.horizonSteps
                }}
                点)</strong
              >
            </div>
            <div class="metric-card">
              <span class="metric-lbl">采样频率</span>
              <strong class="metric-val">{{ res.intervalMinutes }} 分钟 / 点</strong>
            </div>
            <div class="metric-card">
              <span class="metric-lbl">检测主周期 / 置信度</span>
              <strong class="metric-val"
                >{{ res.seasonalitySteps }} 步长 · 95% CI</strong
              >
            </div>
          </div>

          <!-- ECharts 图表容器 -->
          <div class="chart-container">
            <div #chartHost class="chart-canvas"></div>
          </div>
        </section>
      } @else if (!running()) {
        <!-- 初始场景指引卡片 -->
        <section class="scenario-showcase">
          <div class="showcase-header">
            <h2>💡 常用试用场景</h2>
            <p>选择推荐场景，快速体验水务算法精准分析能力</p>
          </div>
          <div class="showcase-grid">
            <article class="showcase-card" (click)="onTaskChange('timeseries-forecast')">
              <span class="sc-icon">📈</span>
              <h3>时序预测</h3>
              <p>供水量外推、水厂进水流量趋势分析，辅助调度决策与峰谷平衡。</p>
              <span class="sc-action">载入配置 ➔</span>
            </article>

            <article class="showcase-card" (click)="onTaskChange('anomaly-detection')">
              <span class="sc-icon">🔍</span>
              <h3>异常突变检测</h3>
              <p>水质浊度突升、管网水压突降智能识别，秒级捕捉异常工况。</p>
              <span class="sc-action">载入配置 ➔</span>
            </article>

            <article class="showcase-card" (click)="onTaskChange('dma-leakage')">
              <span class="sc-icon">💧</span>
              <h3>DMA 分区漏损评估</h3>
              <p>夜间最小流量分析与水量平衡分解，定位暗漏候选区域。</p>
              <span class="sc-action">载入配置 ➔</span>
            </article>
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
      max-width: 1080px;
      margin: 0 auto;
      padding: 36px 20px 60px;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }
    /* 居中 Hero 品牌区 */
    .brand-hero {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
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
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 14px;
      padding: 10px 14px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.07);
      gap: 16px;
      transition: all 0.2s ease;
    }
    .quick-run-bar:focus-within {
      border-color: #0284c7;
      box-shadow: 0 12px 36px rgba(2, 132, 199, 0.14);
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
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 14px;
      padding: 18px 20px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
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
    .drop-target p {
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
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);
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
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 14px;
      padding: 24px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
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
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
    .metric-card {
      padding: 12px 14px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
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
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .showcase-card:hover {
      border-color: #0284c7;
      box-shadow: 0 8px 24px rgba(2, 132, 199, 0.12);
      transform: translateY(-2px);
    }
    .sc-icon {
      font-size: 24px;
    }
    .showcase-card h3 {
      margin: 0;
      font-size: 15px;
      color: #0f172a;
    }
    .showcase-card p {
      margin: 0;
      font-size: 12px;
      color: #64748b;
      line-height: 1.5;
      flex: 1;
    }
    .sc-action {
      font-size: 12px;
      font-weight: 700;
      color: #0284c7;
      margin-top: 6px;
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
    }
  `,
})
export class QuickTrialPage implements OnInit, AfterViewInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly quickTrial = inject(QuickTrialService);
  private readonly dataFiles = inject(DataFileService);
  private readonly notifications = inject(NotificationService);

  readonly scenarios = this.quickTrial.availableScenarios;
  readonly selectedTaskId = signal('timeseries-forecast');
  readonly selectedAlgorithm = signal('auto');
  readonly dataMode = signal<'demo' | 'upload'>('demo');
  readonly drawerOpen = signal(false);

  // Demo 版本 ID 与自定义上传临时文件
  readonly demoVersionId = signal<number>(3); // 默认 s01_leak_demo.csv 的版本 3
  readonly customUploadedFile = signal<DataFileSummary | null>(null);
  readonly customCollectionId = signal<number | null>(null);
  readonly customVersionId = signal<number | null>(null);

  // 列选择状态
  readonly selectedTimeCol = signal('record_time');
  readonly selectedValueCol = signal('inlet_flow');
  readonly selectedPointCol = signal<string | undefined>(undefined);
  readonly sampleRows = signal<Array<Record<string, unknown>>>([]);
  readonly fullFileRows = signal<Array<Record<string, unknown>>>([]);
  readonly uploading = signal(false);

  // 时序窗口与预测步长调控状态
  readonly horizonSteps = signal<number>(32); // 预测步长 (默认 32 点 / 8小时)
  readonly contextStartPercent = signal<number>(0); // 历史输入起始百分比 (0 ~ 100)
  readonly contextEndPercent = signal<number>(100); // 历史输入结束百分比 (0 ~ 100)

  // 运行与结果状态
  readonly running = signal(false);
  readonly result = signal<ForecastResult | null>(null);

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
    const pts = this.parsedTimeSeries();
    if (pts.length < 2) return 15;
    const t1 = parseDateMs(pts[0].time);
    const t2 = parseDateMs(pts[1].time);
    const diff = Math.abs(t2 - t1) / (60 * 1000);
    return diff > 0 && diff <= 1440 ? Math.round(diff) : 15;
  });

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
      : 's01_leak_demo.csv (示例)';
    const ctxCount = this.contextPointsCount() || 48;
    const horizon = this.horizonSteps();
    const hrs = ((horizon * this.detectedIntervalMinutes()) / 60).toFixed(0);
    return `${fileLabel} (${this.selectedTimeCol()} ➔ ${this.selectedValueCol()} · 输入 ${ctxCount}点 ➔ 预测 ${horizon}点/${hrs}h)`;
  });

  ngOnInit(): void {
    // 动态探测 Demo 文件版本并预读样本行与全量数据
    this.dataFiles.listCollections().subscribe({
      next: (collections) => {
        if (!collections.length) return;
        const dma = collections.find((c) => /dma|demo/i.test(c.name)) || collections[0];
        this.dataFiles.listFiles(dma.id).subscribe({
          next: (files) => {
            const demo = files.find((f) => /leak|demo/i.test(f.name)) || files[0];
            if (demo?.current_version_id) {
              this.demoVersionId.set(demo.current_version_id);
              this.dataFiles.getPreview(demo.current_version_id).subscribe({
                next: (preview) => {
                  this.sampleRows.set(preview.rows || []);
                },
              });
              this.loadFullFileVersion(demo.current_version_id);
            }
          },
        });
      },
    });
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
    const val = Math.max(4, Math.min(Number(steps) || 32, 192));
    this.horizonSteps.set(val);
  }

  switchToDemoMode(): void {
    this.dataMode.set('demo');
    this.selectedTimeCol.set('record_time');
    this.selectedValueCol.set('inlet_flow');
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
    if (taskId === 'anomaly-detection') {
      this.selectedValueCol.set('pressure');
    } else {
      this.selectedValueCol.set('inlet_flow');
    }
    setTimeout(() => this.initDrawerChart(), 40);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

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
          colNames.find((c) => /time|date|timestamp|时间/i.test(c)) ||
          colNames[0] ||
          '';
        const valCol =
          colNames.find((c) => /flow|val|pressure|metric|num|流量|压力/i.test(c)) ||
          colNames[1] ||
          colNames[0] ||
          '';
        this.selectedTimeCol.set(timeCol);
        this.selectedValueCol.set(valCol);
        this.uploading.set(false);
        this.notifications.success(`临时数据 ${file.name} 上传成功，请在下方点选输出列与调整预测窗口`);
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
    if (file && colId) {
      this.quickTrial.cleanupTemporaryFile(colId, file.id).subscribe();
    }
    this.customUploadedFile.set(null);
    this.customCollectionId.set(null);
    this.customVersionId.set(null);
    this.fullFileRows.set([]);
    this.switchToDemoMode();
  }

  onViewSelectionChange(selection: DataFileViewSelection): void {
    if (selection.output_mode === 'timeseries') {
      if (selection.time_column) this.selectedTimeCol.set(selection.time_column);
      if (selection.value_column) this.selectedValueCol.set(selection.value_column);
      this.selectedPointCol.set(selection.point_column);
      this.notifications.success(
        `已选定输入列：时间[${selection.time_column}] · 预测目标[${selection.value_column}]`,
      );
      setTimeout(() => this.initDrawerChart(), 40);
    }
  }

  onPreviewLoaded(event: { preview: DataFilePreview; sampleRows: Array<Record<string, unknown>> }): void {
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
    this.running.set(true);
    this.result.set(null);
    this.drawerOpen.set(false);

    const isCustom = Boolean(this.customUploadedFile());
    const fileName = isCustom
      ? this.customUploadedFile()!.name
      : 's01_leak_demo.csv';
    const timeCol = this.selectedTimeCol();
    const valCol = this.selectedValueCol();
    const fullRows = this.fullFileRows();
    const sampleRows = this.sampleRows();
    const currentRows = fullRows.length > 0 ? fullRows : sampleRows;
    const verId = this.activeVersionId();
    const { startIdx, endIdx } = this.selectedContextSlice();
    const horizon = this.horizonSteps();

    const execute = (effectiveRows: Array<Record<string, unknown>>) => {
      setTimeout(() => {
        this.quickTrial
          .executeQuickForecast({
            task:
              this.scenarios.find((s) => s.id === this.selectedTaskId())?.name ||
              '时序预测',
            algorithm: this.selectedAlgorithm(),
            fileName,
            timeColumn: timeCol,
            valueColumn: valCol,
            sampleRows: effectiveRows,
            inputStartIndex: startIdx,
            inputEndIndex: endIdx,
            horizonSteps: horizon,
          })
          .subscribe({
            next: (res) => {
              this.result.set(res);
              this.running.set(false);

              // 运行后清理上传的临时试用文件
              if (this.customUploadedFile() && this.customCollectionId()) {
                const fileId = this.customUploadedFile()!.id;
                const colId = this.customCollectionId()!;
                this.quickTrial.cleanupTemporaryFile(colId, fileId).subscribe();
              }

              setTimeout(() => {
                this.initChart();
              }, 40);
            },
            error: (err) => {
              this.running.set(false);
              this.notifications.error(err, '快速试用运行异常');
            },
          });
      }, 800);
    };

    if (currentRows.length === 0 && verId) {
      this.dataFiles.getPreview(verId).subscribe({
        next: (preview) => {
          this.sampleRows.set(preview.rows || []);
          execute(preview.rows || []);
        },
        error: () => {
          execute([]);
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
      this.renderForecastChart(res);
    } catch {
      // Safe fallback
    }
  }

  private renderForecastChart(res: ForecastResult): void {
    if (!this.chart) return;

    const histData = res.historyPoints.map((p) => [p.time, p.value]);
    const foreData = res.forecastPoints.map((p) => [p.time, p.value]);

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
    }

    const option: echarts.EChartsOption = {
      animation: true,
      title: {
        text: `${res.fileName} · 24小时外推时序预测`,
        left: 'center',
        top: 4,
        textStyle: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' },
      },
      legend: {
        top: 28,
        textStyle: { fontSize: 11, color: '#64748b' },
        data: ['历史观测真实值', '未来预测趋势值', '95% 置信区间'],
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
      series: [
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
          lineStyle: { opacity: 0 },
          stack: 'confidence-band',
          symbol: 'none',
          areaStyle: {
            color: 'rgba(139, 92, 246, 0.18)',
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
        {
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
        },
      ],
    };

    this.chart.setOption(option, { notMerge: true });
  }

  downloadResultCsv(): void {
    const res = this.result();
    if (!res) return;

    const rows: string[] = ['timestamp,type,value,lower_bound,upper_bound'];
    for (const p of res.historyPoints) {
      rows.push(`${p.time},history,${p.value},,`);
    }
    for (let i = 0; i < res.forecastPoints.length; i++) {
      const p = res.forecastPoints[i];
      const lower = res.lowerBand[i]?.value ?? '';
      const upper = res.upperBand[i]?.value ?? '';
      rows.push(`${p.time},forecast,${p.value},${lower},${upper}`);
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `forecast_result_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.notifications.success('预测数据 CSV 已开始下载');
  }

  openInWorkflowEditor(): void {
    void this.router.navigate(['/workflows']);
  }
}
