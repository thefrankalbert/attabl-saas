import type { Metadata } from 'next';
import { BlogArticle } from '@/components/marketing/blog/BlogArticle';
import { articleMetadata } from '../article-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return articleMetadata('stock');
}

export default function ArticleStockPage() {
  return <BlogArticle articleKey="stock" />;
}
