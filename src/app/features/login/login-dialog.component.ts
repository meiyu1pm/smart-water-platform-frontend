import { Component, Injectable, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { Observable, finalize, map } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { safeInternalRedirect } from '../../core/routing/route-access-policy';
import { SwIconComponent } from '../../shared/components/sw-icon.component';

export interface LoginDialogContext {
  title?: string;
  description?: string;
  reason?: string;
  redirectUrl?: string;
  navigateOnSuccess?: boolean;
}

@Component({
  selector: 'app-login-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    SwIconComponent,
  ],
  template: `
    <div class="dialog-shell">
      <header class="dialog-heading">
        <div class="logo"><app-sw-icon name="droplet" [size]="22" /></div>
        <div>
          <span class="eyebrow">账号验证</span>
          <h2>{{ context.title || '登录智慧水务平台' }}</h2>
          <p>{{ context.description || '登录后可以上传数据、运行分析并查看个人工作流。' }}</p>
        </div>
      </header>
      <form [formGroup]="form" (ngSubmit)="submit()">
        @if (errorMessage()) {
          <div class="login-error" role="alert" aria-live="assertive">{{ errorMessage() }}</div>
        }
        <mat-form-field appearance="outline">
          <mat-label>用户名</mat-label>
          <input matInput formControlName="username" autocomplete="username" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>密码</mat-label>
          <input
            matInput
            type="password"
            formControlName="password"
            autocomplete="current-password"
          />
        </mat-form-field>
        <div class="actions">
          <button mat-button type="button" [disabled]="loading()" (click)="dialog.close(false)">
            暂不登录
          </button>
          <button
            mat-flat-button
            color="primary"
            type="submit"
            [disabled]="form.invalid || loading()"
            [attr.aria-busy]="loading()"
          >
            @if (!loading()) {
              <app-sw-icon name="login" [size]="17" />
            }
            {{ loading() ? '正在验证账号…' : '登录并继续' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .dialog-shell {
      width: min(430px, calc(100vw - 32px));
      padding: 28px;
      display: grid;
      gap: 22px;
      box-sizing: border-box;
      color: var(--sw-text-primary);
      background: var(--sw-surface);
    }
    .dialog-heading {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      gap: 14px;
    }
    .logo {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border: 1px solid color-mix(in srgb, var(--sw-color-primary) 26%, var(--sw-border));
      border-radius: var(--sw-radius-md);
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary-strong);
    }
    .eyebrow {
      display: block;
      margin: 1px 0 3px;
      color: var(--sw-color-primary);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h2 {
      margin: 0 0 5px;
      color: var(--sw-text-primary);
      font-size: 22px;
      line-height: 1.3;
    }
    p {
      margin: 0;
      color: var(--sw-text-secondary);
      line-height: 1.6;
    }
    form {
      display: grid;
      gap: 6px;
    }
    .login-error {
      padding: 9px 11px;
      border: 1px solid color-mix(in srgb, var(--sw-color-danger) 36%, var(--sw-border));
      border-radius: var(--sw-radius-sm);
      background: color-mix(in srgb, var(--sw-color-danger) 8%, var(--sw-surface));
      color: var(--sw-color-danger);
      font-size: 13px;
      line-height: 1.5;
    }
    mat-form-field {
      width: 100%;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 2px;
    }
    .actions button {
      min-height: 42px;
    }
    .actions app-sw-icon {
      margin-right: 6px;
      vertical-align: -3px;
    }
    @media (max-width: 520px) {
      .dialog-shell {
        padding: 22px 20px;
      }
      .actions {
        align-items: stretch;
        flex-direction: column-reverse;
      }
      .actions button {
        width: 100%;
      }
    }
  `,
})
export class LoginDialogComponent {
  readonly dialog = inject(MatDialogRef<LoginDialogComponent, boolean>);
  readonly context = inject<LoginDialogContext>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly form = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', Validators.required],
  });

  submit(): void {
    if (this.form.invalid || this.loading()) return;
    this.errorMessage.set('');
    this.loading.set(true);
    const { username, password } = this.form.getRawValue();
    this.auth
      .login(username, password)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => this.dialog.close(true),
        error: (error: unknown) => {
          this.errorMessage.set('登录失败，请检查账号和密码后重试。');
          this.notifications.error(error, '登录失败，请检查账号和密码。');
        },
      });
  }
}

@Injectable({ providedIn: 'root' })
export class LoginDialogService {
  private readonly dialogs = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  requireLogin(request: LoginDialogContext | string = {}): Observable<boolean> {
    const context = typeof request === 'string' ? { redirectUrl: request } : request;
    if (this.auth.isAuthenticated()) {
      return new Observable<boolean>((subscriber) => {
        subscriber.next(true);
        subscriber.complete();
      });
    }
    return this.dialogs
      .open(LoginDialogComponent, {
        autoFocus: 'first-tabbable',
        restoreFocus: true,
        data: context,
        ariaLabel: context.title || '登录智慧水务平台',
      })
      .afterClosed()
      .pipe(
        map((authenticated) => {
          const ready = authenticated === true;
          const redirectUrl = safeInternalRedirect(context.redirectUrl);
          if (ready && redirectUrl && context.navigateOnSuccess !== false)
            void this.router.navigateByUrl(redirectUrl);
          return ready;
        }),
      );
  }
}
