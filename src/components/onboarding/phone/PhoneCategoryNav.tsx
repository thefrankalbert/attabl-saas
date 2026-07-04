import { C, type PhoneCategory } from './tokens';

interface PhoneCategoryNavProps {
  hasMenu: boolean;
  categories: PhoneCategory[];
}

export function PhoneCategoryNav({ hasMenu, categories }: PhoneCategoryNavProps) {
  return (
    /* --- CATEGORY NAV PILLS (sticky dans l'app réelle) --- */
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        paddingLeft: '12px',
        paddingRight: '12px',
        paddingTop: '4px',
        paddingBottom: '8px',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        borderBottom: `1px solid ${C.divider}`,
        marginBottom: '8px',
      }}
    >
      {hasMenu && categories.length > 0
        ? categories.slice(0, 6).map((cat, i) => (
            <div
              key={cat.name}
              style={{
                flexShrink: 0,
                backgroundColor: i === 0 ? C.cartBg : C.surface,
                borderRadius: '999px',
                paddingLeft: '7px',
                paddingRight: '7px',
                paddingTop: '3px',
                paddingBottom: '3px',
              }}
            >
              <span
                style={{
                  fontSize: '7px',
                  fontWeight: 600,
                  color: i === 0 ? C.cartText : C.textSecondary,
                  whiteSpace: 'nowrap',
                }}
              >
                {cat.name}
              </span>
            </div>
          ))
        : /* Skeleton pills */
          [52, 40, 56, 36].map((w, i) => (
            <div
              key={i}
              style={{
                flexShrink: 0,
                width: `${w}px`,
                height: '18px',
                backgroundColor: i === 0 ? C.skeletonBase : C.skeletonAlt,
                borderRadius: '999px',
              }}
            />
          ))}
    </div>
  );
}
