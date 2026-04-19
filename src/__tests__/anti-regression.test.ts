/**
 * TESTS DE REGRESSION ANTI-PATTERN
 *
 * Ces tests verifient que les patterns critiques du projet ne sont pas casses.
 * Ils scannent le code source pour detecter les violations AVANT le build.
 *
 * Si un test echoue, c'est qu'un pattern protege a ete modifie.
 * NE PAS modifier ces tests pour les faire passer — corriger le code source.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC_DIR = path.resolve(__dirname, '..');

// ── Helpers ────────────────────────────────────────────────────

function readFile(relativePath: string): string {
  const fullPath = path.resolve(SRC_DIR, '..', relativePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

function findTsxFiles(dir: string, exclude: string[] = []): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(path.resolve(SRC_DIR, '..'), fullPath);

    if (exclude.some((ex) => relativePath.includes(ex))) continue;

    if (entry.isDirectory()) {
      results.push(...findTsxFiles(fullPath, exclude));
    } else if (entry.name.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

// ── 1. Viewport & Scroll Chain ──────────────────────────────────

describe('Viewport & Scroll Chain', () => {
  it('globals.css doit avoir html,body avec height:100% et overflow:hidden', () => {
    const css = readFile('src/app/globals.css');
    // Verifie que html et body ont les contraintes de viewport
    expect(css).toContain('height: 100%');
    expect(css).toContain('overflow: hidden');
  });

  it('aucun composant ne doit utiliser h-screen (reserve a AdminLayoutClient)', () => {
    const files = findTsxFiles(SRC_DIR, ['node_modules', '.next', 'components/ui']);
    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const relativePath = path.relative(path.resolve(SRC_DIR, '..'), file);

      // h-screen est interdit partout sauf dans les fichiers de layout admin
      if (relativePath.includes('AdminLayoutClient')) continue;
      if (relativePath.includes('global-error')) continue; // page d'erreur peut utiliser h-screen

      // Cherche h-screen dans les className (pas dans les commentaires)
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
        if (line.includes('h-screen') && !line.includes('min-h-screen')) {
          violations.push(`${relativePath}:${i + 1}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ── 2. Securite ──────────────────────────────────────────────────

describe('Securite', () => {
  it('admin.ts ne doit pas avoir autoRefreshToken ou persistSession', () => {
    const content = readFile('src/lib/supabase/admin.ts');
    expect(content).toContain('autoRefreshToken: false');
    expect(content).toContain('persistSession: false');
  });

  it('proxy.ts doit strip le header x-tenant-slug des requetes client', () => {
    const content = readFile('src/proxy.ts');
    // Le proxy doit supprimer le header x-tenant-slug injecte par le client
    expect(content).toMatch(/delete.*x-tenant-slug|x-tenant-slug.*delete/i);
  });

  it('le webhook Stripe doit verifier la signature', () => {
    const content = readFile('src/app/api/webhooks/stripe/route.ts');
    expect(content).toContain('constructEvent');
  });

  it('aucune Server Action ne doit utiliser getSession() au lieu de getUser()', () => {
    const actionsDir = path.resolve(SRC_DIR, 'app/actions');
    if (!fs.existsSync(actionsDir)) return; // Skip si le dossier n'existe pas

    const files = findTsxFiles(actionsDir, []).concat(
      findTsxFiles(actionsDir, []).length === 0 ? [] : [],
    );

    // Aussi chercher dans les fichiers .ts
    const tsFiles = fs.readdirSync(actionsDir, { recursive: true }).toString().split(',');

    for (const file of tsFiles) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      const fullPath = path.join(actionsDir, file);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith('//')) continue;
        // getSession est interdit dans les server actions pour l'auth
        if (line.includes('getSession') && !line.includes('getUser')) {
          expect.fail(
            `${file}:${i + 1} utilise getSession() au lieu de getUser() pour l'authentification`,
          );
        }
      }
    }
  });
});

// ── 3. Multi-tenant ──────────────────────────────────────────────

describe('Multi-tenant', () => {
  it('rate-limit.ts doit exporter au moins 20 limiters', () => {
    const content = readFile('src/lib/rate-limit.ts');
    const exportMatches = content.match(/export\s+const\s+\w+Limiter/g);
    expect(exportMatches).not.toBeNull();
    expect(exportMatches!.length).toBeGreaterThanOrEqual(20);
  });
});

// ── 4. Design System shadcn/ui ──────────────────────────────────

describe('Design System shadcn/ui', () => {
  it('les composants shadcn/ui de base doivent exister', () => {
    const uiDir = path.resolve(SRC_DIR, 'components/ui');
    const requiredComponents = [
      'button.tsx',
      'input.tsx',
      'label.tsx',
      'select.tsx',
      'textarea.tsx',
      'table.tsx',
      'dialog.tsx',
      'card.tsx',
    ];

    for (const component of requiredComponents) {
      const exists = fs.existsSync(path.join(uiDir, component));
      expect(exists, `Composant shadcn/ui manquant: ${component}`).toBe(true);
    }
  });
});

// ── 5. Configuration critique ──────────────────────────────────

describe('Configuration critique', () => {
  it('next.config.mjs doit avoir les headers de securite', () => {
    const content = readFile('next.config.mjs');
    expect(content).toContain('X-Frame-Options');
    expect(content).toContain('X-Content-Type-Options');
    expect(content).toContain('Strict-Transport-Security');
  });

  it('next.config.mjs doit avoir la config Sentry', () => {
    const content = readFile('next.config.mjs');
    expect(content).toContain('sentry');
  });
});
