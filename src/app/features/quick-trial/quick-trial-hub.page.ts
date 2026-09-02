import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs';

import { LoginDialogService } from '../login/login-dialog.component';
import { FengtaiLeakagePage } from './fengtai-leakage/fengtai-leakage.page';
import { QuickTrialPage } from './quick-trial.page';

@Component({
  selector: 'app-quick-trial-hub-page',
  standalone: true,
  imports: [MatTabsModule, QuickTrialPage, FengtaiLeakagePage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-tab-group animationDuration="0ms" aria-label="快速试用分类">
      <mat-tab label="单算法试用"
        ><ng-template matTabContent><app-quick-trial-page></app-quick-trial-page></ng-template
      ></mat-tab>
      <mat-tab label="丰泰风光苑漏损闭环"
        ><ng-template matTabContent
          ><app-fengtai-leakage-page
            (requiresLogin)="openLogin()"
          ></app-fengtai-leakage-page></ng-template
      ></mat-tab>
    </mat-tab-group>
  `,
})
export class QuickTrialHubPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);

  ngOnInit(): void {
    this.route.queryParamMap.pipe(take(1)).subscribe((params) => {
      if (params.get('login') !== '1') return;
      this.openLogin(params.get('redirect') || undefined);
    });
  }

  openLogin(redirectUrl?: string): void {
    this.loginDialog.requireLogin(redirectUrl).subscribe((authenticated) => {
      if (authenticated || this.route.snapshot.queryParamMap.get('login') !== '1') return;
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { login: null, redirect: null },
        queryParamsHandling: 'merge',
      });
    });
  }
}
