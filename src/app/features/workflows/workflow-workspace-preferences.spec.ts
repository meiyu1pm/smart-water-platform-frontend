import { describe, expect, it } from 'vitest';

import {
  legacyWorkspacePreferenceKey,
  isRestorableWorkspaceLayout,
  parseWorkspacePreference,
  workspacePreferenceKey,
} from './workflow-workspace-preferences';

describe('workflow workspace preferences', () => {
  const validLayout = {
    grid: { root: { type: 'leaf', data: { id: 'group-1' } }, height: 700, width: 1200 },
    panels: {
      'canvas:root': { id: 'canvas:root', contentComponent: 'canvas' },
    },
  };
  it('isolates layouts by user', () => {
    expect(workspacePreferenceKey(7)).toBe('smart-water.workflow-workspace.layout.v2.7');
    expect(legacyWorkspacePreferenceKey(7)).toBe('smart-water.workflow-workspace.layout.v1.7');
    expect(workspacePreferenceKey(8)).not.toBe(workspacePreferenceKey(7));
    expect(workspacePreferenceKey(null)).toContain('anonymous');
  });

  it('restores a valid versioned preference', () => {
    const preference = parseWorkspacePreference(
      JSON.stringify({
        schemaVersion: 2,
        userId: 7,
        theme: 'workspace-dark',
        layout: validLayout,
      }),
      7,
    );
    expect(preference?.theme).toBe('workspace-dark');
    expect(preference?.layout).toEqual(validLayout);
  });

  it('rejects damaged, incompatible, and cross-user caches', () => {
    expect(parseWorkspacePreference('{broken', 7)).toBeNull();
    expect(
      parseWorkspacePreference(
        JSON.stringify({ schemaVersion: 1, userId: 7, theme: 'water-light', layout: {} }),
        7,
      ),
    ).toBeNull();
    expect(
      parseWorkspacePreference(
        JSON.stringify({ schemaVersion: 2, userId: 8, theme: 'water-light', layout: {} }),
        7,
      ),
    ).toBeNull();
    expect(
      parseWorkspacePreference(
        JSON.stringify({
          schemaVersion: 2,
          userId: 7,
          theme: 'water-light',
          layout: { ...validLayout, panels: {} },
        }),
        7,
      ),
    ).toBeNull();
  });

  it('requires the permanent root canvas component', () => {
    expect(isRestorableWorkspaceLayout(validLayout)).toBe(true);
    expect(
      isRestorableWorkspaceLayout({
        ...validLayout,
        panels: { 'canvas:root': { contentComponent: 'catalog' } },
      }),
    ).toBe(false);
  });
});
