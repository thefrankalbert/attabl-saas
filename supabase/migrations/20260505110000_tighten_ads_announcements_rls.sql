-- Tighten RLS on ads and announcements: restrict anon SELECT to is_active = true rows.
-- Previously USING(true) exposed inactive/draft records across all tenants via the anon REST API.

DROP POLICY IF EXISTS "Anyone can view active ads" ON ads;
CREATE POLICY "Anyone can view active ads" ON ads
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Anyone can view active announcements" ON announcements;
CREATE POLICY "Anyone can view active announcements" ON announcements
  FOR SELECT USING (is_active = true);
