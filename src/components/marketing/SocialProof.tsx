'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { TestimonialsColumn, type Testimonial } from '@/components/ui/testimonials-columns';

const testimonials: Testimonial[] = [
  {
    text: "On a réduit les erreurs de commande de 40% en 2 mois. La cuisine reçoit tout sur l'écran, plus de tickets perdus.",
    image: '/avatars/ak.png',
    name: 'Amadou K.',
    role: "Le Jardin - N'Djamena",
  },
  {
    text: 'Le room service digital a changé notre classement Booking. Les clients commandent depuis le lit, en anglais ou en français.',
    image: '/avatars/id.png',
    name: 'Ibrahim D.',
    role: 'Hôtel Prestige - Abidjan',
  },
  {
    text: '200 commandes par jour, zéro stress. Le KDS fait le tri, on prépare, on envoie.',
    image: '/avatars/gm.png',
    name: 'Grace M.',
    role: 'Chez Mama - Douala',
  },
  {
    text: 'Le QR code a transformé notre service. Les clients scannent, commandent et paient sans attendre un serveur.',
    image: '/avatars/jn.png',
    name: 'Jean-Pierre N.',
    role: 'Brasserie du Port - Libreville',
  },
  {
    text: "En 3 mois, notre chiffre d'affaires a augmenté de 25%. Le menu digital pousse les clients à commander plus.",
    image: '/avatars/fs.png',
    name: 'Fatou S.',
    role: 'La Terrasse - Dakar',
  },
  {
    text: "Le suivi des stocks en temps réel m'a évité des ruptures. Je sais exactement quoi commander et quand.",
    image: '/avatars/po.png',
    name: 'Patrick O.',
    role: 'Saveurs Locales - Yaoundé',
  },
  {
    text: 'Avant ATTABL, on perdait 2h par jour à gérer les commandes papier. Maintenant tout est automatisé.',
    image: '/avatars/ab.png',
    name: 'Aissatou B.',
    role: "L'Escale Gourmande - Conakry",
  },
  {
    text: 'Le dashboard analytics me donne une vision claire de mes ventes. Je prends de meilleures décisions chaque semaine.',
    image: '/avatars/et.png',
    name: 'Emmanuel T.',
    role: 'Royal Beach Hotel - Lomé',
  },
  {
    text: "L'onboarding a pris 15 minutes. Le lendemain, on avait notre menu digital en ligne avec QR codes sur chaque table.",
    image: '/avatars/ma.png',
    name: 'Marie-Claire A.',
    role: 'Café des Arts - Kinshasa',
  },
];

const firstColumn = testimonials.slice(0, 3);
const secondColumn = testimonials.slice(3, 6);
const thirdColumn = testimonials.slice(6, 9);

export default function SocialProof() {
  const t = useTranslations('marketing.home.socialProof');

  return (
    <section className="bg-white dark:bg-neutral-950 py-20 sm:py-28 relative">
      <div className="container z-10 mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          viewport={{ once: true }}
          className="flex flex-col items-center justify-center max-w-[540px] mx-auto"
        >
          <div className="flex justify-center">
            <div className="border border-neutral-200 dark:border-neutral-800 py-1 px-4 rounded-lg text-sm text-neutral-600 dark:text-neutral-400">
              {t('badge')}
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold tracking-tighter mt-5 text-neutral-900 dark:text-white text-center">
            {t('title')}
          </h2>
          <p className="text-center mt-5 opacity-75 text-neutral-600 dark:text-neutral-400">
            {t('subtitle')}
          </p>
        </motion.div>

        <div className="flex justify-center gap-6 mt-10 [mask-image:linear-gradient(to_bottom,transparent,black_25%,black_75%,transparent)] max-h-[740px] overflow-hidden">
          <TestimonialsColumn testimonials={firstColumn} duration={15} />
          <TestimonialsColumn
            testimonials={secondColumn}
            className="hidden md:block"
            duration={19}
          />
          <TestimonialsColumn
            testimonials={thirdColumn}
            className="hidden lg:block"
            duration={17}
          />
        </div>
      </div>
    </section>
  );
}
