// Enums et unions partages pour l'administration multi-tenant ATTABL SaaS

// --- Roles d'administration --------------------------------
export type AdminRole = 'owner' | 'admin' | 'manager' | 'cashier' | 'chef' | 'waiter';

// --- Statuts & Enums -----------------------------------------
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
export type ServiceType = 'dine_in' | 'takeaway' | 'delivery' | 'room_service';
export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'refunded' | 'comp';
export type ItemStatus = 'pending' | 'preparing' | 'ready' | 'served';
export type Course = 'appetizer' | 'main' | 'dessert' | 'drink';
export type CurrencyCode = 'XAF' | 'XOF' | 'EUR' | 'USD';

export type PreparationZone = 'kitchen' | 'bar' | 'both';
export type OrderPreparationZone = 'kitchen' | 'bar' | 'mixed';
export type KDSZoneFilter = 'all' | 'kitchen' | 'bar';
