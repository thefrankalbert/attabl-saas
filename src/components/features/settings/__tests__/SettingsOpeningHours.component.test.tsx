// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { Tabs } from '@/components/ui/tabs';
import SettingsOpeningHours from '../SettingsOpeningHours';
import type { SettingsFormValues } from '@/hooks/useSettingsData';
import type { OpeningHoursMap } from '@/types/admin.types';

// identity translator: render the i18n key so we can target it
const t = (k: string) => k;

function Harness({ initial }: { initial?: OpeningHoursMap }) {
  const form = useForm<SettingsFormValues>({
    defaultValues: {
      name: 'Resto',
      primaryColor: '#000000',
      secondaryColor: '#FFFFFF',
      openingHours: initial ?? {},
    } as SettingsFormValues,
  });
  return (
    <Tabs value="hours">
      <SettingsOpeningHours form={form} t={t} />
    </Tabs>
  );
}

describe('SettingsOpeningHours', () => {
  it('says the venue is always open when no hours are set', () => {
    render(<Harness />);
    // 7 day switches present
    expect(screen.getAllByRole('switch')).toHaveLength(7);
    // no hours at all = always open: no day is labelled "closed"
    expect(screen.getByText('openingHoursAlwaysOpen')).toBeInTheDocument();
    expect(screen.getAllByText('openingHoursNotSet')).toHaveLength(7);
    expect(screen.queryByText('openingHoursClosed')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('dayMon - openingHoursOpen')).not.toBeInTheDocument();
  });

  it('shows default time inputs when a day is toggled on', () => {
    render(<Harness />);
    const mondaySwitch = screen.getByRole('switch', { name: 'dayMon' });
    fireEvent.click(mondaySwitch);

    const open = screen.getByLabelText('dayMon - openingHoursOpen') as HTMLInputElement;
    const close = screen.getByLabelText('dayMon - openingHoursClose') as HTMLInputElement;
    expect(open.value).toBe('09:00');
    expect(close.value).toBe('22:00');
    // only Monday opened: the other days are now really closed
    expect(screen.getAllByText('openingHoursClosed')).toHaveLength(6);
    expect(screen.queryByText('openingHoursAlwaysOpen')).not.toBeInTheDocument();
  });

  it('renders existing hours and lets the close time be edited', () => {
    render(<Harness initial={{ tue: { open: '08:30', close: '18:00' } }} />);
    const close = screen.getByLabelText('dayTue - openingHoursClose') as HTMLInputElement;
    expect(close.value).toBe('18:00');

    fireEvent.change(close, { target: { value: '20:00' } });
    expect((screen.getByLabelText('dayTue - openingHoursClose') as HTMLInputElement).value).toBe(
      '20:00',
    );
  });

  it('hides the time inputs again when a day is toggled off', () => {
    render(<Harness initial={{ wed: { open: '09:00', close: '17:00' } }} />);
    expect(screen.getByLabelText('dayWed - openingHoursOpen')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'dayWed' }));
    expect(screen.queryByLabelText('dayWed - openingHoursOpen')).not.toBeInTheDocument();
  });
});
