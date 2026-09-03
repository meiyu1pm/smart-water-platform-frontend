import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, Validators, NonNullableFormBuilder } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { SwIconComponent } from '../../shared/components/sw-icon.component';

@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    SwIconComponent,
  ],
  template: `
    <section class="login-page">
      <mat-card class="login-card">
        <header class="heading">
          <div class="logo"><app-sw-icon name="droplet" [size]="22" /></div>
          <div>
            <span class="eyebrow">SMART WATER PLATFORM</span>
            <h1>{{ registering() ? '注册平台账号' : '欢迎回来' }}</h1>
            <p>{{
              registering()
                ? '注册后即可上传数据并创建分析工作流。'
                : '登录后继续进行水务数据分析与工作流编排。'
            }}</p>
          </div>
        </header>
        <form [formGroup]="form" (ngSubmit)="submit()">
          @if (registering()) {
            <mat-form-field appearance="outline"
              ><mat-label>显示名称</mat-label
              ><input matInput formControlName="displayName" autocomplete="name"
            /></mat-form-field>
          }
          <mat-form-field appearance="outline"
            ><mat-label>用户名</mat-label
            ><input matInput formControlName="username" autocomplete="username"
          /></mat-form-field>
          <mat-form-field appearance="outline"
            ><mat-label>密码</mat-label
            ><input
              matInput
              type="password"
              formControlName="password"
              autocomplete="current-password"
          /></mat-form-field>
          @if (registering()) {
            <mat-form-field appearance="outline"
              ><mat-label>确认密码</mat-label
              ><input
                matInput
                type="password"
                formControlName="confirmPassword"
                autocomplete="new-password"
            /></mat-form-field>
          }
          <button
            mat-flat-button
            color="primary"
            type="submit"
            [disabled]="form.invalid || loading()"
            [attr.aria-busy]="loading()"
          >
            @if (!loading()) {
              <app-sw-icon [name]="registering() ? 'users' : 'login'" [size]="17" />
            }
            {{ loading() ? '正在处理…' : registering() ? '创建账号' : '登录并继续' }}
          </button>
        </form>
        <button mat-button type="button" class="mode" (click)="toggleMode()">
          {{ registering() ? '已有账号，返回登录' : '没有账号？注册' }}
        </button>
      </mat-card>
    </section>
  `,
  styles: `
    .login-page {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      box-sizing: border-box;
      background:
        radial-gradient(
          circle at 78% 12%,
          color-mix(in srgb, var(--sw-color-secondary) 14%, transparent),
          transparent 32rem
        ),
        linear-gradient(145deg, var(--sw-surface-muted), var(--sw-page-bg));
    }
    .login-card {
      width: min(460px, 100%);
      padding: 34px;
      box-sizing: border-box;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-lg);
    }
    .heading {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      gap: 15px;
    }
    .logo {
      width: 46px;
      height: 46px;
      display: grid;
      place-items: center;
      border: 1px solid color-mix(in srgb, var(--sw-color-primary) 26%, var(--sw-border));
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary-strong);
      border-radius: var(--sw-radius-md);
    }
    .eyebrow {
      color: var(--sw-color-primary);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.09em;
    }
    h1 {
      margin: 4px 0 6px;
      font-size: 24px;
      color: var(--sw-text-primary);
      line-height: 1.25;
    }
    p {
      margin: 0;
      color: var(--sw-text-secondary);
      line-height: 1.6;
    }
    form {
      display: grid;
      gap: 6px;
      margin: 26px 0 16px;
    }
    mat-form-field {
      width: 100%;
    }
    button {
      height: 44px;
    }
    form > button app-sw-icon {
      margin-right: 6px;
      vertical-align: -3px;
    }
    .mode {
      width: 100%;
      color: var(--sw-color-primary-strong);
    }
    @media (max-width: 520px) {
      .login-page {
        padding: 14px;
      }
      .login-card {
        padding: 25px 20px;
      }
    }
  `,
})
export class LoginPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(NotificationService);
  readonly loading = signal(false);
  readonly registering = signal(false);
  readonly form = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    displayName: [''],
    password: ['', Validators.required],
    confirmPassword: [''],
  });

  submit(): void {
    if (this.form.invalid || this.loading()) {
      return;
    }
    this.loading.set(true);
    const { username, displayName, password, confirmPassword } = this.form.getRawValue();
    if (this.registering()) {
      if (!displayName.trim()) {
        this.notifications.error(new Error('请输入显示名称。'));
        return;
      }
      if (password.length < 12) {
        this.notifications.error(new Error('密码至少需要 12 个字符。'));
        return;
      }
      if (password !== confirmPassword) {
        this.notifications.error(new Error('两次输入的密码不一致。'));
        return;
      }
      this.loading.set(true);
      this.auth
        .register(username, displayName, password)
        .pipe(finalize(() => this.loading.set(false)))
        .subscribe({
          next: () => {
            this.notifications.success('注册成功，请登录。');
            this.registering.set(false);
            this.form.patchValue({ displayName: '', password: '', confirmPassword: '' });
          },
          error: (error: unknown) => this.notifications.error(error, '注册失败。'),
        });
      return;
    }
    this.auth
      .login(username, password)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          const redirect = this.route.snapshot.queryParamMap.get('redirect') || '/dashboard';
          void this.router.navigateByUrl(redirect);
        },
        error: (error: unknown) => this.notifications.error(error, '用户名或密码错误。'),
      });
  }

  toggleMode(): void {
    this.registering.update((value) => !value);
    this.form.patchValue({ displayName: '', password: '', confirmPassword: '' });
  }
}
