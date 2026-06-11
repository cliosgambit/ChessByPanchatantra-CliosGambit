const db = require('../config/database');

// Get all access control settings
exports.getAccessControl = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM roles_control ORDER BY role');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching access control:', err);
        res.status(500).json({ error: 'Failed to fetch access control settings' });
    }
};

// Get access control for a specific role
exports.getRoleAccess = async (req, res) => {
    const { role } = req.params;
    try {
        const result = await db.query('SELECT * FROM roles_control WHERE role = $1', [role]);
        if (result.rows.length === 0) {
            // Return default structure if role doesn't exist
            console.log(`Role '${role}' not found, returning default structure`);
            return res.json({
                role: role,
                mod_access: [],
                chap_access: [],
                story_access: []
            });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching role access:', err);
        res.status(500).json({ error: 'Failed to fetch role access' });
    }
};

// Update access control for a role (create if doesn't exist)
exports.updateRoleAccess = async (req, res) => {
    const { role } = req.params;
    let { mod_access, chap_access, story_access } = req.body;

    try {
        // Fetch current access control for the role
        const { rows } = await db.query('SELECT * FROM roles_control WHERE role = $1', [role]);
        let current = rows[0];

        // If not found, create a new row with all fields
        if (!current) {
            const modAccessArray = mod_access ? `{${mod_access.join(',')}}` : null;
            const chapAccessArray = chap_access ? `{${chap_access.join(',')}}` : null;
            const storyAccessArray = story_access ? `{${story_access.join(',')}}` : null;
            const result = await db.query(
                `INSERT INTO roles_control (role, mod_access, chap_access, story_access)
                 VALUES ($1, $2, $3, $4)
                 RETURNING *`,
                [role, modAccessArray, chapAccessArray, storyAccessArray]
            );
            return res.json({ message: 'Access control created', data: result.rows[0] });
        }

        // Use current values if not provided in the request
        if (!mod_access) mod_access = current.mod_access || [];
        if (!chap_access) chap_access = current.chap_access || [];
        if (!story_access) story_access = current.story_access || [];

        const modAccessArray = mod_access ? `{${mod_access.join(',')}}` : null;
        const chapAccessArray = chap_access ? `{${chap_access.join(',')}}` : null;
        const storyAccessArray = story_access ? `{${story_access.join(',')}}` : null;

        const result = await db.query(
            `UPDATE roles_control
             SET mod_access = $1, chap_access = $2, story_access = $3
             WHERE role = $4
             RETURNING *`,
            [modAccessArray, chapAccessArray, storyAccessArray, role]
        );

        res.json({
            message: 'Access control updated successfully',
            data: result.rows[0]
        });
    } catch (err) {
        console.error('Error updating role access:', err);
        res.status(500).json({ error: 'Failed to update access control' });
    }
};

// Create new role access control
exports.createRoleAccess = async (req, res) => {
    const { role, mod_access, chap_access, story_access } = req.body;
    
    try {
        // Convert arrays to PostgreSQL array format
        const modAccessArray = mod_access ? `{${mod_access.join(',')}}` : null;
        const chapAccessArray = chap_access ? `{${chap_access.join(',')}}` : null;
        const storyAccessArray = story_access ? `{${story_access.join(',')}}` : null;

        const result = await db.query(
            `INSERT INTO roles_control (role, mod_access, chap_access, story_access) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [role, modAccessArray, chapAccessArray, storyAccessArray]
        );

        res.status(201).json({ 
            message: 'Role access control created successfully',
            data: result.rows[0]
        });
    } catch (err) {
        console.error('Error creating role access:', err);
        res.status(500).json({ error: 'Failed to create access control' });
    }
};

// Check if user has access to a specific resource
exports.checkUserAccess = async (req, res) => {
    const { role, resourceType, resourceId } = req.params;
    
    try {
        const result = await db.query('SELECT * FROM roles_control WHERE role = $1', [role]);
        if (result.rows.length === 0) {
            return res.json({ hasAccess: false });
        }

        const accessControl = result.rows[0];
        let hasAccess = false;

        switch (resourceType) {
            case 'module':
                hasAccess = accessControl.mod_access && accessControl.mod_access.includes(resourceId);
                break;
            case 'chapter':
                hasAccess = accessControl.chap_access && accessControl.chap_access.includes(resourceId);
                break;
            case 'story':
                hasAccess = accessControl.story_access && accessControl.story_access.includes(resourceId);
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