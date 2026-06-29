# État de l'art sécurité SaaS 2026 — pour un SaaS restauration vibe-codé

Rapport de référence pour Attabl (Supabase + Vercel/Next.js + Stripe). Objectif: savoir ce qui se fait aujourd'hui en sécurité, où se situe Attabl, et ce qui doit être blindé pour les utilisateurs (restaurateurs et convives). Toutes les affirmations chiffrées sont sourcées en bas de page.

---

## 1. Pourquoi le vibe coding change la donne sécurité

Le code généré par IA ship plus de vulnérabilités que le code humain, c'est mesuré:

- Une étude de décembre 2025 sur des dépôts open source trouve que le code généré par IA introduit des vulnérabilités dans **45% des tâches**, et que les PR assistées par IA produisent **2,74x plus de problèmes de sécurité** que les PR humaines.
- Une étude Stanford citée dans la presse sécurité indique **40% de vulnérabilités en plus** chez les développeurs utilisant un assistant IA.
- Escape.tech a scanné plus de 1 400 applications vibe-codées en production: **65% ont des problèmes de sécurité, 58% au moins une faille critique**, dont plus de 400 secrets exposés et 175 cas de PII exposée (données bancaires comprises).
- Les secrets hardcodés exposés dans des commits GitHub publics ont **bondi de 34% en 2025** (record). Un rapport GitGuardian 2026 estime que les commits assistés par Claude Code exposent des secrets **plus de 2x plus souvent** que les commits humains.
- Une analyse Tenzai de 15 applications produites par 5 outils IA: 69 vulnérabilités, **toutes** sans protection CSRF ni headers de sécurité, **toutes** avec au moins une SSRF.

Conséquence pratique pour Attabl: le risque n'est pas l'algorithme, c'est l'oubli systématique. L'IA écrit du code qui "marche" sans les garde-fous (authz, validation, rate limit, secrets). La sécurité d'un projet vibe-codé se joue sur la revue et les tests automatisés, pas sur la confiance.

Les patterns de défaillance les plus fréquents du code IA:

- Secrets/clés API en dur, souvent côté client.
- Contrôle d'autorisation absent (IDOR/BOLA): l'endpoint vérifie que tu es connecté, pas que l'objet t'appartient.
- RLS désactivée ou absente sur Supabase (table publique par défaut).
- Validation d'entrée manquante, CORS trop ouvert, pas de rate limiting.
- Webhooks non vérifiés, SSRF, pas de headers de sécurité, pas de CSRF.

---

## 2. Le socle de sécurité SaaS attendu en 2026

### 2.1 OWASP Top 10 application (référence 2021, toujours en vigueur)

A1 Broken Access Control, A2 Cryptographic Failures, A3 Injection, A4 Insecure Design, A5 Security Misconfiguration, A6 Vulnerable/Outdated Components, A7 Identification & Auth Failures, A8 Software & Data Integrity Failures, A9 Logging & Monitoring Failures, A10 SSRF. Le contrôle d'accès cassé reste #1.

### 2.2 OWASP API Security Top 10 (2023) — le plus pertinent pour Attabl

Attabl est une API (48 routes). Les risques API priment:

- **API1 BOLA** (Broken Object Level Authorization) — #1, ~40% des attaques API. Manipuler un id pour accéder aux données d'un autre.
- API2 Broken Authentication.
- API3 Broken Object Property Level Authorization (exposer/modifier des champs interdits).
- API4 Unrestricted Resource Consumption (pas de rate limit, coûts, DoS).
- API5 Broken Function Level Authorization (accès à des actions admin).
- API6 Unrestricted Access to Sensitive Business Flows (abus de la logique métier: commandes, paiements).
- API7 SSRF. API8 Security Misconfiguration. API9 Improper Inventory Management. API10 Unsafe Consumption of APIs.

### 2.3 OWASP Top 10 for LLM Applications (2025)

Pertinent car Attabl embarque `@anthropic-ai/sdk` (fonctionnalités IA). Risques: LLM01 Prompt Injection, LLM02 Sensitive Information Disclosure, LLM03 Supply Chain, LLM04 Data/Model Poisoning, LLM05 Improper Output Handling, LLM06 Excessive Agency, LLM07 System Prompt Leakage, LLM08 Vector/Embedding Weaknesses, plus consommation non bornée. Règle clé: ne jamais injecter une sortie de LLM directement dans du SQL, du HTML ou une commande shell sans validation.

### 2.4 Les 7 couches à blinder (cadre de travail)

1. **Authentification**: MFA, hash de mots de passe (bcrypt/argon2, géré par Supabase), protection mots de passe fuités, gestion de session, anti-brute force.
2. **Autorisation & multi-tenant**: RBAC, isolation stricte des tenants, anti-BOLA, RLS Postgres.
3. **Données**: chiffrement en transit (TLS) et au repos, gestion des secrets, minimisation PII.
4. **Paiements & abonnements**: signature webhook, montants calculés serveur, idempotence, anti-fraude, périmètre PCI réduit.
5. **Abus métier**: anti-abus d'essai/coupon, anti-partage de compte, rate limiting, intégrité des transactions, anti-rejeu.
6. **Infrastructure**: headers de sécurité, CSP, WAF/bot protection, secrets en coffre, logs/monitoring, sauvegardes.
7. **Conformité**: RGPD, PCI DSS, DPA avec sous-traitants.

---

## 3. Sécurité de la stack Attabl, point par point

### 3.1 Supabase

- **RLS obligatoire sur toutes les tables du schéma `public`.** Une table sans RLS dans un schéma exposé est lisible par l'API. CVE-2025-48757 (mai 2025): 10,3% des apps analysées exposaient des tables en lecture publique faute de RLS.
- **anon key vs service_role key.** L'anon key est publique (RLS s'applique). La service*role key contourne la RLS: jamais côté client, jamais en `NEXT_PUBLIC*`, rotation trimestrielle, immédiate si suspicion. Attabl est conforme (`server-only`).
- **Fonctions `SECURITY DEFINER`**: dangereuses si exposées en RPC à `anon`/`authenticated` car elles contournent la RLS. Figer `search_path = ''`, révoquer `EXECUTE` quand non voulu. (Voir findings Attabl HIGH-1.)
- **Auth**: activer MFA, confirmations email, protection mots de passe fuités, restreindre les URLs de redirection.
- **Storage**: policies par bucket, pas de bucket public par défaut pour des données privées.

### 3.2 Vercel / Next.js

- **CVE-2025-29927** (CVSS 9.1): contournement d'autorisation via le header `x-middleware-subrequest`. Versions vulnérables: <12.3.5, <13.5.9, <14.2.25, <15.2.3. Attabl en 16.2.9 = non affecté. Leçon durable: ne pas faire reposer l'autorisation uniquement sur le middleware; revérifier dans la route/la couche données.
- **Variables d'environnement**: tout ce qui est préfixé `NEXT_PUBLIC_` est livré au navigateur. N'y mettre que du public. Les secrets restent côté serveur. Attention aux env des Preview Deployments.
- **Server Actions / Route Handlers**: revalider l'auth ET l'autorisation à chaque appel, valider les entrées (Zod), se méfier de la SSRF sur tout fetch d'URL fournie par l'utilisateur.
- **Headers**: HSTS, X-Frame-Options/CSP frame-ancestors, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP par nonce (pas `unsafe-inline`). Attabl: CSP nonce + HSTS + X-Frame-Options présents.

### 3.3 Stripe

- **Vérifier la signature** de chaque webhook (`constructEvent`) avec le corps brut. Sans ça, n'importe qui POST de faux events.
- **Idempotence**: stocker `event.id`, ignorer les doublons; idempotence et effet métier dans la même transaction. Attabl: conforme (table `stripe_events`).
- **Ne jamais faire confiance au montant client.** Créer les `PaymentIntent`/sessions de checkout côté serveur, prix et montants déterminés serveur.
- **Clés API restreintes**, répondre 2xx vite et traiter en asynchrone, gérer les events de cycle de vie d'abonnement (création, paiement échoué, annulation).

---

## 4. Domaine restauration: risques spécifiques

- **Données sensibles**: identité convives, données de paiement (déléguées à Stripe), pourboires, numéros de table/chambre (Attabl gère `table_number` et `room_number` = contexte hôtelier), historiques de commande, fidélité.
- **Manipulation de prix/commande**: le prix d'une commande doit être recalculé côté serveur à partir du menu en base, jamais accepté depuis le client. Vérifier que `create_order` ne fait pas confiance aux montants envoyés.
- **Commandes frauduleuses / spam**: rate limiting + Turnstile sur la création de commande et de compte (Attabl a les deux).
- **Accès anonyme à table**: si un convive commande via un token sans compte, ce token doit être imprévisible, à courte durée, lié à une table/commande, et la fonction qui l'utilise doit tout valider (car SECURITY DEFINER contourne la RLS).

---

## 5. Conformité (clients UE — projet en région eu-north-1)

### 5.1 RGPD

- **Bases légales et consentement** (cookies/analytics: bandeau présent, à vérifier).
- **Droits des personnes**: accès, rectification, effacement, portabilité — prévoir un process.
- **Registre des traitements** et **DPA signés avec chaque sous-traitant**: Supabase (DPA disponible), Vercel, Stripe, Resend, Sentry, Upstash.
- **Violation de données**: notification à l'autorité (CNIL) **sous 72h**; un sous-traitant doit vous alerter "sans délai" (viser 24h dans le DPA). Sanction jusqu'à 10 M€ ou 2% du CA pour défaut de notification.
- **Résidence des données**: eu-north-1 garde les données en UE, bon point.

### 5.2 PCI DSS 4.0.1 (échéance passée: 31 mars 2025)

- Avec Stripe Checkout/Elements (iframe), le périmètre est réduit (SAQ A), mais **pas supprimé**. Depuis 4.0.1, l'éligibilité SAQ A exige que **tout le site** soit protégé contre les scripts malveillants, pas seulement la page de paiement.
- Action: inventorier les scripts tiers (analytics, A/B), s'assurer que la page de paiement n'embarque que le strict nécessaire, confirmer auprès de Stripe la protection de leur iframe. Garder une CSP stricte.

### 5.3 SOC 2 / ISO 27001

Pas obligatoires pour un SaaS early-stage, mais SOC 2 Type II devient un argument commercial dès que tu vises des chaînes/groupes hôteliers. À planifier, pas à faire maintenant.

---

## 6. Où se situe Attabl

Au-dessus de la moyenne des SaaS vibe-codés. Les pièges classiques (secrets commités, service_role exposé, webhook non vérifié, Next vulnérable, pas de rate limit) sont déjà évités. Le travail restant est ciblé: durcir les fonctions Postgres exposées, prouver la couverture RLS, tester l'autorisation objet (BOLA) sur les 48 routes, finaliser la conformité (DPA, PCI scope). Détail actionnable dans `AUDIT-ATTABL-FINDINGS.md` et `01-CHECKLIST-ET-PLAN-DE-TESTS.md`.

---

## Sources

- [Vibe Coding Security Risks Aren't Like Ordinary Security Risks — IBM](https://www.ibm.com/think/insights/vibe-coding-security-risks)
- [Vibe Coding Security: 62% of AI-Generated Code Ships With Vulnerabilities — OX Security](https://www.ox.security/blog/vibe-coding-security/)
- [Vibe Coding Security Crisis: Credential Sprawl — Cloud Security Alliance](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-security-vibe-coding-202/)
- [Vibe Coding's Security Debt: The AI-Generated CVE Surge — Cloud Security Alliance](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-vulnerability-surge-2026/)
- [Vibe Coding Is Shipping Vulnerabilities — Kusari](https://www.kusari.dev/blog/vibe-coding-is-shipping-vulnerabilities-a-security-teams-guide-to-ai-generated-code-risks)
- [OWASP Top 10 for LLM Applications 2025 — OWASP GenAI](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/)
- [OWASP API Security Top 10 (2023) — OWASP](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)
- [CVE-2025-29927 Next.js Middleware Authorization Bypass — NVD](https://nvd.nist.gov/vuln/detail/CVE-2025-29927)
- [Postmortem on Next.js Middleware bypass — Vercel](https://vercel.com/blog/postmortem-on-next-js-middleware-bypass)
- [Row Level Security — Supabase Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Securing your data — Supabase Docs](https://supabase.com/docs/guides/database/secure-data)
- [Supabase Security: Exposed Anon Keys, RLS, and Misconfigurations — Stingrai](https://www.stingrai.io/blog/supabase-powerful-but-one-misconfiguration-away-from-disaster)
- [Receive Stripe events in your webhook endpoint — Stripe Docs](https://docs.stripe.com/webhooks)
- [PCI DSS v4.0.1: Changes to Qualify for SAQ A — Akamai](https://www.akamai.com/blog/security/2025/feb/pci-dss-v4-0-1-changes-qualify-saq-a)
- [Can you use Stripe for PCI DSS? — c/side](https://cside.com/blog/can-you-use-stripe-for-pci-dss)
- [Art. 33 GDPR — Notification of a personal data breach](https://gdpr-info.eu/art-33-gdpr/)
- [The SaaS DPA Guide — Secure Privacy](https://secureprivacy.ai/blog/data-processing-agreements-dpas-for-saas)
