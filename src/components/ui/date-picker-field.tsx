'use client';

import { useState } from 'react';
import { format, parse, isValid, type Locale } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { useLocale } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DatePickerFieldProps {
  value: string; // ISO date string "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

const localeMap: Record<string, Locale> = { fr, en: enUS };

export function DatePickerField({
  value,
  onChange,
  placeholder = 'Pick a date',
  className,
  id,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const dateFnsLocale = localeMap[locale] || enUS;

  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const isSelectedValid = selected && isValid(selected);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal min-h-[44px] touch-manipulation',
            !isSelectedValid && 'text-neutral-500',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {isSelectedValid ? format(selected, 'PPP', { locale: dateFnsLocale }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <DayPicker
          mode="single"
          selected={isSelectedValid ? selected : undefined}
          onSelect={(day) => {
            if (day) {
              onChange(format(day, 'yyyy-MM-dd'));
            } else {
              onChange('');
            }
            setOpen(false);
          }}
          locale={dateFnsLocale}
          classNames={{
            months: 'flex flex-col sm:flex-row gap-2 p-3',
            month: 'flex flex-col gap-4',
            month_caption: 'flex justify-center pt-1 relative items-center',
            caption_label: 'text-sm font-medium',
            nav: 'flex items-center gap-1',
            button_previous:
              'absolute left-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center',
            button_next:
              'absolute right-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center',
            month_grid: 'w-full border-collapse',
            weekdays: 'flex',
            weekday: 'text-neutral-500 rounded-md w-9 font-normal text-[0.8rem]',
            week: 'flex w-full mt-2',
            day: 'h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20',
            day_button:
              'h-9 w-9 p-0 font-normal rounded-md hover:bg-neutral-100 inline-flex items-center justify-center touch-manipulation',
            selected:
              'bg-neutral-900 text-white hover:bg-neutral-900 hover:text-white focus:bg-neutral-900 focus:text-white rounded-md',
            today: 'bg-neutral-100 text-neutral-900 rounded-md',
            outside: 'text-neutral-300',
            disabled: 'text-neutral-300',
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
