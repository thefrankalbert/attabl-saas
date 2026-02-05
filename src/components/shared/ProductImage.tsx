"use client";

import { useState } from "react";
import Image from "next/image";
import { Utensils } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductImageProps {
    src?: string | null;
    alt: string;
    className?: string;
    iconSize?: number;
    fill?: boolean;
    width?: number;
    height?: number;
}

export default function ProductImage({
    src,
    alt,
    className,
    iconSize = 24,
    fill = true,
    width,
    height
}: ProductImageProps) {
    const [hasError, setHasError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const showFallback = !src || hasError;

    if (showFallback) {
        return (
            <div
                className={cn(
                    "bg-gray-100 flex items-center justify-center",
                    className
                )}
            >
                <Utensils size={iconSize} className="text-gray-300" />
            </div>
        );
    }

    return (
        <div className={cn("relative overflow-hidden", className)}>
            {isLoading && (
                <div className="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center">
                    <Utensils size={iconSize} className="text-gray-200" />
                </div>
            )}
            {fill ? (
                <Image
                    src={src}
                    alt={alt}
                    fill
                    className={cn(
                        "object-cover transition-opacity duration-300",
                        isLoading ? "opacity-0" : "opacity-100"
                    )}
                    onLoad={() => setIsLoading(false)}
                    onError={() => {
                        setHasError(true);
                        setIsLoading(false);
                    }}
                />
            ) : (
                <Image
                    src={src}
                    alt={alt}
                    width={width || 100}
                    height={height || 100}
                    className={cn(
                        "object-cover transition-opacity duration-300",
                        isLoading ? "opacity-0" : "opacity-100"
                    )}
                    onLoad={() => setIsLoading(false)}
                    onError={() => {
                        setHasError(true);
                        setIsLoading(false);
                    }}
                />
            )}
        </div>
    );
}
