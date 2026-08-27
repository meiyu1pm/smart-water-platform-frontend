import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * 通用模块占位页。
 *
 * 用于前端已规划但后端接口尚未就绪的模块（数据清洗/修复/增强/标注、API Key 等）。
 * 通过路由 data 传入模块信息，后续后端接口就绪后替换为真实页面即可，路由无需改动。
 *
 * 用法（在 app.routes.ts 中）：
 *   {
 *     path: 'data-center/cleaning',
 *     loadComponent: () => import('.../module-placeholder.component').then(m => m.ModulePlaceholderComponent),
 *     data: {
 *       moduleCode: 'data_cleaning',
 *       moduleName: '数据清洗',
 *       moduleDesc: '配置并执行数据清洗任务',
 *       expectedApi: 'GET /api/v1/data-cleaning/configs',
 *     }
 *   }
 */
@Component({
  selector: 'app-module-placeholder',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="placeholder-page">
      <div class="placeholder-card">
        <div class="icon-wrap">
          <mat-icon>build</mat-icon>
        </div>
        <h2>{{ moduleName }}</h2>
        <p class="desc">{{ moduleDesc }}</p>

        <div class="status-badge">
          <span class="dot"></span>
          前端框架已就绪 · 等待后端接口
        </div>

        @if (expectedApi) {
          <div class="api-hint">
            <small>预期接口</small>
            <code>{{ expectedApi }}</code>
          </div>
        }

        <div class="actions">
          <button mat-stroked-button (click)="goBack()">返回上一页</button>
          <button mat-flat-button routerLink="/dashboard">回到工作台</button>
        </div>

        <p class="note">
          此页面为预留占位。后端接口就绪后，只需在
          <code>core/services/</code> 中实现对应 Service 并替换本组件，路由配置无需改动。
        </p>
      </div>
    </div>
  `,
  styles: `
    .placeholder-page {
      min-height: 60vh;
      display: grid;
      place-items: center;
      padding: 32px 16px;
    }
    .placeholder-card {
      max-width: 480px;
      text-align: center;
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      padding: 40px 32px;
      box-shadow: var(--sw-shadow-sm);
    }
    .icon-wrap {
      width: 64px;
      height: 64px;
      margin: 0 auto 16px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--sw-color-warning-soft);
      color: var(--sw-color-warning);
    }
    .icon-wrap mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 22px;
      color: var(--sw-text-primary);
    }
    .desc {
      margin: 0 0 20px;
      color: var(--sw-text-secondary);
      font-size: 14px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 999px;
      background: var(--sw-color-info-soft);
      color: var(--sw-color-info);
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 20px;
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    .api-hint {
      background: var(--sw-surface-muted);
      border-radius: var(--sw-radius-md);
      padding: 12px 16px;
      margin-bottom: 24px;
      text-align: left;
    }
    .api-hint small {
      display: block;
      color: var(--sw-text-muted);
      font-size: 11px;
      margin-bottom: 4px;
    }
    .api-hint code {
      font-family: 'Cascadia Code', 'Fira Code', monospace;
      font-size: 13px;
      color: var(--sw-color-primary-strong);
      word-break: break-all;
    }
    .actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-bottom: 20px;
    }
    .note {
      margin: 0;
      font-size: 12px;
      color: var(--sw-text-muted);
      line-height: 1.6;
    }
    .note code {
      background: var(--sw-surface-muted);
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 11px;
    }
  `,
})
export class ModulePlaceholderComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** 从路由 data 读取的模块配置 */
  moduleCode = '';
  moduleName = '模块开发中';
  moduleDesc = '该模块正在建设中，敬请期待。';
  expectedApi = '';

  constructor() {
    const data = this.route.snapshot.data;
    this.moduleCode = data['moduleCode'] ?? '';
    this.moduleName = data['moduleName'] ?? '模块开发中';
    this.moduleDesc = data['moduleDesc'] ?? '该模块正在建设中，敬请期待。';
    this.expectedApi = data['expectedApi'] ?? '';
  }

  goBack(): void {
    if (window.history.length > 1) {
      this.router.navigate(['/dashboard']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}
