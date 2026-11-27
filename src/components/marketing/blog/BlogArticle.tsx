import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ARTICLES, ARTICLE_DATE_FORMAT, type ArticleKey } from '@/app/(marketing)/blog/articles';

type Block =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'ul'; items: Record<string, { lead: string; text: string }> };

export async function BlogArticle({ articleKey }: { articleKey: ArticleKey }) {
  const [t, format] = await Promise.all([getTranslations('marketing.blog'), getFormatter()]);
  const meta = ARTICLES.find((a) => a.key === articleKey);
  if (!meta) return null;
  const blocks = Object.values(t.raw(`articles.${articleKey}.body`) as Record<string, Block>);

  return (
    <article className="py-20 lg:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <Link
            href="/blog"
            className="inline-flex min-h-11 items-center text-sm text-neutral-500 dark:text-neutral-400 transition-colors hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            &larr; {t('back')}
          </Link>
        </div>

        <header className="mb-12">
          <div className="mb-4 flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
            <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2.5 py-0.5 text-xs font-medium text-neutral-900 dark:text-white">
              {t(`categories.${meta.category}`)}
            </span>
            <span>{format.dateTime(new Date(meta.date), ARTICLE_DATE_FORMAT)}</span>
            <span>&middot;</span>
            <span>{t('readTime', { minutes: meta.minutes })}</span>
          </div>
          <h1 className="font-[family-name:var(--font-sora)] text-3xl font-bold leading-tight text-neutral-900 dark:text-white sm:text-4xl">
            {t(`articles.${articleKey}.title`)}
          </h1>
        </header>

        <div className="prose prose-neutral dark:prose-invert prose-lg max-w-none [&>h2]:font-[family-name:var(--font-sora)] [&>h2]:text-2xl [&>h2]:font-bold [&>h2]:mt-12 [&>h2]:mb-4 [&>p]:text-neutral-600 dark:[&>p]:text-neutral-400 [&>p]:leading-relaxed [&>p]:mb-6 [&>ul]:text-neutral-600 dark:[&>ul]:text-neutral-400 [&>ul]:mb-6 [&>ul>li]:mb-2">
          {blocks.map((block, i) => {
            if (block.type === 'h2') return <h2 key={i}>{block.text}</h2>;
            if (block.type === 'ul') {
              return (
                <ul key={i}>
                  {Object.values(block.items).map((item) => (
                    <li key={item.lead}>
                      <strong>{item.lead}</strong> - {item.text}
                    </li>
                  ))}
                </ul>
              );
            }
            return <p key={i}>{block.text}</p>;
          })}
        </div>

        <div className="mt-16 border-t border-neutral-200 dark:border-neutral-800 pt-12">
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            {t(`articles.${articleKey}.ctaLead`)}
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center rounded-lg bg-neutral-900 dark:bg-white px-6 py-3 text-sm font-semibold text-white dark:text-neutral-900 transition-colors hover:bg-neutral-800 dark:hover:bg-neutral-200"
          >
            {t('cta.button')}
          </Link>
        </div>
      </div>
    </article>
  );
}
