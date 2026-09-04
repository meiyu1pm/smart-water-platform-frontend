import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type SwIconName =
  | 'activity'
  | 'book'
  | 'building'
  | 'calendar'
  | 'chart'
  | 'chevron-down'
  | 'close'
  | 'dashboard'
  | 'database'
  | 'droplet'
  | 'file'
  | 'flask'
  | 'folder'
  | 'history'
  | 'info'
  | 'login'
  | 'logout'
  | 'menu'
  | 'operators'
  | 'play'
  | 'recycle'
  | 'scene'
  | 'search'
  | 'settings'
  | 'shield'
  | 'tasks'
  | 'upload'
  | 'user-remove'
  | 'users'
  | 'workflow';

const paths: Record<SwIconName, string> = {
  activity: 'M3 12h4l2.5-7 5 14 2.5-7H21',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21V5.5ZM20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5A2.5 2.5 0 0 1 20 21V5.5Z',
  building: 'M4 21V5l8-3 8 3v16M8 8h1M8 12h1M8 16h1M15 8h1M15 12h1M15 16h1M10 21v-3h4v3',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm2-2v4m10-4v4M3 9h18M7 13h3M14 13h3M7 17h3',
  chart: 'M4 20V10m6 10V4m6 16v-7m5 7H3',
  'chevron-down': 'm7 9 5 5 5-5',
  close: 'm6 6 12 12M18 6 6 18',
  dashboard: 'M4 4h6v6H4V4Zm10 0h6v10h-6V4ZM4 14h6v6H4v-6Zm10 4h6v2h-6v-2Z',
  database:
    'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  droplet: 'M12 2S5.5 9.2 5.5 14.2A6.5 6.5 0 0 0 18.5 14.2C18.5 9.2 12 2 12 2Z',
  file: 'M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6M9 17h6',
  flask: 'M9 3h6M10 3v5l-5.5 9.2A2.5 2.5 0 0 0 6.7 21h10.6a2.5 2.5 0 0 0 2.2-3.8L14 8V3M7.5 16h9',
  folder:
    'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  info: 'M12 8h.01M11 12h1v4h1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  login: 'M10 17l5-5-5-5M15 12H3M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5',
  logout: 'm14 17 5-5-5-5M19 12H7M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  operators:
    'M8 3v3M16 3v3M8 18v3M16 18v3M3 8h3M18 8h3M3 16h3M18 16h3M7 7h10v10H7V7Zm3 3h4v4h-4v-4Z',
  play: 'M8 5v14l11-7L8 5Z',
  recycle:
    'm7.5 4 2-2 2 2M9.5 2v5M5.2 8.2A7 7 0 0 0 7 19M16.5 20l-2 2-2-2m2 2v-5m4.3-1.2A7 7 0 0 0 17 5',
  scene: 'M4 6l8-3 8 3-8 3-8-3Zm0 6 8 3 8-3M4 17l8 4 8-4',
  search: 'm21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8 3 1.5-1-2-3.5-1.8.7a7 7 0 0 0-1.2-.7L16.2 5h-4l-.3 2.5a7 7 0 0 0-1.6.9L8 7.4l-2 3.5L7.6 12a7 7 0 0 0 0 1.8L6 15l2 3.5 2.3-1a7 7 0 0 0 1.6.9l.3 2.5h4l.3-2.5a7 7 0 0 0 1.6-.9l2.3 1 2-3.5-1.6-1.1A7 7 0 0 0 20 12Z',
  shield: 'M12 3 4.5 6v5.5c0 4.6 3.1 7.8 7.5 9.5 4.4-1.7 7.5-4.9 7.5-9.5V6L12 3Zm-3 9 2 2 4-4',
  tasks: 'M8 4h8M9 3h6v3H9V3ZM6 5H4v16h16V5h-2M8 11h8M8 15h8',
  upload: 'm12 16V4m0 0-4 4m4-4 4 4M5 15v5h14v-5',
  'user-remove': 'M15 20a7 7 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-1h6',
  users:
    'M16 20a6 6 0 0 0-12 0M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 0a3 3 0 1 0 0-6M22 20a5 5 0 0 0-5-5',
  workflow: 'M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a2 2 0 0 1 2 2V14M8 10v4a2 2 0 0 0 2 2h4',
};

@Component({
  selector: 'app-sw-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      [style.width.px]="size()"
      [style.height.px]="size()"
    >
      <path [attr.d]="path()"></path>
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: 0 0 auto;
      line-height: 0;
    }
    svg {
      display: block;
    }
  `,
})
export class SwIconComponent {
  readonly name = input.required<SwIconName>();
  readonly size = input(18);
  readonly path = computed(() => paths[this.name()]);
}
