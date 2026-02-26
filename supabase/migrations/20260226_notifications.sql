-- In-app notifications for admin users
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID, -- NULL = broadcast to all tenant admins
  type TEXT NOT NULL DEFAULT 'info', -- info, warning, success, error
  title TEXT NOT NULL,
  body TEXT,
  link TEXT, -- optional deep-link path (e.g. /orders/abc123)
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_notifications_tenant_user ON notifications(tenant_id, user_id, read, created_at DESC);
CREATE INDEX idx_notifications_tenant_broadcast ON notifications(tenant_id, created_at DESC) WHERE user_id IS NULL;

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Admin users can read their own notifications (direct or broadcast)
CREATE POLICY "Admins can read own notifications"
  ON notifications FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- Admin users can update their own notifications (mark as read)
CREATE POLICY "Admins can update own notifications"
  ON notifications FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
    AND (user_id = auth.uid() OR user_id IS NULL)
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- Service role can insert (server-side only)
CREATE POLICY "Service can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
