'use client';

import { useTranslations } from 'next-intl';

import { C, type PhoneCategory } from './tokens';

interface PhoneCategoriesProps {
  hasMenu: boolean;
  categories: PhoneCategory[];
}

export function PhoneCategories({ hasMenu, categories }: PhoneCategoriesProps) {
  const t = useTranslations('onboarding');

  return (
    /* --- CATEGORY GRID --- 4 colonnes, tuiles carrées */
    <div
      style={{
        paddingLeft: '12px',
        paddingRight: '12px',
        paddingBottom: '8px',
      }}
    >
      {hasMenu && categories.length > 0 ? (
        <>
          <p
            style={{
              fontSize: '8px',
              fontWeight: 700,
              color: C.text,
              marginBottom: '6px',
            }}
          >
            {t('previewCategories')}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '5px',
            }}
          >
            {categories.slice(0, 8).map((cat) => (
              <div
                key={cat.name}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    backgroundColor: C.surface,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>{cat.emoji}</span>
                </div>
                <span
                  style={{
                    fontSize: '6px',
                    color: C.textSecondary,
                    textAlign: 'center',
                    lineHeight: 1.2,
                    width: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cat.name}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* Skeleton catégories */
        <>
          <div
            style={{
              height: '8px',
              width: '48px',
              backgroundColor: C.skeletonBase,
              borderRadius: '999px',
              marginBottom: '6px',
            }}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '5px',
            }}
          >
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    backgroundColor: C.skeletonAlt,
                    borderRadius: '8px',
                    marginBottom: '3px',
                  }}
                />
                <div
                  style={{
                    height: '5px',
                    backgroundColor: C.skeletonAlt,
                    borderRadius: '999px',
                  }}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
