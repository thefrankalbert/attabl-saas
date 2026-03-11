'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const FAQ_ITEMS = [
  {
    question: 'Comment cr\u00e9er mon premier menu ?',
    answer:
      'Rendez-vous dans la section "Menus" depuis le tableau de bord, puis cliquez sur "Nouveau menu". Ajoutez ensuite des cat\u00e9gories (entr\u00e9es, plats, desserts...) et des articles pour chacune d\u0027elles. Vous pouvez ajouter des photos, des descriptions et des prix pour chaque article.',
  },
  {
    question: 'Comment g\u00e9n\u00e9rer un QR code pour mes tables ?',
    answer:
      'Allez dans "QR Codes" depuis le menu lat\u00e9ral. Vous pouvez g\u00e9n\u00e9rer un QR code unique pour chaque table ou un QR code g\u00e9n\u00e9ral pour votre \u00e9tablissement. T\u00e9l\u00e9chargez-les en haute r\u00e9solution pour impression.',
  },
  {
    question: 'Comment fonctionne l\u0027\u00e9cran cuisine (KDS) ?',
    answer:
      'L\u0027\u00e9cran cuisine affiche en temps r\u00e9el les commandes entrantes. Les commandes sont automatiquement rout\u00e9es selon leur type (boissons vers le bar, plats vers la cuisine). Le personnel peut marquer les commandes comme "en pr\u00e9paration" puis "pr\u00eates".',
  },
  {
    question: 'Puis-je modifier les prix de mes articles ?',
    answer:
      'Oui, rendez-vous dans "Articles" et cliquez sur l\u0027article \u00e0 modifier. Vous pouvez changer le prix de base, ajouter des variantes de prix (ex : taille S/M/L) et des options payantes (suppl\u00e9ments). Les modifications sont effectives imm\u00e9diatement sur le menu client.',
  },
  {
    question: 'Comment changer mon abonnement ?',
    answer:
      'Acc\u00e9dez \u00e0 "Abonnement" depuis le menu de votre compte (en bas de la barre lat\u00e9rale). Vous pouvez passer du plan Essentiel au plan Premium, ou basculer entre facturation mensuelle et annuelle. Le changement prend effet imm\u00e9diatement.',
  },
  {
    question: 'Comment g\u00e9rer les commandes en temps r\u00e9el ?',
    answer:
      'Les nouvelles commandes apparaissent instantan\u00e9ment dans l\u0027onglet "Commandes" et sur l\u0027\u00e9cran cuisine. Vous recevez une notification sonore \u00e0 chaque nouvelle commande. Vous pouvez accepter, pr\u00e9parer et marquer les commandes comme servies.',
  },
  {
    question: 'Est-il possible d\u0027avoir plusieurs \u00e9tablissements ?',
    answer:
      'Oui, vous pouvez g\u00e9rer plusieurs \u00e9tablissements depuis un m\u00eame compte. Chaque \u00e9tablissement dispose de son propre sous-domaine, menu et configuration. Utilisez le s\u00e9lecteur en haut de la barre lat\u00e9rale pour passer d\u0027un \u00e9tablissement \u00e0 l\u0027autre.',
  },
  {
    question: 'Comment contacter le support technique ?',
    answer:
      '\u00c9crivez-nous \u00e0 support@attabl.com. Notre \u00e9quipe r\u00e9pond g\u00e9n\u00e9ralement sous 24 heures, du lundi au vendredi. Pour les urgences, pr\u00e9cisez "URGENT" dans l\u0027objet de votre email.',
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
