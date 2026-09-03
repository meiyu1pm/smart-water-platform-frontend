import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';

const authPath = (url: string) =>
  url.includes('/api/v1/auth/login') || url.includes('/api/v1/auth/refresh');
const publicPath = (url: string) => url.includes('/api/v1/public/');

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const notifications = inject(NotificationService);

  // Public read facades must not carry a stale identity or start refresh work.
  if (authPath(request.url) || publicPath(request.url)) {
    return next(request);
  }

  const authorize = () => {
    const token = auth.accessToken();
    return token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
  };

  return next(authorize()).pipe(
    catchError((error: unknown) => {
      const canRetry =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !request.headers.has('X-Smart-Water-Auth-Retry') &&
        !!auth.accessToken();

      if (!canRetry) {
        if (!(error instanceof HttpErrorResponse && error.status === 401)) {
          notifications.error(error);
        }
        return throwError(() => error);
      }

      return auth.refreshAccessToken().pipe(
        switchMap(() =>
          next(authorize().clone({ setHeaders: { 'X-Smart-Water-Auth-Retry': '1' } })),
        ),
        catchError((refreshError: unknown) => {
          notifications.error(refreshError, '登录状态已失效，请重新登录。');
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
