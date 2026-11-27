import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ARTICLES, type ArticleKey } from './articles';

export async function articleMetadata(key: ArticleKey): Promise<Metadata> {
  const t = await getTranslations('marketing.blog.articles');
  const slug = ARTICLES.find((a) => a.key === key)?.slug;
  return {
    ...(slug ? { alternates: { canonical: `/blog/${slug}` } } : {}),
    title: t(`${key}.title`),
    description: t(`${key}.metaDescription`),
    openGraph: {
      title: t(`${key}.title`),
      description: t(`${key}.ogDescription`),
      type: 'article',
    },
  };
}
