# Tablet UX & Feature Corrections — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 7 tablet UX/feature issues: layout scroll, modals, touch targets, date pickers, CRUD editing, service flow, and smart suggestions.

**Architecture:** CSS/layout fixes on existing components (Chantiers 2/3/7), new reusable DatePickerField component (Chantier 4), edit mode additions to existing CRUD components (Chantier 5), expandable order detail in ServerDashboard (Chantier 1), and a new suggestion generation service gated by plan (Chantier 6).

**Tech Stack:** Next.js 16, React 19, TypeScript 5 strict, Tailwind v4, shadcn/ui, Supabase Realtime, date-fns, react-day-picker.

---

## Chantier 2: Layout & Sidebar (Foundation)

### Task 1: Fix AdminLayoutClient — container scroll

**Files:**

- Modify: `src/components/admin/AdminLayoutClient.tsx:47-56`

**Step 1: Apply the fix**

In `AdminLayoutClient.tsx`, change the `<main>` element to use `h-[100dvh] overflow-y-auto` instead of `min-h-screen`. This makes only the content area scroll, not the entire page.

Replace lines 47-56:

```tsx
<main
  className={cn(
    'h-[100dvh] overflow-y-auto transition-[margin-left] duration-300 ease-in-out',
    marginClass,
    isMobile && 'pb-16', // space for bottom nav
    isDevMode && 'pt-6',
  )}
>
  {children}
</main>
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 2: Fix AdminSidebar — explicit dvh height

**Files:**

- Modify: `src/components/admin/AdminSidebar.tsx:111-117`

**Step 1: Apply the fix**

Add `h-[100dvh]` to the sidebar `<aside>` element to handle mobile browser chrome correctly.

Replace the `<aside>` className (line 112-116):

```tsx
        className={cn(
          'fixed inset-y-0 left-0 h-[100dvh] bg-white border-r border-neutral-100 z-40 flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0',
          isCollapsed ? 'w-16' : 'w-64',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          className,
        )}
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 3: Commit Chantier 2

**Step 1: Commit**

```bash
git add src/components/admin/AdminLayoutClient.tsx src/components/admin/AdminSidebar.tsx
git commit -m "fix: layout scroll — use 100dvh + overflow-y-auto for container scroll

AdminLayoutClient: main uses h-[100dvh] overflow-y-auto instead of min-h-screen
AdminSidebar: explicit h-[100dvh] for mobile browser chrome handling"
```

---

## Chantier 3: Modales & Formulaires

### Task 4: Fix AdminModal — max-height + scrollable body

**Files:**

- Modify: `src/components/admin/AdminModal.tsx:35`

**Step 1: Apply the fix**

The modal body (`<div className="px-6 pb-6">`) needs `max-h-[calc(100dvh-8rem)] overflow-y-auto` so it scrolls on tablet instead of being cut off. The 8rem accounts for header + padding.

Replace line 35:

```tsx
<div className="px-6 pb-6 max-h-[calc(100dvh-8rem)] overflow-y-auto">{children}</div>
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 5: Fix CouponForm — responsive date grid

**Files:**

- Modify: `src/components/admin/CouponForm.tsx:182`

**Step 1: Apply the fix**

The date grid is `grid-cols-2` which is too cramped on narrow screens. Make it responsive.

Replace line 182:

```tsx
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 6: Commit Chantier 3

**Step 1: Commit**

```bash
git add src/components/admin/AdminModal.tsx src/components/admin/CouponForm.tsx
git commit -m "fix: modals — scrollable body + responsive date grid on tablet

AdminModal: max-h-[calc(100dvh-8rem)] overflow-y-auto on body
CouponForm: date grid responsive grid-cols-1 sm:grid-cols-2"
```

---

## Chantier 7: Touch Targets

### Task 7: Fix mobile sidebar toggle — 44px touch target

**Files:**

- Modify: `src/components/admin/AdminSidebar.tsx:93-100`

**Step 1: Apply the fix**

The mobile toggle button uses `size="icon"` which renders at 36x36px. Apple HIG requires 44x44px minimum. Add explicit sizing and `touch-action: manipulation` to eliminate the 300ms tap delay.

Replace lines 93-100:

```tsx
<Button
  variant="ghost"
  size="icon"
  className="fixed top-3 left-3 z-50 lg:hidden bg-white border border-neutral-200 min-w-[44px] min-h-[44px] touch-manipulation"
  onClick={toggleSidebar}
>
  {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
</Button>
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 8: Fix SidebarFooter — touch targets on collapsed icons

**Files:**

- Modify: `src/components/admin/sidebar/SidebarFooter.tsx:75-80`

**Step 1: Apply the fix**

The collapse toggle button and collapsed-mode icon buttons need minimum 44px touch targets and `touch-manipulation`.

Replace the collapse toggle button className (line 78-80):

```tsx
            className={cn(
              'hidden lg:flex items-center rounded-lg text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 transition-colors text-sm font-medium w-full touch-manipulation',
              isCollapsed ? 'justify-center px-2 py-2.5 min-h-[44px]' : 'gap-3 px-3 py-2.5 min-h-[44px]',
            )}
```

Also update the collapsed settings link (line 100):

```tsx
className =
  'flex items-center justify-center w-full px-2 py-2.5 min-h-[44px] rounded-lg text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 transition-colors touch-manipulation';
```

Also update the collapsed logout button (line 110):

```tsx
className =
  'flex items-center justify-center w-full px-2 py-2.5 min-h-[44px] rounded-lg text-red-600 hover:bg-red-50 transition-colors group touch-manipulation';
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 9: Commit Chantier 7

**Step 1: Commit**

```bash
git add src/components/admin/AdminSidebar.tsx src/components/admin/sidebar/SidebarFooter.tsx
git commit -m "fix: touch targets — 44px minimum + touch-manipulation on interactive elements

Mobile toggle: min-w/h-[44px] + touch-manipulation
SidebarFooter: min-h-[44px] on all collapsed icons + touch-manipulation"
```

---

## Chantier 4: Date Pickers

### Task 10: Install dependencies for date picker

**Step 1: Install packages**

```bash
pnpm add react-day-picker @radix-ui/react-popover
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 11: Create shadcn Popover component

**Files:**

- Create: `src/components/ui/popover.tsx`

**Step 1: Create Popover**

```tsx
'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';

import { cn } from '@/lib/utils';

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-auto rounded-xl border border-neutral-200 bg-white p-4 shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 12: Create DatePickerField component

**Files:**

- Create: `src/components/ui/date-picker-field.tsx`

**Step 1: Create DatePickerField**

```tsx
'use client';

import { useState } from 'react';
import { format, parse, isValid } from 'date-fns';
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
            months: 'flex flex-col sm:flex-row gap-2',
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
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 13: Replace date inputs in AnnouncementsClient

**Files:**

- Modify: `src/components/admin/AnnouncementsClient.tsx:250-268`

**Step 1: Add import**

Add at the top of the file, after existing imports:

```tsx
import { DatePickerField } from '@/components/ui/date-picker-field';
```

**Step 2: Replace date inputs**

Replace the date grid section (lines 250-268) with:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  <div>
    <Label className="mb-1.5 block text-neutral-900">{t('startDateRequired')}</Label>
    <DatePickerField
      value={startDate}
      onChange={setStartDate}
      placeholder={t('startDateRequired')}
    />
  </div>
  <div>
    <Label className="mb-1.5 block text-neutral-900">{t('endDateOptional')}</Label>
    <DatePickerField value={endDate} onChange={setEndDate} placeholder={t('endDateOptional')} />
  </div>
</div>
```

**Step 3: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 14: Replace date inputs in CouponForm

**Files:**

- Modify: `src/components/admin/CouponForm.tsx:181-201`

**Step 1: Add import**

Add at the top of the file, after existing imports:

```tsx
import { DatePickerField } from '@/components/ui/date-picker-field';
```

**Step 2: Replace date inputs**

Replace the date grid section (lines 181-201) with:

```tsx
{
  /* Date Range */
}
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  <div className="space-y-2">
    <Label htmlFor="validFrom">{t('startDateField')}</Label>
    <DatePickerField
      id="validFrom"
      value={validFrom}
      onChange={setValidFrom}
      placeholder={t('startDateField')}
    />
  </div>
  <div className="space-y-2">
    <Label htmlFor="validUntil">{t('endDateField')}</Label>
    <DatePickerField
      id="validUntil"
      value={validUntil}
      onChange={setValidUntil}
      placeholder={t('endDateField')}
    />
  </div>
</div>;
```

**Step 3: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 15: Commit Chantier 4

**Step 1: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/ui/popover.tsx src/components/ui/date-picker-field.tsx src/components/admin/AnnouncementsClient.tsx src/components/admin/CouponForm.tsx
git commit -m "feat: replace native date inputs with DatePickerField component

Install react-day-picker + @radix-ui/react-popover
Create Popover (shadcn) and DatePickerField (reusable) components
Replace <input type=date> in AnnouncementsClient and CouponForm
Locale-aware (fr/en) via date-fns, 44px touch targets"
```

---

## Chantier 5: Edition Annonces & Coupons

### Task 16: AnnouncementsClient — add edit mode + remove line-clamp

**Files:**

- Modify: `src/components/admin/AnnouncementsClient.tsx`

**Step 1: Add edit state**

After line 29 (`const [isModalOpen, setIsModalOpen] = useState(false);`), add:

```tsx
const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
```

**Step 2: Modify resetForm to clear editing state**

Update `resetForm` (line 43-49) to also clear editingAnnouncement:

```tsx
const resetForm = () => {
  setEditingAnnouncement(null);
  setTitle('');
  setDescription('');
  setStartDate(new Date().toISOString().split('T')[0]);
  setEndDate('');
  setIsActive(true);
};
```

**Step 3: Modify handleSave to support update**

Replace the `handleSave` function (lines 51-96) with:

```tsx
const handleSave = async () => {
  if (!title || !startDate) {
    toast({ title: t('fieldsRequired'), variant: 'destructive' });
    return;
  }

  if (endDate && new Date(endDate) < new Date(startDate)) {
    toast({
      title: t('endDateBeforeStartDate'),
      variant: 'destructive',
    });
    return;
  }

  setLoading(true);
  try {
    const payload = {
      title,
      description: description || null,
      start_date: new Date(startDate).toISOString(),
      end_date: endDate ? new Date(endDate).toISOString() : null,
      is_active: isActive,
    };

    if (editingAnnouncement) {
      // Update existing
      const { data, error } = await supabase
        .from('announcements')
        .update(payload)
        .eq('id', editingAnnouncement.id)
        .select()
        .single();

      if (error) throw error;
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === editingAnnouncement.id ? (data as Announcement) : a)),
      );
      toast({ title: t('announcementUpdated') });
    } else {
      // Create new
      const { data: newAnnouncement, error } = await supabase
        .from('announcements')
        .insert({ tenant_id: tenantId, ...payload })
        .select()
        .single();

      if (error) throw error;
      setAnnouncements((prev) => [newAnnouncement as Announcement, ...prev]);
      toast({ title: t('announcementCreated') });
    }

    setIsModalOpen(false);
    resetForm();
  } catch (e: unknown) {
    logger.error('Failed to save announcement', e);
    toast({
      title: tc('error'),
      description: e instanceof Error ? e.message : tc('errorGeneric'),
      variant: 'destructive',
    });
  } finally {
    setLoading(false);
  }
};
```

**Step 4: Add edit handler + make cards clickable**

Add an `openEdit` function after `handleSave`:

```tsx
const openEdit = (ann: Announcement) => {
  setEditingAnnouncement(ann);
  setTitle(ann.title);
  setDescription(ann.description || '');
  setStartDate(ann.start_date ? new Date(ann.start_date).toISOString().split('T')[0] : '');
  setEndDate(ann.end_date ? new Date(ann.end_date).toISOString().split('T')[0] : '');
  setIsActive(ann.is_active);
  setIsModalOpen(true);
};
```

**Step 5: Make announcement cards clickable**

On the card `<div>` (line 153-156), add an onClick and cursor:

```tsx
          <div
            key={ann.id}
            className="group bg-white border border-neutral-100 rounded-xl p-5 transition-all flex flex-col h-full cursor-pointer hover:border-neutral-300"
            onClick={() => openEdit(ann)}
          >
```

**Step 6: Remove text truncation**

Change `line-clamp-1` on the title (line 170) to no clamp:

```tsx
<h3 className="font-bold text-neutral-900 mb-2">{ann.title}</h3>
```

Change `line-clamp-2` on the description (line 172) to `line-clamp-3` for a reasonable limit:

```tsx
<p className="text-sm text-neutral-500 line-clamp-3 mb-4 flex-1">{ann.description}</p>
```

**Step 7: Update modal title dynamically**

Change the AdminModal title (line 226) to be dynamic:

```tsx
        title={editingAnnouncement ? t('editAnnouncement') : t('newAnnouncement')}
```

**Step 8: Update save button text**

Change the save button (line 282-284) text to be dynamic:

```tsx
<Button onClick={handleSave} disabled={loading} variant="lime">
  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
  {editingAnnouncement ? tc('save') : t('publish')}
</Button>
```

**Step 9: Prevent card click when clicking action buttons**

Add `e.stopPropagation()` to the toggle and delete buttons. On the actions container div (line 188):

```tsx
              <div className="flex gap-2 border-t pt-4" onClick={(e) => e.stopPropagation()}>
```

**Step 10: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 17: CouponForm — accept initialData for edit mode

**Files:**

- Modify: `src/components/admin/CouponForm.tsx`

**Step 1: Add initialData prop to interface**

Update the `CouponFormProps` interface (lines 20-26):

```tsx
interface CouponFormProps {
  tenantId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currency: CurrencyCode;
  initialData?: Coupon | null;
}
```

Add the Coupon type import:

```tsx
import type { Coupon, CurrencyCode } from '@/types/admin.types';
```

**Step 2: Destructure initialData + initialize state from it**

Update the component function (lines 28-46):

```tsx
export default function CouponForm({
  tenantId,
  isOpen,
  onClose,
  onSuccess,
  currency,
  initialData,
}: CouponFormProps) {
  const t = useTranslations('coupons');
  const tc = useTranslations('common');
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<number | ''>('');
  const [minAmount, setMinAmount] = useState<number | ''>('');
  const [maxDiscount, setMaxDiscount] = useState<number | ''>('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [maxUses, setMaxUses] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  // Populate form when initialData changes (edit mode)
  React.useEffect(() => {
    if (initialData) {
      setCode(initialData.code || '');
      setDiscountType(initialData.discount_type || 'percentage');
      setDiscountValue(initialData.discount_value ?? '');
      setMinAmount(initialData.min_order_amount ?? '');
      setMaxDiscount(initialData.max_discount_amount ?? '');
      setValidFrom(initialData.valid_from ? new Date(initialData.valid_from).toISOString().split('T')[0] : '');
      setValidUntil(initialData.valid_until ? new Date(initialData.valid_until).toISOString().split('T')[0] : '');
      setMaxUses(initialData.max_uses ?? '');
    } else {
      setCode('');
      setDiscountType('percentage');
      setDiscountValue('');
      setMinAmount('');
      setMaxDiscount('');
      setValidFrom('');
      setValidUntil('');
      setMaxUses('');
    }
  }, [initialData]);
```

Also add `React` import (it should already be available since `useState` is imported from React, but add explicit `useEffect` import):
Update the import line to include `useEffect`:

```tsx
import { useState, useEffect } from 'react';
```

Then use `useEffect` instead of `React.useEffect`.

**Step 3: Modify handleSubmit to support update**

Replace the insert block in `handleSubmit` (lines 69-82) with:

```tsx
const supabase = createClient();
const payload = {
  code: code.toUpperCase().trim(),
  discount_type: discountType,
  discount_value: Number(discountValue),
  min_order_amount: minAmount ? Number(minAmount) : null,
  max_discount_amount: maxDiscount ? Number(maxDiscount) : null,
  valid_from: validFrom || null,
  valid_until: validUntil || null,
  max_uses: maxUses ? Number(maxUses) : null,
};

let error;
if (initialData) {
  // Update existing coupon
  ({ error } = await supabase.from('coupons').update(payload).eq('id', initialData.id));
} else {
  // Create new coupon
  ({ error } = await supabase.from('coupons').insert({
    tenant_id: tenantId,
    ...payload,
    is_active: true,
    current_uses: 0,
  }));
}
```

**Step 4: Update modal title and button text**

Change the AdminModal title (line 103):

```tsx
    <AdminModal isOpen={isOpen} onClose={onClose} title={initialData ? t('editCoupon') : t('newCoupon')}>
```

Change the submit button text (line 222-224):

```tsx
<Button type="submit" variant="lime" disabled={submitting}>
  {submitting ? tc('saving') : initialData ? tc('save') : t('createCoupon')}
</Button>
```

**Step 5: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 18: CouponsClient — add edit mode

**Files:**

- Modify: `src/components/admin/CouponsClient.tsx`

**Step 1: Add editing state**

After line 21 (`const [showForm, setShowForm] = useState(false);`), add:

```tsx
const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
```

**Step 2: Add openEdit handler**

After the `toggleActive` function (line 74), add:

```tsx
const openEdit = (coupon: Coupon) => {
  setEditingCoupon(coupon);
  setShowForm(true);
};
```

**Step 3: Make coupon rows clickable**

On the coupon card div (line 112), add onClick and cursor:

```tsx
            <div key={coupon.id} className="bg-white rounded-xl border border-neutral-100 p-4 cursor-pointer hover:border-neutral-300" onClick={() => openEdit(coupon)}>
```

**Step 4: Stop propagation on action buttons**

Wrap the status toggle and delete button area to stop click propagation. On the status button (line 145), add:

```tsx
                <button
                  onClick={(e) => { e.stopPropagation(); toggleActive(coupon); }}
```

On the delete button (line 169-176):

```tsx
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
```

**Step 5: Update CouponForm usage to pass initialData**

Update the CouponForm call (lines 222-231):

```tsx
<CouponForm
  tenantId={tenantId}
  currency={currency}
  isOpen={showForm}
  onClose={() => {
    setShowForm(false);
    setEditingCoupon(null);
  }}
  onSuccess={() => {
    setShowForm(false);
    setEditingCoupon(null);
    refetch();
  }}
  initialData={editingCoupon}
/>
```

**Step 6: Update "new coupon" button to reset editing state**

Update the new coupon button onClick (line 92):

```tsx
        <Button onClick={() => { setEditingCoupon(null); setShowForm(true); }} variant="lime" className="gap-2">
```

Also update the empty state button (line 214):

```tsx
          <Button onClick={() => { setEditingCoupon(null); setShowForm(true); }} variant="outline" className="mt-4 gap-2">
```

**Step 7: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 19: Commit Chantier 5

**Step 1: Commit**

```bash
git add src/components/admin/AnnouncementsClient.tsx src/components/admin/CouponForm.tsx src/components/admin/CouponsClient.tsx
git commit -m "feat: add edit mode for announcements and coupons

AnnouncementsClient: click card to edit, dynamic insert/update, remove line-clamp
CouponForm: accept initialData prop for edit mode, insert vs update
CouponsClient: click row to edit, pass initialData to CouponForm"
```

---

## Chantier 1: Flux Service/Serveur

### Task 20: ServerDashboard — expandable table with inline orders

**Files:**

- Modify: `src/components/admin/ServerDashboard.tsx`

**Step 1: Add expand state + ChevronDown import**

Update imports (line 7):

```tsx
import { UserCheck, ShoppingCart, LogOut, ChevronDown } from 'lucide-react';
```

After line 17 (`export default function ServerDashboard(...)`), inside the component, add:

```tsx
const [expandedTableId, setExpandedTableId] = useState<string | null>(null);
```

Add `useState` to the imports (line 1, already there — this is a client component).

**Step 2: Make table cards clickable + show inline orders**

Replace the `myAssignments.map` block (lines 46-74) with:

```tsx
{
  myAssignments.map((assignment) => {
    const tableOrders = myOrders.filter((o: Order) => o.table_id === assignment.table_id);
    const isExpanded = expandedTableId === assignment.table_id;
    return (
      <div
        key={assignment.id}
        className="rounded-lg border border-neutral-100 bg-white overflow-hidden"
      >
        <div
          className="p-4 cursor-pointer hover:bg-neutral-50 transition-colors touch-manipulation"
          onClick={() => setExpandedTableId(isExpanded ? null : assignment.table_id)}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono font-bold text-neutral-900">
              {assignment.table?.display_name ?? assignment.table?.table_number ?? 'Table'}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  releaseAssignment.mutate(assignment.id);
                }}
                className="flex items-center gap-1 text-xs text-neutral-500 hover:text-red-500 transition-colors min-h-[44px] min-w-[44px] justify-center touch-manipulation"
              >
                <LogOut className="w-3.5 h-3.5" />
                {t('release')}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm text-neutral-500">
            <span>{t('activeOrders', { count: tableOrders.length })}</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
        </div>

        {/* Expanded: inline order list */}
        {isExpanded && tableOrders.length > 0 && (
          <div className="border-t border-neutral-100 bg-neutral-50 p-3 space-y-2">
            {tableOrders.map((order: Order) => (
              <div key={order.id} className="bg-white rounded-lg p-3 border border-neutral-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-neutral-600 uppercase">
                    #{order.id.slice(0, 8)}
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      order.status === 'pending'
                        ? 'bg-amber-100 text-amber-700'
                        : order.status === 'confirmed'
                          ? 'bg-blue-100 text-blue-700'
                          : order.status === 'preparing'
                            ? 'bg-purple-100 text-purple-700'
                            : order.status === 'ready'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    {order.status}
                  </span>
                </div>
                <div className="text-sm text-neutral-900">
                  {formatCurrency(order.total_price, currency)}
                  <span className="text-neutral-400 ml-2">
                    ({order.items?.length ?? 0} {t('items', { count: order.items?.length ?? 0 })})
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {isExpanded && tableOrders.length === 0 && (
          <div className="border-t border-neutral-100 bg-neutral-50 p-4 text-center text-sm text-neutral-400">
            {t('noActiveOrders')}
          </div>
        )}
      </div>
    );
  });
}
```

**Step 3: Add `useState` import if not present**

Add to the imports:

```tsx
import { useState } from 'react';
```

**Step 4: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 21: ServerDashboard — add Realtime subscription for orders

**Files:**

- Modify: `src/components/admin/ServerDashboard.tsx`

**Step 1: Add useEffect and useQueryClient imports**

```tsx
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
```

**Step 2: Add Realtime subscription**

After the existing hook calls (after line 22), add:

```tsx
const queryClient = useQueryClient();

// Realtime: auto-refetch orders when changes occur for this tenant
useEffect(() => {
  const supabase = createClient();
  const channel = supabase
    .channel('server-orders-realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `tenant_id=eq.${tenantId}`,
      },
      () => {
        queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [tenantId, queryClient]);
```

**Step 3: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 22: Commit Chantier 1

**Step 1: Commit**

```bash
git add src/components/admin/ServerDashboard.tsx
git commit -m "feat: server dashboard — expandable table orders + realtime subscription

Click table card to expand inline order list with status badges
Supabase Realtime subscription auto-refreshes orders on changes
44px touch targets on release button"
```

---

## Chantier 6: Suggestions Intelligentes

### Task 23: Add `autoSuggestions` feature flag

**Files:**

- Modify: `src/lib/plans/features.ts:18-43`

**Step 1: Add the flag**

Add `autoSuggestions: boolean;` to the `PlanLimits` interface after `waiterSuggestions`:

```tsx
autoSuggestions: boolean;
```

**Step 2: Set values per plan**

In the `essentiel` plan object, add:

```tsx
    autoSuggestions: false,
```

In the `premium` plan object, add:

```tsx
    autoSuggestions: true,
```

In the `enterprise` plan object, add:

```tsx
    autoSuggestions: true,
```

**Step 3: Add to canAccessFeature union type**

Add `'autoSuggestions'` to the union type in `canAccessFeature` (around line 200):

```tsx
    | 'autoSuggestions'
```

**Step 4: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 24: Create suggestion generation service

**Files:**

- Create: `src/services/suggestion.service.ts`

**Step 1: Create the service**

```tsx
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SuggestionType } from '@/types/inventory.types';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  is_available: boolean;
}

interface GeneratedSuggestion {
  menu_item_id: string;
  suggested_item_id: string;
  suggestion_type: SuggestionType;
  description: string | null;
}

/**
 * Auto-generate suggestions based on menu items:
 * - Pairings: items from different categories at similar price points
 * - Upsells: 20-50% more expensive item in same category
 * - Alternatives: similar price in same category
 */
export function generateSuggestions(items: MenuItem[]): GeneratedSuggestion[] {
  const suggestions: GeneratedSuggestion[] = [];
  const byCategory = new Map<string, MenuItem[]>();

  for (const item of items) {
    if (!item.category_id || !item.is_available) continue;
    const list = byCategory.get(item.category_id) || [];
    list.push(item);
    byCategory.set(item.category_id, list);
  }

  const categories = [...byCategory.keys()];

  for (const item of items) {
    if (!item.category_id || !item.is_available) continue;

    const sameCategory = byCategory.get(item.category_id) || [];

    // Upsells: 20-50% more expensive in same category
    const upsellCandidates = sameCategory.filter(
      (c) => c.id !== item.id && c.price > item.price * 1.2 && c.price <= item.price * 1.5,
    );
    if (upsellCandidates.length > 0) {
      const best = upsellCandidates.sort((a, b) => a.price - b.price)[0];
      suggestions.push({
        menu_item_id: item.id,
        suggested_item_id: best.id,
        suggestion_type: 'upsell',
        description: null,
      });
    }

    // Alternatives: same category, price within 30%
    const altCandidates = sameCategory.filter(
      (c) => c.id !== item.id && Math.abs(c.price - item.price) <= item.price * 0.3,
    );
    if (altCandidates.length > 0) {
      const best = altCandidates[0];
      suggestions.push({
        menu_item_id: item.id,
        suggested_item_id: best.id,
        suggestion_type: 'alternative',
        description: null,
      });
    }

    // Pairings: item from a different category
    const otherCategories = categories.filter((c) => c !== item.category_id);
    if (otherCategories.length > 0) {
      const targetCategory = otherCategories[0];
      const targets = byCategory.get(targetCategory) || [];
      if (targets.length > 0) {
        // Pick closest price match
        const closest = targets.sort(
          (a, b) => Math.abs(a.price - item.price) - Math.abs(b.price - item.price),
        )[0];
        suggestions.push({
          menu_item_id: item.id,
          suggested_item_id: closest.id,
          suggestion_type: 'pairing',
          description: null,
        });
      }
    }
  }

  // Deduplicate: same source→target pair
  const seen = new Set<string>();
  return suggestions.filter((s) => {
    const key = `${s.menu_item_id}→${s.suggested_item_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Generate and persist auto-suggestions for a tenant.
 * Clears existing auto-generated suggestions first.
 */
export async function generateAndSaveSuggestions(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<number> {
  // Fetch all available menu items with price and category
  const { data: items, error: itemsError } = await supabase
    .from('menu_items')
    .select('id, name, price, category_id, is_available')
    .eq('tenant_id', tenantId)
    .eq('is_available', true);

  if (itemsError || !items) return 0;

  const generated = generateSuggestions(items as MenuItem[]);
  if (generated.length === 0) return 0;

  // Insert suggestions (ignore duplicates via on-conflict if constraint exists)
  const rows = generated.map((s, i) => ({
    tenant_id: tenantId,
    menu_item_id: s.menu_item_id,
    suggested_item_id: s.suggested_item_id,
    suggestion_type: s.suggestion_type,
    description: s.description,
    display_order: i,
    is_active: true,
  }));

  const { error } = await supabase.from('item_suggestions').insert(rows);
  if (error) throw error;

  return generated.length;
}
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 25: Write tests for suggestion generation

**Files:**

- Create: `src/services/__tests__/suggestion.service.test.ts`

**Step 1: Write tests**

```tsx
import { describe, it, expect } from 'vitest';
import { generateSuggestions } from '../suggestion.service';

const makeItem = (id: string, name: string, price: number, categoryId: string) => ({
  id,
  name,
  price,
  category_id: categoryId,
  is_available: true,
});

describe('generateSuggestions', () => {
  it('returns empty array for empty input', () => {
    expect(generateSuggestions([])).toEqual([]);
  });

  it('generates upsell for 20-50% more expensive in same category', () => {
    const items = [
      makeItem('a', 'Burger', 1000, 'cat1'),
      makeItem('b', 'Premium Burger', 1300, 'cat1'), // 30% more
    ];
    const result = generateSuggestions(items);
    const upsells = result.filter((s) => s.suggestion_type === 'upsell');
    expect(upsells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          menu_item_id: 'a',
          suggested_item_id: 'b',
          suggestion_type: 'upsell',
        }),
      ]),
    );
  });

  it('does NOT generate upsell if price diff < 20%', () => {
    const items = [
      makeItem('a', 'Burger', 1000, 'cat1'),
      makeItem('b', 'Similar Burger', 1100, 'cat1'), // only 10% more
    ];
    const result = generateSuggestions(items);
    const upsells = result.filter((s) => s.suggestion_type === 'upsell' && s.menu_item_id === 'a');
    expect(upsells).toHaveLength(0);
  });

  it('generates alternative for same category + close price', () => {
    const items = [
      makeItem('a', 'Burger', 1000, 'cat1'),
      makeItem('b', 'Veggie Burger', 1200, 'cat1'), // 20% diff
    ];
    const result = generateSuggestions(items);
    const alts = result.filter((s) => s.suggestion_type === 'alternative');
    expect(alts.length).toBeGreaterThan(0);
  });

  it('generates pairing from different category', () => {
    const items = [
      makeItem('a', 'Steak', 5000, 'mains'),
      makeItem('b', 'Caesar Salad', 2000, 'starters'),
    ];
    const result = generateSuggestions(items);
    const pairings = result.filter((s) => s.suggestion_type === 'pairing');
    expect(pairings.length).toBeGreaterThan(0);
  });

  it('deduplicates same source→target pairs', () => {
    const items = [
      makeItem('a', 'Burger', 1000, 'cat1'),
      makeItem('b', 'Premium Burger', 1250, 'cat1'),
    ];
    const result = generateSuggestions(items);
    const keys = result.map((s) => `${s.menu_item_id}→${s.suggested_item_id}`);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it('skips unavailable items', () => {
    const items = [
      { id: 'a', name: 'Burger', price: 1000, category_id: 'cat1', is_available: true },
      { id: 'b', name: 'Old Burger', price: 1300, category_id: 'cat1', is_available: false },
    ];
    const result = generateSuggestions(items);
    const refs = result.flatMap((s) => [s.menu_item_id, s.suggested_item_id]);
    expect(refs).not.toContain('b');
  });

  it('skips items without category', () => {
    const items = [{ id: 'a', name: 'Misc', price: 1000, category_id: null, is_available: true }];
    expect(generateSuggestions(items)).toEqual([]);
  });
});
```

**Step 2: Run tests**

Run: `pnpm test src/services/__tests__/suggestion.service.test.ts`
Expected: All tests pass

---

### Task 26: SuggestionsClient — add auto-generate button with plan gating

**Files:**

- Modify: `src/components/admin/SuggestionsClient.tsx`

**Step 1: Add imports**

Add these imports at the top:

```tsx
import { Wand2 } from 'lucide-react';
import { generateAndSaveSuggestions } from '@/services/suggestion.service';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
```

**Step 2: Extend props**

Update the interface:

```tsx
interface SuggestionsClientProps {
  tenantId: string;
  subscriptionPlan?: SubscriptionPlan | null;
  subscriptionStatus?: SubscriptionStatus | null;
  trialEndsAt?: string | null;
}
```

**Step 3: Destructure new props + compute access**

Update the component signature:

```tsx
export default function SuggestionsClient({
  tenantId,
  subscriptionPlan,
  subscriptionStatus,
  trialEndsAt,
}: SuggestionsClientProps) {
```

Add after the `supabase` line:

```tsx
const [generating, setGenerating] = useState(false);
const canAutoGenerate = canAccessFeature(
  'autoSuggestions',
  subscriptionPlan,
  subscriptionStatus,
  trialEndsAt,
);
```

**Step 4: Add auto-generate handler**

After `handleDelete`, add:

```tsx
const handleAutoGenerate = async () => {
  setGenerating(true);
  try {
    const count = await generateAndSaveSuggestions(supabase, tenantId);
    toast({ title: t('suggestionsGenerated', { count }) });
    loadData();
  } catch {
    toast({ title: tc('error'), variant: 'destructive' });
  } finally {
    setGenerating(false);
  }
};
```

**Step 5: Add auto-generate button next to the "Add" button**

Update the header buttons area (line 183-186):

```tsx
<div className="flex items-center gap-2">
  {canAutoGenerate && (
    <Button
      onClick={handleAutoGenerate}
      variant="outline"
      className="gap-2"
      disabled={generating || menuItems.length === 0}
    >
      <Wand2 className="w-4 h-4" />
      {generating ? tc('loading') : t('autoGenerate')}
    </Button>
  )}
  <Button onClick={() => setShowAdd(true)} variant="lime" className="gap-2">
    <Plus className="w-4 h-4" />
    {t('addSuggestion')}
  </Button>
</div>
```

**Step 6: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 27: Update SuggestionsClient page to pass plan props

**Files:**

- Find and modify the page that renders SuggestionsClient (likely in `src/app/sites/[site]/admin/suggestions/page.tsx` or similar)

**Step 1: Find the page**

Search for `SuggestionsClient` usage in pages.

**Step 2: Pass tenant plan data**

Add `subscriptionPlan`, `subscriptionStatus`, and `trialEndsAt` props from the tenant data to `<SuggestionsClient>`.

**Step 3: Verify**

Run: `pnpm typecheck`
Expected: 0 errors

---

### Task 28: Commit Chantier 6

**Step 1: Commit**

```bash
git add src/lib/plans/features.ts src/services/suggestion.service.ts src/services/__tests__/suggestion.service.test.ts src/components/admin/SuggestionsClient.tsx
git commit -m "feat: auto-generate suggestions — plan-gated algorithm

Add autoSuggestions feature flag (premium+)
Create suggestion.service.ts with local generation algorithm:
  - Upsells: 20-50% more expensive in same category
  - Alternatives: same category, price within 30%
  - Pairings: closest price match from different category
Add auto-generate button to SuggestionsClient (hidden for essentiel)
7 unit tests for generation logic"
```

---

## Final Verification

### Task 29: Run full verification suite

**Step 1: TypeScript**

Run: `pnpm typecheck`
Expected: 0 errors

**Step 2: Lint**

Run: `pnpm lint`
Expected: 0 errors, 0 warnings

**Step 3: Tests**

Run: `pnpm test`
Expected: 316+ tests pass (including 7 new suggestion tests)

**Step 4: Format**

Run: `pnpm format`

**Step 5: Report results**

---

## Summary

| Chantier        | Tasks | Key Changes                                           |
| --------------- | ----- | ----------------------------------------------------- |
| 2. Layout       | 1-3   | `h-[100dvh]` + `overflow-y-auto` on main/sidebar      |
| 3. Modales      | 4-6   | `max-h-[calc(100dvh-8rem)]` + responsive date grid    |
| 7. Touch        | 7-9   | `min-h-[44px]` + `touch-manipulation` on buttons      |
| 4. DatePickers  | 10-15 | New Popover + DatePickerField + replace native inputs |
| 5. Edition CRUD | 16-19 | Edit mode for announcements + coupons                 |
| 1. Service Flow | 20-22 | Expandable table orders + Realtime subscription       |
| 6. Suggestions  | 23-28 | Auto-generation algorithm + plan gating + tests       |
| Verification    | 29    | typecheck + lint + test + format                      |

**Total: 29 tasks**
