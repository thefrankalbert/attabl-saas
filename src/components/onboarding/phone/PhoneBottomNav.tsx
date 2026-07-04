import { Clock, Home, ShoppingBag, User } from 'lucide-react';

import { C } from './tokens';

export function PhoneBottomNav() {
  return (
    <>
      {/* --- BOTTOM NAV --- 4 tabs (BottomNav.tsx) */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40px',
          backgroundColor: C.bg,
          borderTop: `1px solid ${C.divider}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingLeft: '8px',
          paddingRight: '8px',
          zIndex: 40,
        }}
      >
        <Home style={{ width: '16px', height: '16px', color: C.text }} strokeWidth={2} />
        <ShoppingBag
          style={{ width: '16px', height: '16px', color: C.iconInactive }}
          strokeWidth={2}
        />
        <Clock style={{ width: '16px', height: '16px', color: C.iconInactive }} strokeWidth={2} />
        <User style={{ width: '16px', height: '16px', color: C.iconInactive }} strokeWidth={2} />
      </div>

      {/* Home indicator bar */}
      <div
        style={{
          position: 'absolute',
          bottom: '5px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '48px',
          height: '3px',
          borderRadius: '999px',
          backgroundColor: 'rgba(0,0,0,0.12)',
          zIndex: 50,
        }}
      />
    </>
  );
}
