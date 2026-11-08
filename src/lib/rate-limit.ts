import { createHash } from 'node:crypto';

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';

/**
 * Rate limiting module powered by Upstash Redis.
 *
 * Graceful mode: if UPSTASH_REDIS_REST_URL is not set, all checks pass
 * (no crash in development or CI without Redis).
 *
 * Usage in API routes:
 *   import { signupLimiter, getClientIp } from '@/lib/rate-limit';
 *   const ip = getClientIp(request);
 *   const { success } = await signupLimiter.check(ip);
 *   if (!success) return NextResponse.json({ error: 'Trop de requetes' }, { status: 429 });
 *
 * Usage in Server Actions:
 *   import { contactLimiter, getClientIpFromHeaders } from '@/lib/rate-limit';
 *   const headersList = await headers();
 *   const ip = getClientIpFromHeaders(headersList);
 *   const { success } = await contactLimiter.check(ip);
 */

// --- Redis client (shared) ---

const isConfigured = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = isConfigured
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// Log rate limiting status at module load (startup)
// Using console.warn to avoid circular dependency with logger at module level
if (!isConfigured) {
  // CONSOLE-PROD. L'ancien message annoncait "rate limiting disabled", ce qui
  // est FAUX en production: sans Redis, check() renvoie success:false et bloque
  // donc TOUTES les requetes limitees. Lire "desactive" au moment ou le site
  // refuse tout est exactement le message qui envoie chercher la panne ailleurs.
  console.warn(
    process.env.NODE_ENV === 'production'
      ? '[rate-limit] ERREUR: Redis non configure EN PRODUCTION - toutes les requetes limitees seront REFUSEES'
      : '[rate-limit] WARN: Redis non configure - limitation inactive hors production (les requetes passent)',
  );
}

// --- Rate limit result type ---

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Horodatage (ms) ou le compteur se libere. 0 quand inconnu. */
  reset: number;
}

// --- Limiter factory ---

function createLimiter(
  prefix: string,
  limiter: ConstructorParameters<typeof Ratelimit>[0]['limiter'],
  /** When true, Redis failure blocks the request instead of allowing it through */
  failClosed = false,
) {
  const rl = redis
    ? new Ratelimit({
        redis,
        limiter,
        prefix: `attabl:${prefix}`,
      })
    : null;

  return {
    async check(identifier: string): Promise<RateLimitResult> {
      if (!rl) {
        if (process.env.NODE_ENV === 'production') {
          logger.error(
            'Rate limiting is DISABLED in production - UPSTASH_REDIS not configured. Blocking request.',
          );
          return { success: false, limit: 0, remaining: 0, reset: 0 };
        }
        return { success: true, limit: 0, remaining: 0, reset: 0 };
      }

      try {
        const result = await rl.limit(identifier);
        return {
          success: result.success,
          limit: result.limit,
          remaining: result.remaining,
          reset: result.reset,
        };
      } catch (err) {
        if (failClosed) {
          // Security-critical endpoints: block on Redis failure to prevent brute-force
          logger.error('Rate limiter fetch failed, BLOCKING request (fail-closed)', err, {
            prefix,
          });
          return { success: false, limit: 0, remaining: 0, reset: 0 };
        }
        // Non-critical endpoints: allow through to avoid blocking legitimate traffic
        logger.error('Rate limiter fetch failed, allowing request through', err, { prefix });
        return { success: true, limit: 0, remaining: 0, reset: 0 };
      }
    },
  };
}

/**
 * Cle de compteur pour une adresse email.
 *
 * On ne met pas l'email en clair dans Redis: une cle de compteur n'a pas a
 * devenir un annuaire des comptes du service. L'empreinte suffit a compter.
 */
export function cleCompte(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}

/**
 * Regroupe une adresse pour en faire une cle de comptage utile.
 *
 * POURQUOI: en IPv6, un abonne ordinaire recoit un bloc /64, soit plus de
 * 18 milliards de milliards d adresses. Compter "par adresse" lui donne donc un
 * budget neuf a chaque requete, et la limite ne vaut rien contre lui - alors
 * qu elle s applique pleinement a un abonne IPv4. On compte donc par /64 en
 * IPv6, l unite reellement attribuee a un client.
 *
 * L IPv4 est rendue telle quelle: la grouper par /24 punirait des voisins qui
 * n ont rien en commun.
 */
export function grouperAdresse(ip: string): string {
  if (!ip.includes(':')) return ip;
  // Forme abregee (::): on ne deplie pas. Les adresses d un meme /64 arrivent
  // sous la meme forme dans les en-tetes de la plateforme, donc le
  // regroupement reste correct en pratique.
  if (ip.includes('::')) return ip;
  const blocs = ip.split(':');
  return blocs.length >= 4 ? `${blocs.slice(0, 4).join(':')}::/64` : ip;
}

/**
 * Intervalle minimum entre deux envois de mail pour un meme compte, en
 * secondes.
 *
 * POURQUOI PAS UN BUDGET PAR FENETRE: un budget "3 par 10 minutes" par compte
 * peut etre tenu PLEIN indefiniment par qui connait l email - 18 requetes par
 * heure suffisent - et le proprietaire n obtient alors plus jamais son lien. Un
 * intervalle ne retarde que d une minute: la fonctionnalite ne peut pas etre
 * confisquee.
 */
const INTERVALLE_ENVOI_S = 60;

/**
 * Pose un verrou d envoi pour ce compte, et dit s il etait libre.
 *
 * Une seule operation atomique (`SET ... NX EX`): deux requetes simultanees ne
 * peuvent pas declencher deux mails.
 */
export async function envoiAutorisePourCompte(cle: string): Promise<boolean> {
  if (!redis) return process.env.NODE_ENV !== 'production';
  try {
    const pose = await redis.set(`attabl:envoi:${cle}`, '1', {
      nx: true,
      ex: INTERVALLE_ENVOI_S,
    });
    return pose === 'OK';
  } catch (err) {
    // Un envoi de mail n est pas une operation de securite: en cas de panne du
    // verrou, on laisse passer plutot que de priver quelqu un de son lien.
    logger.error('Verrou d envoi indisponible, envoi autorise', err, { cle });
    return true;
  }
}

/**
 * Rend un verrou d envoi.
 *
 * A appeler des qu on sait qu AUCUN mail ne partira: compte inexistant, lien
 * impossible a generer, envoi refuse par le fournisseur. Sans cela, une requete
 * sterile confisque la minute suivante a une requete legitime.
 */
export async function libererEnvoi(cle: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(`attabl:envoi:${cle}`);
  } catch (err) {
    // Au pire le verrou expire de lui-meme au bout d une minute.
    logger.error('Liberation du verrou d envoi impossible', err, { cle });
  }
}

/**
 * Minutes a annoncer avant liberation.
 *
 * UNE MINUTE DE MARGE, et elle n'est pas decorative. `slidingWindow` rend un
 * instant aligne sur l'horloge, et la fenetre glissante reporte une part de la
 * sous-fenetre precedente: a l'instant annonce, l'utilisateur peut encore etre
 * refuse. Annoncer un delai trop court le fait revenir pour rien - exactement
 * ce que ce message est cense eviter.
 */
export function minutesAvantLiberation(reset: number): number {
  if (!reset) return 1;
  return Math.max(1, Math.ceil((reset - Date.now()) / 60_000) + 1);
}

// --- Limiters per endpoint ---
//
// CE QUI A ETE MESURE PUIS LAISSE TEL QUEL (production, 2026-11-08). Un
// compartiment qu'on desserre "au cas ou" est une protection qu'on perd pour
// rien: ces trois-la ont ete verifies sur les donnees reelles et sont
// suffisants.
//
//   - Commandes, 20 par minute et par restaurant: le maximum JAMAIS observe
//     est de 7 commandes dans la meme minute. Marge de x3, on ne touche pas.
//   - Droits et affectations, 20 a 30 par minute: le plus grand restaurant
//     compte 2 membres actifs. Ces compartiments ne peuvent pas etre atteints
//     par un usage normal.
//   - Exports, 10 par minute: une action rare, declenchee a la main.
//
// Les compartiments REELLEMENT corriges sont ceux ou la mesure contredisait le
// reglage: televersement (menu de 284 plats contre 20 par minute), imports de
// menu (iteratifs contre 5 par heure), recherche dans le menu (tous les
// convives d'un lieu derriere une seule adresse contre 60 par minute).

/**
 * Inscription: 15 par 10 minutes et par adresse.
 *
 * Une inscription cree un compte qui n'existe pas encore: impossible de
 * compter par compte. Le compteur reste donc par adresse, mais 5 etait trop
 * bas pour un usage REEL: une formation ou six restaurateurs s'inscrivent
 * depuis le meme Wi-Fi refusait le sixieme, et chez un operateur mobile des
 * inconnus se partagent l'adresse. Ce qui arrete reellement les inscriptions
 * automatisees est Turnstile et le honeypot, qui s'executent avant.
 */
export const signupLimiter = createLimiter('signup', Ratelimit.slidingWindow(15, '10 m'), true);

/** OAuth signup: 5 requests / 10 minutes per IP (fail-closed: brute-force protection) */
export const oauthSignupLimiter = createLimiter(
  'signup-oauth',
  Ratelimit.slidingWindow(5, '10 m'),
  true,
);

/**
 * Commandes: 20 par minute et par (IP, tenant). FAIL-OPEN, deliberement.
 *
 * RL-FAILOPEN demandait de passer ce compartiment en fail-closed. Applique tel
 * quel, une simple panne Upstash renvoyait 429 sur TOUTE creation de commande:
 * plus aucun convive ne peut commander, dans tous les restaurants a la fois.
 * C'est le chemin de recette du produit, et la panne serait invisible cote
 * restaurateur - il verrait juste sa salle ne plus rien commander.
 *
 * Le dommage qu'on evitait en fermant est REVERSIBLE: une commande fantome
 * s'annule d'un geste en cuisine. Celui qu'on causait ne l'est pas: un service
 * perdu ne se rattrape pas. On garde donc fail-open ici, et on ferme la ou le
 * dommage est vraiment irreversible - voir `couponClaimLimiter`.
 *
 * Les autres compartiments demandes par RL-FAILOPEN (contact, newsletter,
 * export) restent fail-closed: leur indisponibilite ne coute rien a personne.
 */
export const orderLimiter = createLimiter('orders', Ratelimit.slidingWindow(20, '1 m'));

/**
 * Reclamation d'un code promo: 3 par heure et par (IP, tenant, code).
 * FAIL-CLOSED, et c'est ici que ca compte.
 *
 * ORDER-SPAM. C'est le SEUL dommage irreversible de la creation de commande:
 * `claimUsage` incremente le compteur d'usage du coupon AVANT meme que la
 * commande n'existe, et rien ne le rend au restaurateur. Une campagne promo
 * peut donc etre videe par un script, et le restaurateur ne comprend qu'apres
 * coup pourquoi son budget est parti en une nuit.
 *
 * Trois tentatives par heure sur un MEME code depuis une MEME adresse est trois
 * fois plus permissif qu'un usage humain reel (on saisit un code promo une fois,
 * eventuellement deux si on se trompe), et ferme la boucle scriptee.
 *
 * Fail-closed assume: si Upstash tombe, on refuse les codes promo pendant la
 * panne. Le convive paie plein tarif au lieu de ne pas pouvoir commander - une
 * degradation, pas un arret.
 */
export const couponClaimLimiter = createLimiter(
  'coupon-claim',
  Ratelimit.slidingWindow(3, '1 h'),
  true,
);

/**
 * ORDER-SPAM. Commandes dont le tenant n'est PAS etabli par une source serveur:
 * 5 par heure et par (IP, tenant), fail-closed.
 *
 * Sur le domaine principal, le slug ne peut venir que du `Referer`, forgeable
 * hors navigateur. Un script pouvait donc boucler sur
 * `POST https://attabl.com/api/orders` avec un `Referer` pointant un concurrent,
 * et chaque requete creait une VRAIE commande: notification et son en cuisine,
 * email comportemental, destockage si l'inventaire est actif, et surtout
 * consommation IRREVERSIBLE du budget d'un code promo via claimUsage.
 *
 * Ce compartiment ne touche pas le parcours client normal: un convive commande
 * depuis `<slug>.attabl.com` ou un domaine custom, donc avec un slug etabli par
 * le serveur, et ne passe jamais ici. Seule la commande depuis
 * `attabl.com/sites/<slug>/...` l'emprunte - un chemin marginal, ou 5 commandes
 * par heure restent largement au-dessus de l'usage reel.
 */
export const untrustedOrderLimiter = createLimiter(
  'orders-untrusted',
  Ratelimit.slidingWindow(5, '1 h'),
  true,
);

/**
 * Recherche dans le menu (lecture seule): 300 par minute, par restaurant ET
 * par adresse.
 *
 * POURQUOI 60 PAR ADRESSE ETAIT TROP BAS: les convives d'un meme lieu sont
 * TOUS derriere le Wi-Fi du restaurant, donc derriere UNE adresse. A 60 par
 * minute, vingt convives qui ouvrent la recherche et tapent quelques lettres
 * epuisaient le compartiment - et c'est le client finissant sa commande qui
 * recevait le refus. La limite punissait le succes du restaurant.
 *
 * Compartiment separe de celui des commandes, pour que parcourir le menu ne
 * puisse jamais empecher de commander.
 */
export const menuSearchLimiter = createLimiter('menu-search', Ratelimit.slidingWindow(300, '1 m'));

// KNIP-RL: `paymentInitiationLimiter` et `webhookLimiter` vivaient ici, exportes
// et jamais appeles. Mesure faite avant de trancher: ils n'ont AUCUN appelant
// possible. Les routes Wave et Orange Money n'existent pas encore, et le seul
// webhook du produit est celui de Stripe - qui ne doit surtout pas etre limite
// par IP: Stripe reessaie, et brider ses tentatives ferait perdre des evenements
// de facturation. Ils sont donc supprimes plutot que branches au hasard. Le jour
// ou la route Wave arrive, son limiteur tient en trois lignes, ecrites avec la
// fenetre que ce fournisseur exige vraiment.

/** Checkout: 5 requests / 10 minutes per IP. Fail-closed: block if Redis is down
 * in production to prevent unbounded checkout sessions during an outage. */
export const checkoutLimiter = createLimiter('checkout', Ratelimit.slidingWindow(5, '10 m'), true);

/** Verify checkout: 10 requests / minute per IP */
export const verifyCheckoutLimiter = createLimiter(
  'verify-checkout',
  Ratelimit.slidingWindow(10, '1 m'),
);

/** Onboarding state (GET): loaded once on page open */
export const onboardingStateLimiter = createLimiter(
  'onboarding-state',
  Ratelimit.slidingWindow(10, '10 m'),
);

/** Onboarding save (POST auto-save): fires every 2s on data change */
export const onboardingSaveLimiter = createLimiter(
  'onboarding-save',
  Ratelimit.slidingWindow(60, '1 m'),
);

/** Onboarding complete (POST launch): one-shot final action */
export const onboardingCompleteLimiter = createLimiter(
  'onboarding-complete',
  Ratelimit.slidingWindow(5, '10 m'),
);

/** Contact form: 3 requests / hour per IP (RL-FAILOPEN: fail-closed). */
export const contactLimiter = createLimiter('contact', Ratelimit.slidingWindow(3, '1 h'), true);

/** Newsletter: 3 requests / hour per IP (RL-FAILOPEN: fail-closed). */
export const newsletterLimiter = createLimiter(
  'newsletter',
  Ratelimit.slidingWindow(3, '1 h'),
  true,
);

/**
 * Import de menu Excel: 30 par heure.
 *
 * POURQUOI 5 ETAIT TROP BAS: importer un menu est ITERATIF. On se trompe de
 * colonne, on corrige, on reessaie. A cinq essais par heure, un restaurateur
 * qui decouvre l'outil etait bloque avant d'avoir reussi une seule fois - et
 * le message ne lui disait pas d'attendre une heure. L'ingestion reste
 * couteuse, d'ou un plafond: mais 30 laisse la place a l'apprentissage.
 */
export const excelImportLimiter = createLimiter(
  'excel-import',
  Ratelimit.slidingWindow(30, '1 h'),
  true,
);

/** Supports/chevalet PDF export: 10 requests / minute per IP (authenticated admin, costly PDF render) */
export const supportsExportLimiter = createLimiter(
  'supports-export',
  Ratelimit.slidingWindow(10, '1 m'),
  true,
);

/**
 * Import de menu PDF: 30 par heure.
 *
 * POURQUOI 5 ETAIT TROP BAS: importer un menu est ITERATIF. On se trompe de
 * colonne, on corrige, on reessaie. A cinq essais par heure, un restaurateur
 * qui decouvre l'outil etait bloque avant d'avoir reussi une seule fois - et
 * le message ne lui disait pas d'attendre une heure. L'ingestion reste
 * couteuse, d'ou un plafond: mais 30 laisse la place a l'apprentissage.
 */
export const pdfImportLimiter = createLimiter(
  'pdf-import',
  Ratelimit.slidingWindow(30, '1 h'),
  true,
);

/** Assignments: 30 requests / minute per IP */
export const assignmentLimiter = createLimiter('assignment', Ratelimit.slidingWindow(30, '1 m'));

/**
 * Encaissements en caisse: 120 requetes / minute par IP.
 *
 * Compartiment SEPARE de `assignmentLimiter`. Un restaurant est derriere une
 * seule box, donc une seule IP: les 30/min du compartiment assignation sont
 * partages par toutes les tablettes ET couvrent deja les changements de statut
 * cuisine et les assignations de serveur. Y ajouter les encaissements les faisait
 * tomber en 429 en plein coup de feu; comme un 429 est classe transitoire, le
 * paiement partait en file avec le message "en attente de reseau" alors que le
 * reseau allait parfaitement bien - un mensonge affiche au caissier.
 *
 * Fail-open assume (pas de troisieme argument): si Upstash tombe, un restaurant
 * doit continuer d'encaisser. La route est de toute facon authentifiee et le
 * tenant derive cote serveur, donc ce compartiment borne l'usage, il ne porte pas
 * la securite.
 */
export const orderSettlementLimiter = createLimiter(
  'order-settlement',
  Ratelimit.slidingWindow(120, '1 m'),
);

/**
 * Gestes AU NIVEAU ARTICLE de l'ecran cuisine: 240 requetes / minute par IP.
 *
 * Compartiment SEPARE, et le plus large des trois, pour la meme raison que
 * `orderSettlementLimiter` mais en pire: le KDS marque UN article a la fois
 * (toggleItemStatus envoie `[itemId]`). Une commande de 14 articles, c'est 14
 * requetes, et un restaurant en coup de feu fait tourner plusieurs commandes en
 * parallele depuis plusieurs tablettes derriere une seule IP. Les 30/min du
 * compartiment assignation seraient epuises en quelques secondes.
 *
 * Ce que couterait un compartiment trop etroit ici est precisement ce que le
 * LOT 3 corrige: un 429 est classe transitoire, donc le geste partirait dans
 * l'outbox avec "en attente de reseau" alors que le reseau va bien, et le
 * cuisinier verrait son ecran figer sans comprendre.
 *
 * Fail-open assume (pas de troisieme argument): si Upstash tombe, une cuisine
 * doit continuer d'avancer. La route est authentifiee et le tenant derive cote
 * serveur; ce compartiment borne l'usage, il ne porte pas la securite.
 */
export const kitchenItemLimiter = createLimiter(
  'kitchen-item',
  Ratelimit.slidingWindow(240, '1 m'),
);

/**
 * Invitation management (authenticated: create / list / cancel / resend).
 * 30 requests / 10 minutes per IP, fail-closed (create/resend send emails).
 * Kept separate from the public accept/validate buckets so a manager's
 * dashboard activity never drains an invitee's quota.
 */
export const invitationManageLimiter = createLimiter(
  'invitation-manage',
  Ratelimit.slidingWindow(30, '10 m'),
  true,
);

/**
 * Invitation token validation (public, read-only on-mount check).
 * 30 requests / 10 minutes per TOKEN, fail-OPEN: no side effects (no account
 * creation, no email), so a Redis blip must not block a legitimate invitee.
 * Keyed by token, not IP, so CGNAT / shared-wifi users never collide.
 */
export const invitationValidateLimiter = createLimiter(
  'invitation-validate',
  Ratelimit.slidingWindow(30, '10 m'),
);

/**
 * Invitation acceptance (public, creates the account).
 * 10 requests / 10 minutes per token+IP, fail-closed. Keying on the token
 * scopes the budget to a single invitation, so neighbours behind the same NAT
 * cannot collectively exhaust each other's retries.
 */
export const invitationAcceptLimiter = createLimiter(
  'invitation-accept',
  Ratelimit.slidingWindow(10, '10 m'),
  true,
);

/** Permissions: 20 requests / minute per IP (fail-closed: privilege-escalation surface) */
export const permissionLimiter = createLimiter(
  'permission',
  Ratelimit.slidingWindow(20, '1 m'),
  true,
);

/** Push subscriptions: 10 requests / minute per IP */
export const pushSubscriptionLimiter = createLimiter(
  'push-subscription',
  Ratelimit.slidingWindow(10, '1 m'),
);

/** Domain verification: 5 requests / 10 minutes per IP (fail-closed: external DNS calls) */
export const domainVerifyLimiter = createLimiter(
  'domain-verify',
  Ratelimit.slidingWindow(5, '10 m'),
  true,
);

/** Restaurant creation: 5 requests / 10 minutes per IP (fail-closed: tenant-factory abuse target) */
export const restaurantCreateLimiter = createLimiter(
  'restaurant-create',
  Ratelimit.slidingWindow(5, '10 m'),
  true,
);

/** Stock alerts: 10 requests / minute per IP */
export const stockAlertLimiter = createLimiter('stock-alert', Ratelimit.slidingWindow(10, '1 m'));

/** Auth signout: 10 requests / minute per IP */
export const signoutLimiter = createLimiter('signout', Ratelimit.slidingWindow(10, '1 m'));

/**
 * Mot de passe oublie: par COMPTE, 3 par 10 minutes.
 *
 * Ici le compteur par compte est le BON reglage, et il est serre volontairement: le
 * dommage d'un abus n'est pas une intrusion, c'est de noyer la boite mail d'un
 * tiers. Trois messages par 10 minutes pour une adresse donnee suffisent a
 * l'en empecher.
 *
 * Il etait compte par ADRESSE IP, ce qui se trompait de cible: deux employes
 * distraits le meme matin, sur le meme Wi-Fi, et plus personne du restaurant
 * ne pouvait demander un lien.
 */
export const forgotPasswordLimiter = createLimiter(
  'forgot-password',
  Ratelimit.slidingWindow(3, '10 m'),
  true,
);

/** Mot de passe oublie, garde-fou par adresse: large, pour ne pas punir un Wi-Fi partage. */
export const forgotPasswordAdresseLimiter = createLimiter(
  'forgot-password-adresse',
  Ratelimit.slidingWindow(30, '1 h'),
  true,
);

/** Resend confirmation email: 3 requests / 10 minutes per IP (fail-closed: email enumeration + abuse) */
export const resendConfirmationLimiter = createLimiter(
  'resend-confirmation',
  Ratelimit.slidingWindow(3, '10 m'),
  true,
);

/**
 * Renvoi de confirmation, garde-fou par adresse: large.
 * Meme raison que pour le mot de passe oublie - la garde serree appartient au
 * COMPTE, parce que l'abus consiste a noyer une boite mail, pas a entrer.
 */
export const resendConfirmationAdresseLimiter = createLimiter(
  'resend-confirmation-adresse',
  Ratelimit.slidingWindow(30, '1 h'),
  true,
);

/**
 * Televersement de fichiers: 120 par minute.
 *
 * CHIFFRE CHOISI SUR MESURE, pas au jugement. En production le 2026-11-08, le
 * plus gros menu compte 284 plats (moyenne 68). A 20 par minute, mettre les
 * photos d'un tel menu imposait 15 minutes d'attente ENTRECOUPEES D'ERREURS:
 * le restaurateur voyait "trop de requetes" au milieu de son travail et ne
 * pouvait pas savoir qu'il suffisait d'attendre. A 120, le meme menu passe en
 * moins de trois minutes, sans un seul refus.
 *
 * Ce compartiment reste un garde-fou de COUT (quota de stockage), derriere
 * authentification: il n'autorise rien, il borne la depense.
 */
export const uploadLimiter = createLimiter('upload', Ratelimit.slidingWindow(120, '1 m'), true);

/** Admin reset: 3 requests / hour per IP (fail-closed: destructive action) */
export const adminResetLimiter = createLimiter(
  'admin-reset',
  Ratelimit.slidingWindow(3, '1 h'),
  true,
);

/**
 * Envoi d'un lien de reinitialisation de mot de passe par un administrateur
 * (Server Action actionResetUserPassword): 3 par heure et par COMPTE CIBLE,
 * fail-closed.
 *
 * Compartiment separe de `adminResetLimiter`, qui appartient a /api/admin/reset
 * (remise a zero de donnees) : partager le budget ferait qu'un geste de support
 * consomme le quota d'une action destructive, et l'inverse.
 *
 * Cle sur la CIBLE et non sur l'IP, volontairement, pour deux raisons mesurees
 * sur ce produit : (1) le prejudice est par BOITE AUX LETTRES - des envois en
 * rafale harcelent le titulaire et usent la reputation d'expedition du domaine,
 * donc la delivrabilite de TOUS les emails d'ATTABL, y compris les confirmations
 * de commande ; (2) un restaurant est derriere une seule IP, donc une cle par IP
 * ferait collisionner des administrateurs legitimes entre eux tout en laissant un
 * attaquant changer d'IP pour repartir a zero.
 *
 * 3 par heure, la meme franchise que l'equivalent public /api/forgot-password
 * (3 par 10 minutes) mais sur une fenetre plus longue : un administrateur n'a
 * aucune raison legitime de renvoyer ce lien plus de trois fois en une heure, et
 * le titulaire peut toujours demander lui-meme une reinitialisation.
 *
 * Fail-closed : si Upstash tombe, on refuse. L'action envoie un courriel a un
 * tiers, donc son indisponibilite ne coute qu'un report de quelques minutes,
 * alors qu'un envoi non borne coute la delivrabilite du domaine.
 */
export const adminPasswordResetLinkLimiter = createLimiter(
  'admin-password-reset-link',
  Ratelimit.slidingWindow(3, '1 h'),
  true,
);

/**
 * Compartiment PAR IP de la meme Server Action: 10 par 10 minutes, fail-closed.
 *
 * Pourquoi DEUX compartiments pour une seule action (reserve S1 du contre-audit
 * LOT 6). `.claude/rules/05-backend-api.md` impose une limitation en PREMIERE
 * etape, avant toute lecture et avant l'authentification. Mettre la cle par
 * compte cible a cette place la rendait consommable par un appelant qui n'a
 * passe aucun controle d'identite: trois appels et le patron ne pouvait plus
 * depanner ce membre pendant une heure - et comme le refus par quota arrive
 * AVANT la branche "non authentifie", les deux etats devenaient distinguables,
 * donc le quota devenait un oracle d'activite de compte.
 *
 * Une cle par IP n'a aucun de ces deux defauts: elle ne depend d'aucun
 * parametre venu du client, donc elle n'est pas dirigeable contre un compte
 * choisi. Elle borne le trafic brut en premiere etape ; le prejudice reel
 * (harcelement d'une boite aux lettres, reputation d'expedition du domaine)
 * reste porte par `adminPasswordResetLinkLimiter`, desormais consomme APRES
 * l'authentification.
 *
 * 10 par 10 minutes, et non 3 comme /api/forgot-password: un restaurant entier
 * sort par une seule IP, et plusieurs administrateurs legitimes peuvent y
 * depanner leurs equipes dans la meme fenetre. La borne par compte (3 / 1 h)
 * reste la contrainte serieuse.
 */
export const adminPasswordResetLinkIpLimiter = createLimiter(
  'admin-password-reset-link-ip',
  Ratelimit.slidingWindow(10, '10 m'),
  true,
);

/**
 * Connexion: deux compteurs, tous deux consommes ATOMIQUEMENT avant
 * l'authentification.
 *
 * TROIS CONCEPTIONS ONT ETE ESSAYEES AVANT CELLE-CI, et les deux premieres
 * etaient fausses. L'historique est garde parce que chaque erreur est un piege
 * dans lequel il est naturel de retomber.
 *
 *   v1 (l'origine): 5 tentatives par 15 minutes, par ADRESSE IP, consommees
 *      avant la verification du mot de passe. Entrer CORRECTEMENT coutait un
 *      essai, et l'adresse etant partagee, les quatre employes d'un restaurant
 *      se partageaient cinq connexions par quart d'heure. Mesure en production
 *      le 2026-11-08: un utilisateur enferme 22 minutes hors de son produit.
 *
 *   v2: compteur par COMPTE, consulte avant l'authentification, echec compte
 *      apres. Deux defauts: lire puis ecrire n'est pas atomique (cent requetes
 *      simultanees passaient toutes la lecture), et refuser avant
 *      l'authentification permettait a quiconque connaissant un email de
 *      verrouiller ce compte en boucle.
 *
 *   v3: compteur par compte consomme APRES l'echec, sans jamais barrer la
 *      route. Un audit adversarial a montre que ce plafond etait DECORATIF: le
 *      mot de passe etant verifie avant tout comptage, un attaquant testait
 *      800 mots de passe par heure sur un compte au lieu de 20. La limite
 *      affichee ne bornait rien.
 *
 * LA FORME RETENUE porte la garde serree sur le COUPLE (compte, adresse). Elle
 * resout les trois problemes a la fois:
 *
 *   - elle est atomique, donc une rafale simultanee ne la contourne pas;
 *   - elle borne REELLEMENT les essais sur un compte depuis une source donnee;
 *   - elle ne permet PAS le verrouillage a distance: un attaquant n'epuise que
 *     SON couple, le proprietaire garde le sien intact depuis son adresse.
 *
 * Ce qui reste assume: un attaquant qui change d'adresse retrouve un budget
 * neuf. C'est la rancon de ne pas verrouiller un compte globalement, et c'est
 * le compromis que l'OWASP recommande - un verrou global se retourne en arme
 * contre le proprietaire. Turnstile et le honeypot restent la premiere ligne.
 */
export const loginPaireLimiter = createLimiter(
  'login-paire',
  Ratelimit.slidingWindow(10, '15 m'),
  true,
);

/**
 * Par ADRESSE: 200 tentatives par 15 minutes. C'est un garde-fou de COUT, pas
 * d'authentification: il borne ce qu'une seule machine peut nous faire
 * consommer. Haut volontairement - une adresse est partagee par un restaurant entier,
 * ou par des centaines d'abonnes derriere le reseau d'un operateur mobile.
 */
export const loginAdresseLimiter = createLimiter(
  'login-adresse',
  Ratelimit.slidingWindow(200, '15 m'),
  true,
);

/** Billing portal: 10 requests / minute per IP */
export const billingPortalLimiter = createLimiter(
  'billing-portal',
  Ratelimit.slidingWindow(10, '1 m'),
);

/** Revalidate menu cache: 20 requests / minute per IP */
export const revalidateMenuLimiter = createLimiter(
  'revalidate-menu',
  Ratelimit.slidingWindow(20, '1 m'),
);

// --- IP extraction helpers ---

/**
 * Extract client IP from a Request object (API routes).
 * Checks x-forwarded-for, x-real-ip, then falls back to 'anonymous'.
 *
 * IP-SPOOF - HYPOTHESE D'HEBERGEMENT, a relire si elle change.
 *
 * On retient le PREMIER element de `X-Forwarded-For`, qui est la partie la plus
 * a gauche donc la plus facile a forger: n'importe qui peut envoyer
 * `X-Forwarded-For: 1.2.3.4` et se fabriquer un compartiment de debit neuf a
 * chaque requete, ce qui annule la limitation.
 *
 * C'est inoperant ICI parce que Vercel PREPEND l'IP reelle a l'en-tete avant
 * que la requete n'atteigne la fonction: le premier element est donc toujours
 * celui du proxy, pas celui du client. La garantie vient de l'hebergeur, pas de
 * ce code.
 *
 * Si le projet quitte Vercel, ou passe derriere un proxy supplementaire, cette
 * fonction devient une passoire et doit etre reecrite pour lire l'element a
 * DROITE (le dernier ajoute par l'infrastructure de confiance), ou pour se fier
 * a un en-tete signe par le proxy.
 */
/**
 * Adresse du client, telle que la plateforme la donne.
 *
 * POURQUOI L'ELEMENT LE PLUS A GAUCHE EST LE BON ICI, et pourquoi ce n'est pas
 * une faille: un audit a soupconne une falsification possible (un attaquant
 * qui envoie son propre `X-Forwarded-For` se fabriquerait un compteur neuf a
 * chaque requete, et toutes les limites tomberaient). Verifie dans la
 * documentation Vercel plutot que deduit: la plateforme **reecrit** cet en-tete
 * et ne transmet PAS les adresses externes, precisement pour empecher
 * l'usurpation (vercel.com/docs/headers/request-headers). L'element de gauche
 * est donc l'adresse constatee par Vercel, pas une valeur fournie par le
 * client.
 *
 * CE QUI INVALIDERAIT CE RAISONNEMENT: interposer un autre proxy devant Vercel
 * (Cloudflare, par exemple), ou quitter Vercel. Dans ce cas il faudrait lire
 * `x-vercel-forwarded-for`, ou l'en-tete du nouveau proxy, et surtout le
 * reverifier - pas le supposer.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return 'anonymous';
}

/**
 * Extract client IP from a Headers object (Server Actions).
 * Use with `const headersList = await headers();`
 */
export function getClientIpFromHeaders(headersList: Headers): string {
  const forwarded = headersList.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = headersList.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return 'anonymous';
}
