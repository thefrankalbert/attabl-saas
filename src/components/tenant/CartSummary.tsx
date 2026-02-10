'use client';

import { useCart } from '@/contexts/CartContext';
import { useTenant } from '@/contexts/TenantContext';
import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function CartSummary() {
  const { totalItems } = useCart();
  const { slug: tenantSlug, tenant } = useTenant();
  const pathname = usePathname();

  const cartPath = `/sites/${tenantSlug}/cart`;
  const primaryColor = tenant?.primary_color || '#000000';

  // Hide if empty OR if we are already on the cart page
  if (totalItems === 0 || pathname?.includes('/cart')) return null;

  return (
    <div className="fixed bottom-20 right-4 sm:bottom-24 sm:right-6 z-[100]">
      <Link
        href={cartPath}
        aria-label={`Voir mon panier (${totalItems} articles)`}
        className="relative w-14 h-14 sm:w-16 sm:h-16 text-white rounded-full flex items-center justify-center transition-all duration-300 border border-white/20 group shadow-lg hover:scale-110 active:scale-95"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="relative">
          <ShoppingBag
            size={24}
            className="sm:w-7 sm:h-7 group-hover:rotate-12 transition-transform duration-300"
          />

          {/* Count Badge */}
          <div
            className="absolute -top-2 -right-2 bg-amber-500 text-white text-[10px] sm:text-[11px] font-black w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center border-2 border-white"
          >
            {totalItems}
          </div>
        </div>
      </Link>
    </div>
  );
}
