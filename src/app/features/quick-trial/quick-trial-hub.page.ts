import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { FengtaiLeakagePage } from './fengtai-leakage/fengtai-leakage.page';
import { QuickTrialPage } from './quick-trial.page';

@Component({
  selector: 'app-quick-trial-hub-page',
  standalone: true,
  imports: [MatTabsModule, QuickTrialPage, FengtaiLeakagePage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="trial-hub">
      <mat-tab-group class="trial-tabs" animationDuration="180ms" aria-label="快速试用分类">
        <mat-tab label="单算法试用"
          ><ng-template matTabContent><app-quick-trial-page></app-quick-trial-page></ng-template
        ></mat-tab>
        <mat-tab label="管网漏损闭环"
          ><ng-template matTabContent
            ><app-fengtai-leakage-page></app-fengtai-leakage-page></ng-template
        ></mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .trial-hub {
      overflow: hidden;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      background: var(--sw-page-bg);
      box-shadow: var(--sw-shadow-sm);
    }
    :host ::ng-deep .trial-tabs > .mat-mdc-tab-header {
      position: relative;
      z-index: 2;
      padding: 10px 18px;
      border-bottom: 1px solid var(--sw-border);
      background: var(--sw-surface);
    }
    :host ::ng-deep .trial-tabs .mat-mdc-tab {
      min-width: min(320px, 42vw);
      height: 44px;
      border: 1px solid transparent;
      border-radius: var(--sw-radius-sm);
      font-weight: 700;
    }
    :host ::ng-deep .trial-tabs .mat-mdc-tab.mdc-tab--active {
      border-color: color-mix(in srgb, var(--sw-color-primary) 24%, var(--sw-border));
      background: var(--sw-color-primary-faint);
    }
    :host ::ng-deep .trial-tabs .mdc-tab-indicator__content--underline {
      display: none;
    }
    :host ::ng-deep .trial-tabs .mdc-tab__text-label {
      color: var(--sw-text-secondary);
    }
    :host ::ng-deep .trial-tabs .mat-mdc-tab.mdc-tab--active .mdc-tab__text-label {
      color: var(--sw-color-primary-strong);
    }
    @media (max-width: 720px) {
      .trial-hub {
        margin: -2px;
        border-radius: var(--sw-radius-md);
      }
      :host ::ng-deep .trial-tabs > .mat-mdc-tab-header {
        padding: 7px;
      }
      :host ::ng-deep .trial-tabs .mat-mdc-tab {
        min-width: 0;
      }
    }
  `,
})
export class QuickTrialHubPage {}
