-- Add explicit WITH CHECK to menu_items ALL policy.
-- FOR ALL policies inherit USING as WITH CHECK by default in PostgreSQL,
-- but the project security rules require explicit WITH CHECK on all INSERT/UPDATE policies.
-- See: .claude/rules/01-security.md and CLAUDE.md section "Regles de securite"

ALTER POLICY "Admins can manage own tenant menu items" ON menu_items
  USING (tenant_id = ANY(get_my_tenant_ids_array()))
  WITH CHECK (tenant_id = ANY(get_my_tenant_ids_array()));
