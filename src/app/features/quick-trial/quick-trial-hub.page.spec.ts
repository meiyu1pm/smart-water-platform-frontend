import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { LoginDialogService } from '../login/login-dialog.component';
import { QuickTrialHubPage } from './quick-trial-hub.page';

describe('QuickTrialHubPage login intent', () => {
  let fixture: ComponentFixture<QuickTrialHubPage>;
  let login: { requireLogin: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn>; navigateByUrl: ReturnType<typeof vi.fn> };

  async function create(params: Record<string, string> = {}): Promise<void> {
    TestBed.resetTestingModule();
    login = { requireLogin: vi.fn().mockReturnValue(of(false)) };
    router = { navigate: vi.fn(), navigateByUrl: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [QuickTrialHubPage],
      providers: [
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(params)) } },
        { provide: Router, useValue: router },
        { provide: LoginDialogService, useValue: login },
      ],
    })
      .overrideComponent(QuickTrialHubPage, { set: { template: '' } })
      .compileComponents();
    fixture = TestBed.createComponent(QuickTrialHubPage);
    fixture.detectChanges();
  }

  it('does not prompt on a plain quick-trial visit', async () => {
    await create();
    expect(login.requireLogin).not.toHaveBeenCalled();
  });

  it('opens one contextual dialog for a protected-route login intent and clears it on cancel', async () => {
    await create({ login: '1', redirect: '/workflows' });
    expect(login.requireLogin).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUrl: '/workflows', navigateOnSuccess: false }),
    );
    expect(router.navigate).toHaveBeenCalledOnce();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('clears an unsafe redirect without opening a dialog', async () => {
    await create({ login: '1', redirect: '//untrusted.example' });
    expect(login.requireLogin).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledOnce();
  });
});
