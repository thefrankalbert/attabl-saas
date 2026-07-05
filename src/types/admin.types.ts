// Types pour l'administration multi-tenant ATTABL SaaS
// Adapte de BluTable avec support tenant_id
//
// Ce fichier est un barrel : les declarations reelles sont regroupees par
// domaine dans src/types/admin/*.types.ts. Tout est re-exporte ici pour que
// les imports existants (`@/types/admin.types`) continuent de fonctionner.

export * from './admin/enums.types';
export * from './admin/tenant.types';
export * from './admin/order.types';
export * from './admin/venue.types';
export * from './admin/menu.types';
export * from './admin/marketing.types';
export * from './admin/dashboard.types';
