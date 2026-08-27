import { describe, expect, it } from 'vitest';

import { isFrontendChunkLoadError } from './frontend-release-recovery.service';

describe('frontend release recovery', () => {
  it('recognizes lazy route failures caused by an atomic release switch', () => {
    expect(
      isFrontendChunkLoadError(
        new TypeError('Failed to fetch dynamically imported module: /chunk-OLD.js'),
      ),
    ).toBe(true);
    expect(
      isFrontendChunkLoadError({ error: new Error('ChunkLoadError: Loading chunk 12 failed') }),
    ).toBe(true);
  });

  it('does not classify ordinary application errors as release changes', () => {
    expect(isFrontendChunkLoadError(new Error('Workflow not found'))).toBe(false);
  });
});
