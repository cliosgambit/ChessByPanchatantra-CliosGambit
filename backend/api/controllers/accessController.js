const db = require('../config/database');

function encodeAccessList(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return JSON.stringify(parsed);
    } catch {
      // legacy PG array literal: {a,b,c}
      if (value.startsWith('{') && value.endsWith('}')) {
        const inner = value.slice(1, -1).trim();
        if (!inner) return JSON.stringify([]);
        return JSON.stringify(inner.split(',').map((s) => s.trim()).filter(Boolean));
      }
    }
    return JSON.stringify([value]);
  }
  if (Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify([]);
}

function decodeAccessList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      if (value.startsWith('{') && value.endsWith('}')) {
        const inner = value.slice(1, -1).trim();
        if (!inner) return [];
        return inner.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
  }
  return [];
}

function mapRoleRow(row) {
  if (!row) return row;
  return {
    ...row,
    mod_access: decodeAccessList(row.mod_access),
    chap_access: decodeAccessList(row.chap_access),
    story_access: decodeAccessList(row.story_access),
  };
}

exports.getAccessControl = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM roles_control ORDER BY role');
    res.json(result.rows.map(mapRoleRow));
  } catch (err) {
    console.error('Error fetching access control:', err);
    res.status(500).json({ error: 'Failed to fetch access control settings' });
  }
};

exports.getRoleAccess = async (req, res) => {
  const { role } = req.params;
  try {
    const result = await db.query('SELECT * FROM roles_control WHERE role = $1', [role]);
    if (result.rows.length === 0) {
      return res.json({
        role,
        mod_access: [],
        chap_access: [],
        story_access: [],
      });
    }
    res.json(mapRoleRow(result.rows[0]));
  } catch (err) {
    console.error('Error fetching role access:', err);
    res.status(500).json({ error: 'Failed to fetch role access' });
  }
};

exports.updateRoleAccess = async (req, res) => {
  const { role } = req.params;
  let { mod_access, chap_access, story_access } = req.body;

  try {
    const { rows } = await db.query('SELECT * FROM roles_control WHERE role = $1', [role]);
    const current = rows[0] ? mapRoleRow(rows[0]) : null;

    if (!current) {
      const result = await db.query(
        `INSERT INTO roles_control (role, mod_access, chap_access, story_access)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          role,
          encodeAccessList(mod_access || []),
          encodeAccessList(chap_access || []),
          encodeAccessList(story_access || []),
        ]
      );
      return res.json({ message: 'Access control created', data: mapRoleRow(result.rows[0]) });
    }

    if (!mod_access) mod_access = current.mod_access || [];
    if (!chap_access) chap_access = current.chap_access || [];
    if (!story_access) story_access = current.story_access || [];

    const result = await db.query(
      `UPDATE roles_control
       SET mod_access = $1, chap_access = $2, story_access = $3
       WHERE role = $4
       RETURNING *`,
      [
        encodeAccessList(mod_access),
        encodeAccessList(chap_access),
        encodeAccessList(story_access),
        role,
      ]
    );

    res.json({
      message: 'Access control updated successfully',
      data: mapRoleRow(result.rows[0]),
    });
  } catch (err) {
    console.error('Error updating access control:', err);
    res.status(500).json({ error: 'Failed to update access control' });
  }
};

exports.createRoleAccess = async (req, res) => {
  const { role, mod_access, chap_access, story_access } = req.body;

  try {
    const result = await db.query(
      `INSERT INTO roles_control (role, mod_access, chap_access, story_access)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        role,
        encodeAccessList(mod_access || []),
        encodeAccessList(chap_access || []),
        encodeAccessList(story_access || []),
      ]
    );

    res.status(201).json({
      message: 'Role access control created successfully',
      data: mapRoleRow(result.rows[0]),
    });
  } catch (err) {
    console.error('Error creating access control:', err);
    res.status(500).json({ error: 'Failed to create access control' });
  }
};

exports.checkUserAccess = async (req, res) => {
  const { role, resourceType, resourceId } = req.params;

  try {
    const result = await db.query('SELECT * FROM roles_control WHERE role = $1', [role]);
    if (result.rows.length === 0) {
      return res.json({ hasAccess: false });
    }

    const accessControl = mapRoleRow(result.rows[0]);
    let hasAccess = false;

    switch (resourceType) {
      case 'module':
        hasAccess = accessControl.mod_access.includes(resourceId);
        break;
      case 'chapter':
        hasAccess = accessControl.chap_access.includes(resourceId);
        break;
      case 'story':
        hasAccess = accessControl.story_access.includes(resourceId);
        break;
      default:
        hasAccess = false;
    }

    res.json({ hasAccess });
  } catch (err) {
    console.error('Error checking user access:', err);
    res.status(500).json({ error: 'Failed to check access' });
  }
};
