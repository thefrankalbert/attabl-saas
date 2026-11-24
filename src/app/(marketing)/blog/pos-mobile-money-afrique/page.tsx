import type { Metadata } from 'next';
import { BlogArticle } from '@/components/marketing/blog/BlogArticle';
import { articleMetadata } from '../article-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return articleMetadata('pos');
}

export default function ArticlePosPage() {
  return <BlogArticle articleKey="pos" />;
}
