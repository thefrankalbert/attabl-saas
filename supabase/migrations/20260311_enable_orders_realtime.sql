-- Enable Supabase Realtime for the orders table.
-- Without this, postgres_changes subscriptions on `orders` silently receive nothing.
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
