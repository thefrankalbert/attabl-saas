# Service floor table occupancy - sync with the rest of the dashboard

Date: 2026-07-03
Branch: `fix/service-table-occupancy`

## Problem (reported)

A cashier takes an order at the POS (Caisse), assigns it to a table (e.g. Table 1,
Bar zone), total 41 000 FCFA. Going back to the Service space (espace Service):

- the amount is correctly applied,
- BUT the table card still shows **libre** (free), even though a party clearly
  holds that table.

Secondary product question: a 4-seat table with one order - do we show it as free,
occupied, or "seats taken (n/4)"?

## Root cause

The Service floor computes a table's status client-side in
`src/components/admin/service/service-status.ts` (`buildTableVMs`). A table is
`occupied` iff it has an **active server assignment** OR an order in the set passed
to it. That set is `readyOrders` = `listReadyOrdersToday` which filters
`status = 'ready'` (kitchen-ready only).

A POS dine-in order lands in `status = 'pending'` and, unless a waiter is assigned,
never flips the card to occupied. The table detail panel _did_ show the 41 000
because it uses a different path (`getCurrentOrderForTable`, "any order not
delivered/cancelled") - hence the inconsistency the user saw.

Meanwhile the **canonical occupancy signal already exists and the tenant dashboard
already uses it**: `table_sessions`. When a dine-in order with a `table_number` is
created, `create_order_with_items` **find-or-creates an open `table_sessions` row**
(migration `20260629000600_table_sessions.sql`). The session is **closed** when all
its orders are settled (`closeSessionIfFullySettled`, order-lifecycle). The
dashboard (`app/sites/[site]/admin/page.tsx:238-244`) computes occupied = tables
with an open session. The Service floor is the only surface that ignores it.

So: Service floor and dashboard disagree because they use two different occupancy
signals. Fix = make the Service floor read the same canonical signal.

## Occupation model decision (option A - defaulted)

A restaurant table is occupied as soon as **a party opens a check** - one order =
one seated party holding the whole table. The data model has **no covers/party_size
field** on orders, only `tables.capacity` (how many the table seats). So "seats
taken n/4" is not derivable without a new field + waiter input on every order.

Decision (default, confirm with user): **binary occupied + capacity as info**.

- occupied iff an open `table_sessions` row exists for the table OR a server is
  assigned to it,
- `tables.capacity` keeps rendering as static info on the card (already shown at
  `ServiceTableCard.tsx:133`).

This matches the DB model and the dashboard. "seats taken n/4" (option B) is
deliberately out of scope - it needs a covers field, POS UI change, and mandatory
waiter input per order; revisit only if the user asks.

## Design (smallest correct change, reuse the dashboard's signal)

1. **`service-manager.service.ts` - `loadDashboard`**: add a 4th parallel query
   returning open sessions: `table_sessions` where `status='open'` for the tenant,
   selecting `table_number, opened_at`. Return `openSessions` alongside
   zones/servers/readyOrders. (Same query shape as the dashboard.)

2. **`service-status.ts` - `buildTableVMs`**: replace the `orders: Order[]` input
   with `openSessions: { table_number: string; opened_at: string }[]`. Occupied iff
   `assignment` OR an open session keyed by `table.table_number` /
   `table.display_name`. `since = session.opened_at ?? assignment.started_at`.
   Drop the now-unused `order` field from `ServiceTableVM` (no component reads it).

3. **`ServiceManager.tsx`**: hold `openSessions` state; feed it to `buildTableVMs`.
   Keep `readyOrders` feeding the right panel + mobile "ready to serve" list
   (unchanged - that list legitimately wants `status='ready'`). On the existing
   `orders` realtime subscription, also reload open sessions (an order insert opens
   a session; settling it closes the session via an orders update), so the floor
   stays live.

4. **Test**: add `service-status.test.ts` covering `buildTableVMs`: occupied via
   open session, occupied via assignment, free when neither, session `opened_at`
   surfaced as `since`.

Nothing touches protected files (`order.service.ts` aggregator untouched; the
session query lives in `service-manager.service.ts`, not `order/*`). No migration -
`table_sessions` and the session lifecycle already exist and run in prod.

## Out of scope

- Covers / "seats taken n/4" (needs new data + POS change).
- `reserved` / `cleaning` statuses (no backend support yet).
- Any other Service<->dashboard sync gaps beyond table occupancy (none identified;
  raise if found).

## Verification

- 5 CI gates (typecheck, lint, format, test, build).
- Live: with a dev/test DB (never prod creds), open a dine-in POS order on a table
  -> Service card flips to occupied with "depuis HH:MM"; settle it -> back to free.
