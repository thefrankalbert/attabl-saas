/* eslint-disable @next/next/no-img-element */
import { Plus, Utensils } from 'lucide-react';

import { C, type PhoneMenuItem } from './tokens';

interface PhoneMenuItemsProps {
  hasMenu: boolean;
  displayItems: PhoneMenuItem[];
  currency: string;
}

export function PhoneMenuItems({ hasMenu, displayItems, currency }: PhoneMenuItemsProps) {
  return (
    /* --- ITEMS LIST --- image droite / texte gauche (MenuItemCard) */
    <div style={{ paddingLeft: '12px', paddingRight: '12px' }}>
      {hasMenu
        ? displayItems.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                paddingBottom: '10px',
                marginBottom: '8px',
                borderBottom: idx < displayItems.length - 1 ? `1px solid ${C.divider}` : 'none',
              }}
            >
              {/* Texte - gauche */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    color: C.text,
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginBottom: '2px',
                  }}
                >
                  {item.name}
                </p>
                {item.category && (
                  <p
                    style={{
                      fontSize: '7px',
                      color: C.textSecondary,
                      lineHeight: 1.3,
                      marginBottom: '4px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.category}
                  </p>
                )}
                <p
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    color: C.text,
                  }}
                >
                  {item.price.toLocaleString()}&nbsp;{currency || 'FCFA'}
                </p>
              </div>

              {/* Image - droite (w-90px -> 53px scaled) */}
              <div
                style={{
                  position: 'relative',
                  flexShrink: 0,
                  width: '53px',
                  height: '53px',
                }}
              >
                <div
                  style={{
                    width: '53px',
                    height: '53px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    backgroundColor: C.surface,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <Utensils
                      style={{
                        width: '18px',
                        height: '18px',
                        color: C.textMuted,
                      }}
                      strokeWidth={1.5}
                    />
                  )}
                </div>
                {/* Bouton (+) noir */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '-3px',
                    right: '-3px',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: C.cartBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Plus
                    style={{
                      width: '10px',
                      height: '10px',
                      color: C.cartText,
                    }}
                    strokeWidth={2.5}
                  />
                </div>
              </div>
            </div>
          ))
        : /* Skeleton items */
          [1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                paddingBottom: '10px',
                marginBottom: '8px',
                borderBottom: `1px solid ${C.divider}`,
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    height: '8px',
                    width: `${50 + i * 18}%`,
                    backgroundColor: C.skeletonBase,
                    borderRadius: '4px',
                    marginBottom: '4px',
                  }}
                />
                <div
                  style={{
                    height: '6px',
                    width: '70%',
                    backgroundColor: C.skeletonAlt,
                    borderRadius: '4px',
                    marginBottom: '5px',
                  }}
                />
                <div
                  style={{
                    height: '8px',
                    width: '38%',
                    backgroundColor: C.skeletonBase,
                    borderRadius: '4px',
                  }}
                />
              </div>
              <div
                style={{
                  flexShrink: 0,
                  width: '53px',
                  height: '53px',
                  borderRadius: '10px',
                  backgroundColor: C.skeletonAlt,
                }}
              />
            </div>
          ))}
    </div>
  );
}
