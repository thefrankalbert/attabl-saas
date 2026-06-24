'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const FAQ_ITEMS = [
  {
    question: 'Comment créer mon premier menu ?',
    answer:
      'Rendez-vous dans la section "Menus" depuis le tableau de bord, puis cliquez sur "Nouveau menu". Ajoutez ensuite des catégories (entrées, plats, desserts...) et des articles pour chacune d\'elles. Vous pouvez ajouter des photos, des descriptions et des prix pour chaque article.',
  },
  {
    question: 'Comment générer un QR code pour mes tables ?',
    answer:
      'Allez dans "QR Codes" depuis le menu latéral. Vous pouvez générer un QR code unique pour chaque table ou un QR code général pour votre établissement. Téléchargez-les en haute résolution pour impression.',
  },
  {
    question: "Comment fonctionne l'écran cuisine (KDS) ?",
    answer:
      'L\'écran cuisine affiche en temps réel les commandes entrantes. Les commandes sont automatiquement routées selon leur type (boissons vers le bar, plats vers la cuisine). Le personnel peut marquer les commandes comme "en préparation" puis "prêtes".',
  },
  {
    question: 'Puis-je modifier les prix de mes articles ?',
    answer:
      'Oui, rendez-vous dans "Articles" et cliquez sur l\'article à modifier. Vous pouvez changer le prix de base, ajouter des variantes de prix (ex : taille S/M/L) et des options payantes (suppléments). Les modifications sont effectives immédiatement sur le menu client.',
  },
  {
    question: 'Comment changer mon abonnement ?',
    answer:
      'Accédez à "Abonnement" depuis le menu de votre compte (en bas de la barre latérale). Vous pouvez passer du plan Starter au plan Pro ou Business, ou basculer entre facturation mensuelle, semestrielle et annuelle. Le changement prend effet immédiatement.',
  },
  {
    question: 'Comment gérer les commandes en temps réel ?',
    answer:
      'Les nouvelles commandes apparaissent instantanément dans l\'onglet "Commandes" et sur l\'écran cuisine. Vous recevez une notification sonore à chaque nouvelle commande. Vous pouvez accepter, préparer et marquer les commandes comme servies.',
  },
  {
    question: 'Comment utiliser la Caisse (POS) ?',
    answer:
      'Accédez à "Caisse" depuis le menu latéral. Le point de vente vous permet de prendre des commandes rapidement, de sélectionner les articles du menu, d\'appliquer des coupons et de procéder à l\'encaissement. Idéal pour la prise de commande au comptoir ou en salle.',
  },
  {
    question: 'Comment gérer mon inventaire et mes fournisseurs ?',
    answer:
      'La section "Inventaire" permet de suivre vos stocks en temps réel. Ajoutez des fournisseurs dans "Fournisseurs" et créez des fiches techniques (recettes) dans "Recettes" pour calculer automatiquement les coûts de revient. L\'historique des mouvements de stock est disponible dans "Historique stock".',
  },
  {
    question: 'Comment gérer mon équipe et les permissions ?',
    answer:
      'Allez dans "Équipe" pour ajouter des membres (serveurs, cuisiniers, managers). Dans "Paramètres > Permissions", configurez des rôles personnalisés avec des permissions granulaires pour contrôler l\'accès à chaque section du dashboard.',
  },
  {
    question: 'Comment accéder aux rapports et analyses ?',
    answer:
      'La section "Rapports" offre des statistiques détaillées : chiffre d\'affaires, nombre de commandes, produits les plus vendus, et tendances. Vous pouvez filtrer par période et exporter les données en CSV ou Excel.',
  },
  {
    question: 'Comment créer des promotions et coupons ?',
    answer:
      'Accédez à "Coupons" depuis le menu latéral pour créer des codes promotionnels avec réduction en pourcentage ou montant fixe. Vous pouvez aussi publier des annonces visibles par vos clients via la section "Annonces".',
  },
  {
    question: "Est-il possible d'avoir plusieurs établissements ?",
    answer:
      "Oui, vous pouvez gérer plusieurs établissements depuis un même compte. Chaque établissement dispose de son propre sous-domaine, menu et configuration. Utilisez le sélecteur en haut de la barre latérale pour passer d'un établissement à l'autre.",
  },
  {
    question: 'Comment contacter le support technique ?',
    answer:
      'Écrivez-nous à support@attabl.com. Notre équipe répond généralement sous 24 heures, du lundi au vendredi. Pour les urgences, précisez "URGENT" dans l\'objet de votre email.',
  },
];

export function SupportFAQ() {
  return (
    <Accordion type="single" collapsible className="px-4">
      {FAQ_ITEMS.map((item, index) => (
        <AccordionItem key={index} value={`faq-${index}`}>
          <AccordionTrigger className="text-left text-app-text hover:no-underline hover:text-accent">
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="text-app-text-secondary leading-relaxed">
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
