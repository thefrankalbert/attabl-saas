'use client';

// Logos SVG de partenaires/clients fictifs
const Logo1 = () => (
  <svg width="120" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="2" opacity="0.7" />
    <text x="45" y="25" fill="white" fontSize="16" fontWeight="700" opacity="0.7">
      LE GARDEN
    </text>
  </svg>
);

const Logo2 = () => (
  <svg width="140" height="40" viewBox="0 0 140 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="10" width="25" height="20" stroke="white" strokeWidth="2" opacity="0.7" />
    <text x="35" y="25" fill="white" fontSize="16" fontWeight="700" opacity="0.7">
      HOTEL LUXE
    </text>
  </svg>
);

const Logo3 = () => (
  <svg width="130" height="40" viewBox="0 0 130 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 5 L25 5 L20 15 Z" fill="white" opacity="0.7" />
    <text x="35" y="25" fill="white" fontSize="16" fontWeight="700" opacity="0.7">
      BISTRO 55
    </text>
  </svg>
);

const Logo4 = () => (
  <svg width="120" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="15" cy="15" r="8" fill="white" opacity="0.7" />
    <circle cx="25" cy="15" r="8" fill="white" opacity="0.7" />
    <text x="40" y="25" fill="white" fontSize="16" fontWeight="700" opacity="0.7">
      CAFÉ NOIR
    </text>
  </svg>
);

const Logo5 = () => (
  <svg width="150" height="40" viewBox="0 0 150 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="8" width="20" height="24" rx="3" stroke="white" strokeWidth="2" opacity="0.7" />
    <text x="35" y="25" fill="white" fontSize="16" fontWeight="700" opacity="0.7">
      BOULANGERIE
    </text>
  </svg>
);

const Logo6 = () => (
  <svg width="140" height="40" viewBox="0 0 140 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 25 L20 10 L30 25 Z" stroke="white" strokeWidth="2" fill="none" opacity="0.7" />
    <text x="40" y="25" fill="white" fontSize="16" fontWeight="700" opacity="0.7">
      LA TABLE
    </text>
  </svg>
);

const Logo7 = () => (
  <svg width="130" height="40" viewBox="0 0 130 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="12" width="18" height="16" rx="8" stroke="white" strokeWidth="2" opacity="0.7" />
    <text x="35" y="25" fill="white" fontSize="16" fontWeight="700" opacity="0.7">
      FOOD HUB
    </text>
  </svg>
);

const Logo8 = () => (
  <svg width="120" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="15" y1="10" x2="15" y2="30" stroke="white" strokeWidth="2" opacity="0.7" />
    <line x1="22" y1="10" x2="22" y2="30" stroke="white" strokeWidth="2" opacity="0.7" />
    <text x="35" y="25" fill="white" fontSize="16" fontWeight="700" opacity="0.7">
      LE ZINC
    </text>
  </svg>
);

const logos = [
  { name: 'Le Garden', component: Logo1 },
  { name: 'Hotel Luxe', component: Logo2 },
  { name: 'Bistro 55', component: Logo3 },
  { name: 'Café Noir', component: Logo4 },
  { name: 'Boulangerie', component: Logo5 },
  { name: 'La Table', component: Logo6 },
  { name: 'Food Hub', component: Logo7 },
  { name: 'Le Zinc', component: Logo8 },
];

export default function LogoMarquee() {
  return (
    <div className="absolute bottom-2 left-0 right-0 z-10 overflow-hidden py-6">
      <div className="relative flex">
        {/* Premier set de logos */}
        <div className="animate-scroll flex shrink-0 items-center gap-24 px-12">
          {logos.map((logo, idx) => {
            const LogoComponent = logo.component;
            return (
              <div
                key={`logo-1-${idx}`}
                className="flex h-16 items-center justify-center transition-opacity duration-300 hover:opacity-100"
              >
                <LogoComponent />
              </div>
            );
          })}
        </div>

        {/* Deuxième set de logos (pour l'effet de boucle infinie) */}
        <div className="animate-scroll flex shrink-0 items-center gap-24 px-12">
          {logos.map((logo, idx) => {
            const LogoComponent = logo.component;
            return (
              <div
                key={`logo-2-${idx}`}
                className="flex h-16 items-center justify-center transition-opacity duration-300 hover:opacity-100"
              >
                <LogoComponent />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
