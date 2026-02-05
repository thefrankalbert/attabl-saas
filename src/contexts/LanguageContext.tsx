"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname } from "next/navigation";

type Language = "fr" | "en";

// Clés de stockage isolées pour Admin et Client (Namespace Attabl)
const STORAGE_KEYS = {
    admin: "attabl_admin_prefs_lang",
    client: "attabl_client_prefs_lang"
} as const;

interface Translations {
    [key: string]: {
        fr: string;
        en: string;
    };
}

const translations: Translations = {
    select_menu: { fr: "Sélectionnez votre carte", en: "Select your menu" },
    view_menu: { fr: "Voir la carte", en: "View menu" },
    back: { fr: "Retour", en: "Back" },
    back_to_menu: { fr: "Retour au menu", en: "Back to menu" },
    add: { fr: "Ajouter", en: "Add" },
    my_cart: { fr: "Mon Panier", en: "My Cart" },
    checkout: { fr: "Valider la commande", en: "Checkout" },
    order_summary: { fr: "Récapitulatif de commande", en: "Order Summary" },
    your_selection: { fr: "Votre Sélection", en: "Your Selection" },
    total_to_pay: { fr: "Total à payer", en: "Total to pay" },
    delivery_info: { fr: "Informations de livraison", en: "Delivery Info" },
    table_room_number: { fr: "Table / Chambre", en: "Table / Room Number" },
    instructions: { fr: "Instructions (Facultatif)", en: "Instructions (Optional)" },
    send_order: { fr: "Envoyer la commande", en: "Send Order" },
    confirmed: { fr: "Confirmé.", en: "Confirmed." },
    success_msg: { fr: "Nos équipes en cuisine s'activent pour vous servir.", en: "Our kitchen teams are busy preparing your order." },
    complete_order: { fr: "Compléter ma commande", en: "Complete my order" },
    home: { fr: "Accueil", en: "Home" },
    cart_empty: { fr: "Votre panier est vide", en: "Your cart is empty" },
    discover_menus: { fr: "Découvrir les menus", en: "Discover menus" },
    my_orders: { fr: "Mes Commandes", en: "My Orders" },
    menu_empty: { fr: "Aucun plat disponible pour le moment.", en: "No dishes available at the moment." },
    installation_progress: { fr: "Carte en cours d'installation", en: "Menu setup in progress" },
    come_back_soon: { fr: "Revenez très bientôt pour découvrir nos sélections.", en: "Check back soon to discover our selections." },
    order_sent_success: { fr: "✅ Votre commande a été envoyée ! Elle sera préparée sous peu.", en: "✅ Your order has been sent! It will be prepared shortly." },
    table_required: { fr: "Veuillez indiquer votre numéro de table ou de chambre.", en: "Please provide your table or room number." },
    error_sending_order: { fr: "Une erreur est survenue lors de l'envoi de votre commande. Veuillez réessayer.", en: "An error occurred while sending your order. Please try again." },
    item: { fr: "article", en: "item" },
    items: { fr: "articles", en: "items" },
    select_table: { fr: "Sélectionner votre table", en: "Select your table" },
    zone: { fr: "Zone", en: "Zone" },
    number: { fr: "Numéro", en: "Number" },
    selected_table: { fr: "Table sélectionnée", en: "Selected table" },
    confirm_table: { fr: "Confirmer la table", en: "Confirm table" },
    panorama: { fr: "Panorama", en: "Panorama" },
    lobby_bar: { fr: "Lobby Bar", en: "Lobby Bar" },
    drinks: { fr: "Boissons", en: "Drinks" },
    loading: { fr: "Chargement...", en: "Loading..." },
    error: { fr: "Erreur", en: "Error" },
    cancel: { fr: "Annuler", en: "Cancel" },
    confirm: { fr: "Confirmer", en: "Confirm" },
    save: { fr: "Enregistrer", en: "Save" },
    delete: { fr: "Supprimer", en: "Delete" },
    edit: { fr: "Modifier", en: "Edit" },
    starters: { fr: "Entrées", en: "Starters" },
    main_courses: { fr: "Plats Principaux", en: "Main Courses" },
    desserts: { fr: "Desserts", en: "Desserts" },
    beverages: { fr: "Boissons", en: "Beverages" },
    pending: { fr: "En attente", en: "Pending" },
    preparing: { fr: "En préparation", en: "Preparing" },
    ready: { fr: "Prêt", en: "Ready" },
    delivered: { fr: "Livré", en: "Delivered" },
    cancelled: { fr: "Annulé", en: "Cancelled" },
    kitchen: { fr: "Cuisine", en: "Kitchen" },
    new_order: { fr: "Nouvelle commande", en: "New order" },
    minutes_ago: { fr: "min", en: "min ago" },
    just_now: { fr: "À l'instant", en: "Just now" },

    // Generic
    actions: { fr: "Actions", en: "Actions" },
    save_changes: { fr: "Enregistrer les modifications", en: "Save changes" },
    delete_confirm: { fr: "Êtes-vous sûr de vouloir supprimer ?", en: "Are you sure you want to delete?" },
    loading_data: { fr: "Chargement des données...", en: "Loading data..." },

    // Admin Dashboard Header & Sidebar
    dashboard: { fr: "Tableau de Bord", en: "Dashboard" },
    orders_mgmt: { fr: "Gestion des Commandes", en: "Orders Management" },
    menus_mgmt: { fr: "Cartes & Menus", en: "Menus & Cards" },
    dishes_mgmt: { fr: "Gestion des Plats", en: "Dishes Management" },
    announcements_mgmt: { fr: "Annonces & Pub", en: "Ads & Promo" },
    qr_generator: { fr: "Générateur QR Codes", en: "QR Code Generator" },
    sys_settings: { fr: "Paramètres Système", en: "System Settings" },
    pos_caisse: { fr: "Caisse (POS)", en: "Point of Sale" },
    kitchen_kds: { fr: "Cuisine (KDS)", en: "Kitchen (KDS)" },
    logout: { fr: "Déconnexion", en: "Logout" },
    welcome_msg: { fr: "Bonjour,", en: "Welcome," },
    manage_perf: { fr: "Gérez vos performances.", en: "Manage your performance." },
    intelligent_sys: { fr: "Système Intelligent • Actif", en: "Intelligent System • Active" },
    real_time_activity: { fr: "Activité Temps Réel", en: "Real-time Activity" },
    full_history: { fr: "Historique complet", en: "Full history" },
    revenue_day: { fr: "Recettes Jour", en: "Daily Revenue" },
    orders_count: { fr: "Commandes", en: "Orders" },
    active_items: { fr: "Plats Actifs", en: "Active Dishes" },
    satisfaction: { fr: "Satisfaction", en: "Satisfaction" },
    top_performers: { fr: "Top Performances", en: "Top Performers" },
    profit_analysis: { fr: "Analyse de Rentabilité", en: "Profitability Analysis" },
    view_full_report: { fr: "Voir le rapport complet", en: "View full report" },

    // Dishes Management
    add_item: { fr: "AJOUTER UN PLAT", en: "ADD A DISH" },
    item_name_fr: { fr: "Nom (FR)", en: "Name (FR)" },
    item_name_en: { fr: "Nom (EN)", en: "Name (EN)" },
    description_fr: { fr: "Description (FR)", en: "Description (FR)" },
    description_en: { fr: "Description (EN)", en: "Description (EN)" },
    price_cfa: { fr: "Prix (FCFA)", en: "Price (FCFA)" },
    category: { fr: "Catégorie", en: "Category" },
    availability: { fr: "Disponibilité", en: "Availability" },
    featured: { fr: "Mise en avant (FRONT)", en: "Featured (FRONT)" },
    available: { fr: "Disponible", en: "Available" },
    unavailable: { fr: "Indisponible", en: "Unavailable" },
    all_menus: { fr: "Toutes les cartes", en: "All menus" },
    all_categories: { fr: "Toutes les catégories", en: "All categories" },
    status: { fr: "Statut", en: "Status" },
    dish: { fr: "Plat", en: "Dish" },
    price: { fr: "Prix", en: "Price" },

    // Orders Management
    order_history: { fr: "Historique et suivi en direct", en: "Order history & live tracking" },
    period: { fr: "Période", en: "Period" },
    today: { fr: "Aujourd'hui", en: "Today" },
    last_7_days: { fr: "7 derniers jours", en: "Last 7 days" },
    last_30_days: { fr: "30 derniers jours", en: "Last 30 days" },
    all_time: { fr: "Tout", en: "All time" },
    all_restaurants: { fr: "Tous les restaurants", en: "All restaurants" },
    order_details: { fr: "Détails de commande", en: "Order details" },
    table: { fr: "Table", en: "Table" },
    total: { fr: "Total", en: "Total" },
    close: { fr: "Fermer", en: "Close" },

    // Settings
    establishment: { fr: "Établissement", en: "Establishment" },
    theme_design: { fr: "Thème & Design", en: "Theme & Design" },
    team: { fr: "Équipe", en: "Team" },
    notifications: { fr: "Notifications", en: "Notifications" },
    system: { fr: "Système", en: "System" },
    display_mode: { fr: "Mode d'Affichage", en: "Display Mode" },
    light_mode: { fr: "Clair", en: "Light" },
    dark_mode: { fr: "Sombre", en: "Dark" },
    primary_color: { fr: "Couleur Primaire", en: "Primary Color" },
    sound_alerts: { fr: "Alertes Sonores", en: "Sound Alerts" },
    preinstalled_sounds: { fr: "Sons pré-installés", en: "Pre-installed sounds" },
    upload_sound: { fr: "Charger une nouvelle sonnerie", en: "Upload new sound" },
    enable_sounds: { fr: "Activer les sons", en: "Enable sounds" },
    browser_alerts: { fr: "Alertes visuelles navigateur", en: "Browser visual alerts" },
    commercial_name: { fr: "Nom Commercial", en: "Commercial Name" },
    currency: { fr: "Devise", en: "Currency" },
    timezone: { fr: "Fuseau Horaire", en: "Timezone" },
    dashboard_language: { fr: "Langue du Dashboard", en: "Dashboard Language" }
};

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<Language>("fr");
    const pathname = usePathname();

    // Déterminer le contexte (Admin ou Client)
    const isAdmin = pathname?.startsWith('/admin') || false;
    const storageKey = isAdmin ? STORAGE_KEYS.admin : STORAGE_KEYS.client;

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        // Charger la langue sauvegardée selon le contexte
        const savedLang = localStorage.getItem(storageKey) as Language;
        if (savedLang && (savedLang === "fr" || savedLang === "en")) {
            setLanguageState(savedLang);
        } else if (typeof navigator !== 'undefined' && navigator.language) {
            // Fallback: détection navigateur
            const browserLang = navigator.language.toLowerCase();
            setLanguageState(browserLang.startsWith('fr') ? 'fr' : 'en');
        }
    }, [storageKey]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        // Sauvegarder avec la clé spécifique au contexte
        localStorage.setItem(storageKey, lang);
    };

    const t = (key: string) => {
        return translations[key]?.[language] || key;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error("useLanguage must be used within a LanguageProvider");
    }
    return context;
}
