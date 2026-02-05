"use client";

import React from "react";

interface Category {
    id: string;
    name: string;
}

interface CategoryNavProps {
    categories: Category[];
}

export default function CategoryNav({ categories }: CategoryNavProps) {
    const [activeCategory, setActiveCategory] = React.useState<string>("");
    const [tabPaneHeight, setTabPaneHeight] = React.useState<number>(60);
    const navRef = React.useRef<HTMLDivElement>(null);
    const buttonRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());

    // Détecter la hauteur du tab pane s'il existe
    React.useEffect(() => {
        const checkTabPane = () => {
            const tabPane = document.querySelector('[data-tab-pane]');
            if (tabPane) {
                setTabPaneHeight(tabPane.getBoundingClientRect().height);
            } else {
                setTabPaneHeight(0);
            }
        };
        checkTabPane();
        window.addEventListener('resize', checkTabPane);
        return () => window.removeEventListener('resize', checkTabPane);
    }, []);

    // Sync horizontal scroll when active category changes
    React.useEffect(() => {
        if (activeCategory && buttonRefs.current.has(activeCategory)) {
            const activeButton = buttonRefs.current.get(activeCategory);
            if (activeButton && navRef.current) {
                // Centrer l'item actif dans la navigation horizontale
                const container = navRef.current;
                const buttonRect = activeButton.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const scrollLeft = container.scrollLeft;
                const buttonLeft = activeButton.offsetLeft;
                const buttonWidth = activeButton.offsetWidth;
                const containerWidth = container.offsetWidth;

                // Calculer la position pour centrer le bouton
                const targetScroll = buttonLeft - (containerWidth / 2) + (buttonWidth / 2);

                container.scrollTo({
                    left: targetScroll,
                    behavior: 'smooth'
                });
            }
        }
    }, [activeCategory]);

    React.useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                // Trouver l'entrée avec le meilleur ratio d'intersection
                let bestEntry = entries[0];
                let bestRatio = 0;

                entries.forEach((entry) => {
                    if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
                        bestRatio = entry.intersectionRatio;
                        bestEntry = entry;
                    }
                });

                if (bestEntry && bestEntry.isIntersecting) {
                    const id = bestEntry.target.id.replace("cat-", "");
                    setActiveCategory(id);
                }
            },
            {
                rootMargin: "-80px 0px -70% 0px", // Ajusté pour mieux détecter les sections visibles
                threshold: [0, 0.1, 0.3, 0.5, 0.7, 1.0] // Plusieurs seuils pour une détection plus précise
            }
        );

        categories.forEach((category) => {
            const element = document.getElementById(`cat-${category.id}`);
            if (element) observer.observe(element);
        });

        return () => observer.disconnect();
    }, [categories]);

    const scrollToCategory = (id: string) => {
        setActiveCategory(id);
        const element = document.getElementById(`cat-${id}`);
        if (element) {
            // Calculer l'offset en tenant compte de la hauteur du tab pane et de la navigation
            const navHeight = navRef.current?.offsetHeight || 60;
            const offset = tabPaneHeight + navHeight + 20; // 20px d'espace supplémentaire

            const elementRect = element.getBoundingClientRect();
            const absoluteElementTop = elementRect.top + window.pageYOffset;
            const offsetPosition = absoluteElementTop - offset;

            window.scrollTo({
                top: offsetPosition,
                behavior: "smooth"
            });
        }
    };

    return (
        <div ref={navRef} className="fixed left-0 right-0 z-30 bg-white border-b border-gray-200 overflow-x-auto scrollbar-hide py-3 transition-all duration-150" style={{ top: `${tabPaneHeight}px` }}>
            <div className="max-w-3xl lg:max-w-5xl mx-auto px-6 flex gap-2 md:gap-4 min-w-max">
                {categories.map((category) => {
                    const isActive = activeCategory === category.id;
                    return (
                        <button
                            key={category.id}
                            ref={(el) => {
                                if (el) {
                                    buttonRefs.current.set(category.id, el);
                                } else {
                                    buttonRefs.current.delete(category.id);
                                }
                            }}
                            onClick={() => scrollToCategory(category.id)}
                            className={`
                                whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all duration-150 border active:scale-[0.98]
                                ${isActive
                                    ? "bg-[#002C5F] text-white border-[#002C5F]"
                                    : "bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200"
                                }
                            `}

                        >
                            {category.name}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
