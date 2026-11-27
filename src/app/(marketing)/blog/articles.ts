/**
 * Registre des articles du blog. Les textes (titres, extraits, corps) vivent
 * dans `marketing.blog.articles.<key>` des fichiers de messages, en francais et
 * en anglais ; ici ne restent que les donnees qui ne se traduisent pas.
 */
export type ArticleKey = 'stock' | 'qr' | 'pos';
type ArticleCategory = 'management' | 'restauration' | 'payments';

export type ArticleMeta = {
  slug: string;
  key: ArticleKey;
  category: ArticleCategory;
  /** Date ISO (AAAA-MM-JJ), formatee selon la langue a l'affichage. */
  date: string;
  minutes: number;
};

export const ARTICLES: readonly ArticleMeta[] = [
  {
    slug: 'gestion-stock-commerce-afrique',
    key: 'stock',
    category: 'management',
    date: '2026-03-12',
    minutes: 8,
  },
  {
    slug: 'menu-qr-code-restaurant',
    key: 'qr',
    category: 'restauration',
    date: '2026-03-08',
    minutes: 6,
  },
  {
    slug: 'pos-mobile-money-afrique',
    key: 'pos',
    category: 'payments',
    date: '2026-03-03',
    minutes: 5,
  },
];

export const ARTICLE_DATE_FORMAT = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  // UTC: meme rendu serveur et client, pas de decalage d'un jour.
  timeZone: 'UTC',
} as const;
