import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withNavigationErrorHandler } from '@angular/router';

import { authInterceptor } from './core/interceptors/auth.interceptor';
import { FrontendReleaseRecoveryService } from './core/services/frontend-release-recovery.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(
      routes,
      withNavigationErrorHandler((error) =>
        inject(FrontendReleaseRecoveryService).handleNavigationError(error),
      ),
    ),
  ],
};
