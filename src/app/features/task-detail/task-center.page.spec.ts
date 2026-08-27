import { describe, expect, it } from 'vitest';

import { taskUpdatedAt } from './task-center.page';

describe('task center presentation', () => {
  it('uses the freshest available task timestamp', () => {
    expect(
      taskUpdatedAt({
        created_at: 'created',
        started_at: 'started',
        finished_at: 'finished',
        heartbeat_at: 'heartbeat',
      } as never),
    ).toBe('heartbeat');
    expect(taskUpdatedAt({ created_at: 'created' } as never)).toBe('created');
  });
});
