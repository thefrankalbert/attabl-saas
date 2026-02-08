'use client';

import { useCart } from '@/contexts/CartContext';
import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function CartSummary() {
  const { totalItems } = useCart();
  const pathname = usePathname();

  // Hide if empty OR if we are already on the cart page
  if (totalItems === 0 || pathname === '/cart') return null;

  return (
    <div className="fixed bottom-24 right-6 z-[100]">
      <Link
        href="/cart"
        aria-label={`Voir mon panier (${totalItems} articles)`}
        // Enhanced hover: scale-110
        className="relative w-16 h-16 bg-radisson-blue text-white rounded-full flex items-center justify-center transition-all duration-300 border border-white/20 group animate-pulse hover:animate-none hover:scale-110 active:scale-95"
      >
        <div className="relative">
          <ShoppingBag
            size={28}
            className="group-hover:rotate-12 transition-transform duration-300"
          />

          {/* Count Badge - No pulse on badge itself, it rides the parent */}
          <div className="absolute -top-2 -right-2 bg-radisson-gold text-radisson-blue text-[11px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white">
            {totalItems}
          </div>
        </div>
      </Link>
    </div>
  );
}
