import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

const CHUNK_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module',
  'chunkloaderror',
  'loading chunk',
  'importing a module script failed',
  'expected a javascript-or-wasm module script',
];

function errorMessages(error: unknown): string[] {
  const messages: string[] = [];
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (current && !visited.has(current)) {
    visited.add(current);
    if (typeof current === 'string') {
      messages.push(current);
      break;
    }
    if (current instanceof Error) messages.push(current.message);
    if (typeof current !== 'object') break;
    const candidate = current as { message?: unknown; error?: unknown; cause?: unknown };
    if (typeof candidate.message === 'string') messages.push(candidate.message);
    current = candidate.error ?? candidate.cause;
  }
  return messages;
}

export function isFrontendChunkLoadError(error: unknown): boolean {
  const message = errorMessages(error).join(' ').toLowerCase();
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

@Injectable({ providedIn: 'root' })
export class FrontendReleaseRecoveryService {
  private readonly snackBar = inject(MatSnackBar);
  private notificationOpen = false;

  handleNavigationError(error: unknown): void {
    if (!isFrontendChunkLoadError(error) || this.notificationOpen) return;
    this.notificationOpen = true;
    const notice = this.snackBar.open('平台已更新，刷新后即可继续使用当前页面。', '刷新', {
      duration: 0,
      panelClass: ['notice-error'],
    });
    notice.onAction().subscribe(() => window.location.reload());
    notice.afterDismissed().subscribe(() => (this.notificationOpen = false));
  }
}
