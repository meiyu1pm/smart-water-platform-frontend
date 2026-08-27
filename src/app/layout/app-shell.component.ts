import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';

import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';

interface NavChild {
  label: string;
  route: string;
  permission?: string;
  /** 标记为待后端接口的模块，显示角标 */
  pending?: boolean;
}

interface NavItem {
  label: string;
  icon: string;
  route?: string;
  permission?: string;
  badge?: number;
  children?: NavChild[];
}

@Component({
  selector: 'app-shell',
  imports: [
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
    MatTooltipModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav
        [mode]="mobile() ? 'over' : 'side'"
        [opened]="!mobile() || drawerOpen()"
        (closed)="drawerOpen.set(false)"
        class="side-nav"
      >
        <!-- 品牌 -->
        <div class="brand">
          <span class="brand-mark">
            <mat-icon>donut_large</mat-icon>
          </span>
          <div>
            <strong>AlgoSphere</strong>
            <small>算法资产与场景中台</small>
          </div>
        </div>

        <mat-divider />

        <!-- 主导航 -->
        <nav class="nav-list">
          @for (item of visibleItems(); track item.label) {
            @if (item.children) {
              <!-- 可折叠分组 -->
              <div class="nav-group">
                <button
                  type="button"
                  class="nav-group-toggle"
                  [class.expanded]="expandedGroups()[item.label]"
                  (click)="toggleGroup(item.label)"
                >
                  <mat-icon class="nav-icon">{{ item.icon }}</mat-icon>
                  <span class="nav-label">{{ item.label }}</span>
                  <mat-icon class="chevron" [class.rotated]="expandedGroups()[item.label]">
                    chevron_right
                  </mat-icon>
                </button>
                @if (expandedGroups()[item.label]) {
                  <div class="nav-children">
                    @for (child of item.children; track child.route) {
                      <a
                        class="nav-child"
                        [routerLink]="child.route"
                        routerLinkActive="active-child"
                        (click)="closeDrawer()"
                      >
                        <span class="child-dot"></span>
                        <span>{{ child.label }}</span>
                        @if (child.pending) {
                          <span class="pending-tag">待接口</span>
                        }
                      </a>
                    }
                  </div>
                }
              </div>
            } @else {
              <!-- 单级菜单项 -->
              <a
                class="nav-item"
                [routerLink]="item.route!"
                routerLinkActive="active-item"
                (click)="closeDrawer()"
              >
                <mat-icon class="nav-icon">{{ item.icon }}</mat-icon>
                <span class="nav-label">{{ item.label }}</span>
                @if (item.badge) {
                  <span class="nav-badge">{{ item.badge }}</span>
                }
              </a>
            }
          }
        </nav>

        <div class="nav-spacer"></div>

        <!-- 工作区卡片 -->
        <div class="workspace-card">
          <div class="ws-icon">
            <mat-icon>business</mat-icon>
          </div>
          <div class="ws-info">
            <strong>哈工大联合项目</strong>
            <small>专业工作区 · 68% 已使用</small>
            <div class="ws-bar">
              <div class="ws-bar-fill" style="width: 68%"></div>
            </div>
          </div>
        </div>

        <!-- 用户区 -->
        <div class="user-section">
          @if (auth.user(); as user) {
            <div class="user-avatar">{{ avatarText(user.display_name || user.username) }}</div>
            <div class="user-info">
              <strong>{{ user.display_name || user.username }}</strong>
              <small>{{ user.roles.join('、') || '用户' }}</small>
            </div>
            <button mat-icon-button type="button" class="user-more" [matTooltip]="'更多操作'" (click)="userMenuOpen.set(!userMenuOpen())">
              <mat-icon>more_vert</mat-icon>
            </button>
            @if (userMenuOpen()) {
              <div class="user-menu">
                <button type="button" (click)="cancelAccount()">注销账户</button>
                <button type="button" (click)="logout()">退出登录</button>
              </div>
            }
          }
        </div>
      </mat-sidenav>

      <mat-sidenav-content>
        <mat-toolbar class="top-bar">
          @if (mobile()) {
            <button mat-icon-button type="button" class="menu-button" (click)="drawerOpen.set(true)">
              <mat-icon>menu</mat-icon>
            </button>
          }
          <span class="top-title">{{ currentPageTitle() }}</span>
          <span class="spacer"></span>
          @if (auth.user(); as user) {
            <button mat-icon-button type="button" matTooltip="通知">
              <mat-icon>notifications_none</mat-icon>
            </button>
            <button mat-icon-button type="button" matTooltip="帮助" (click)="openDocs()">
              <mat-icon>help_outline</mat-icon>
            </button>
          }
        </mat-toolbar>
        <main class="content" [class.workspace-content]="workspace()"><router-outlet /></main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .shell {
      height: 100vh;
      background: var(--sw-page-bg);
    }
    .side-nav {
      width: 260px;
      border-right: 1px solid #cfe0f5;
      background: linear-gradient(180deg, #eef5fd 0%, #e6f0fb 100%);
      display: flex;
      flex-direction: column;
    }
    .side-nav .mat-mdc-divider {
      --mdc-divider-color: #cfe0f5;
    }

    /* 品牌 */
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px 18px 16px;
    }
    .brand-mark {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, #1e3a5f 0%, #0f5f92 100%);
      color: white;
      display: grid;
      place-items: center;
    }
    .brand-mark mat-icon {
      font-size: 22px;
      width: 22px;
      height: 22px;
    }
    .brand strong {
      display: block;
      font-size: 16px;
      font-weight: 800;
      color: var(--sw-text-primary);
      letter-spacing: -0.3px;
    }
    .brand small {
      display: block;
      margin-top: 2px;
      color: var(--sw-text-muted);
      font-size: 11px;
    }

    /* 导航列表 */
    .nav-list {
      padding: 8px 10px;
      flex: 1;
      overflow-y: auto;
    }
    .nav-item,
    .nav-group-toggle {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px 12px;
      border: none;
      background: transparent;
      border-radius: 8px;
      color: var(--sw-text-secondary);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.15s, color 0.15s;
      text-align: left;
    }
    .nav-item:hover,
    .nav-group-toggle:hover {
      background: rgba(255, 255, 255, 0.65);
      color: var(--sw-text-primary);
    }
    .nav-item.active-item {
      background: rgba(15, 95, 146, 0.12);
      color: var(--sw-color-primary-strong);
      font-weight: 700;
    }
    .nav-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }
    .nav-label {
      flex: 1;
    }
    .nav-badge {
      background: var(--sw-color-danger);
      color: white;
      font-size: 11px;
      font-weight: 700;
      padding: 1px 7px;
      border-radius: 999px;
      min-width: 18px;
      text-align: center;
    }
    .chevron {
      font-size: 18px;
      width: 18px;
      height: 18px;
      transition: transform 0.2s;
      color: var(--sw-text-muted);
    }
    .chevron.rotated {
      transform: rotate(90deg);
    }

    /* 子菜单 */
    .nav-group {
      margin-bottom: 2px;
    }
    .nav-children {
      padding-left: 32px;
      margin-top: 2px;
    }
    .nav-child {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      border-radius: 6px;
      color: var(--sw-text-secondary);
      font-size: 13px;
      text-decoration: none;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .nav-child:hover {
      background: rgba(255, 255, 255, 0.6);
      color: var(--sw-text-primary);
    }
    .nav-child.active-child {
      color: var(--sw-color-primary-strong);
      font-weight: 600;
    }
    .child-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--sw-border-strong);
      flex-shrink: 0;
    }
    .nav-child.active-child .child-dot {
      background: var(--sw-color-primary);
    }
    .pending-tag {
      margin-left: auto;
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--sw-color-warning-soft);
      color: var(--sw-color-warning);
      font-weight: 600;
    }

    .nav-spacer {
      flex: 1;
    }

    /* 工作区卡片 */
    .workspace-card {
      margin: 8px 12px;
      padding: 12px;
      background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%);
      border-radius: 10px;
      display: flex;
      gap: 10px;
      color: white;
    }
    .ws-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.15);
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }
    .ws-icon mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .ws-info {
      flex: 1;
      min-width: 0;
    }
    .ws-info strong {
      display: block;
      font-size: 13px;
      font-weight: 700;
    }
    .ws-info small {
      display: block;
      font-size: 11px;
      opacity: 0.75;
      margin: 2px 0 6px;
    }
    .ws-bar {
      height: 4px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
      overflow: hidden;
    }
    .ws-bar-fill {
      height: 100%;
      background: #54b5e8;
      border-radius: 2px;
    }

    /* 用户区 */
    .user-section {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-top: 1px solid #cfe0f5;
    }
    .user-avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: linear-gradient(135deg, #0f5f92, #087f8c);
      color: white;
      display: grid;
      place-items: center;
      font-size: 13px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .user-info {
      flex: 1;
      min-width: 0;
    }
    .user-info strong {
      display: block;
      font-size: 13px;
      color: var(--sw-text-primary);
    }
    .user-info small {
      display: block;
      font-size: 11px;
      color: var(--sw-text-muted);
    }
    .user-more {
      color: var(--sw-text-muted);
    }
    .user-menu {
      position: absolute;
      bottom: 100%;
      right: 10px;
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: 8px;
      box-shadow: var(--sw-shadow-lg);
      padding: 4px;
      min-width: 140px;
      z-index: 100;
    }
    .user-menu button {
      display: block;
      width: 100%;
      padding: 8px 12px;
      border: none;
      background: transparent;
      text-align: left;
      font-size: 13px;
      color: var(--sw-text-secondary);
      border-radius: 6px;
      cursor: pointer;
    }
    .user-menu button:hover {
      background: var(--sw-surface-muted);
      color: var(--sw-text-primary);
    }

    /* 顶栏 */
    .top-bar {
      background: var(--sw-surface);
      border-bottom: 1px solid var(--sw-border);
      color: var(--sw-text-primary);
      height: 56px;
    }
    .top-title {
      font-size: 15px;
      font-weight: 600;
    }
    .spacer {
      flex: 1;
    }
    .menu-button {
      margin-right: 8px;
    }
    .content {
      min-width: 0;
      padding: 24px;
      max-width: 1440px;
      margin: 0 auto;
      width: 100%;
    }
    .workspace-content {
      max-width: none;
      height: calc(100vh - 56px);
      padding: 0;
      overflow: hidden;
    }

    @media (max-width: 800px) {
      .side-nav {
        width: min(82vw, 280px);
      }
      .content {
        padding: 14px;
      }
    }
  `,
})
export class AppShellComponent {
  readonly auth = inject(AuthService);
  readonly mobile = signal(typeof window !== 'undefined' && window.innerWidth <= 800);
  readonly drawerOpen = signal(false);
  readonly userMenuOpen = signal(false);
  readonly workspace = signal(false);
  readonly expandedGroups = signal<Record<string, boolean>>({
    数据中心: true,
    开发者工具: false,
  });

  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  private readonly items: NavItem[] = [
    {
      label: '工作台',
      icon: 'dashboard',
      route: '/dashboard',
      badge: 0, // 运行中任务数，后续可动态绑定
    },
    {
      label: '数据中心',
      icon: 'folder',
      children: [
        { label: '数据集管理', route: '/data-sources', permission: 'data_source:read' },
        { label: '数据评估', route: '/data-center/assessment' },
        { label: '数据清洗', route: '/data-center/cleaning', pending: true },
        { label: '数据修复', route: '/data-center/repair', pending: true },
        { label: '数据增强', route: '/data-center/augmentation', pending: true },
        { label: '数据标注', route: '/data-center/annotation', pending: true },
      ],
    },
    {
      label: '算法中控',
      icon: 'memory',
      route: '/operators',
      permission: 'operator:read',
    },
    {
      label: '场景编排',
      icon: 'account_tree',
      route: '/workflows',
      permission: 'workflow:read',
    },
    {
      label: '开发者工具',
      icon: 'code',
      children: [
        { label: 'API Key', route: '/developer/api-keys', pending: true },
        { label: '开发文档', route: '/developer/docs' },
      ],
    },
  ];

  readonly visibleItems = computed(() =>
    this.items.map((item) => {
      if (!item.children) return item;
      return {
        ...item,
        children: item.children.filter((c) => !c.permission || this.auth.hasPermission(c.permission)),
      };
    }),
  );

  /** 根据当前路由计算页面标题（顶栏显示） */
  readonly currentPageTitle = computed(() => {
    const url = this.router.url;
    const titleMap: Array<[RegExp, string]> = [
      [/^\/dashboard/, '工作台'],
      [/^\/data-sources/, '数据中心 · 数据集管理'],
      [/^\/datasets\//, '数据中心 · 数据集详情'],
      [/^\/data-center\/assessment/, '数据中心 · 数据评估'],
      [/^\/data-center\/cleaning/, '数据中心 · 数据清洗'],
      [/^\/data-center\/repair/, '数据中心 · 数据修复'],
      [/^\/data-center\/augmentation/, '数据中心 · 数据增强'],
      [/^\/data-center\/annotation/, '数据中心 · 数据标注'],
      [/^\/operators\/import/, '算法中控 · 外部算法导入'],
      [/^\/operators/, '算法中控 · 算子中心'],
      [/^\/workflows\/new/, '场景编排 · 新建工作流'],
      [/^\/workflows\/.+\/edit/, '场景编排 · 工作流编辑器'],
      [/^\/workflows\//, '场景编排 · 工作流详情'],
      [/^\/workflows/, '场景编排 · 工作流库'],
      [/^\/workflow-runs\//, '场景编排 · 运行详情'],
      [/^\/workflow-runs/, '场景编排 · 运行记录'],
      [/^\/scenes/, '场景中心'],
      [/^\/s01-leakage/, '场景编排 · S01 漏损评估'],
      [/^\/s01\/runs/, '场景编排 · S01 运行结果'],
      [/^\/tasks\//, '任务中心 · 任务详情'],
      [/^\/tasks/, '任务中心'],
      [/^\/results\//, '算法结果'],
      [/^\/users/, '用户管理'],
      [/^\/recycle-bin/, '资源回收站'],
      [/^\/developer\/api-keys/, '开发者工具 · API Key'],
      [/^\/developer\/docs/, '开发者工具 · 开发文档'],
    ];
    for (const [pattern, title] of titleMap) {
      if (pattern.test(url)) return title;
    }
    return 'AlgoSphere';
  });

  constructor() {
    this.workspace.set(this.isWorkspaceUrl(this.router.url));
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.workspace.set(this.isWorkspaceUrl(event.urlAfterRedirects));
        this.userMenuOpen.set(false);
      });
  }

  toggleGroup(label: string): void {
    this.expandedGroups.update((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  avatarText(name: string): string {
    return name.slice(0, 1).toUpperCase();
  }

  openDocs(): void {
    window.open('https://schwarz-hal.github.io/smart-water-platform-docs/', '_blank', 'noopener');
  }

  private isWorkspaceUrl(url: string): boolean {
    return /\/workflows\/[^/]+\/edit(?:\?|$)/.test(url);
  }

  @HostListener('window:resize')
  updateViewport(): void {
    this.mobile.set(window.innerWidth <= 800);
    if (!this.mobile()) this.drawerOpen.set(false);
  }

  closeDrawer(): void {
    if (this.mobile()) this.drawerOpen.set(false);
  }

  logout(): void {
    this.auth.clearSession();
    void this.router.navigate(['/login']);
  }

  cancelAccount(): void {
    const user = this.auth.user();
    if (!user) return;
    this.userMenuOpen.set(false);
    const username = window.prompt(
      `账户注销后，资源将进入回收站并保留 14 天。\n请输入用户名 ${user.username} 确认：`,
    );
    if (username !== user.username) return;
    const password = window.prompt('请输入当前密码：');
    if (!password) return;
    this.auth.cancelAccount(username, password).subscribe({
      next: () => {
        this.auth.clearSession();
        void this.router.navigate(['/login']);
      },
      error: (error: unknown) => this.notifications.error(error, '账户注销失败。'),
    });
  }
}
