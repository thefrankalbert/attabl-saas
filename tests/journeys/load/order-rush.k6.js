/* eslint-disable */
/**
 * Test de charge k6: "le coup de feu" - jusqu'a 100 convives en simultane.
 *
 * Mesure la tenue sous charge d'un endpoint public (validation de commande /
 * coupon). Par defaut NON destructif: ne cree PAS de commandes. Pour tester la
 * creation reelle sous charge, mettre K6_CREATE_ORDERS=true SUR UNE BASE DE TEST.
 *
 * GARDE-FOU: ne tourne que si K6_CONFIRM=yes, pour eviter de bombarder une prod
 * par accident.
 *
 * Installation: brew install k6   (ou https://k6.io/docs/get-started/installation/)
 * Lancement:
 *   K6_CONFIRM=yes BASE_URL=http://localhost:3000 TENANT_SLUG=journey-test \
 *     k6 run tests/journeys/load/order-rush.k6.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TENANT_SLUG = __ENV.TENANT_SLUG || 'journey-test';
const CONFIRM = __ENV.K6_CONFIRM === 'yes';
const PEAK_VUS = Number(__ENV.K6_PEAK_VUS || 100);

const errorRate = new Rate('errors');
const orderLatency = new Trend('order_latency_ms', true);

export const options = {
  scenarios: {
    rush: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Math.ceil(PEAK_VUS / 4) }, // montee douce
        { duration: '1m', target: PEAK_VUS }, // coup de feu: 100 convives
        { duration: '1m', target: PEAK_VUS }, // plateau
        { duration: '30s', target: 0 }, // reflux
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], // < 1% d'erreurs HTTP
    http_req_duration: ['p(95)<1500'], // 95% des requetes sous 1,5 s
    errors: ['rate<0.05'],
  },
};

// Hotes de prod: k6 refuse de les bombarder meme avec K6_CONFIRM=yes.
const PROD_HOSTS = ['attabl.com', 'attabl-saas.vercel.app'];

export function setup() {
  if (!CONFIRM) {
    throw new Error(
      'k6 stoppe: relance avec K6_CONFIRM=yes (et JAMAIS contre la prod). ' +
        'Cible une base/instance de test.',
    );
  }
  const host = BASE_URL.replace(/^https?:\/\//, '')
    .split('/')[0]
    .split(':')[0];
  const isProd = PROD_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  if (isProd) {
    throw new Error(
      'k6 stoppe: BASE_URL pointe sur un hote de PROD (' +
        host +
        '). Le test de charge refuse de viser la production. Cible une instance de test.',
    );
  }
  return { base: BASE_URL, slug: TENANT_SLUG };
}

export default function (data) {
  // Endpoint public, non destructif: valide un (faux) coupon = exerce tenant
  // resolution + rate limit + DB, sans creer de commande.
  const res = http.post(
    `${data.base}/api/coupons/validate`,
    JSON.stringify({ code: `LOAD-${__VU}-${__ITER}`, subtotal: 5000, tenantSlug: data.slug }),
    {
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-slug': data.slug,
        // verifyOrigin (CSRF) renvoie 403 sans Origin autorise; en dev localhost OK.
        Origin: data.base,
      },
    },
  );

  orderLatency.add(res.timings.duration);
  // 200 (valid:false) ou 404 (tenant/coupon inconnu) ou 429 (rate limit) = OK.
  const ok = [200, 400, 404, 429].includes(res.status);
  check(res, { 'statut attendu': () => ok });
  errorRate.add(!ok);

  sleep(Math.random() * 1.5); // rythme realiste entre actions d'un convive
}
