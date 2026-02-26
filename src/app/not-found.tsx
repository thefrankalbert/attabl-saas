import Link from 'next/link';
import { ArrowLeft, Layout } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="text-center max-w-md">
        {/* Branding */}
        <div className="mx-auto mb-8 flex items-center justify-center gap-3">
          <div className="rounded-xl bg-[#CCFF00] p-2.5">
            <Layout className="h-6 w-6 text-black" />
          </div>
          <span className="text-2xl font-bold text-neutral-900">ATTABL</span>
        </div>

        <p className="text-7xl font-black text-neutral-100">404</p>
        <h1 className="mt-4 text-xl font-semibold text-neutral-900">Page introuvable</h1>
        <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
          Cette page n&apos;existe pas ou a &eacute;t&eacute; d&eacute;plac&eacute;e.
          V&eacute;rifiez l&apos;URL ou revenez &agrave; l&apos;accueil.
        </p>

        <Button asChild className="mt-8 gap-2 bg-neutral-900 hover:bg-neutral-800">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Retour &agrave; l&apos;accueil
          </Link>
        </Button>
      </div>
    </div>
  );
}
