// Audit logging helper.
export async function logAction(db, { userId, action, resourceType, resourceId, details, ip }) {
  try {
    await db.query(
      `insert into audit_log (user_id, action, resource_type, resource_id, details, ip_address) values ($1, $2, $3, $4, $5, $6)`,
      [userId || null, action, resourceType || null, resourceId || null, JSON.stringify(details || {}), ip || null],
    );
  } catch (e) {
    // Audit failures should not break the main flow
    console.error("[audit] failed:", e.message);
  }
}
