import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  DataAsset,
  DataQualityReport,
  DatasetChannel,
  DatasetLineage,
  DatasetLineageTree,
  DatasetVersion,
} from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { DatasetLineageTreeComponent } from '../../shared/components/dataset-lineage-tree.component';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { BeijingTimePipe } from '../../shared/pipes/beijing-time.pipe';

interface QualityDimension {
  key: string;
  name: string;
  score: number;
  percent: number;
}

interface IssueItem {
  label: string;
  count: number;
}

@Component({
  selector: 'app-dataset-detail-page',
  imports: [
    BeijingTimePipe,
    DecimalPipe,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    RouterLink,
    StatusChipComponent,
    DatasetLineageTreeComponent,
  ],
  template: `
    @if (asset(); as item) {
      <div class="page-container">
        <!-- Header -->
        <header class="head">
          <div>
            <div class="breadcrumb">
              <a routerLink="/data-sources" class="crumb-link">数据源与导入</a>
              <span class="crumb-sep">/</span>
              <span class="crumb-current">数据资产详情</span>
            </div>
            <div class="title-with-tag">
              <h1>{{ item.name }}</h1>
              <span class="source-tag" [class.csv]="item.source_type === 'csv'">
                {{ item.source_type === 'csv' ? 'CSV 上传导入' : 'MySQL 数据库接入' }}
              </span>
            </div>
            <p class="asset-desc">{{ item.description || '暂无说明' }}</p>
          </div>
          <div class="actions">
            <a mat-stroked-button routerLink="/data-sources">
              <span class="btn-icon">←</span> 返回
            </a>
            <a
              mat-flat-button
              color="primary"
              [routerLink]="['/workflows/new']"
              [queryParams]="{
                template: 'timeseries_governance_basic',
                dataset_version_id: selectedVersion()?.id,
              }"
            >
              创建治理工作流
            </a>
            @if (canDelete()) {
              <button mat-stroked-button color="warn" type="button" (click)="deleteAsset()">
                删除资产
              </button>
            }
          </div>
        </header>

        <!-- Top Summary Metric Cards -->
        <section class="summary-grid">
          <div class="metric-card">
            <div class="metric-header">
              <small>资产状态</small>
              <span class="metric-marker status" aria-hidden="true"></span>
            </div>
            <div class="status-wrap">
              <app-status-chip [status]="item.status || 'active'" />
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-header">
              <small>演进版本数</small>
              <span class="metric-marker versions" aria-hidden="true"></span>
            </div>
            <div class="metric-val">
              <strong>{{ item.version_count || versions().length }}</strong>
              <span class="metric-sub">包含导入与治理衍生</span>
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-header">
              <small>监测通道数</small>
              <span class="metric-marker channels" aria-hidden="true"></span>
            </div>
            <div class="metric-val">
              <strong>{{ item.channel_count || channels().length }}</strong>
              <span class="metric-sub">覆盖点位与指标</span>
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-header">
              <small>最新综合质量</small>
              <span class="metric-marker quality" aria-hidden="true"></span>
            </div>
            <div class="metric-val">
              <strong>{{
                item.latest_quality
                  ? item.latest_quality.grade + ' · ' + item.latest_quality.score.toFixed(1) + '分'
                  : '尚未评估'
              }}</strong>
              <span class="metric-sub">{{ item.latest_quality ? '六维质量综合加权' : '建议运行质量检查' }}</span>
            </div>
          </div>
        </section>

        <!-- 2-Column Master-Detail Workspace -->
        <div class="workspace-grid">
          <!-- Left Column: Lineage Topology & Version History -->
          <div class="main-column">
            <div class="panel graph-panel">
              <div class="panel-header">
                <div>
                  <h3>数据血缘与演进拓扑</h3>
                  <p class="panel-sub">
                    点击拓扑节点可切换右侧对应版本的详细指标、质量评估与监测通道
                  </p>
                </div>
                <div class="panel-actions">
                  @if (versions().length > 1) {
                    <button
                      mat-stroked-button
                      type="button"
                      (click)="showHistory.set(!showHistory())"
                    >
                      {{ showHistory() ? '收起版本列表' : '展开版本时间轴' }}
                    </button>
                  }
                </div>
              </div>

              @if (lineageTree(); as tree) {
                <app-dataset-lineage-tree
                  [tree]="tree"
                  [selectedVersionId]="selectedVersion()?.id ?? null"
                  (versionSelected)="selectVersionById($event)"
                />
              }

              @if (showHistory()) {
                <div class="version-timeline-grid">
                  @for (candidate of versions(); track candidate.id) {
                    <div
                      class="timeline-card"
                      [class.active]="selectedVersion()?.id === candidate.id"
                      role="button"
                      tabindex="0"
                      (click)="selectVersion(candidate)"
                      (keydown.enter)="selectVersion(candidate)"
                      (keydown.space)="$event.preventDefault(); selectVersion(candidate)"
                    >
                      <div class="card-top">
                        <span
                          class="v-badge"
                          [class.derived]="candidate.version_kind === 'derived'"
                        >
                          {{ candidate.version_kind === 'derived' ? '治理生成' : '初始导入' }}
                        </span>
                        <b>{{ versionLabel(candidate) }}</b>
                      </div>
                      <div class="card-body">
                        <span
                          >{{ candidate.record_count | number }} 条记录 ·
                          {{ candidate.storage_backend || 'MySQL' }}</span
                        >
                        <small>{{ candidate.created_at | beijingTime: 'yyyy-MM-dd HH:mm' }}</small>
                      </div>
                    </div>
                  }
                </div>
              }

              @if (lineage(); as value) {
                <div class="lineage-footer-info">
                  <span class="info-item">
                    <b>派生来源：</b>
                    {{ value.ancestors.length ? value.ancestors[0].version_code.slice(0, 12) : '原始接入' }}
                  </span>
                  <span class="info-item">
                    <b>生成任务：</b>
                    <code>{{ value.created_by_task_id || '—' }}</code>
                  </span>
                </div>
              }
            </div>
          </div>

          <!-- Right Column: Selected Version Inspector -->
          <div class="side-column">
            @if (selectedVersion(); as version) {
              <!-- Version Overview Card -->
              <div class="panel inspect-panel">
                <div class="panel-header compact">
                  <div>
                    <span class="eyebrow">当前选中版本</span>
                    <h2>{{ versionLabel(version) }}</h2>
                  </div>
                  @if (version.id === lineageTree()?.current_version_id) {
                    <span class="primary-pill">当前使用</span>
                  }
                </div>
                <p class="version-note">
                  {{ version.version_note || '基础时序治理与清洗生成的数据版本' }}
                </p>

                <div class="meta-box-grid">
                  <div class="meta-box">
                    <small>版本代码</small>
                    <code>{{ version.version_code.slice(0, 10) }}...</code>
                  </div>
                  <div class="meta-box">
                    <small>存储介质</small>
                    <strong>{{ version.storage_backend || 'MySQL / Parquet' }}</strong>
                  </div>
                  <div class="meta-box">
                    <small>数据规模</small>
                    <strong>{{ (version.record_count || 0) | number }} 条</strong>
                  </div>
                  <div class="meta-box">
                    <small>创建时间</small>
                    <span>{{ version.created_at | beijingTime: 'MM-dd HH:mm' }}</span>
                  </div>
                </div>

                <div class="quick-action-wrap">
                  <a
                    mat-flat-button
                    color="primary"
                    class="full-btn"
                    [routerLink]="['/workflows/new']"
                    [queryParams]="{
                      template: 'timeseries_governance_basic',
                      dataset_version_id: version.id,
                    }"
                  >
                    基于此版本创建治理工作流
                  </a>
                </div>
              </div>

              <!-- Quality Report Card (Visual Progress Bars & Badges) -->
              <div class="panel quality-panel">
                <div class="panel-header compact">
                  <h3>数据质量评估</h3>
                  @if (reports().length) {
                    <span class="eval-time">{{
                      reports()[0].created_at | beijingTime: 'MM-dd HH:mm'
                    }}</span>
                  }
                </div>

                @for (report of reports(); track report.report_id) {
                  <div class="quality-score-hero">
                    <div class="grade-circle" [attr.data-grade]="report.grade">
                      <span class="grade-text">{{ report.grade }}</span>
                    </div>
                    <div class="score-text-wrap">
                      <div class="big-score">
                        {{ report.score | number: '1.1-1' }} <small>分</small>
                      </div>
                      <p class="score-subtext">
                        {{
                          report.score >= 90
                            ? '数据质量优秀，可直接用于高精度算法'
                            : report.score >= 75
                              ? '质量良好，存在少量异常或毛刺'
                              : '质量偏低，建议使用治理工作流清洗'
                        }}
                      </p>
                    </div>
                  </div>

                  <!-- Dimension Bars -->
                  <div class="dimensions-wrap">
                    @for (dim of getDimensionEntries(report.dimensions); track dim.key) {
                      <div class="dim-item">
                        <div class="dim-labels">
                          <span>{{ dim.name }}</span>
                          <b>{{ dim.score | number: '1.1-1' }}%</b>
                        </div>
                        <div class="progress-track">
                          <div
                            class="progress-bar"
                            [style.width.%]="dim.percent"
                            [class.high]="dim.score >= 90"
                            [class.medium]="dim.score >= 75 && dim.score < 90"
                            [class.low]="dim.score < 75"
                          ></div>
                        </div>
                      </div>
                    }
                  </div>

                  @if (report.issue_summary && getIssueEntries(report.issue_summary).length) {
                    <div class="issue-section">
                      <small class="issue-title">异常分布明细：</small>
                      <div class="issue-chips">
                        @for (issue of getIssueEntries(report.issue_summary); track issue.label) {
                          <span class="issue-chip">
                            {{ issue.label }}: <b>{{ issue.count }}</b>
                          </span>
                        }
                      </div>
                    </div>
                  }
                } @empty {
                  <div class="empty-report">
                    <p>该版本尚未执行数据质量评估。</p>
                  </div>
                }
              </div>

              <!-- Channels Inspector -->
              <div class="panel channels-panel">
                <div class="panel-header compact">
                  <h3>监测通道明细 ({{ channels().length }})</h3>
                </div>
                <div class="channels-grid">
                  @for (
                    channel of channels();
                    track channel.monitor_point_id + channel.metric_code
                  ) {
                    <div class="channel-card">
                      <div class="ch-title">
                        <b>{{ channel.point_name }} · {{ channel.metric_name }}</b>
                      </div>
                      <div class="ch-detail">
                        <span>{{ (channel.record_count || 0) | number }} 条</span>
                        <span class="ch-unit">{{ channel.unit || '无单位' }}</span>
                      </div>
                      <div class="ch-badges">
                        @if (channel.raw_available) {
                          <span class="ch-pill raw">原始</span>
                        }
                        @if (channel.processed_available) {
                          <span class="ch-pill processed">已清洗</span>
                        }
                      </div>
                    </div>
                  } @empty {
                    <p class="muted">暂无可展示的监测通道。</p>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    } @else {
      <div class="empty">正在读取数据资产详情…</div>
    }
  `,
  styles: `
    .page-container {
      max-width: 1480px;
      margin: 0 auto;
      padding: 6px 0 32px;
    }
    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 20px;
    }
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: #64748b;
      margin-bottom: 6px;
    }
    .crumb-link {
      color: #0f5f92;
      text-decoration: none;
    }
    .crumb-link:hover {
      text-decoration: underline;
    }
    .crumb-sep {
      color: #94a3b8;
    }
    .crumb-current {
      color: #334155;
      font-weight: 500;
    }
    .title-with-tag {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .title-with-tag h1 {
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
    }
    .source-tag {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      background: #e0f2fe;
      color: #0369a1;
    }
    .source-tag.csv {
      background: #f0fdf4;
      color: #15803d;
    }
    .asset-desc {
      color: #64748b;
      font-size: 13px;
      margin: 6px 0 0;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .btn-icon {
      margin-right: 4px;
    }

    /* Top Summary Grid */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-bottom: 22px;
    }
    .metric-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 14px 18px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
    }
    .metric-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .metric-header small {
      color: #64748b;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .metric-icon {
      font-size: 14px;
      opacity: 0.8;
    }
    .status-wrap {
      margin-top: 4px;
    }
    .metric-val strong {
      display: block;
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
    }
    .metric-sub {
      display: block;
      font-size: 11px;
      color: #94a3b8;
      margin-top: 2px;
    }

    /* 2-Column Master-Detail Layout */
    .workspace-grid {
      display: grid;
      grid-template-columns: 1fr 390px;
      gap: 18px;
      align-items: flex-start;
    }
    .panel {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
      margin-bottom: 18px;
    }
    .panel:last-child {
      margin-bottom: 0;
    }
    .panel-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }
    .panel-header.compact {
      margin-bottom: 12px;
    }
    .panel-header h3 {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
    }
    .panel-sub {
      color: #64748b;
      font-size: 12px;
      margin: 4px 0 0;
    }
    .eyebrow {
      display: block;
      color: #0f5f92;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .inspect-panel h2 {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
    }
    .primary-pill {
      background: #dbeafe;
      color: #1d4ed8;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
    }
    .version-note {
      font-size: 12px;
      color: #475569;
      line-height: 1.5;
      margin: 8px 0 14px;
      background: #f8fafc;
      padding: 8px 12px;
      border-radius: 8px;
      border-left: 3px solid #0f5f92;
    }

    /* Meta Grid */
    .meta-box-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 16px;
    }
    .meta-box {
      background: #f8fafc;
      border: 1px solid #f1f5f9;
      border-radius: 8px;
      padding: 8px 10px;
    }
    .meta-box small {
      display: block;
      color: #64748b;
      font-size: 11px;
      margin-bottom: 2px;
    }
    .meta-box code {
      font-size: 12px;
      color: #0f5f92;
    }
    .meta-box strong {
      font-size: 13px;
      color: #0f172a;
    }
    .meta-box span {
      font-size: 12px;
      color: #334155;
    }

    .quick-action-wrap {
      margin-top: 12px;
    }
    .full-btn {
      width: 100%;
      height: 38px;
      font-weight: 600;
    }

    /* Quality Overview */
    .eval-time {
      font-size: 11px;
      color: #94a3b8;
    }
    .quality-score-hero {
      display: flex;
      align-items: center;
      gap: 14px;
      background: #f8fafc;
      border: 1px solid #edf2f7;
      border-radius: 10px;
      padding: 12px 16px;
      margin-bottom: 14px;
    }
    .grade-circle {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: #15803d;
      color: white;
      font-size: 24px;
      font-weight: 800;
      box-shadow: 0 4px 10px rgba(21, 128, 61, 0.25);
    }
    .grade-circle[data-grade='B'] {
      background: #0284c7;
      box-shadow: 0 4px 10px rgba(2, 132, 199, 0.25);
    }
    .grade-circle[data-grade='C'] {
      background: #d97706;
      box-shadow: 0 4px 10px rgba(217, 119, 6, 0.25);
    }
    .grade-circle[data-grade='D'] {
      background: #dc2626;
      box-shadow: 0 4px 10px rgba(220, 38, 38, 0.25);
    }
    .score-text-wrap {
      flex: 1;
    }
    .big-score {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1;
    }
    .big-score small {
      font-size: 12px;
      font-weight: normal;
      color: #64748b;
    }
    .score-subtext {
      font-size: 11px;
      color: #64748b;
      margin: 4px 0 0;
      line-height: 1.4;
    }

    /* Dimensions Progress Bars */
    .dimensions-wrap {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 14px;
    }
    .dim-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .dim-labels {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #475569;
    }
    .dim-labels b {
      color: #0f172a;
    }
    .progress-track {
      width: 100%;
      height: 6px;
      background: #f1f5f9;
      border-radius: 99px;
      overflow: hidden;
    }
    .progress-bar {
      height: 100%;
      border-radius: 99px;
      transition: width 0.3s ease;
    }
    .progress-bar.high {
      background: #15803d;
    }
    .progress-bar.medium {
      background: #0284c7;
    }
    .progress-bar.low {
      background: #d97706;
    }

    /* Issue Chips */
    .issue-section {
      border-top: 1px dashed #e2e8f0;
      padding-top: 10px;
    }
    .issue-title {
      display: block;
      color: #64748b;
      font-size: 11px;
      margin-bottom: 6px;
    }
    .issue-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .issue-chip {
      background: #f1f5f9;
      color: #475569;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 6px;
    }

    /* Channels Card */
    .channels-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 280px;
      overflow-y: auto;
    }
    .channel-card {
      background: #f8fafc;
      border: 1px solid #edf2f7;
      border-radius: 8px;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .ch-title {
      font-size: 12px;
      color: #0f172a;
    }
    .ch-detail {
      font-size: 11px;
      color: #64748b;
    }
    .ch-unit {
      margin-left: 4px;
    }
    .ch-badges {
      display: flex;
      gap: 4px;
    }
    .ch-pill {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 4px;
    }
    .ch-pill.raw {
      background: #e2e8f0;
      color: #475569;
    }
    .ch-pill.processed {
      background: #dcfce7;
      color: #15803d;
    }

    /* Version Timeline */
    .version-timeline-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 10px;
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid #f1f5f9;
    }
    .timeline-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .timeline-card:hover {
      border-color: #cbd5e1;
      transform: translateY(-1px);
    }
    .timeline-card.active {
      border-color: #0f5f92;
      background: #f0f7ff;
      box-shadow: 0 0 0 1px #0f5f92;
    }
    .card-top {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }
    .v-badge {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 4px;
      background: #e0f2fe;
      color: #0369a1;
    }
    .v-badge.derived {
      background: #dcfce7;
      color: #15803d;
    }
    .card-body span {
      display: block;
      font-size: 11px;
      color: #475569;
    }
    .card-body small {
      display: block;
      font-size: 10px;
      color: #94a3b8;
      margin-top: 2px;
    }

    .lineage-footer-info {
      display: flex;
      gap: 20px;
      font-size: 12px;
      color: #64748b;
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #edf2f7;
    }
    .info-item code {
      color: #0f5f92;
    }

    .empty-quality,
    .empty-report,
    .empty {
      padding: 24px;
      text-align: center;
      color: #94a3b8;
      font-size: 13px;
    }

    /* Detail workbench visual layer: the lineage remains the primary canvas,
       with selected-version evidence grouped in a stable inspection rail. */
    .breadcrumb {
      color: var(--sw-text-muted);
    }
    .crumb-link {
      color: var(--sw-color-primary-strong);
    }
    .crumb-sep {
      color: var(--sw-border-strong);
    }
    .crumb-current,
    .asset-desc {
      color: var(--sw-text-secondary);
    }
    .title-with-tag h1,
    .panel-header h3,
    .inspect-panel h2,
    .metric-val strong,
    .meta-box strong,
    .big-score,
    .dim-labels b,
    .ch-title {
      color: var(--sw-text-primary);
    }
    .source-tag {
      border: 1px solid color-mix(in srgb, var(--sw-color-primary) 20%, var(--sw-border));
      border-radius: var(--sw-radius-xs);
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary-strong);
    }
    .source-tag.csv {
      border-color: color-mix(in srgb, var(--sw-color-success) 22%, var(--sw-border));
      background: var(--sw-color-success-soft);
      color: var(--sw-color-secondary-strong);
    }
    .metric-card {
      position: relative;
      overflow: hidden;
      border-color: var(--sw-border);
      border-radius: var(--sw-radius-lg);
      background: linear-gradient(145deg, var(--sw-surface) 58%, var(--sw-color-primary-faint));
      box-shadow: var(--sw-shadow-sm);
    }
    .metric-card::before {
      position: absolute;
      inset: 0 auto 0 0;
      width: 3px;
      background: var(--sw-color-secondary);
      content: '';
    }
    .metric-header small,
    .metric-sub,
    .panel-sub,
    .eval-time,
    .score-subtext,
    .issue-title,
    .ch-detail,
    .card-body small,
    .lineage-footer-info {
      color: var(--sw-text-muted);
    }
    .metric-marker {
      position: relative;
      display: inline-grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border-radius: 8px;
      background: var(--sw-color-primary-soft);
    }
    .metric-marker::before {
      width: 8px;
      height: 8px;
      border: 2px solid var(--sw-color-primary);
      border-radius: 50%;
      content: '';
    }
    .metric-marker.versions::before {
      width: 12px;
      height: 10px;
      border-width: 0 0 2px 2px;
      border-radius: 0;
      transform: skewY(-26deg);
    }
    .metric-marker.channels::before {
      width: 14px;
      height: 9px;
      border-width: 0 0 2px;
      border-radius: 0;
      background: linear-gradient(135deg, transparent 42%, var(--sw-color-primary) 43% 56%, transparent 57%);
    }
    .metric-marker.quality {
      background: var(--sw-color-success-soft);
    }
    .metric-marker.quality::before {
      border-color: var(--sw-color-success);
      border-radius: 2px;
      transform: rotate(45deg);
    }
    .panel {
      border-color: var(--sw-border);
      border-radius: var(--sw-radius-lg);
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-sm);
    }
    .graph-panel {
      min-height: 640px;
    }
    .side-column {
      position: sticky;
      top: 16px;
    }
    .inspect-panel {
      border-top: 3px solid var(--sw-color-primary);
    }
    .eyebrow,
    .info-item code {
      color: var(--sw-color-primary-strong);
    }
    .primary-pill {
      border: 1px solid color-mix(in srgb, var(--sw-color-primary) 20%, var(--sw-border));
      border-radius: 999px;
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary-strong);
    }
    .version-note,
    .meta-box,
    .quality-score-hero,
    .channel-card {
      border-color: var(--sw-border);
      background: var(--sw-surface-sunken);
    }
    .version-note {
      border-left-color: var(--sw-color-primary);
      color: var(--sw-text-secondary);
    }
    .meta-box {
      min-height: 58px;
      border-radius: var(--sw-radius-sm);
    }
    .meta-box small,
    .meta-box span,
    .big-score small,
    .dim-labels,
    .card-body span {
      color: var(--sw-text-muted);
    }
    .meta-box code {
      color: var(--sw-color-primary-strong);
    }
    .quality-score-hero {
      border-left: 3px solid var(--sw-color-success);
      border-radius: var(--sw-radius-md);
    }
    .grade-circle {
      background: var(--sw-color-success);
      box-shadow: none;
    }
    .grade-circle[data-grade='B'] {
      background: var(--sw-color-primary);
      box-shadow: none;
    }
    .grade-circle[data-grade='C'] {
      background: var(--sw-color-warning);
      box-shadow: none;
    }
    .grade-circle[data-grade='D'] {
      background: var(--sw-color-danger);
      box-shadow: none;
    }
    .progress-track {
      height: 7px;
      background: var(--sw-surface-muted);
    }
    .progress-bar {
      transition: width var(--sw-motion-base) var(--sw-ease-standard);
    }
    .progress-bar.high {
      background: var(--sw-color-success);
    }
    .progress-bar.medium {
      background: var(--sw-color-primary);
    }
    .progress-bar.low {
      background: var(--sw-color-warning);
    }
    .issue-section,
    .version-timeline-grid,
    .lineage-footer-info {
      border-color: var(--sw-border);
    }
    .issue-chip,
    .ch-pill.raw {
      border: 1px solid var(--sw-border);
      background: var(--sw-color-neutral-soft);
      color: var(--sw-text-secondary);
    }
    .ch-pill.processed {
      border: 1px solid color-mix(in srgb, var(--sw-color-success) 22%, var(--sw-border));
      background: var(--sw-color-success-soft);
      color: var(--sw-color-secondary-strong);
    }
    .channel-card {
      min-height: 48px;
      border-radius: var(--sw-radius-sm);
    }
    .timeline-card {
      border-color: var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface);
      transition:
        border-color var(--sw-motion-fast) var(--sw-ease-standard),
        background-color var(--sw-motion-fast) var(--sw-ease-standard),
        box-shadow var(--sw-motion-fast) var(--sw-ease-standard);
    }
    .timeline-card:hover {
      border-color: color-mix(in srgb, var(--sw-color-primary) 35%, var(--sw-border));
      transform: none;
      box-shadow: var(--sw-shadow-sm);
    }
    .timeline-card.active {
      border-color: var(--sw-color-accent);
      background: var(--sw-color-accent-soft);
      box-shadow: 0 0 0 1px var(--sw-color-accent);
    }
    .v-badge {
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary-strong);
    }
    .v-badge.derived {
      background: var(--sw-color-success-soft);
      color: var(--sw-color-secondary-strong);
    }
    .empty-quality,
    .empty-report,
    .empty {
      border: 1px dashed var(--sw-border-strong);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-sunken);
      color: var(--sw-text-muted);
    }
    button:focus-visible,
    a:focus-visible,
    .timeline-card:focus-visible {
      outline: 2px solid var(--sw-focus);
      outline-offset: 2px;
    }

    @media (max-width: 1024px) {
      .workspace-grid {
        grid-template-columns: 1fr;
      }
      .side-column {
        position: static;
      }
      .summary-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
    @media (max-width: 640px) {
      .head {
        flex-direction: column;
      }
      .summary-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class DatasetDetailPage {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  readonly datasetId = Number(inject(ActivatedRoute).snapshot.paramMap.get('datasetId'));
  readonly asset = signal<DataAsset | null>(null);
  readonly versions = signal<DatasetVersion[]>([]);
  readonly selectedVersion = signal<DatasetVersion | null>(null);
  readonly channels = signal<DatasetChannel[]>([]);
  readonly reports = signal<DataQualityReport[]>([]);
  readonly lineage = signal<DatasetLineage | null>(null);
  readonly lineageTree = signal<DatasetLineageTree | null>(null);
  readonly showHistory = signal(false);

  private readonly dimensionNameMap: Record<string, string> = {
    completeness: '数据完整性',
    continuity: '时序连续性',
    validity: '数值有效性',
    stability: '时序平稳性',
    timeliness: '采集及时性',
    consistency: '跨通道一致性',
    uniqueness: '记录唯一性',
  };

  private readonly issueLabelMap: Record<string, string> = {
    missing_records: '缺失数据点',
    duplicate_records: '重复时间戳',
    outliers: '离群异常点',
    stale_values: '连续死值',
    frozen: '时序冻结/死值',
    jumps: '突变跳跃点',
    abnormal_range: '超量程数值',
  };

  constructor() {
    this.api.get<DataAsset>(`/api/v1/datasets/${this.datasetId}`).subscribe({
      next: (value) => this.asset.set(value),
      error: (error) => this.notifications.error(error, '无法读取数据资产。'),
    });
    this.api.get<DatasetVersion[]>(`/api/v1/datasets/${this.datasetId}/versions`).subscribe({
      next: (items) => {
        this.versions.set(items);
        if (items[0]) this.selectVersion(items[0]);
      },
      error: (error) => this.notifications.error(error, '无法读取数据版本。'),
    });
    this.api.get<DatasetLineageTree>(`/api/v1/datasets/${this.datasetId}/lineage`).subscribe({
      next: (tree) => {
        this.lineageTree.set(tree);
        const current = this.versions().find((version) => version.id === tree.current_version_id);
        if (current && this.selectedVersion()?.id !== current.id) this.selectVersion(current);
      },
      error: (error) => this.notifications.error(error, '无法读取数据版本血缘。'),
    });
  }

  selectVersion(version: DatasetVersion): void {
    this.selectedVersion.set(version);
    this.api
      .get<DatasetChannel[]>(`/api/v1/dataset-versions/${version.id}/channels`)
      .subscribe((value) => this.channels.set(value));
    this.api
      .get<DataQualityReport[]>(`/api/v1/dataset-versions/${version.id}/quality-reports`)
      .subscribe((value) => this.reports.set(value));
    this.api
      .get<DatasetLineage>(`/api/v1/dataset-versions/${version.id}/lineage`)
      .subscribe((value) => this.lineage.set(value));
  }

  selectVersionById(versionId: number): void {
    const version = this.versions().find((candidate) => candidate.id === versionId);
    if (version) this.selectVersion(version);
  }

  versionLabel(version: DatasetVersion): string {
    if (version.version_kind === 'derived') {
      const chronological = this.versions()
        .filter((item) => item.version_kind === 'derived')
        .reverse();
      return `治理生成 V${Math.max(2, chronological.findIndex((item) => item.id === version.id) + 2)}`;
    }
    return '初始导入';
  }

  getDimensionEntries(dimensions?: Record<string, number>): QualityDimension[] {
    if (!dimensions) return [];
    return Object.entries(dimensions).map(([key, score]) => {
      const rawScore = typeof score === 'number' ? score : 0;
      const normalizedScore = rawScore <= 1.0 ? rawScore * 100 : rawScore;
      return {
        key,
        name: this.dimensionNameMap[key] || key,
        score: normalizedScore,
        percent: Math.min(100, Math.max(0, normalizedScore)),
      };
    });
  }

  getIssueEntries(issues?: Record<string, number>): IssueItem[] {
    if (!issues) return [];
    return Object.entries(issues)
      .filter(([_, count]) => count > 0)
      .map(([key, count]) => ({
        label: this.issueLabelMap[key] || key,
        count,
      }));
  }

  canDelete(): boolean {
    return this.auth.hasPermission('dataset:delete') && this.asset()?.source_type === 'csv';
  }

  deleteAsset(): void {
    const item = this.asset();
    if (!item || !window.confirm(`删除数据资产“${item.name}”？删除后将进入管理员回收站。`)) return;
    this.api.delete<DataAsset>(`/api/v1/datasets/${item.id}`).subscribe({
      next: () => {
        this.notifications.success('数据资产已移入回收站。');
        void this.router.navigate(['/data-sources']);
      },
      error: (error: unknown) => this.notifications.error(error, '删除数据资产失败。'),
    });
  }
}

