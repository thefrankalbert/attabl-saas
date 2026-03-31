'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const FAQ_ITEMS = [
  {
    question: 'Comment creer mon premier menu ?',
    answer:
      'Rendez-vous dans la section "Menus" depuis le tableau de bord, puis cliquez sur "Nouveau menu". Ajoutez ensuite des categories (entrees, plats, desserts...) et des articles pour chacune d\'elles. Vous pouvez ajouter des photos, des descriptions et des prix pour chaque article.',
  },
  {
    question: 'Comment generer un QR code pour mes tables ?',
    answer:
      'Allez dans "QR Codes" depuis le menu lateral. Vous pouvez generer un QR code unique pour chaque table ou un QR code general pour votre etablissement. Telechargez-les en haute resolution pour impression.',
  },
  {
    question: "Comment fonctionne l'ecran cuisine (KDS) ?",
    answer:
      'L\'ecran cuisine affiche en temps reel les commandes entrantes. Les commandes sont automatiquement routees selon leur type (boissons vers le bar, plats vers la cuisine). Le personnel peut marquer les commandes comme "en preparation" puis "pretes".',
  },
  {
    question: 'Puis-je modifier les prix de mes articles ?',
    answer:
      'Oui, rendez-vous dans "Articles" et cliquez sur l\'article a modifier. Vous pouvez changer le prix de base, ajouter des variantes de prix (ex : taille S/M/L) et des options payantes (supplements). Les modifications sont effectives immediatement sur le menu client.',
  },
  {
    question: 'Comment changer mon abonnement ?',
    answer:
      'Accedez a "Abonnement" depuis le menu de votre compte (en bas de la barre laterale). Vous pouvez passer du plan Starter au plan Pro ou Business, ou basculer entre facturation mensuelle, semestrielle et annuelle. Le changement prend effet immediatement.',
  },
  {
    question: 'Comment gerer les commandes en temps reel ?',
    answer:
      'Les nouvelles commandes apparaissent instantanement dans l\'onglet "Commandes" et sur l\'ecran cuisine. Vous recevez une notification sonore a chaque nouvelle commande. Vous pouvez accepter, preparer et marquer les commandes comme servies.',
  },
  {
    question: 'Comment utiliser la Caisse (POS) ?',
    answer:
      'Accedez a "Caisse" depuis le menu lateral. Le point de vente vous permet de prendre des commandes rapidement, de selectionner les articles du menu, d\'appliquer des coupons et de proceder a l\'encaissement. Ideal pour la prise de commande au comptoir ou en salle.',
  },
  {
    question: 'Comment gerer mon inventaire et mes fournisseurs ?',
    answer:
      'La section "Inventaire" permet de suivre vos stocks en temps reel. Ajoutez des fournisseurs dans "Fournisseurs" et creez des fiches techniques (recettes) dans "Recettes" pour calculer automatiquement les couts de revient. L\'historique des mouvements de stock est disponible dans "Historique stock".',
  },
  {
    question: 'Comment gerer mon equipe et les permissions ?',
    answer:
      'Allez dans "Equipe" pour ajouter des membres (serveurs, cuisiniers, managers). Dans "Parametres > Permissions", configurez des roles personnalises avec des permissions granulaires pour controler l\'acces a chaque section du dashboard.',
  },
  {
    question: 'Comment acceder aux rapports et analyses ?',
    answer:
      'La section "Rapports" offre des statistiques detaillees : chiffre d\'affaires, nombre de commandes, produits les plus vendus, et tendances. Vous pouvez filtrer par periode et exporter les donnees en CSV ou Excel.',
  },
  {
    question: 'Comment creer des promotions et coupons ?',
    answer:
      'Accedez a "Coupons" depuis le menu lateral pour creer des codes promotionnels avec reduction en pourcentage ou montant fixe. Vous pouvez aussi publier des annonces visibles par vos clients via la section "Annonces".',
  },
  {
    question: "Est-il possible d'avoir plusieurs etablissements ?",
    answer:
      "Oui, vous pouvez gerer plusieurs etablissements depuis un meme compte. Chaque etablissement dispose de son propre sous-domaine, menu et configuration. Utilisez le selecteur en haut de la barre laterale pour passer d'un etablissement a l'autre.",
  },
  {
    question: 'Comment contacter le support technique ?',
    answer:
      'Ecrivez-nous a support@attabl.com. Notre equipe repond generalement sous 24 heures, du lundi au vendredi. Pour les urgences, precisez "URGENT" dans l\'objet de votre email.',
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
