# Audit de Migration Blutable → ATTABL

> **Date** : 2026-02-27
> **Mode** : LECTURE SEULE — aucune modification effectuee
> **Blutable Supabase** : `gjlztittszelfjubbksy` (Radisson Blu N'Djamena)
> **ATTABL Supabase** : `nqufpobuozrzwpeijkxt` (SaaS multi-tenant)

---

## Section 1 : Schema Blutable (12 tables)

### 1.1 `restaurants` (4 enregistrements)

| Colonne       | Type        | Nullable | Default                  |
| ------------- | ----------- | -------- | ------------------------ |
| `id`          | uuid        | NOT NULL | `gen_random_uuid()`      |
| `name`        | text        | NOT NULL |                          |
| `name_en`     | text        | NULLABLE |                          |
| `slug`        | text        | NOT NULL |                          |
| `image_url`   | text        | NULLABLE |                          |
| `is_active`   | boolean     | NULLABLE | `true`                   |
| `is_event`    | boolean     | NULLABLE | `false`                  |
| `qr_code_url` | text        | NULLABLE |                          |
| `created_at`  | timestamptz | NOT NULL | `timezone('utc', now())` |

**Donnees** : Carte Panorama Restaurant, Carte des Boissons, Lobby Bar Snacks, Pool

### 1.2 `categories` (24 enregistrements)

| Colonne         | Type        | Nullable | Default                  |
| --------------- | ----------- | -------- | ------------------------ |
| `id`            | uuid        | NOT NULL | `gen_random_uuid()`      |
| `name`          | text        | NOT NULL |                          |
| `name_en`       | text        | NULLABLE |                          |
| `description`   | text        | NULLABLE |                          |
| `restaurant_id` | uuid        | NULLABLE | FK → restaurants.id      |
| `display_order` | integer     | NULLABLE | `0`                      |
| `sort_order`    | integer     | NULLABLE | `0`                      |
| `created_at`    | timestamptz | NOT NULL | `timezone('utc', now())` |

### 1.3 `menu_items` (249 enregistrements)

| Colonne            | Type        | Nullable | Default                  |
| ------------------ | ----------- | -------- | ------------------------ |
| `id`               | uuid        | NOT NULL | `gen_random_uuid()`      |
| `name`             | text        | NOT NULL |                          |
| `name_en`          | text        | NULLABLE |                          |
| `description`      | text        | NULLABLE |                          |
| `description_en`   | text        | NULLABLE |                          |
| `price`            | numeric     | NULLABLE |                          |
| `image_url`        | text        | NULLABLE |                          |
| `is_available`     | boolean     | NULLABLE | `true`                   |
| `is_featured`      | boolean     | NULLABLE | `false`                  |
| `is_popular`       | boolean     | NULLABLE | `false`                  |
| `category_id`      | uuid        | NULLABLE | FK → categories.id       |
| `display_order`    | integer     | NULLABLE | `0`                      |
| `sort_order`       | integer     | NULLABLE | `0`                      |
| `preparation_time` | integer     | NULLABLE | `20`                     |
| `dietary_flags`    | jsonb       | NULLABLE |                          |
| `created_at`       | timestamptz | NOT NULL | `timezone('utc', now())` |

### 1.4 `item_options` (0 enregistrements)

| Colonne         | Type        | Nullable | Default             |
| --------------- | ----------- | -------- | ------------------- |
| `id`            | uuid        | NOT NULL | `gen_random_uuid()` |
| `menu_item_id`  | uuid        | NULLABLE | FK → menu_items.id  |
| `name_fr`       | text        | NOT NULL |                     |
| `name_en`       | text        | NULLABLE |                     |
| `display_order` | integer     | NULLABLE | `0`                 |
| `is_default`    | boolean     | NULLABLE | `false`             |
| `created_at`    | timestamptz | NULLABLE | `now()`             |

### 1.5 `item_price_variants` (0 enregistrements)

| Colonne           | Type        | Nullable | Default             |
| ----------------- | ----------- | -------- | ------------------- |
| `id`              | uuid        | NOT NULL | `gen_random_uuid()` |
| `menu_item_id`    | uuid        | NULLABLE | FK → menu_items.id  |
| `variant_name_fr` | text        | NOT NULL |                     |
| `variant_name_en` | text        | NULLABLE |                     |
| `price`           | numeric     | NOT NULL |                     |
| `display_order`   | integer     | NULLABLE | `0`                 |
| `is_default`      | boolean     | NULLABLE | `false`             |
| `created_at`      | timestamptz | NULLABLE | `now()`             |

### 1.6 `orders` (92 enregistrements)

| Colonne          | Type        | Nullable | Default                  |
| ---------------- | ----------- | -------- | ------------------------ |
| `id`             | uuid        | NOT NULL | `gen_random_uuid()`      |
| `table_number`   | text        | NULLABLE |                          |
| `total_price`    | numeric     | NULLABLE |                          |
| `status`         | text        | NULLABLE | `'pending'`              |
| `restaurant_id`  | uuid        | NULLABLE | FK → restaurants.id      |
| `payment_method` | text        | NULLABLE | `'cash'`                 |
| `room_number`    | text        | NULLABLE |                          |
| `customer_notes` | text        | NULLABLE |                          |
| `notes`          | text        | NULLABLE |                          |
| `tip_amount`     | integer     | NULLABLE | `0`                      |
| `created_at`     | timestamptz | NOT NULL | `timezone('utc', now())` |
| `updated_at`     | timestamptz | NULLABLE | `now()`                  |

### 1.7 `order_items` (211 enregistrements)

| Colonne          | Type    | Nullable | Default             |
| ---------------- | ------- | -------- | ------------------- |
| `id`             | uuid    | NOT NULL | `gen_random_uuid()` |
| `order_id`       | uuid    | NULLABLE | FK → orders.id      |
| `menu_item_id`   | uuid    | NULLABLE | FK → menu_items.id  |
| `quantity`       | integer | NULLABLE | `1`                 |
| `price_at_order` | numeric | NULLABLE |                     |

### 1.8 `admin_users` (protege par RLS)

| Colonne      | Type        | Nullable | Default             |
| ------------ | ----------- | -------- | ------------------- |
| `id`         | uuid        | NOT NULL | `gen_random_uuid()` |
| `email`      | text        | NOT NULL |                     |
| `role`       | text        | NULLABLE | `'admin'`           |
| `user_id`    | uuid        | NULLABLE |                     |
| `full_name`  | text        | NULLABLE |                     |
| `is_active`  | boolean     | NULLABLE |                     |
| `created_by` | uuid        | NULLABLE |                     |
| `created_at` | timestamptz | NULLABLE | `now()`             |

### 1.9 `admin_login_logs` (protege par RLS)

| Colonne      | Type        | Nullable | Default             |
| ------------ | ----------- | -------- | ------------------- |
| `id`         | uuid        | NOT NULL | `gen_random_uuid()` |
| `user_email` | text        | NOT NULL |                     |
| `user_id`    | uuid        | NULLABLE |                     |
| `ip_address` | text        | NULLABLE |                     |
| `user_agent` | text        | NULLABLE |                     |
| `created_at` | timestamptz | NULLABLE | `now()`             |

### 1.10 `ads` (2 enregistrements)

| Colonne      | Type        | Nullable | Default             |
| ------------ | ----------- | -------- | ------------------- |
| `id`         | uuid        | NOT NULL | `gen_random_uuid()` |
| `image_url`  | text        | NOT NULL |                     |
| `link`       | text        | NULLABLE |                     |
| `sort_order` | integer     | NULLABLE | `1`                 |
| `active`     | boolean     | NULLABLE | `true`              |
| `created_at` | timestamptz | NULLABLE | `now()`             |

### 1.11 `announcements` (0 enregistrements)

| Colonne          | Type        | Nullable | Default             |
| ---------------- | ----------- | -------- | ------------------- |
| `id`             | uuid        | NOT NULL | `gen_random_uuid()` |
| `title`          | text        | NOT NULL |                     |
| `title_en`       | text        | NULLABLE |                     |
| `description`    | text        | NULLABLE |                     |
| `description_en` | text        | NULLABLE |                     |
| `image_url`      | text        | NULLABLE |                     |
| `start_date`     | timestamptz | NULLABLE |                     |
| `end_date`       | timestamptz | NULLABLE |                     |
| `is_active`      | boolean     | NULLABLE | `true`              |
| `restaurant_id`  | uuid        | NULLABLE | FK → restaurants.id |
| `type`           | text        | NULLABLE | `'standard'`        |
| `created_at`     | timestamptz | NULLABLE | `now()`             |

### 1.12 `notification_sounds` (0 enregistrements)

| Colonne      | Type        | Nullable | Default             |
| ------------ | ----------- | -------- | ------------------- |
| `id`         | uuid        | NOT NULL | `gen_random_uuid()` |
| `name`       | text        | NOT NULL |                     |
| `url`        | text        | NOT NULL |                     |
| `is_system`  | boolean     | NULLABLE | `false`             |
| `created_at` | timestamptz | NULLABLE | `now()`             |

### Tables TypeScript mais ABSENTES de la DB Blutable

- `venues` — Non creee
- `zones` — Non creee
- `tables` — Non creee
- `settings` — Existe probablement (RLS strict), stocke `establishment_settings` et `design_settings`

### Buckets Storage Blutable

- `menu-items` — Images des plats
- `images` — Bannieres pub, sons, images generales

---

## Section 2 : Schema ATTABL (31 tables)

### Tables Live (22)

| Table                       | Enregistrements | Description                           |
| --------------------------- | --------------- | ------------------------------------- |
| `tenants`                   | ~2              | Entite racine multi-tenant            |
| `admin_users`               | ~3              | Utilisateurs admin lies aux tenants   |
| `venues`                    | ~2              | Espaces de restauration par tenant    |
| `zones`                     | variable        | Zones dans un venue                   |
| `tables`                    | variable        | Tables physiques dans les zones       |
| `menus`                     | variable        | Cartes/menus hierarchiques            |
| `categories`                | variable        | Categories dans les menus             |
| `menu_items`                | variable        | Plats/boissons                        |
| `item_modifiers`            | 0               | Options payantes (supplements)        |
| `orders`                    | variable        | Commandes                             |
| `order_items`               | variable        | Lignes de commande                    |
| `coupons`                   | 0               | Codes promo                           |
| `settings`                  | variable        | Parametres cle-valeur par tenant      |
| `announcements`             | 0               | Annonces promotionnelles              |
| `ingredients`               | variable        | Ingredients pour gestion stock        |
| `recipes`                   | variable        | Fiches techniques (plat → ingredient) |
| `stock_movements`           | variable        | Historique mouvements de stock        |
| `item_suggestions`          | 0               | Suggestions d'accompagnement          |
| `stock_alert_notifications` | variable        | Alertes stock (rate-limited)          |
| `suppliers`                 | variable        | Fournisseurs                          |
| `user_preferences`          | variable        | Preferences UI par utilisateur        |
| `user_sessions`             | variable        | Sessions audit                        |

### Tables en migrations (non appliquees, 9)

| Table                   | Description                 |
| ----------------------- | --------------------------- |
| `onboarding_progress`   | Progression onboarding      |
| `newsletter_subscriber` | Abonnes newsletter          |
| `invitations`           | Invitations d'equipe        |
| `role_permissions`      | Permissions par role        |
| `restaurant_groups`     | Groupes multi-restaurant    |
| `table_assignments`     | Affectation serveur → table |
| `audit_log`             | Journal d'audit             |
| `notifications`         | Notifications in-app        |
| `push_subscriptions`    | Abonnements push web        |

---

## Section 3 : Matrice de Mapping

### 3.1 `restaurants` (Blutable) → `menus` + `venues` (ATTABL)

Les "restaurants" dans Blutable sont en realite des **cartes/menus differents** du meme hotel (Panorama, Pool, Boissons, Lobby Bar). Dans ATTABL, cela correspond a des `menus` rattaches a un `venue`.

| Blutable `restaurants` | ATTABL Cible       | Transformation                                 |
| ---------------------- | ------------------ | ---------------------------------------------- |
| `id`                   | `menus.id`         | Nouveau UUID ou conservation                   |
| `name`                 | `menus.name`       | Direct                                         |
| `name_en`              | `menus.name_en`    | Direct                                         |
| `slug`                 | `menus.slug`       | Direct                                         |
| `image_url`            | `menus.image_url`  | Direct (re-upload si storage)                  |
| `is_active`            | `menus.is_active`  | Direct                                         |
| `is_event`             | —                  | **GAP** : pas d'equivalent dans ATTABL         |
| `qr_code_url`          | —                  | **GAP** : QR generes dynamiquement dans ATTABL |
| `created_at`           | `menus.created_at` | Direct                                         |
| —                      | `menus.tenant_id`  | **A REMPLIR** : ID du tenant Radisson          |
| —                      | `menus.venue_id`   | **A REMPLIR** : ID du venue principal          |

**Strategie** : Creer 1 tenant "Radisson Blu N'Djamena", 1 venue "main", puis 4 menus correspondant aux 4 restaurants.

### 3.2 `categories` (Blutable) → `categories` (ATTABL)

| Blutable        | ATTABL          | Transformation                                                          |
| --------------- | --------------- | ----------------------------------------------------------------------- |
| `id`            | `id`            | Nouveau UUID ou conservation                                            |
| `name`          | `name`          | Direct                                                                  |
| `name_en`       | `name_en`       | Direct                                                                  |
| `description`   | `description`   | Direct                                                                  |
| `restaurant_id` | `menu_id`       | **TRANSFORMATION** : mapper restaurant_id vers le menu_id correspondant |
| `display_order` | `display_order` | Direct                                                                  |
| `sort_order`    | —               | **IGNORE** : champ legacy, utiliser `display_order`                     |
| `created_at`    | `created_at`    | Direct                                                                  |
| —               | `tenant_id`     | **A REMPLIR** : ID du tenant                                            |
| —               | `venue_id`      | **A REMPLIR** : ID du venue (optionnel)                                 |
| —               | `is_active`     | **A REMPLIR** : `true` par defaut                                       |

### 3.3 `menu_items` (Blutable) → `menu_items` (ATTABL)

| Blutable           | ATTABL           | Transformation                                                       |
| ------------------ | ---------------- | -------------------------------------------------------------------- |
| `id`               | `id`             | Nouveau UUID ou conservation                                         |
| `name`             | `name`           | Direct                                                               |
| `name_en`          | `name_en`        | Direct                                                               |
| `description`      | `description`    | Direct                                                               |
| `description_en`   | `description_en` | Direct                                                               |
| `price`            | `price`          | Direct (meme devise XAF)                                             |
| `image_url`        | `image_url`      | **MIGRATION STORAGE** : re-upload vers bucket ATTABL                 |
| `is_available`     | `is_available`   | Direct                                                               |
| `is_featured`      | `is_featured`    | Direct                                                               |
| `is_popular`       | —                | **GAP** : pas d'equivalent dans ATTABL                               |
| `category_id`      | `category_id`    | Mapper via la table de correspondance categories                     |
| `display_order`    | —                | **GAP** : ATTABL n'a pas `display_order` sur menu_items              |
| `sort_order`       | —                | **IGNORE** : champ legacy                                            |
| `preparation_time` | —                | **GAP** : pas de colonne dans ATTABL                                 |
| `dietary_flags`    | —                | **GAP** : ATTABL a `allergens` (TEXT[]) mais migration non appliquee |
| `created_at`       | `created_at`     | Direct                                                               |
| —                  | `tenant_id`      | **A REMPLIR** : ID du tenant                                         |
| —                  | `updated_at`     | **A REMPLIR** : `now()`                                              |

### 3.4 `item_options` (Blutable) → Pas d'equivalent direct (ATTABL)

| Blutable `item_options`       | ATTABL | Notes                                                                              |
| ----------------------------- | ------ | ---------------------------------------------------------------------------------- |
| Options sans prix additionnel | —      | **GAP TOTAL** : ATTABL a `item_modifiers` (avec prix) mais pas d'options gratuites |

**Note** : 0 enregistrements dans Blutable, donc pas de donnees a migrer.

### 3.5 `item_price_variants` (Blutable) → Pas d'equivalent (ATTABL)

| Blutable `item_price_variants`          | ATTABL | Notes                                                |
| --------------------------------------- | ------ | ---------------------------------------------------- |
| Variantes de prix (ex: Verre/Bouteille) | —      | **GAP TOTAL** : Pas de variantes de prix dans ATTABL |

**Note** : 0 enregistrements dans Blutable, donc pas de donnees a migrer.

### 3.6 `orders` (Blutable) → `orders` (ATTABL)

| Blutable         | ATTABL                  | Transformation                                            |
| ---------------- | ----------------------- | --------------------------------------------------------- |
| `id`             | `id`                    | Nouveau UUID ou conservation                              |
| `table_number`   | `table_number`          | Direct                                                    |
| `total_price`    | `total`                 | **RENAME**                                                |
| —                | `subtotal`              | **A REMPLIR** : = total_price (pas de taxe dans Blutable) |
| —                | `tax`                   | **A REMPLIR** : `0`                                       |
| `status`         | `status`                | Direct (memes valeurs)                                    |
| `restaurant_id`  | `venue_id`              | **TRANSFORMATION** : mapper vers venue_id ATTABL          |
| `payment_method` | `payment_method`        | Direct (valeur `cash`)                                    |
| `room_number`    | `room_number`           | Direct                                                    |
| `customer_notes` | `notes`                 | **MERGE** : customer_notes + notes → notes                |
| `notes`          | `notes`                 | voir ci-dessus                                            |
| `tip_amount`     | —                       | **GAP** : pas de pourboire dans ATTABL                    |
| `created_at`     | `created_at`            | Direct                                                    |
| `updated_at`     | `updated_at`            | Direct                                                    |
| —                | `tenant_id`             | **A REMPLIR** : ID du tenant                              |
| —                | `order_number`          | **A GENERER** : format `CMD-YYYYMMDD-NNN`                 |
| —                | `service_type`          | **A REMPLIR** : `'dine_in'` par defaut                    |
| —                | `payment_status`        | **A REMPLIR** : `'pending'`                               |
| —                | `tax_amount`            | **A REMPLIR** : `0`                                       |
| —                | `service_charge_amount` | **A REMPLIR** : `0`                                       |
| —                | `discount_amount`       | **A REMPLIR** : `0`                                       |

### 3.7 `order_items` (Blutable) → `order_items` (ATTABL)

| Blutable         | ATTABL           | Transformation                                 |
| ---------------- | ---------------- | ---------------------------------------------- |
| `id`             | `id`             | Nouveau UUID ou conservation                   |
| `order_id`       | `order_id`       | Mapper via correspondance orders               |
| `menu_item_id`   | `menu_item_id`   | Mapper via correspondance menu_items           |
| `quantity`       | `quantity`       | Direct                                         |
| `price_at_order` | `price_at_order` | Direct                                         |
| —                | `item_name`      | **A REMPLIR** : lookup menu_items.name         |
| —                | `item_name_en`   | **A REMPLIR** : lookup menu_items.name_en      |
| —                | `item_status`    | **A REMPLIR** : `'served'` (historique)        |
| —                | `created_at`     | **A REMPLIR** : copier depuis order.created_at |

### 3.8 `admin_users` (Blutable) → `admin_users` (ATTABL)

| Blutable     | ATTABL       | Transformation                                                                           |
| ------------ | ------------ | ---------------------------------------------------------------------------------------- |
| `id`         | `id`         | Nouveau UUID                                                                             |
| `email`      | `email`      | Direct                                                                                   |
| `role`       | `role`       | **MAPPING** : superadmin→owner, admin→admin, caissier→cashier, chef→chef, serveur→waiter |
| `user_id`    | `user_id`    | **RE-CREATION** : nouveaux users dans Supabase Auth ATTABL                               |
| `full_name`  | `full_name`  | Direct                                                                                   |
| `is_active`  | `is_active`  | Direct                                                                                   |
| `created_by` | `created_by` | Mapper vers nouveau admin_users.id                                                       |
| `created_at` | `created_at` | Direct                                                                                   |
| —            | `tenant_id`  | **A REMPLIR** : ID du tenant                                                             |

### 3.9 `admin_login_logs` (Blutable) → `user_sessions` (ATTABL)

| Blutable     | ATTABL       | Transformation                      |
| ------------ | ------------ | ----------------------------------- |
| `user_email` | —            | Non stocke (deduisible via user_id) |
| `user_id`    | `user_id`    | Mapper vers admin_users.id ATTABL   |
| `ip_address` | `ip_address` | Direct                              |
| `user_agent` | `user_agent` | Direct                              |
| `created_at` | `login_at`   | **RENAME**                          |
| —            | `tenant_id`  | **A REMPLIR**                       |
| —            | `login_type` | **A REMPLIR** : `'web'`             |

### 3.10 `ads` (Blutable) → Pas d'equivalent (ATTABL)

| Blutable `ads`          | ATTABL | Notes                                              |
| ----------------------- | ------ | -------------------------------------------------- |
| Bannieres publicitaires | —      | **GAP TOTAL** : pas de systeme de pubs dans ATTABL |

**Note** : 2 enregistrements. Possibilite de stocker dans `announcements` ATTABL ou dans `settings` JSON.

### 3.11 `announcements` (Blutable) → `announcements` (ATTABL)

| Blutable         | ATTABL           | Transformation                                   |
| ---------------- | ---------------- | ------------------------------------------------ |
| `id`             | `id`             | Direct                                           |
| `title`          | `title`          | Direct                                           |
| `title_en`       | `title_en`       | Direct                                           |
| `description`    | `description`    | Direct                                           |
| `description_en` | `description_en` | Direct                                           |
| `image_url`      | `image_url`      | Migration storage                                |
| `start_date`     | `start_date`     | Direct                                           |
| `end_date`       | `end_date`       | Direct                                           |
| `is_active`      | `is_active`      | Direct                                           |
| `restaurant_id`  | —                | **IGNORE** (pas de FK dans ATTABL announcements) |
| `type`           | —                | **GAP** : pas de champ `type` dans ATTABL        |
| `created_at`     | `created_at`     | Direct                                           |
| —                | `tenant_id`      | **A REMPLIR**                                    |

### 3.12 `notification_sounds` (Blutable) → `tenants.notification_sound_id` (ATTABL)

Pas d'equivalent table. ATTABL stocke un seul `notification_sound_id` (string) sur le tenant.
0 enregistrements a migrer.

---

## Section 4 : Points d'attention

### 4.1 Donnees dans Blutable SANS equivalent dans ATTABL

| Donnee                        | Impact                            | Recommandation                                                                      |
| ----------------------------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| `menu_items.is_popular`       | Affichage "populaire" sur le menu | Ajouter une colonne ou ignorer                                                      |
| `menu_items.display_order`    | Tri des plats dans une categorie  | **CRITIQUE** : ATTABL n'a pas cette colonne. Ajouter `display_order` a `menu_items` |
| `menu_items.preparation_time` | Temps de preparation estime       | Ajouter ou ignorer (utile pour KDS)                                                 |
| `menu_items.dietary_flags`    | Flags dietetiques (JSON)          | ATTABL a `allergens` (TEXT[]) en migration — appliquer la migration                 |
| `orders.tip_amount`           | Pourboires                        | Ignorer ou ajouter colonne                                                          |
| `restaurants.is_event`        | Flag menu evenementiel            | Ignorer (stocker dans `menus` metadata ou settings)                                 |
| `restaurants.qr_code_url`     | QR codes pre-generes              | Ignorer (ATTABL genere dynamiquement)                                               |
| `item_options` (table)        | Options sans prix                 | Ignorer (0 donnees)                                                                 |
| `item_price_variants` (table) | Variantes de prix                 | Ignorer (0 donnees)                                                                 |
| `ads` (table)                 | Systeme publicitaire              | Ignorer ou stocker dans `announcements`                                             |
| `categories.sort_order`       | Tri legacy                        | Ignorer (utiliser `display_order`)                                                  |

### 4.2 Donnees dans ATTABL SANS equivalent dans Blutable

| Donnee ATTABL                  | Valeur par defaut pour migration               |
| ------------------------------ | ---------------------------------------------- |
| `tenants.*`                    | Creer un tenant "Radisson Blu N'Djamena"       |
| `orders.order_number`          | Generer `CMD-YYYYMMDD-NNN` depuis `created_at` |
| `orders.subtotal`              | = `total_price` (pas de taxe)                  |
| `orders.tax`, `tax_amount`     | `0`                                            |
| `orders.service_charge_amount` | `0`                                            |
| `orders.service_type`          | `'dine_in'`                                    |
| `orders.payment_status`        | `'pending'`                                    |
| `order_items.item_name`        | Lookup depuis `menu_items.name`                |
| `order_items.item_status`      | `'served'` (donnees historiques)               |
| `categories.menu_id`           | Mapper depuis restaurant_id → menu_id          |
| `venues.*`                     | Creer 1 venue "main"                           |
| `ingredients.*`                | Pas de donnees a migrer                        |
| `recipes.*`                    | Pas de donnees a migrer                        |
| `stock_movements.*`            | Pas de donnees a migrer                        |
| `suppliers.*`                  | Pas de donnees a migrer                        |
| `coupons.*`                    | Pas de donnees a migrer                        |

### 4.3 Logique multi-QR / multi-restaurant

**Blutable** : 4 "restaurants" = 4 cartes differentes, chacune avec son QR code.

- QR Panorama → filtre `restaurant_id` = Panorama → affiche ce menu
- QR Boissons → filtre `restaurant_id` = Boissons → affiche ce menu
- QR Pool → filtre `restaurant_id` = Pool → affiche ce menu
- QR Lobby → filtre `restaurant_id` = Lobby → affiche ce menu

**ATTABL** : Architecture cible

```
Tenant: "Radisson Blu N'Djamena"
  └── Venue: "main" (slug: "main")
       ├── Menu: "Carte Panorama Restaurant" (slug: "carte-panorama-restaurant")
       │    └── 9 categories → 100+ items
       ├── Menu: "Carte des Boissons" (slug: "carte-des-boissons")
       │    └── 9 categories → 80+ items
       ├── Menu: "Pool" (slug: "pool-bar")
       │    └── 5 categories → 40+ items
       └── Menu: "Lobby Bar Snacks" (slug: "carte-lobby-bar-snacks")
            └── 1 categorie → 20+ items
```

**QR Codes ATTABL** : Chaque menu a son propre slug. L'URL QR serait :

- `radisson.attabl.com/carte-panorama-restaurant`
- `radisson.attabl.com/carte-des-boissons`
- `radisson.attabl.com/pool-bar`
- `radisson.attabl.com/carte-lobby-bar-snacks`

### 4.4 Migration des images

Les images des plats sont stockees dans le bucket Supabase `menu-items` de Blutable.

- URL format : `https://gjlztittszelfjubbksy.supabase.co/storage/v1/object/public/menu-items/...`
- **Action** : Telecharger chaque image et re-uploader dans le bucket ATTABL
- **Alternative** : Garder les URLs Blutable temporairement (risque si projet Blutable supprime)

### 4.5 Migration des utilisateurs auth

Les utilisateurs Supabase Auth de Blutable ne peuvent PAS etre copies vers ATTABL.

- **Action** : Creer de nouveaux comptes dans Supabase Auth ATTABL
- **Mots de passe** : Les utilisateurs devront reinitialiser leurs mots de passe
- **Alternative** : Utiliser `supabase auth admin createUser()` avec `email_confirm: true` et envoyer un email de reset password

---

## Section 5 : Plan de migration recommande

### Ordre d'insertion (respect des foreign keys)

```
1. tenants           → Creer le tenant Radisson
2. admin_users       → Creer les admins (re-creation auth users)
3. venues            → Creer le venue "main"
4. zones             → Creer les zones si necessaire
5. tables            → Creer les tables si necessaire
6. menus             → Migrer les 4 "restaurants" en menus
7. categories        → Migrer les 24 categories (avec menu_id)
8. menu_items        → Migrer les 249 items (avec category_id)
9. orders            → Migrer les 92 commandes (historique)
10. order_items      → Migrer les 211 lignes de commande
11. announcements    → Migrer les annonces (0 donnees)
12. settings         → Migrer les parametres design
13. Images storage   → Re-upload des images plats
```

### Pre-requis avant migration

1. **Appliquer les migrations ATTABL manquantes** (optionnel mais recommande) :
   - `20260226_allergens_calories.sql` → pour migrer `dietary_flags`
   - `20260218_invitations_permissions.sql` → pour le systeme d'invitations

2. **Ajouter `display_order` a `menu_items` ATTABL** :

   ```sql
   ALTER TABLE menu_items ADD COLUMN display_order INTEGER DEFAULT 0;
   ```

   Ceci est **critique** pour preserver l'ordre d'affichage des plats.

3. **Decider du sort des images** : re-upload ou conserver URLs Blutable

### Donnees a creer d'abord (avant import)

| Entite      | Donnees | Exemple                                                           |
| ----------- | ------- | ----------------------------------------------------------------- |
| Tenant      | 1       | name: "Radisson Blu N'Djamena", slug: "radisson", currency: "XAF" |
| Auth Users  | N       | Re-creer chaque admin avec email + role                           |
| Admin Users | N       | Lier auth users au tenant                                         |
| Venue       | 1       | name: "Radisson Blu", slug: "main", type: "hotel"                 |

### Risques identifies

| Risque                                       | Severite    | Mitigation                                             |
| -------------------------------------------- | ----------- | ------------------------------------------------------ |
| Perte d'images si Blutable Supabase supprime | **HAUTE**   | Re-upload immediat des images                          |
| Mots de passe perdus (users auth)            | **MOYENNE** | Envoyer email reset password apres migration           |
| Ordre des plats perdu                        | **HAUTE**   | Ajouter `display_order` a `menu_items` AVANT migration |
| IDs changes → liens casses                   | **MOYENNE** | Utiliser une table de mapping old_id → new_id          |
| Donnees historiques (commandes) volumineuses | **BASSE**   | 92 commandes = faible volume                           |
| `is_popular`, `preparation_time` perdus      | **BASSE**   | Accepter la perte ou ajouter les colonnes              |
| QR codes existants imprimes                  | **HAUTE**   | Configurer redirections des anciens URLs               |

### Estimation du volume

| Table               | Enregistrements  | Complexite                               |
| ------------------- | ---------------- | ---------------------------------------- |
| restaurants → menus | 4                | Simple                                   |
| categories          | 24               | Simple (mapping restaurant_id → menu_id) |
| menu_items          | 249              | Moyenne (images + display_order)         |
| orders              | 92               | Moyenne (champs a remplir)               |
| order_items         | 211              | Simple (lookup item_name)                |
| Images              | ~50-100 fichiers | Moyenne (download + re-upload)           |
| **TOTAL**           | ~580 lignes      | **2-4 heures de travail**                |

---

## Annexe : Correspondance des roles

| Blutable     | ATTABL              |
| ------------ | ------------------- |
| `superadmin` | `owner`             |
| `admin`      | `admin`             |
| `caissier`   | `cashier`           |
| `chef`       | `chef`              |
| `serveur`    | `waiter`            |
| —            | `manager` (nouveau) |
