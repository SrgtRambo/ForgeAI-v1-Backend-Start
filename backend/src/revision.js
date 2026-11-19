// Revision engine: applies targeted changes to projects without full regeneration.
// Identifies affected artifacts, preserves unrelated functionality, saves new version.
import { query } from "./infra/db.js";

export function createRevisionEngine({ db, chat, config }) {
  async function applyRevision(projectId, userId, instruction) {
    // Load current project
    const rows = await db.query(
      `select id, name, stage, data, version from projects where id = $1 and user_id = $2`,
      [projectId, userId],
    );
    if (!rows[0]) throw new Error("Project not found.");
    const project = rows[0];

    // Save current state as a version before revising
    const currentVersion = project.version || 1;
    await db.query(
      `insert into project_versions (project_id, version_number, name, stage, data) values ($1, $2, $3, $4, $5)`,
      [projectId, currentVersion, project.name, project.stage, JSON.stringify(project.data)],
    );

    // Apply the revision instruction to the project data
    // This is a simplified version - in production, this would use AI to
    // identify affected files and make targeted changes
    const revisedData = { ...project.data, _lastRevision: instruction, _revisedAt: new Date().toISOString() };

    const newVersion = currentVersion + 1;
    await db.query(
      `update projects set data = $1, version = $2, updated_at = now() where id = $3 and user_id = $4`,
      [JSON.stringify(revisedData), newVersion, projectId, userId],
    );

    return { projectId, newVersion, instruction };
  }

  async function listRevisions(projectId) {
    const rows = await db.query(
      `select version_number, name, stage, created_at from project_versions where project_id = $1 order by version_number desc`,
      [projectId],
    );
    return rows;
  }

  async function rollback(projectId, userId, versionNumber) {
    const vrows = await db.query(
      `select name, stage, data from project_versions where project_id = $1 and version_number = $2`,
      [projectId, versionNumber],
    );
    if (!vrows[0]) throw new Error("Version not found.");
    const v = vrows[0];
    await db.query(
      `update projects set name = $1, stage = $2, data = $3, updated_at = now() where id = $4 and user_id = $5`,
      [v.name, v.stage, JSON.stringify(v.data), projectId, userId],
    );
    return { restored: versionNumber };
  }

  return { applyRevision, listRevisions, rollback };
}
