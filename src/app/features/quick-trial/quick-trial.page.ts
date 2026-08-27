import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
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
} from './quick-trial.service';
import { DataFileService } from '../../core/services/data-file.service';
import { DataFileSummary } from '../../core/models/api.models';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-quick-trial-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
          <label>数据输入</label>
          <div
            class="data-input-box"
            (click)="toggleDataDrawer()"
            [class.active]="drawerOpen()"
            title="点击选择或上传数据"
          >
            <span class="data-icon">{{ customUploadedFile() ? '📁' : '📊' }}</span>
            <span class="data-summary-text">{{ dataInputDisplay() }}</span>
            <span class="edit-badge">{{ drawerOpen() ? '收起' : '更换' }}</span>
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

      <!-- 数据选择与上传抽屉 -->
      @if (drawerOpen()) {
        <section class="data-drawer-panel">
          <div class="drawer-header">
            <div class="drawer-tabs">
              <button
                type="button"
                [class.active]="dataMode() === 'demo'"
                (click)="dataMode.set('demo')"
              >
                🌟 平台示例数据
              </button>
              <button
                type="button"
                [class.active]="dataMode() === 'upload'"
                (click)="dataMode.set('upload')"
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

          <!-- Demo 示例数据模式 -->
          @if (dataMode() === 'demo') {
            <div class="demo-options-grid">
              <article
                class="demo-card"
                [class.selected]="
                  selectedField() === 'inlet_flow' && !customUploadedFile()
                "
                (click)="selectDemoField('inlet_flow')"
              >
                <div class="demo-title">
                  <strong>DMA 进水总流量时序 (m³/h)</strong>
                  <span class="badge">推荐</span>
                </div>
                <p>
                  文件：<code>s01_leak_demo.csv</code> · 时间列：<code
                    >record_time</code
                  >
                  · 数值列：<code>inlet_flow</code>
                </p>
              </article>

              <article
                class="demo-card"
                [class.selected]="
                  selectedField() === 'pressure' && !customUploadedFile()
                "
                (click)="selectDemoField('pressure')"
              >
                <div class="demo-title">
                  <strong>DMA 节点水压时序 (m)</strong>
                </div>
                <p>
                  文件：<code>s01_leak_demo.csv</code> · 时间列：<code
                    >record_time</code
                  >
                  · 数值列：<code>pressure</code>
                </p>
              </article>
            </div>
          }

          <!-- 上传本地文件模式 -->
          @if (dataMode() === 'upload') {
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
                  <span>正在解析文件结构与字段 Profile...</span>
                </div>
              } @else if (customUploadedFile(); as file) {
                <div class="uploaded-file-info">
                  <div class="file-badge">
                    <span>📄 {{ file.name }}</span>
                    <button
                      type="button"
                      class="remove-file-btn"
                      (click)="clearCustomFile()"
                    >
                      移除并恢复示例
                    </button>
                  </div>
                  <div class="mapping-selectors">
                    <div class="mapping-item">
                      <label>时间列：</label>
                      <select
                        [ngModel]="selectedTimeCol()"
                        (ngModelChange)="selectedTimeCol.set($event)"
                      >
                        @for (col of uploadedColumns(); track col) {
                          <option [value]="col">{{ col }}</option>
                        }
                      </select>
                    </div>
                    <div class="mapping-item">
                      <label>预测数值列：</label>
                      <select
                        [ngModel]="selectedValueCol()"
                        (ngModelChange)="selectedValueCol.set($event)"
                      >
                        @for (col of uploadedColumns(); track col) {
                          <option [value]="col">{{ col }}</option>
                        }
                      </select>
                    </div>
                  </div>
                  <small class="temp-file-note"
                    >ℹ️
                    此文件为临时试用文件，运行得出预测结果后将自动清理回收。</small
                  >
                </div>
              } @else {
                <div class="drop-target" (click)="fileInput.click()">
                  <span class="upload-icon">☁️</span>
                  <strong>点击或拖拽上传本地 CSV 时序文件</strong>
                  <p>支持包含时间列与数值指标的标准 CSV 文件</p>
                </div>
              }
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
            <span class="step-item active">1. 时序数据特征提取</span>
            <span class="step-item active">2. 周期趋势建模</span>
            <span class="step-item active">3. 未来序列外推</span>
            <span class="step-item">4. 生成 95% 置信区间</span>
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
              <span class="file-tag">{{ res.fileName }}</span>
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
              <span class="metric-lbl">预测步长 (Horizon)</span>
              <strong class="metric-val"
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
              <span class="metric-lbl">检测主周期</span>
              <strong class="metric-val"
                >{{ res.seasonalitySteps }} 步长 (约
                {{ (res.seasonalitySteps * res.intervalMinutes) / 60 }}
                小时)</strong
              >
            </div>
            <div class="metric-card">
              <span class="metric-lbl">预测置信度</span>
              <strong class="metric-val highlight">95% 双侧置信区间</strong>
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
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 16px 20px;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.06);
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
      padding: 6px 14px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
      color: #475569;
      font-size: 12px;
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
    .demo-options-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .demo-card {
      padding: 12px 14px;
      border: 1.5px solid #e2e8f0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      background: #fafafa;
    }
    .demo-card:hover {
      border-color: #38bdf8;
      background: #f0f9ff;
    }
    .demo-card.selected {
      border-color: #0284c7;
      background: #f0f9ff;
      box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
    }
    .demo-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .demo-title strong {
      font-size: 13px;
      color: #0f172a;
    }
    .demo-title .badge {
      font-size: 10px;
      background: #22c55e;
      color: #ffffff;
      padding: 1px 6px;
      border-radius: 4px;
    }
    .demo-card p {
      margin: 0;
      font-size: 11px;
      color: #64748b;
    }
    .demo-card code {
      color: #0369a1;
      font-weight: 600;
    }
    /* 上传区域 */
    .file-input-hidden {
      display: none;
    }
    .drop-target {
      padding: 24px;
      border: 2px dashed #cbd5e1;
      border-radius: 8px;
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
    .uploaded-file-info {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .file-badge {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 700;
      font-size: 13px;
      color: #0f172a;
    }
    .remove-file-btn {
      border: none;
      background: transparent;
      color: #ef4444;
      font-size: 12px;
      cursor: pointer;
    }
    .mapping-selectors {
      display: flex;
      gap: 16px;
    }
    .mapping-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
    }
    .mapping-item select {
      padding: 4px 8px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      font-size: 12px;
    }
    .temp-file-note {
      color: #64748b;
      font-size: 11px;
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
export class QuickTrialPage implements AfterViewInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly quickTrial = inject(QuickTrialService);
  private readonly dataFiles = inject(DataFileService);
  private readonly notifications = inject(NotificationService);

  readonly scenarios = this.quickTrial.availableScenarios;
  readonly selectedTaskId = signal('timeseries-forecast');
  readonly selectedAlgorithm = signal('auto');
  readonly dataMode = signal<'demo' | 'upload'>('demo');
  readonly selectedField = signal<'inlet_flow' | 'pressure'>('inlet_flow');
  readonly drawerOpen = signal(false);

  // 上传的自定义临时文件
  readonly customUploadedFile = signal<DataFileSummary | null>(null);
  readonly customCollectionId = signal<number | null>(null);
  readonly uploadedColumns = signal<string[]>([]);
  readonly uploadedSampleRows = signal<Array<Record<string, unknown>>>([]);
  readonly selectedTimeCol = signal('record_time');
  readonly selectedValueCol = signal('inlet_flow');
  readonly uploading = signal(false);

  // 运行与结果状态
  readonly running = signal(false);
  readonly result = signal<ForecastResult | null>(null);

  @ViewChild('chartHost') chartHost?: ElementRef<HTMLDivElement>;
  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;

  readonly dataInputDisplay = computed(() => {
    if (this.customUploadedFile()) {
      return `${this.customUploadedFile()?.name} (${this.selectedTimeCol()} ➔ ${this.selectedValueCol()})`;
    }
    return `示例数据：DMA供水流量 (s01_leak_demo.csv · record_time ➔ ${this.selectedField()})`;
  });

  ngAfterViewInit(): void {
    if (this.result()) {
      this.initChart();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
    this.chart = null;
  }

  toggleDataDrawer(): void {
    this.drawerOpen.update((v) => !v);
  }

  onTaskChange(taskId: string): void {
    this.selectedTaskId.set(taskId);
    if (taskId === 'anomaly-detection') {
      this.selectedField.set('pressure');
    } else {
      this.selectedField.set('inlet_flow');
    }
  }

  selectDemoField(field: 'inlet_flow' | 'pressure'): void {
    this.clearCustomFile();
    this.selectedField.set(field);
    this.drawerOpen.set(false);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploading.set(true);
    this.quickTrial.uploadTemporaryFile(file).subscribe({
      next: (res) => {
        this.customUploadedFile.set(res.file);
        this.customCollectionId.set(res.collectionId);
        const colNames = res.preview.columns.map((c) => c.name);
        this.uploadedColumns.set(colNames);
        this.uploadedSampleRows.set(res.preview.rows || []);

        const timeCol =
          colNames.find((c) => /time|date|timestamp/i.test(c)) ||
          colNames[0] ||
          '';
        const valCol =
          colNames.find((c) => /flow|val|pressure|metric|num/i.test(c)) ||
          colNames[1] ||
          colNames[0] ||
          '';
        this.selectedTimeCol.set(timeCol);
        this.selectedValueCol.set(valCol);
        this.uploading.set(false);
        this.notifications.success(`临时数据 ${file.name} 解析就绪`);
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
    this.uploadedColumns.set([]);
    this.uploadedSampleRows.set([]);
  }

  runQuickTrial(): void {
    this.running.set(true);
    this.result.set(null);
    this.drawerOpen.set(false);

    const isCustom = Boolean(this.customUploadedFile());
    const fileName = isCustom
      ? this.customUploadedFile()!.name
      : 's01_leak_demo.csv';
    const timeCol = isCustom ? this.selectedTimeCol() : 'record_time';
    const valCol = isCustom ? this.selectedValueCol() : this.selectedField();
    const rows = isCustom ? this.uploadedSampleRows() : [];

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
          sampleRows: rows,
        })
        .subscribe({
          next: (res) => {
            this.result.set(res);
            this.running.set(false);

            // Auto cleanup uploaded temporary file after calculation
            if (this.customUploadedFile() && this.customCollectionId()) {
              const fileId = this.customUploadedFile()!.id;
              const colId = this.customCollectionId()!;
              this.quickTrial.cleanupTemporaryFile(colId, fileId).subscribe();
            }

            requestAnimationFrame(() => {
              this.initChart();
            });
          },
          error: (err) => {
            this.running.set(false);
            this.notifications.error(err, '快速试用运行异常');
          },
        });
    }, 1200);
  }

  private initChart(): void {
    if (!this.chartHost?.nativeElement || !this.result()) return;

    try {
      if (!this.chart) {
        this.chart = echarts.init(this.chartHost.nativeElement, null, {
          renderer: 'svg',
        });
        if (typeof ResizeObserver !== 'undefined') {
          this.resizeObserver = new ResizeObserver(() => {
            this.chart?.resize();
          });
          this.resizeObserver.observe(this.chartHost.nativeElement);
        }
      }
      this.renderForecastChart(this.result()!);
    } catch {
      // Safe fallback
    }
  }

  private renderForecastChart(res: ForecastResult): void {
    if (!this.chart) return;

    const histData = res.historyPoints.map((p) => [p.time, p.value]);
    const foreData = res.forecastPoints.map((p) => [p.time, p.value]);
    const lowerData = res.lowerBand.map((p) => [p.time, p.value]);
    const upperData = res.upperBand.map((p) => [p.time, p.value]);

    if (res.historyPoints.length > 0) {
      const last = res.historyPoints[res.historyPoints.length - 1];
      foreData.unshift([last.time, last.value]);
      lowerData.unshift([last.time, last.value]);
      upperData.unshift([last.time, last.value]);
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
        data: ['历史观测真实值', '未来预测趋势值', '95% 置信区间上界', '95% 置信区间下界'],
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
        {
          name: '未来预测趋势值',
          type: 'line',
          data: foreData,
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#8b5cf6', width: 2.5, type: 'dashed' },
        },
        {
          name: '95% 置信区间上界',
          type: 'line',
          data: upperData,
          smooth: true,
          showSymbol: false,
          lineStyle: { opacity: 0 },
          stack: 'confidence-band',
          symbol: 'none',
        },
        {
          name: '95% 置信区间下界',
          type: 'line',
          data: lowerData,
          smooth: true,
          showSymbol: false,
          lineStyle: { opacity: 0 },
          stack: 'confidence-band',
          symbol: 'none',
          areaStyle: {
            color: 'rgba(139, 92, 246, 0.12)',
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
