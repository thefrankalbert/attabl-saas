"use client";

import { Plus, Minus, Leaf, Flame, Utensils, ChevronDown, Wine } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";

// Types pour options et variantes
interface ItemOption {
    id: string;
    name_fr: string;
    name_en?: string;
    display_order: number;
    is_default: boolean;
}

interface ItemPriceVariant {
    id: string;
    variant_name_fr: string;
    variant_name_en?: string;
    price: number;
    display_order: number;
    is_default: boolean;
}

interface MenuItem {
    id: string;
    name: string;
    name_en?: string | null;
    description: string;
    description_en?: string | null;
    price: number;
    image_url?: string;
    is_vegetarian?: boolean;
    is_spicy?: boolean;
    is_available?: boolean;
    is_drink?: boolean;
    category_id?: string;
    options?: ItemOption[];
    price_variants?: ItemPriceVariant[];
}

interface MenuItemCardProps {
    item: MenuItem;
    restaurantId: string;
    priority?: boolean;
    category?: string;
    language?: 'fr' | 'en';
    currency?: string;
    accentColor?: string;
}

// Simple price formatter
const formatPrice = (price: number, currency: string = 'XOF') => {
    if (currency === 'XOF') {
        return `${price.toLocaleString('fr-FR')} F`;
    }
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: currency,
    }).format(price);
};

// Simple translation helper
const getTranslatedContent = (language: string, fr: string, en?: string | null) => {
    return language === 'en' && en ? en : fr;
};

export default function MenuItemCard({
    item,
    restaurantId,
    priority = false,
    category = "",
    language = 'fr',
    currency = 'XOF',
    accentColor = 'text-amber-600'
}: MenuItemCardProps) {
    const { addToCart, updateQuantity, items } = useCart();
    const [isAnimating, setIsAnimating] = useState(false);
    const [imageError, setImageError] = useState(false);

    // État pour les sélections
    const [selectedOption, setSelectedOption] = useState<ItemOption | null>(null);
    const [selectedVariant, setSelectedVariant] = useState<ItemPriceVariant | null>(null);
    const [showVariantDropdown, setShowVariantDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Déterminer si c'est une boisson
    const isDrink = item.is_drink || category.toLowerCase().match(/boisson|cocktail|vin|bière|beer|soda|jus|drink|beverage|wine|eau|water/i);

    // Initialiser les sélections par défaut
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (item.options?.length) {
            const defaultOption = item.options.find(o => o.is_default) || item.options[0];
            setSelectedOption(defaultOption);
        }
        if (item.price_variants?.length) {
            const defaultVariant = item.price_variants.find(v => v.is_default) || item.price_variants[0];
            setSelectedVariant(defaultVariant);
        }
    }, [item.options, item.price_variants]);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Fermer le dropdown quand on clique ailleurs
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowVariantDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Obtenir le prix actuel (avec variante si applicable)
    const currentPrice = selectedVariant ? selectedVariant.price : item.price;

    // Clé unique pour le panier (inclut option/variante)
    const getCartKey = () => {
        let key = item.id;
        if (selectedOption) key += `-opt-${selectedOption.name_fr}`;
        if (selectedVariant) key += `-var-${selectedVariant.variant_name_fr}`;
        return key;
    };

    // Trouver l'item dans le panier
    const cartItem = items.find((i) => {
        let itemKey = i.id;
        if (i.selectedOption) itemKey += `-opt-${i.selectedOption.name_fr}`;
        if (i.selectedVariant) itemKey += `-var-${i.selectedVariant.name_fr}`;
        return itemKey === getCartKey();
    });

    const handleAdd = () => {
        if (item.is_available === false) return;

        setIsAnimating(true);

        const cartItemData = {
            id: item.id,
            name: item.name,
            name_en: item.name_en ?? undefined,
            price: currentPrice,
            image_url: item.image_url,
            quantity: 1,
            category_id: item.category_id,
            category_name: category,
            selectedOption: selectedOption ? {
                name_fr: selectedOption.name_fr,
                name_en: selectedOption.name_en
            } : undefined,
            selectedVariant: selectedVariant ? {
                name_fr: selectedVariant.variant_name_fr,
                name_en: selectedVariant.variant_name_en,
                price: selectedVariant.price
            } : undefined
        };

        addToCart(cartItemData, restaurantId);
        setTimeout(() => setIsAnimating(false), 300);
    };

    // Helper pour obtenir le nom traduit
    const getVariantName = (variant: ItemPriceVariant) => {
        return language === 'en' && variant.variant_name_en ? variant.variant_name_en : variant.variant_name_fr;
    };

    const hasVariants = item.price_variants && item.price_variants.length > 0;
    const isUnavailable = item.is_available === false;
    const hasValidImage = item.image_url && !item.image_url.includes('placeholder') && !item.image_url.includes('default') && !imageError;

    return (
        <div
            onClick={handleAdd}
            className={`group py-4 px-4 flex items-start gap-4 relative transition-all duration-150 active:scale-[0.99] select-none cursor-pointer hover:bg-gray-50/30 ${isUnavailable ? 'opacity-50 pointer-events-none' : ''}`}
        >
            {/* TEXT CONTENT (Left) */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start gap-1.5 mb-1">
                    <h3 className="text-[15px] font-semibold text-gray-900 leading-tight line-clamp-2">
                        {getTranslatedContent(language, item.name, item.name_en)}
                    </h3>
                    <div className="flex gap-1 flex-shrink-0 mt-0.5">
                        {item.is_vegetarian && <Leaf size={12} className="text-green-500" />}
                        {item.is_spicy && <Flame size={12} className="text-red-500" />}
                    </div>
                </div>

                <p className="text-[13px] text-gray-500 leading-snug line-clamp-2 mb-2">
                    {getTranslatedContent(language, item.description, item.description_en)}
                </p>

                <div className="flex items-center gap-2 mt-auto">
                    <span
                        className="text-[16px] font-bold"
                        style={{ color: 'var(--tenant-primary)' }}
                    >
                        {currentPrice > 0 ? formatPrice(currentPrice, currency) : (language === 'en' ? 'Included' : 'Inclus')}
                    </span>
                </div>

                {/* Variants Dropdown */}
                {hasVariants && (
                    <div className="mt-2 relative" ref={dropdownRef}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowVariantDropdown(!showVariantDropdown);
                            }}
                            className="flex items-center gap-1 text-[12px] bg-gray-50 px-2 py-1 rounded-md"
                            style={{ color: 'var(--tenant-primary)' }}
                        >
                            {getVariantName(selectedVariant!)}
                            <ChevronDown size={12} className={`transition-transform ${showVariantDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        {showVariantDropdown && (
                            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg border border-gray-200 py-1 z-20 shadow-lg min-w-[120px]">
                                {item.price_variants?.map((variant) => (
                                    <button
                                        key={variant.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedVariant(variant);
                                            setShowVariantDropdown(false);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 ${selectedVariant?.id === variant.id ? 'font-bold bg-gray-50' : 'text-gray-700'}`}
                                        style={selectedVariant?.id === variant.id ? { color: 'var(--tenant-primary)' } : undefined}
                                    >
                                        {getVariantName(variant)} - {formatPrice(variant.price, currency)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* IMAGE SECTION (Right) */}
            <div className="relative flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24">
                <div className="w-full h-full rounded-lg overflow-hidden bg-gray-50 border border-gray-100 flex items-center justify-center">
                    {hasValidImage ? (
                        <Image
                            src={item.image_url!}
                            alt={item.name}
                            fill
                            sizes="(max-width: 640px) 80px, 96px"
                            className="object-cover"
                            onError={() => setImageError(true)}
                            priority={priority}
                        />
                    ) : (
                        isDrink ? <Wine size={24} className="text-gray-300" /> : <Utensils size={24} className="text-gray-300" />
                    )}
                </div>

                {/* Floating Add/Quantity Controls */}
                <div className="absolute -bottom-1 -right-1">
                    {cartItem ? (
                        <div className="flex items-center bg-white rounded-full shadow-md border border-gray-200 p-0.5">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    updateQuantity(getCartKey(), cartItem.quantity - 1);
                                }}
                                className={`w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-50 active:scale-90 transition-all text-white`}
                                style={{ backgroundColor: 'var(--tenant-primary)' }}
                            >
                                <Minus size={16} strokeWidth={2.5} />
                            </button>
                            <span className="text-[13px] font-bold text-gray-900 w-6 text-center">
                                {cartItem.quantity}
                            </span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    updateQuantity(getCartKey(), cartItem.quantity + 1);
                                }}
                                className={`w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-50 active:scale-90 transition-all text-white`}
                                style={{ backgroundColor: 'var(--tenant-primary)' }}
                            >
                                <Plus size={16} strokeWidth={2.5} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleAdd();
                            }}
                            disabled={isUnavailable}
                            className={`w-10 h-10 rounded-full bg-white border-2 border-gray-100 flex items-center justify-center shadow-md hover:border-current/30 active:scale-90 transition-all ${isAnimating ? "scale-110 bg-current/10" : ""}`}
                            style={{ color: 'var(--tenant-primary)' }}
                        >
                            <Plus size={20} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
            </div>

            {/* Unavailable Overlay */}
            {isUnavailable && (
                <div className="absolute inset-0 bg-white/40 flex items-center justify-center pointer-events-none">
                    <span className="bg-gray-900/80 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
                        {language === 'en' ? 'Unavailable' : 'Indisponible'}
                    </span>
                </div>
            )}
        </div>
    );
}
