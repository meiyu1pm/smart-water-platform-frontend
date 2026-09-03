import { Component, Injectable, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { Observable, finalize, map } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-login-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <div class="dialog-shell">
      <div class="logo">SW</div>
      <div>
        <h2>登录智慧水务平台</h2>
        <p>登录后可以上传数据、运行分析并查看个人工作流。</p>
      </div>
      <form [formGroup]="form" (ngSubmit)="submit()">
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
          >
            {{ loading() ? '正在登录…' : '登录并继续' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .dialog-shell {
      width: min(390px, calc(100vw - 48px));
      padding: 26px;
      display: grid;
      gap: 14px;
    }
    .logo {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      background: var(--sw-color-primary);
      color: white;
      font-weight: 800;
    }
    h2 {
      margin: 0 0 6px;
      color: var(--sw-text-primary);
      font-size: 21px;
    }
    p {
      margin: 0;
      color: var(--sw-text-secondary);
      line-height: 1.6;
    }
    form {
      display: grid;
      gap: 4px;
    }
    mat-form-field {
      width: 100%;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `,
})
export class LoginDialogComponent {
  readonly dialog = inject(MatDialogRef<LoginDialogComponent, boolean>);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  readonly loading = signal(false);
  readonly form = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', Validators.required],
  });

  submit(): void {
    if (this.form.invalid || this.loading()) return;
    this.loading.set(true);
    const { username, password } = this.form.getRawValue();
    this.auth
      .login(username, password)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => this.dialog.close(true),
        error: (error: unknown) => this.notifications.error(error, '登录失败，请检查账号和密码。'),
      });
  }
}

@Injectable({ providedIn: 'root' })
export class LoginDialogService {
  private readonly dialogs = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  requireLogin(redirectUrl?: string): Observable<boolean> {
    if (this.auth.isAuthenticated()) {
      return new Observable<boolean>((subscriber) => {
        subscriber.next(true);
        subscriber.complete();
      });
    }
    return this.dialogs
      .open(LoginDialogComponent, { autoFocus: 'first-tabbable', restoreFocus: true })
      .afterClosed()
      .pipe(
        map((authenticated) => {
          const ready = authenticated === true;
          if (ready && redirectUrl) void this.router.navigateByUrl(redirectUrl);
          return ready;
        }),
      );
  }
}
