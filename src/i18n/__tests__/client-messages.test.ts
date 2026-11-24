/**
 * Garde-fou des messages envoyes au navigateur (src/i18n/client-messages.ts).
 *
 * Le layout racine n'envoie plus tout le catalogue : chaque zone publique
 * n'envoie que les espaces de noms de ses composants client, et les autres
 * zones re-fournissent le catalogue complet. Deux regressions sont faciles et
 * silencieuses : un composant client de la vitrine qui se met a utiliser un
 * nouvel espace de noms, ou une nouvelle zone sous src/app sans fournisseur de
 * messages. Dans les deux cas le navigateur afficherait des cles brutes au lieu
 * des textes. Ces tests les attrapent.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  AUTH_CLIENT_NAMESPACES,
  MARKETING_CLIENT_NAMESPACES,
  ROOT_CLIENT_NAMESPACES,
  SITES_CLIENT_NAMESPACES,
  STOREFRONT_CLIENT_NAMESPACES,
  pickMessages,
} from '../client-messages';

const SRC = path.resolve(__dirname, '../..');
const APP = path.join(SRC, 'app');

function filesIn(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) filesIn(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  const candidates = [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

// `from '<module>'` suffit a reperer import et export (sans balayer la clause
// avant `from`, ce qui exposait l'expression a un retour arriere couteux).
const IMPORT_RE =
  /\bfrom\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;
const USE_CLIENT_RE = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/;

/**
 * Espaces de noms lus par useTranslations dans les modules client atteignables
 * depuis `entries` (un module importe par un module client est client).
 */
function clientNamespaces(entries: string[]): { namespaces: Set<string>; nonLiteral: string[] } {
  const visited = new Map<string, boolean>();
  const stack = entries.map((file) => ({ file, client: false }));
  while (stack.length > 0) {
    const { file, client: inherited } = stack.pop()!;
    const known = visited.get(file);
    if (known === true || (known === false && !inherited)) continue;
    const source = readFileSync(file, 'utf8');
    const client = inherited || USE_CLIENT_RE.test(source);
    visited.set(file, client);
    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2] ?? match[3];
      const resolved = resolveImport(file, spec);
      if (resolved) stack.push({ file: resolved, client });
    }
  }

  const namespaces = new Set<string>();
  const nonLiteral: string[] = [];
  for (const [file, client] of visited) {
    if (!client) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/useTranslations\(\s*([^)]*)\)/g)) {
      const arg = match[1].trim();
      const literal = /^(['"])([^'"]*)\1$/.exec(arg);
      if (literal) namespaces.add(literal[2]);
      else nonLiteral.push(`${path.relative(SRC, file)}: useTranslations(${arg})`);
    }
  }
  return { namespaces, nonLiteral };
}

/** Un espace de noms est couvert si lui ou l'un de ses parents est dans la liste. */
function uncovered(used: Set<string>, provided: readonly string[]): string[] {
  return [...used].filter((ns) => !provided.some((p) => ns === p || ns.startsWith(`${p}.`))).sort();
}

const ROOT_ENTRIES = ['layout.tsx', 'error.tsx', 'not-found.tsx', 'loading.tsx']
  .map((f) => path.join(APP, f))
  .filter((f) => existsSync(f));

describe('messages envoyes au navigateur', () => {
  it('le layout racine fournit tout ce que ses propres composants client lisent', () => {
    const { namespaces, nonLiteral } = clientNamespaces(ROOT_ENTRIES);
    expect(nonLiteral).toEqual([]);
    expect(uncovered(namespaces, ROOT_CLIENT_NAMESPACES)).toEqual([]);
  });

  it('la vitrine fournit tout ce que ses composants client lisent', () => {
    const { namespaces, nonLiteral } = clientNamespaces(filesIn(path.join(APP, '(marketing)')));
    expect(nonLiteral).toEqual([]);
    expect(uncovered(namespaces, MARKETING_CLIENT_NAMESPACES)).toEqual([]);
  });

  it.each(['login', 'signup', 'forgot-password', 'reset-password'])(
    '%s fournit tout ce que ses composants client lisent',
    (segment) => {
      const { namespaces, nonLiteral } = clientNamespaces(filesIn(path.join(APP, segment)));
      expect(nonLiteral).toEqual([]);
      expect(uncovered(namespaces, AUTH_CLIENT_NAMESPACES)).toEqual([]);
    },
  );

  it('le parent commun des restaurants fournit ce que ses pages d erreur lisent', () => {
    const site = path.join(APP, 'sites', '[site]');
    const entries = [
      path.join(APP, 'sites', 'layout.tsx'),
      path.join(site, 'layout.tsx'),
      path.join(site, 'error.tsx'),
      path.join(site, 'not-found.tsx'),
    ].filter((f) => existsSync(f));
    const { namespaces, nonLiteral } = clientNamespaces(entries);
    expect(nonLiteral).toEqual([]);
    expect(uncovered(namespaces, SITES_CLIENT_NAMESPACES)).toEqual([]);
  });

  it('le menu convive fournit tout ce que ses composants client lisent', () => {
    const storefront = path.join(APP, 'sites', '[site]', '(storefront)');
    const { namespaces, nonLiteral } = clientNamespaces(filesIn(storefront));
    expect(nonLiteral).toEqual([]);
    expect(uncovered(namespaces, STOREFRONT_CLIENT_NAMESPACES)).toEqual([]);
    // Une page qui repasserait getMessages() en entier annulerait le decoupage :
    // le layout et les pages passent tous par getStorefrontMessages().
    const fullCatalog = filesIn(storefront).filter((f) =>
      /getMessages\(/.test(readFileSync(f, 'utf8')),
    );
    expect(fullCatalog.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('le tableau de bord du restaurant re-fournit le catalogue complet', () => {
    const layout = readFileSync(path.join(APP, 'sites', '[site]', 'admin', 'layout.tsx'), 'utf8');
    // Sans prop messages : le fournisseur serveur herite de tout le catalogue.
    expect(layout).toMatch(/<NextIntlClientProvider>/);
  });

  it('chaque zone de src/app a un layout qui fournit des messages', () => {
    const withoutPages = new Set(['api', 'actions', 'fonts', '__tests__']);
    const missing = readdirSync(APP, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !withoutPages.has(entry.name))
      .map((entry) => entry.name)
      .filter((segment) => {
        const layout = path.join(APP, segment, 'layout.tsx');
        return (
          !existsSync(layout) || !readFileSync(layout, 'utf8').includes('NextIntlClientProvider')
        );
      });
    expect(missing).toEqual([]);
  });

  it('les listes ne designent que des chemins qui existent dans le catalogue', () => {
    for (const locale of ['fr-FR', 'en-US']) {
      const catalog = JSON.parse(
        readFileSync(path.join(SRC, 'messages', `${locale}.json`), 'utf8'),
      ) as Record<string, unknown>;
      for (const p of [
        ...ROOT_CLIENT_NAMESPACES,
        ...MARKETING_CLIENT_NAMESPACES,
        ...AUTH_CLIENT_NAMESPACES,
        ...SITES_CLIENT_NAMESPACES,
        ...STOREFRONT_CLIENT_NAMESPACES,
      ]) {
        const picked = pickMessages(catalog as never, [p]);
        expect(Object.keys(picked), `${locale}: ${p}`).not.toHaveLength(0);
      }
    }
  });
});

describe('pickMessages', () => {
  const catalog = {
    common: { ok: 'OK' },
    marketing: { header: { home: 'Accueil' }, home: { title: 'Titre' } },
    admin: { x: 'y' },
  };

  it('copie un espace de noms entier et un sous-espace, rien d autre', () => {
    expect(pickMessages(catalog, ['common', 'marketing.header'])).toEqual({
      common: { ok: 'OK' },
      marketing: { header: { home: 'Accueil' } },
    });
  });

  it('fusionne deux sous-espaces du meme parent', () => {
    expect(pickMessages(catalog, ['marketing.header', 'marketing.home'])).toEqual({
      marketing: catalog.marketing,
    });
  });

  it('ignore un chemin absent', () => {
    expect(pickMessages(catalog, ['absent', 'common.absent.deep'])).toEqual({});
  });

  it('ne modifie pas le catalogue source', () => {
    const before = JSON.stringify(catalog);
    pickMessages(catalog, ['marketing.header', 'common']);
    expect(JSON.stringify(catalog)).toBe(before);
  });
});
