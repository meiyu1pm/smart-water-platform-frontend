import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';

import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { LoginDialogService } from '../features/login/login-dialog.component';
import { SwIconComponent, SwIconName } from '../shared/components/sw-icon.component';

interface NavigationItem {
  label: string;
  route: string;
  icon: SwIconName;
  permission?: string;
}

interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

@Component({
  selector: 'app-shell',
  imports: [
    MatButtonModule,
    MatSidenavModule,
    MatToolbarModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    SwIconComponent,
  ],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav
        [mode]="mobile() ? 'over' : 'side'"
        [opened]="!mobile() || drawerOpen()"
        (closed)="drawerOpen.set(false)"
        class="side-nav"
      >
        <div class="brand">
          <span class="brand-mark"><app-sw-icon name="droplet" [size]="22" /></span>
          <div><strong>智慧水务</strong><small>分析与决策平台</small></div>
        </div>
        <nav class="navigation" aria-label="平台主导航">
          @for (group of visibleGroups(); track group.label) {
            <section class="nav-group">
              <p>{{ group.label }}</p>
              @for (item of group.items; track item.route) {
                <a [routerLink]="item.route" routerLinkActive="active-link" (click)="closeDrawer()">
                  <app-sw-icon [name]="item.icon" [size]="18" />
                  <span>{{ item.label }}</span>
                </a>
              }
            </section>
          }
          <section class="nav-group nav-support">
            <p>支持</p>
            <a
              href="https://schwarz-hal.github.io/smart-water-platform-docs/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <app-sw-icon name="book" [size]="18" />
              <span>文档中心</span>
            </a>
          </section>
        </nav>
        <div class="nav-footer">
          <app-sw-icon name="activity" [size]="18" />
          <div><strong>统一分析工作台</strong><small>数据、算子与任务协同管理</small></div>
        </div>
      </mat-sidenav>
      <mat-sidenav-content>
        <mat-toolbar class="top-bar">
          @if (mobile()) {
            <button
              mat-button
              type="button"
              class="menu-button sw-icon-button"
              aria-label="打开主导航"
              (click)="drawerOpen.set(true)"
            >
              <app-sw-icon name="menu" [size]="21" />
            </button>
          }
          <div class="page-context">
            <span>智慧水务工作台</span>
            <strong>{{ currentPageTitle() }}</strong>
          </div>
          <span class="spacer"></span>
          @if (auth.user(); as user) {
            <div class="account-summary">
              <span class="avatar">{{ userInitial() }}</span>
              <span class="user-name"
                ><strong>{{ user.display_name || user.username }}</strong
                ><small>{{ user.roles.join('、') }}</small></span
              >
            </div>
            <button
              mat-button
              class="account-action danger-action"
              type="button"
              (click)="cancelAccount()"
            >
              <app-sw-icon name="user-remove" [size]="17" />注销账户
            </button>
            <button mat-button class="account-action" type="button" (click)="logout()">
              <app-sw-icon name="logout" [size]="17" />退出
            </button>
          } @else {
            <button
              mat-flat-button
              color="primary"
              type="button"
              class="login-button"
              (click)="openLogin()"
            >
              <app-sw-icon name="login" [size]="17" />登录
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
      width: 252px;
      border-right: 0;
      background:
        radial-gradient(circle at 10% -10%, rgb(35 145 173 / 28%), transparent 220px),
        var(--sw-nav-bg);
      color: var(--sw-nav-text);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 78px;
      padding: 18px 20px;
      border-bottom: 1px solid rgb(255 255 255 / 9%);
    }
    .brand-mark {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border: 1px solid rgb(255 255 255 / 22%);
      border-radius: 12px;
      background: linear-gradient(145deg, #169ac0, #0b6d88);
      color: white;
      box-shadow: 0 8px 22px rgb(0 20 30 / 24%);
    }
    .brand strong {
      display: block;
      color: #f4fbfd;
      font-size: 15px;
      letter-spacing: 0.02em;
    }
    .brand small {
      display: block;
      margin-top: 2px;
      color: var(--sw-nav-muted);
      font-size: 11px;
    }
    .navigation {
      height: calc(100vh - 154px);
      padding: 10px 12px 18px;
      overflow-y: auto;
    }
    .nav-group {
      display: grid;
      gap: 3px;
      margin-top: 12px;
    }
    .nav-group > p {
      margin: 0 10px 5px;
      color: var(--sw-nav-muted);
      font-size: 10px;
      font-weight: 750;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .nav-group a {
      display: flex;
      align-items: center;
      gap: 11px;
      min-height: 40px;
      padding: 0 11px;
      border: 1px solid transparent;
      border-radius: 9px;
      color: var(--sw-nav-text);
      font-size: 13px;
      font-weight: 560;
      text-decoration: none;
      transition:
        color var(--sw-motion-fast) var(--sw-ease-standard),
        background-color var(--sw-motion-fast) var(--sw-ease-standard),
        border-color var(--sw-motion-fast) var(--sw-ease-standard);
    }
    .nav-group a:hover {
      border-color: rgb(255 255 255 / 9%);
      background: rgb(255 255 255 / 7%);
      color: white;
    }
    .active-link {
      border-color: rgb(116 213 232 / 18%) !important;
      background: linear-gradient(90deg, rgb(31 155 184 / 30%), rgb(31 155 184 / 12%)) !important;
      color: white !important;
      font-weight: 700 !important;
      box-shadow: inset 3px 0 0 #54c6dd;
    }
    .nav-support {
      padding-top: 11px;
      border-top: 1px solid rgb(255 255 255 / 8%);
    }
    .nav-footer {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 76px;
      padding: 14px 20px;
      border-top: 1px solid rgb(255 255 255 / 9%);
      background: rgb(0 17 25 / 16%);
    }
    .nav-footer strong,
    .nav-footer small {
      display: block;
    }
    .nav-footer strong {
      color: #dff4f7;
      font-size: 11px;
    }
    .nav-footer small {
      margin-top: 2px;
      color: var(--sw-nav-muted);
      font-size: 10px;
    }
    .nav-footer > app-sw-icon {
      color: #6fd2df;
    }

    .top-bar {
      min-height: 72px;
      padding: 0 24px;
      background: var(--sw-surface);
      border-bottom: 1px solid var(--sw-border);
      color: var(--sw-text-primary);
      box-shadow: 0 1px 0 rgb(15 45 61 / 2%);
    }
    .page-context {
      display: grid;
      gap: 1px;
      line-height: 1.2;
    }
    .page-context span {
      color: var(--sw-text-muted);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }
    .page-context strong {
      font-size: 16px;
      font-weight: 720;
    }
    .spacer {
      flex: 1;
    }
    .account-summary {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-right: 8px;
      padding-right: 15px;
      border-right: 1px solid var(--sw-border);
    }
    .avatar {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary-strong);
      font-size: 13px;
      font-weight: 850;
    }
    .user-name {
      display: grid;
      gap: 1px;
      color: var(--sw-text-secondary);
      font-size: 12px;
      line-height: 1.25;
    }
    .user-name strong {
      color: var(--sw-text-primary);
      font-size: 12px;
    }
    .user-name small {
      color: var(--sw-text-muted);
      font-size: 10px;
    }
    .account-action,
    .login-button {
      gap: 6px;
    }
    .danger-action {
      color: var(--sw-color-danger);
    }
    .content {
      min-width: 0;
      min-height: calc(100vh - 72px);
      padding: 26px 28px 40px;
      max-width: var(--sw-content-max);
      margin: 0 auto;
    }
    .workspace-content {
      max-width: none;
      height: calc(100vh - 72px);
      min-height: 0;
      padding: 0;
      overflow: hidden;
    }
    .menu-button {
      margin: 0 10px 0 -8px;
    }
    @media (max-width: 800px) {
      .side-nav {
        width: min(82vw, 300px);
      }
      .content {
        min-height: calc(100vh - 64px);
        padding: 16px 14px 28px;
      }
      .top-bar {
        min-height: 64px;
        padding-inline: 14px;
      }
      .page-context span,
      .user-name,
      .danger-action {
        display: none;
      }
      .account-summary {
        padding-right: 9px;
      }
      .workspace-content {
        height: calc(100vh - 64px);
      }
    }
  `,
})
export class AppShellComponent {
  readonly auth = inject(AuthService);
  readonly mobile = signal(typeof window !== 'undefined' && window.innerWidth <= 800);
  readonly drawerOpen = signal(false);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly loginDialog = inject(LoginDialogService);
  readonly workspace = signal(false);
  readonly currentPageTitle = signal('快速试用');
  readonly userInitial = computed(() => {
    const user = this.auth.user();
    return (user?.display_name || user?.username || 'U').trim().slice(0, 1).toUpperCase();
  });
  private readonly groups: NavigationGroup[] = [
    {
      label: '开始',
      items: [
        { label: '快速试用', route: '/quick-trial', icon: 'flask' },
        { label: '平台概览', route: '/dashboard', icon: 'dashboard' },
      ],
    },
    {
      label: '数据与分析',
      items: [
        { label: '场景中心', route: '/scenes', icon: 'scene', permission: 'workflow:read' },
        {
          label: '数据源与导入',
          route: '/data-sources',
          icon: 'database',
          permission: 'data_source:read',
        },
        {
          label: '数据集管理',
          route: '/data-collections',
          icon: 'folder',
          permission: 'data_source:read',
        },
        { label: '算子中心', route: '/operators', icon: 'operators', permission: 'operator:read' },
      ],
    },
    {
      label: '运行与管理',
      items: [
        { label: '工作流', route: '/workflows', icon: 'workflow', permission: 'workflow:read' },
        {
          label: '运行记录',
          route: '/workflow-runs',
          icon: 'history',
          permission: 'workflow:read',
        },
        { label: '任务中心', route: '/tasks', icon: 'tasks', permission: 'task:read' },
        { label: '用户管理', route: '/users', icon: 'users', permission: 'user:manage' },
        {
          label: '资源回收站',
          route: '/recycle-bin',
          icon: 'recycle',
          permission: 'recycle:manage',
        },
      ],
    },
  ];
  readonly visibleGroups = computed(() =>
    this.groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => !item.permission || this.auth.hasPermission(item.permission),
        ),
      }))
      .filter((group) => group.items.length > 0),
  );

  constructor() {
    this.workspace.set(this.isWorkspaceUrl(this.router.url));
    this.currentPageTitle.set(this.resolvePageTitle(this.router.url));
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.workspace.set(this.isWorkspaceUrl(event.urlAfterRedirects));
        this.currentPageTitle.set(this.resolvePageTitle(event.urlAfterRedirects));
      });
  }

  private isWorkspaceUrl(url: string): boolean {
    return /\/workflows\/[^/]+\/edit(?:\?|$)/.test(url);
  }

  private resolvePageTitle(url: string): string {
    const path = url.split('?')[0];
    const item = this.groups
      .flatMap((group) => group.items)
      .find((candidate) => path === candidate.route || path.startsWith(`${candidate.route}/`));
    return item?.label ?? '智慧水务平台';
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
    void this.router.navigate(['/quick-trial']);
  }

  openLogin(): void {
    this.loginDialog.requireLogin().subscribe();
  }

  cancelAccount(): void {
    const user = this.auth.user();
    if (!user) return;
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
