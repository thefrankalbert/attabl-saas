import type { Metadata } from 'next';
import { BlogArticle } from '@/components/marketing/blog/BlogArticle';
import { articleMetadata } from '../article-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return articleMetadata('qr');
}

export default function ArticleMenuQrPage() {
  return <BlogArticle articleKey="qr" />;
}
