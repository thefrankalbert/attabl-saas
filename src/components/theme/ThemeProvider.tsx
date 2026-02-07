'use client';

import { createContext, useContext, useEffect, ReactNode } from 'react';

interface ThemeColors {
    primaryColor: string;
    secondaryColor: string;
}

interface ThemeContextType {
    colors: ThemeColors;
    applyTheme: (colors: ThemeColors) => void;
}

const defaultColors: ThemeColors = {
    primaryColor: '#CCFF00',
    secondaryColor: '#000000',
};

const ThemeContext = createContext<ThemeContextType>({
    colors: defaultColors,
    applyTheme: () => { },
});

export function useTheme() {
    return useContext(ThemeContext);
}

function applyColorsToDOM(colors: ThemeColors) {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;

    // Apply CSS custom properties
    root.style.setProperty('--tenant-primary', colors.primaryColor);
    root.style.setProperty('--tenant-secondary', colors.secondaryColor);

    // Calculate derived colors
    const primaryRGB = hexToRgb(colors.primaryColor);
    if (primaryRGB) {
        root.style.setProperty('--tenant-primary-rgb', `${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}`);
        root.style.setProperty('--tenant-primary-10', `rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, 0.1)`);
        root.style.setProperty('--tenant-primary-20', `rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, 0.2)`);
        root.style.setProperty('--tenant-primary-50', `rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, 0.5)`);
    }

    const secondaryRGB = hexToRgb(colors.secondaryColor);
    if (secondaryRGB) {
        root.style.setProperty('--tenant-secondary-rgb', `${secondaryRGB.r}, ${secondaryRGB.g}, ${secondaryRGB.b}`);
    }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
    } : null;
}

interface ThemeProviderProps {
    children: ReactNode;
    initialColors?: ThemeColors;
}

export function ThemeProvider({ children, initialColors }: ThemeProviderProps) {
    const colors = initialColors || defaultColors;

    useEffect(() => {
        applyColorsToDOM(colors);
    }, [colors]);

    const applyTheme = (newColors: ThemeColors) => {
        applyColorsToDOM(newColors);
    };

    return (
        <ThemeContext.Provider value={{ colors, applyTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

// Server-side helper to generate inline CSS
export function generateTenantCSS(primaryColor: string, secondaryColor: string): string {
    const primaryRGB = hexToRgb(primaryColor);
    const secondaryRGB = hexToRgb(secondaryColor);

    return `
    :root {
      --tenant-primary: ${primaryColor};
      --tenant-secondary: ${secondaryColor};
      ${primaryRGB ? `
        --tenant-primary-rgb: ${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b};
        --tenant-primary-10: rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, 0.1);
        --tenant-primary-20: rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, 0.2);
        --tenant-primary-50: rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, 0.5);
      ` : ''}
      ${secondaryRGB ? `
        --tenant-secondary-rgb: ${secondaryRGB.r}, ${secondaryRGB.g}, ${secondaryRGB.b};
      ` : ''}
    }
  `.trim();
}
