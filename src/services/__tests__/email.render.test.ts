import { describe, it, expect } from 'vitest';
import { cta } from '../email.render';
import { buildPasswordResetEmail } from '../email.templates';

function hrefOf(html: string): string | undefined {
  return /href="([^"]*)"/.exec(html)?.[1];
}

describe('liens des boutons d e-mail (B43)', () => {
  it('un %XX deja present dans le lien n est pas encode une seconde fois', () => {
    const href = hrefOf(cta('https://checkout.flutterwave.com/pay/ab%2Fc?x=1&y=2', 'Payer'));
    expect(href).toBe('https://checkout.flutterwave.com/pay/ab%2Fc?x=1&amp;y=2');
    expect(href).not.toContain('%25');
  });

  it('un modele transmet le lien intact au bouton', () => {
    const { html } = buildPasswordResetEmail({
      resetUrl: 'https://attabl.com/auth/callback?token_hash=a%2Bb&type=recovery',
    });
    expect(hrefOf(html)).toBe(
      'https://attabl.com/auth/callback?token_hash=a%2Bb&amp;type=recovery',
    );
  });

  it('temoin: un lien hors http(s) donne un bouton vide, des guillemets sont encodes', () => {
    expect(hrefOf(cta('javascript:alert(1)', 'X'))).toBe('');
    expect(hrefOf(cta('https://attabl.com/a"b', 'X'))).toBe('https://attabl.com/a%22b');
  });
});

describe('courriel "mot de passe refuse" a l inscription (contre-audit 2)', () => {
  it('dit quoi changer, renvoie vers l inscription, et ne promet aucun compte', async () => {
    const { buildSignupPasswordRejectedEmail } = await import('../email.templates');
    const { subject, html, text } = buildSignupPasswordRejectedEmail({
      signupUrl: 'https://attabl.com/signup',
    });
    expect(subject).toBe('Choisissez un mot de passe plus solide');
    expect(hrefOf(html)).toBe('https://attabl.com/signup');
    for (const body of [html, text]) {
      expect(body).toContain('12 caracteres');
      expect(body).toContain("Aucun compte n'a ete cree");
    }
  });
});

describe('courriel "inscription non aboutie" (contre-audit 5)', () => {
  it('dit que le compte n a pas pu etre finalise, avec le lien vers l inscription', async () => {
    const { buildSignupFailedEmail } = await import('../email.templates');
    const { subject, html, text } = buildSignupFailedEmail({
      signupUrl: 'https://attabl.com/signup',
    });
    expect(subject).toBe("Votre inscription n'a pas abouti");
    expect(hrefOf(html)).toBe('https://attabl.com/signup');
    for (const body of [html, text]) {
      expect(body).toContain("Votre compte n'a pas pu etre finalise.");
      expect(body).not.toContain('Aucun compte');
    }
  });
});
