// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettingsData, type SettingsTenant } from '../useSettingsData';

// After a successful save the "save changes" bar must disappear: what was just
// saved becomes the new baseline (form fields AND the notification sound).
// Before the fix it stayed on screen after every save (live test 2026-11-14).

const updateSettings = vi.fn();
vi.mock('@/app/actions/tenant-settings', () => ({
  actionUpdateTenantSettings: (fd: FormData) => updateSettings(fd),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const tenant = {
  id: 't1',
  slug: 'demo',
  name: 'Resto',
  primary_color: '#000000',
  secondary_color: '#FFFFFF',
  currency: 'XOF',
  notification_sound_id: 'classic-bell',
} as SettingsTenant;

describe('useSettingsData: baseline after save', () => {
  beforeEach(() => updateSettings.mockReset());

  it('clears the unsaved state once the server confirms the save', async () => {
    updateSettings.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useSettingsData(tenant));

    act(() => {
      result.current.form.setValue('name', 'Resto Ouaga', { shouldDirty: true });
      result.current.setSelectedSoundId('simple-ding');
    });
    expect(result.current.hasUnsavedChanges).toBe(true);

    await act(async () => {
      await result.current.onSubmit(result.current.form.getValues());
    });

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(result.current.form.getValues('name')).toBe('Resto Ouaga');
  });

  it('keeps the unsaved state when the server refuses the save', async () => {
    updateSettings.mockResolvedValue({ success: false, error: 'refus' });
    const { result } = renderHook(() => useSettingsData(tenant));

    act(() => {
      result.current.form.setValue('name', 'Resto Ouaga', { shouldDirty: true });
    });
    await act(async () => {
      await result.current.onSubmit(result.current.form.getValues());
    });

    expect(result.current.hasUnsavedChanges).toBe(true);
  });
});
