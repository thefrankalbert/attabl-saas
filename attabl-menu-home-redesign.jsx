import { useState } from "react";

// ============================================
// ATTABL Menu Home — Redesign Dribbble "Hi Cook"
// Screen 1: Client Home Page
// Faithfully reproduces the Dribbble layout:
//   - Header: avatar + welcome + restaurant name + bell
//   - Search bar with filter button
//   - Categories: 2x4 grid with circular IMAGES
//   - Venues: horizontal scroll of circular avatars (replaces "Explore mentors")
//   - Promo banner (from Ads model)
//   - Announcement bar
//   - Popular items: horizontal scroll of food cards with image + tags + price
//   - Bottom nav: 5 tabs (Accueil active, Menu, Scanner, Panier, Plus)
// ============================================

// --- CATEGORY IMAGE MAPPING ---
// Since categories don't have image_url in DB, we use curated food photos
// In production: add image_url field to categories table, or use these defaults
const CATEGORY_IMAGES = {
  "entree":    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=200&h=200&fit=crop&crop=center",
  "plat":      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200&h=200&fit=crop&crop=center",
  "grillade":  "https://images.unsplash.com/photo-1558030006-450675393462?w=200&h=200&fit=crop&crop=center",
  "poisson":   "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=200&h=200&fit=crop&crop=center",
  "pizza":     "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200&h=200&fit=crop&crop=center",
  "dessert":   "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=200&h=200&fit=crop&crop=center",
  "cocktail":  "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=200&h=200&fit=crop&crop=center",
  "boisson":   "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=200&h=200&fit=crop&crop=center",
  "burger":    "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&h=200&fit=crop&crop=center",
  "pates":     "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=200&h=200&fit=crop&crop=center",
  "salade":    "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=200&h=200&fit=crop&crop=center",
  "soupe":     "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=200&h=200&fit=crop&crop=center",
  "vin":       "https://images.unsplash.com/photo-1474722883778-792e7990302f?w=200&h=200&fit=crop&crop=center",
  "biere":     "https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=200&h=200&fit=crop&crop=center",
  "cafe":      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=200&h=200&fit=crop&crop=center",
  "default":   "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200&h=200&fit=crop&crop=center",
};

function getCategoryImage(name) {
  const lower = (name || "").toLowerCase().trim();
  if (CATEGORY_IMAGES[lower]) return CATEGORY_IMAGES[lower];
  for (const [key, url] of Object.entries(CATEGORY_IMAGES)) {
    if (lower.includes(key) || key.includes(lower)) return url;
  }
  return CATEGORY_IMAGES.default;
}

// --- ICONS (inline SVG) ---
const Icons = {
  Bell: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
    </svg>
  ),
  Search: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.3-4.3"/>
    </svg>
  ),
  Filter: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/>
      <line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/>
      <line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/>
      <line x1="2" x2="6" y1="14" y2="14"/>
      <line x1="10" x2="14" y1="8" y2="8"/>
      <line x1="18" x2="22" y1="16" y2="16"/>
    </svg>
  ),
  Heart: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  ),
  Home: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  Menu: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
      <line x1="4" x2="4" y1="22" y2="15"/>
    </svg>
  ),
  QR: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/>
      <rect width="5" height="5" x="3" y="16" rx="1"/>
      <path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/>
      <path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/>
      <path d="M12 3h.01"/><path d="M12 16v.01"/>
      <path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>
    </svg>
  ),
  Bag: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
      <path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  ),
  More: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
    </svg>
  ),
};

// --- DEMO DATA ---
const demoCategories = [
  { id: "1", name: "Entrees" },
  { id: "2", name: "Plats" },
  { id: "3", name: "Grillades" },
  { id: "4", name: "Poissons" },
  { id: "5", name: "Pizzas" },
  { id: "6", name: "Desserts" },
  { id: "7", name: "Cocktails" },
  { id: "8", name: "Boissons" },
];

const demoVenues = [
  { id: "1", name: "Restaurant", image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=120&h=120&fit=crop&crop=center" },
  { id: "2", name: "Terrasse", image: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=120&h=120&fit=crop&crop=center" },
  { id: "3", name: "Bar lounge", image: "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=120&h=120&fit=crop&crop=center" },
  { id: "4", name: "Pool bar", image: "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=120&h=120&fit=crop&crop=center" },
  { id: "5", name: "Room Srv.", image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=120&h=120&fit=crop&crop=center" },
];

const demoFeatured = [
  { id: "1", name: "Salade Cesar", image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop", price: 4500, tags: ["Entree", "Vege"], tagColors: ["green", "green"] },
  { id: "2", name: "Brochettes mixtes", image: "https://images.unsplash.com/photo-1558030006-450675393462?w=400&h=300&fit=crop", price: 8500, tags: ["Grillade", "Epice"], tagColors: ["green", "red"] },
  { id: "3", name: "Tilapia braise", image: "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=400&h=300&fit=crop", price: 7000, tags: ["Poisson", "Chef"], tagColors: ["green", "orange"] },
  { id: "4", name: "Pizza Margherita", image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop", price: 6500, tags: ["Pizza", "Vege"], tagColors: ["green", "green"] },
];

const demoDesserts = [
  { id: "5", name: "Fondant chocolat", image: "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=300&fit=crop", price: 3500, tags: ["Dessert"], tagColors: ["green"] },
  { id: "6", name: "Mojito fraise", image: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&h=300&fit=crop", price: 4000, tags: ["Cocktail", "Happy H."], tagColors: ["green", "orange"] },
  { id: "7", name: "Cappuccino", image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=300&fit=crop", price: 2000, tags: ["Cafe"], tagColors: ["green"] },
];

// --- TAG COLOR MAP ---
const tagStyles = {
  green:  { background: "#F0F7F1", color: "#2D5A3D" },
  red:    { background: "#FFEDE9", color: "#E25B45" },
  orange: { background: "#FFF3E8", color: "#C5A065" },
};

// --- FORMAT PRICE ---
function formatPrice(amount) {
  return amount.toLocaleString("fr-FR").replace(/\s/g, "\u2009") + "\u2009FCFA";
}

// ============================================
// COMPONENTS
// ============================================

function SectionHeader({ title, actionLabel = "Voir tout", onAction }) {
  return (
    <div className="flex items-center justify-between px-6 mb-3.5">
      <h3 className="text-[17px] font-bold text-[#1A1A1A] tracking-tight">{title}</h3>
      {actionLabel && (
        <button onClick={onAction} className="text-[13px] font-semibold text-[#2D5A3D]">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function CategoryCircle({ category, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 group">
      <div className="w-16 h-16 rounded-full overflow-hidden bg-[#F5F0E8] transition-transform group-hover:scale-105">
        <img
          src={getCategoryImage(category.name)}
          alt={category.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
      <span className="text-[11px] font-medium text-[#4A4A4A] text-center max-w-[72px] truncate">
        {category.name}
      </span>
    </button>
  );
}

function VenueAvatar({ venue, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 shrink-0">
      <div className="w-14 h-14 rounded-full border-2 border-[#2D5A3D] p-0.5 bg-white">
        <img
          src={venue.image}
          alt={venue.name}
          className="w-full h-full rounded-full object-cover"
          loading="lazy"
        />
      </div>
      <span className="text-[11px] font-medium text-[#4A4A4A] text-center max-w-[64px] truncate">
        {venue.name}
      </span>
    </button>
  );
}

function FoodCard({ item, onClick }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 w-[164px] bg-white rounded-2xl overflow-hidden border border-[#F0EFEB] text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      {/* Image */}
      <div className="w-full h-[130px] relative overflow-hidden bg-[#F5F0E8]">
        <img src={item.image} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
        <div className="absolute top-2 right-2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center">
          <Icons.Heart />
        </div>
      </div>
      {/* Content */}
      <div className="p-3 pt-2.5">
        <div className="text-[13px] font-semibold text-[#1A1A1A] mb-1.5 truncate">{item.name}</div>
        <div className="flex gap-1 flex-wrap mb-2">
          {item.tags.map((tag, i) => (
            <span
              key={i}
              className="text-[10px] font-medium px-2 py-0.5 rounded-md"
              style={tagStyles[item.tagColors[i]] || tagStyles.green}
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="text-sm font-bold text-[#2D5A3D]">{formatPrice(item.price)}</div>
      </div>
    </button>
  );
}

function BottomNavItem({ icon: Icon, label, active, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 relative pt-1 ${
        active ? "text-[#2D5A3D]" : "text-[#BFBFBF]"
      }`}
    >
      {active && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-6 h-[3px] rounded-full bg-[#2D5A3D]" />
      )}
      <span style={{ strokeWidth: active ? 2.2 : 1.8 }}><Icon /></span>
      {badge && (
        <span className="absolute top-0 -right-1 min-w-4 h-4 bg-[#E25B45] rounded-full text-[9px] font-bold text-white flex items-center justify-center px-1 border-2 border-white">
          {badge}
        </span>
      )}
      <span className={`text-[10px] ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
    </button>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function AttablMenuHome() {
  const [activeNav, setActiveNav] = useState("home");

  // In real usage, these come from props/context:
  // const { tenant } = useTenant();
  // const { items: cartItems } = useCartData();
  // categories, venues, featuredItems from server component props

  const tenant = {
    name: "Le Radisson Blu",
    logo_url: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=120&h=120&fit=crop&crop=center",
    primary_color: "#2D5A3D",
  };

  return (
    <div className="relative w-full max-w-md mx-auto bg-white min-h-dvh overflow-hidden">
      <div className="overflow-y-auto overflow-x-hidden pb-24" style={{ WebkitOverflowScrolling: "touch" }}>

        {/* ═══ HEADER ═══ */}
        <div className="flex items-center justify-between px-6 pt-14 pb-3">
          <div className="flex items-center gap-3">
            <img
              src={tenant.logo_url}
              alt={tenant.name}
              className="w-11 h-11 rounded-full object-cover border-2 border-[#E8F0E8]"
            />
            <div>
              <h2 className="text-base font-semibold text-[#1A1A1A] leading-tight">Bienvenue</h2>
              <span className="text-xs text-[#8B8B8B]">{tenant.name}</span>
            </div>
          </div>
          <button className="w-10 h-10 rounded-full bg-[#F5F5F3] flex items-center justify-center relative">
            <Icons.Bell />
            <span className="absolute top-[9px] right-[10px] w-2 h-2 bg-[#E25B45] rounded-full border-2 border-white" />
          </button>
        </div>

        {/* ═══ SEARCH BAR ═══ */}
        <div className="mx-6 my-3 h-12 bg-[#F7F7F5] rounded-[14px] flex items-center px-4 gap-2.5 border border-[#EEEDE9]">
          <span className="text-[#A0A0A0]"><Icons.Search /></span>
          <span className="text-sm text-[#A0A0A0] flex-1">Rechercher un plat...</span>
          <div className="w-9 h-9 rounded-[10px] bg-[#2D5A3D] flex items-center justify-center text-white">
            <Icons.Filter />
          </div>
        </div>

        {/* ═══ CATEGORIES ═══ */}
        <div className="mt-5">
          <SectionHeader title="Categories" />
          <div className="grid grid-cols-4 gap-y-2 gap-x-0 px-5 mb-6">
            {demoCategories.slice(0, 8).map((cat) => (
              <CategoryCircle key={cat.id} category={cat} onClick={() => {}} />
            ))}
          </div>
        </div>

        {/* ═══ VENUES (replaces "Explore cooking mentors") ═══ */}
        <div className="mb-6">
          <SectionHeader title="Nos espaces" />
          <div className="flex gap-4 overflow-x-auto px-6 no-scrollbar" style={{ scrollSnapType: "x mandatory" }}>
            {demoVenues.map((v) => (
              <VenueAvatar key={v.id} venue={v} onClick={() => {}} />
            ))}
          </div>
        </div>

        {/* ═══ PROMO BANNER ═══ */}
        <div className="mx-6 mb-5 h-[120px] rounded-2xl overflow-hidden relative bg-gradient-to-br from-[#2D5A3D] via-[#3E7A52] to-[#4A8F5F] cursor-pointer">
          <div className="relative z-10 p-5 h-full flex flex-col justify-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/70 mb-1.5">
              Offre speciale
            </div>
            <div className="text-lg font-bold text-white leading-tight max-w-[200px]">
              -20% sur le brunch du dimanche
            </div>
            <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-white opacity-85">
              Decouvrir <Icons.ChevronRight />
            </div>
          </div>
          {/* Decorative circles */}
          <svg className="absolute right-4 top-1/2 -translate-y-1/2 opacity-15" width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="50" fill="rgba(255,255,255,0.08)"/>
            <circle cx="60" cy="60" r="35" fill="rgba(255,255,255,0.06)"/>
            <circle cx="60" cy="60" r="20" fill="rgba(255,255,255,0.04)"/>
          </svg>
        </div>

        {/* ═══ ANNOUNCEMENT ═══ */}
        <div className="mx-6 mb-4 px-3.5 py-2.5 bg-[#FFF8ED] rounded-[10px] border border-[#F5E6CC] flex items-center gap-2">
          <span className="text-base shrink-0">&#128226;</span>
          <span className="text-xs font-medium text-[#7A6840] leading-snug">
            Happy hour de 17h a 19h — Cocktails a moitie prix !
          </span>
        </div>

        {/* ═══ POPULAR ITEMS ═══ */}
        <div className="mb-6">
          <SectionHeader title="Plats populaires" />
          <div className="flex gap-3.5 overflow-x-auto px-6 no-scrollbar" style={{ scrollSnapType: "x mandatory" }}>
            {demoFeatured.map((item) => (
              <FoodCard key={item.id} item={item} onClick={() => {}} />
            ))}
          </div>
        </div>

        {/* ═══ DESSERTS & BOISSONS ═══ */}
        <div className="mb-6">
          <SectionHeader title="Desserts & boissons" />
          <div className="flex gap-3.5 overflow-x-auto px-6 no-scrollbar" style={{ scrollSnapType: "x mandatory" }}>
            {demoDesserts.map((item) => (
              <FoodCard key={item.id} item={item} onClick={() => {}} />
            ))}
          </div>
        </div>

        <div className="h-5" />
      </div>

      {/* ═══ BOTTOM NAV ═══ */}
      <div className="absolute bottom-0 left-0 right-0 h-[82px] bg-white border-t border-[#F0EFEB] flex items-start justify-around px-3 pt-2.5 z-10"
           style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <BottomNavItem icon={Icons.Home} label="Accueil" active={activeNav === "home"} onClick={() => setActiveNav("home")} />
        <BottomNavItem icon={Icons.Menu} label="Menu" active={activeNav === "menu"} onClick={() => setActiveNav("menu")} />
        <BottomNavItem icon={Icons.QR} label="Scanner" active={activeNav === "scanner"} onClick={() => setActiveNav("scanner")} />
        <BottomNavItem icon={Icons.Bag} label="Panier" badge="2" active={activeNav === "cart"} onClick={() => setActiveNav("cart")} />
        <BottomNavItem icon={Icons.More} label="Plus" active={activeNav === "more"} onClick={() => setActiveNav("more")} />
      </div>
    </div>
  );
}