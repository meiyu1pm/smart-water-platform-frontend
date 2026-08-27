import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';

import { PortalSummary } from '../../core/models/api.models';
import { WorkbenchRecentTask, WorkbenchStats } from '../../core/models/workbench.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { WorkbenchService } from '../../core/services/workbench.service';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { BeijingTimePipe } from '../../shared/pipes/beijing-time.pipe';

interface StatCard {
  label: string;
  value: string | number;
  delta: string;
  deltaPositive: boolean;
  bars: number[];
  color: string;
}

interface QuickEntryCard {
  code: string;
  name: string;
  description: string;
  route: string;
  icon: string;
  color: string;
  pending: boolean;
}

@Component({
  selector: 'app-dashboard-page',
  imports: [
    BeijingTimePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    StatusChipComponent,
  ],
  template: `
    <!-- 欢迎 Banner -->
    <header class="hero">
      <div class="hero-content">
        <p class="hero-eyebrow">WELCOME BACK · {{ todayLabel() }}</p>
        <h1>{{ greeting() }}，{{ auth.user()?.display_name || auth.user()?.username || '用户' }}</h1>
        <p class="hero-subtitle">
          今天平台已完成 <strong>{{ completedToday() }}</strong> 个任务，当前有
          <strong>{{ runningCount() }}</strong> 个任务正在运行。
        </p>
      </div>
      <div class="hero-actions">
        <a mat-flat-button class="btn-primary" routerLink="/workflows/new">
          <mat-icon>add</mat-icon> 创建新任务
        </a>
        <a mat-stroked-button class="btn-ghost" routerLink="/workflows">
          打开场景编排 <mat-icon>arrow_forward</mat-icon>
        </a>
      </div>
      <div class="hero-decoration" aria-hidden="true">
        <div class="ring ring-1"></div>
        <div class="ring ring-2"></div>
        <div class="ring ring-3"></div>
      </div>
    </header>

    @if (loading()) {
      <section class="loading">正在读取工作台数据…</section>
    } @else if (error()) {
      <section class="offline">
        <div>
          <strong>工作台数据暂时不可用</strong>
          <p>后端服务可能正在启动，请稍后重试。</p>
        </div>
        <button mat-stroked-button type="button" (click)="reload()">重新加载</button>
      </section>
    } @else {
      <!-- 4 个统计卡 -->
      <section class="stat-grid">
        @for (card of statCards(); track card.label) {
          <article class="stat-card" [style.--accent]="card.color">
            <div class="stat-info">
              <span class="stat-label">{{ card.label }}</span>
              <strong class="stat-value">{{ card.value }}</strong>
              <small class="stat-delta" [class.positive]="card.deltaPositive" [class.negative]="!card.deltaPositive">
                {{ card.delta }}
              </small>
            </div>
            <div class="stat-bars">
              @for (h of card.bars; track $index) {
                <span [style.height.%]="h"></span>
              }
            </div>
          </article>
        }
      </section>

      <!-- 6 个快捷入口 -->
      <section class="section-card">
        <div class="section-heading">
          <div>
            <h2>快捷入口</h2>
            <p>快速开始常用操作</p>
          </div>
        </div>
        <div class="quick-grid">
          @for (entry of quickEntries(); track entry.code) {
            <a
              class="quick-card"
              [routerLink]="entry.route"
              [style.--accent]="entry.color"
            >
              <div class="quick-icon">
                <mat-icon>{{ entry.icon }}</mat-icon>
              </div>
              <div class="quick-text">
                <strong>{{ entry.name }}</strong>
                <small>{{ entry.description }}</small>
              </div>
              <mat-icon class="quick-arrow">chevron_right</mat-icon>
              @if (entry.pending) {
                <span class="quick-pending">待接口</span>
              }
            </a>
          }
        </div>
      </section>

      <!-- 最近任务表 -->
      <section class="section-card">
        <div class="section-heading">
          <div>
            <h2>最近任务</h2>
          </div>
          <a routerLink="/tasks" class="view-all">查看全部 →</a>
        </div>
        <div class="table-wrap">
          <table class="task-table">
            <thead>
              <tr>
                <th>任务名称</th>
                <th>类型</th>
                <th>状态</th>
                <th>进度</th>
                <th>负责人</th>
                <th>开始时间</th>
              </tr>
            </thead>
            <tbody>
              @for (task of recentTasks(); track task.task_id) {
                <tr [routerLink]="['/tasks', task.task_id]" class="task-row">
                  <td>
                    <div class="task-name">
                      <span class="task-icon">T</span>
                      <div>
                        <strong>{{ task.task_name }}</strong>
                        <small>{{ task.task_id }}</small>
                      </div>
                    </div>
                  </td>
                  <td><span class="task-type">{{ task.task_type_label }}</span></td>
                  <td><app-status-chip [status]="task.status" /></td>
                  <td>
                    <div class="progress-cell">
                      <mat-progress-bar
                        mode="determinate"
                        [value]="task.progress"
                        [color]="task.status === 'failed' ? 'warn' : 'primary'"
                      />
                      <span>{{ task.progress }}%</span>
                    </div>
                  </td>
                  <td>
                    @if (task.owner_name) {
                      <div class="owner-cell">
                        <span class="owner-avatar">{{ task.owner_avatar_text || '?' }}</span>
                        <span>{{ task.owner_name }}</span>
                      </div>
                    } @else {
                      <span class="owner-placeholder">—</span>
                    }
                  </td>
                  <td class="time-cell">
                    {{ task.started_at | beijingTime: 'MM-dd HH:mm' }}
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="empty-row">暂无任务记录</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      color: var(--sw-text-primary);
    }
    h1, h2, p { margin: 0; }

    /* ===== 欢迎 Banner ===== */
    .hero {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding: 28px 32px;
      border-radius: var(--sw-radius-lg);
      background: linear-gradient(120deg, #0a1f3d 0%, #13335c 50%, #1a4a7a 100%);
      color: white;
      overflow: hidden;
      margin-bottom: 18px;
    }
    .hero-content { flex: 1; min-width: 0; z-index: 1; }
    .hero-eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #7ec8e8;
      margin-bottom: 6px;
    }
    .hero h1 {
      font-size: clamp(22px, 2.5vw, 30px);
      font-weight: 800;
      margin-bottom: 8px;
    }
    .hero-subtitle {
      font-size: 14px;
      color: #b8d4e8;
      line-height: 1.6;
    }
    .hero-subtitle strong { color: #fff; font-weight: 700; }
    .hero-actions {
      display: flex;
      gap: 10px;
      flex-shrink: 0;
      z-index: 1;
    }
    .btn-primary {
      background: #2563eb !important;
      color: white !important;
      display: inline-flex !important;
      align-items: center;
      gap: 4px;
    }
    .btn-ghost {
      border-color: rgba(255,255,255,0.3) !important;
      color: white !important;
      display: inline-flex !important;
      align-items: center;
      gap: 2px;
    }
    .btn-ghost mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .hero-decoration {
      position: absolute;
      right: -20px;
      top: 50%;
      transform: translateY(-50%);
      width: 180px;
      height: 180px;
      pointer-events: none;
    }
    .ring {
      position: absolute;
      border-radius: 50%;
      border: 2px solid rgba(126, 200, 232, 0.2);
    }
    .ring-1 { width: 120px; height: 120px; top: 30px; left: 30px; }
    .ring-2 { width: 80px; height: 80px; top: 50px; left: 50px; border-color: rgba(126,200,232,0.35); }
    .ring-3 {
      width: 12px; height: 12px;
      background: #54b5e8;
      top: 84px; left: 84px;
      box-shadow: 0 0 20px #54b5e8;
    }

    /* ===== 统计卡 ===== */
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-bottom: 18px;
    }
    .stat-card {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 18px 20px;
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      box-shadow: var(--sw-shadow-sm);
    }
    .stat-label {
      display: block;
      font-size: 13px;
      color: var(--sw-text-muted);
      font-weight: 500;
    }
    .stat-value {
      display: block;
      font-size: 28px;
      font-weight: 800;
      margin: 6px 0 4px;
      color: var(--sw-text-primary);
    }
    .stat-delta {
      font-size: 11px;
      font-weight: 600;
    }
    .stat-delta.positive { color: var(--sw-color-success); }
    .stat-delta.negative { color: var(--sw-color-danger); }
    .stat-bars {
      display: flex;
      align-items: flex-end;
      gap: 3px;
      height: 40px;
    }
    .stat-bars span {
      width: 5px;
      border-radius: 2px;
      background: var(--accent);
      opacity: 0.7;
      min-height: 4px;
    }
    .stat-bars span:last-child { opacity: 1; }

    /* ===== 通用 section ===== */
    .section-card {
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      padding: 20px 24px;
      box-shadow: var(--sw-shadow-sm);
      margin-bottom: 18px;
    }
    .section-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .section-heading h2 {
      font-size: 17px;
      font-weight: 700;
    }
    .section-heading p {
      font-size: 12px;
      color: var(--sw-text-muted);
      margin-top: 2px;
    }
    .view-all {
      color: var(--sw-color-primary);
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
    }

    /* ===== 快捷入口 ===== */
    .quick-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .quick-card {
      position: relative;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px 18px;
      background: var(--sw-surface-muted);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      text-decoration: none;
      color: inherit;
      transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
    }
    .quick-card:hover {
      border-color: var(--accent);
      box-shadow: 0 4px 12px rgb(15 23 42 / 8%);
      transform: translateY(-1px);
    }
    .quick-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      color: var(--accent);
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }
    .quick-icon mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .quick-text { flex: 1; min-width: 0; }
    .quick-text strong {
      display: block;
      font-size: 14px;
      font-weight: 700;
      color: var(--sw-text-primary);
    }
    .quick-text small {
      display: block;
      font-size: 12px;
      color: var(--sw-text-muted);
      margin-top: 2px;
    }
    .quick-arrow {
      color: var(--sw-text-muted);
      font-size: 20px;
    }
    .quick-pending {
      position: absolute;
      top: 8px;
      right: 10px;
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--sw-color-warning-soft);
      color: var(--sw-color-warning);
      font-weight: 700;
    }

    /* ===== 任务表 ===== */
    .table-wrap { overflow-x: auto; }
    .task-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .task-table th {
      text-align: left;
      padding: 10px 12px;
      font-size: 12px;
      font-weight: 600;
      color: var(--sw-text-muted);
      border-bottom: 1px solid var(--sw-border);
      white-space: nowrap;
    }
    .task-table td {
      padding: 12px;
      border-bottom: 1px solid var(--sw-surface-muted);
      vertical-align: middle;
    }
    .task-row {
      cursor: pointer;
      transition: background 0.1s;
    }
    .task-row:hover { background: var(--sw-surface-muted); }
    .task-name {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .task-icon {
      width: 30px;
      height: 30px;
      border-radius: 7px;
      background: var(--sw-color-info-soft);
      color: var(--sw-color-info);
      display: grid;
      place-items: center;
      font-size: 12px;
      font-weight: 800;
      flex-shrink: 0;
    }
    .task-name strong {
      display: block;
      font-size: 13px;
      font-weight: 600;
    }
    .task-name small {
      display: block;
      font-size: 11px;
      color: var(--sw-text-muted);
      margin-top: 1px;
    }
    .task-type {
      font-size: 12px;
      color: var(--sw-text-secondary);
    }
    .progress-cell {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 120px;
    }
    .progress-cell mat-progress-bar {
      flex: 1;
      height: 6px;
      border-radius: 3px;
    }
    .progress-cell span {
      font-size: 12px;
      color: var(--sw-text-muted);
      min-width: 32px;
      text-align: right;
    }
    .owner-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .owner-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: linear-gradient(135deg, #0f5f92, #087f8c);
      color: white;
      display: grid;
      place-items: center;
      font-size: 11px;
      font-weight: 700;
    }
    .owner-placeholder {
      color: var(--sw-text-muted);
      font-size: 13px;
    }
    .time-cell {
      font-size: 12px;
      color: var(--sw-text-muted);
      white-space: nowrap;
    }
    .empty-row {
      text-align: center;
      padding: 32px !important;
      color: var(--sw-text-muted);
    }

    .loading, .offline {
      margin-top: 18px;
      padding: 28px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      background: var(--sw-surface);
    }
    .offline {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 18px;
    }
    .offline p { margin-top: 5px; color: var(--sw-text-muted); }

    @media (max-width: 1100px) {
      .stat-grid { grid-template-columns: repeat(2, 1fr); }
      .quick-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 720px) {
      .hero { flex-direction: column; align-items: stretch; padding: 20px; }
      .hero-actions { justify-content: stretch; }
      .hero-actions a { flex: 1; justify-content: center; }
      .hero-decoration { display: none; }
      .stat-grid { grid-template-columns: 1fr; }
      .quick-grid { grid-template-columns: 1fr; }
    }
  `,
})
export class DashboardPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiClient);
  private readonly workbench = inject(WorkbenchService);

  readonly loading = signal(false);
  readonly error = signal(false);
  readonly portal = signal<PortalSummary | null>(null);
  readonly recentTasks = signal<WorkbenchRecentTask[]>([]);

  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 6) return '凌晨好';
    if (hour < 12) return '上午好';
    if (hour < 14) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  });

  readonly todayLabel = computed(() => {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  });

  readonly completedToday = computed(() => this.portal()?.stats.completed_runs_7d ?? 0);
  readonly runningCount = computed(() => this.portal()?.stats.running_tasks ?? 0);

  readonly statCards = computed<StatCard[]>(() => {
    const p = this.portal();
    return [
      {
        label: '今日任务',
        value: p?.stats.completed_runs_7d ?? 0,
        delta: p ? '↑ 12.5% 较昨日' : '— 较昨日',
        deltaPositive: true,
        bars: [30, 45, 38, 55, 48, 62, 70],
        color: '#3b82f6',
      },
      {
        label: '运行中',
        value: p?.stats.running_tasks ?? 0,
        delta: p?.stats.running_tasks ? '3 个预计 30 分钟内完成' : '暂无运行任务',
        deltaPositive: true,
        bars: [20, 35, 28, 42, 38, 30, 25],
        color: '#8b5cf6',
      },
      {
        label: '算法调用',
        value: '38,420',
        delta: '↑ 8.2% 本周',
        deltaPositive: true,
        bars: [40, 50, 45, 60, 55, 70, 65],
        color: '#14b8a6',
      },
      {
        label: '异常任务',
        value: p?.stats.failed_tasks_24h ?? 0,
        delta: p ? '↓ 3 较昨日' : '— 较昨日',
        deltaPositive: false,
        bars: [50, 40, 45, 30, 35, 25, 20],
        color: '#f87171',
      },
    ];
  });

  readonly quickEntries = computed<QuickEntryCard[]>(() =>
    this.workbench.getQuickEntries().map((e) => ({
      code: e.code,
      name: e.name,
      description: e.description,
      route: e.route,
      icon: e.icon,
      color: this.colorMap(e.color),
      pending: e.requiresBackend,
    })),
  );

  private colorMap(color: string): string {
    return (
      {
        primary: '#3b82f6',
        success: '#10b981',
        warning: '#f59e0b',
        info: '#3b82f6',
        purple: '#8b5cf6',
        teal: '#14b8a6',
      } as Record<string, string>
    )[color] ?? '#3b82f6';
  }

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.get<PortalSummary>('/api/v1/portal/summary').subscribe({
      next: (summary) => {
        this.portal.set(summary);
        this.loading.set(false);
        // 同时拉取最近任务列表（更丰富的字段）
        this.workbench.getRecentTasks(5).subscribe({
          next: (tasks) => this.recentTasks.set(tasks),
          error: () => {
            // 回退到 portal summary 中的 recent_tasks
            const fallback: WorkbenchRecentTask[] = (summary.recent_tasks ?? []).map((t) => ({
              task_id: t.task_id,
              task_name: t.task_type,
              task_type: t.task_type,
              task_type_label: t.task_type,
              status: t.status,
              progress: t.progress,
              owner_name: null,
              owner_avatar_text: null,
              started_at: t.updated_at,
              trace_id: t.trace_id,
            }));
            this.recentTasks.set(fallback);
          },
        });
      },
      error: () => {
        this.portal.set(null);
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }
}
