import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

// Verification visuelle du lot B2b-2 (defaut 1): les boutons rouges B128
// (`bg-[var(--destructive)] ... hover:opacity-90`) passaient au GRIS au survol:
// `hover:bg-accent-hover` de la variante par defaut du Button restait dans la
// classe finale. Chaque usage porte maintenant `hover:bg-[var(--destructive)]`,
// que tailwind-merge prefere au survol de la variante.

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== '__tests__' && name !== 'ui') walk(p, out);
    } else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

// Les classes des boutons rouges pleins (fond destructif + survol).
const allRedFills = walk(join(process.cwd(), 'src')).flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(/['"]([^'"]*bg-\[var\(--destructive\)\][^'"]*)['"]/g)]
    .map((m) => m[1])
    .map((cls) => ({ file, cls })),
);
const usages = allRedFills.filter((u) => u.cls.includes('hover:'));

describe('boutons destructifs: le fond reste rouge au survol', () => {
  it('temoin: les huit usages B128 sont trouves', () => {
    expect(usages).toHaveLength(8);
  });

  // Un fond rouge SANS classe de survol n'est permis que pour un element non
  // cliquable. Un seul existe: le bandeau "ecran non synchronise" de la
  // cuisine. Un nouveau bouton rouge ecrit sans survol fait echouer ce compte.
  it('un seul fond rouge sans survol: le bandeau cuisine', () => {
    const noHover = allRedFills.filter((u) => !u.cls.includes('hover:'));
    expect(noHover.map((u) => u.file.split('/src/')[1])).toEqual([
      'components/admin/KitchenClient.tsx',
    ]);
  });

  it.each(usages.map((u) => [u.file.split('/src/')[1], u.cls]))('%s', (_file, cls) => {
    const finalClass = cn(buttonVariants(), cls);
    expect(finalClass).toContain('hover:bg-[var(--destructive)]');
    expect(finalClass).not.toContain('hover:bg-accent-hover');
  });

  it('temoin negatif: sans la correction, le survol gris de la variante gagne', () => {
    const before = cn(
      buttonVariants(),
      'bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90',
    );
    expect(before).toContain('hover:bg-accent-hover');
  });
});
