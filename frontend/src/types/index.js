/**
 * @typedef {'admin' | 'coach' | 'student' | 'paused'} UserRole
 */

/**
 * @typedef {Object} AppUser
 * @property {string} id - Chess_com_ID
 * @property {string} chessComId
 * @property {string} name - Player_Name
 * @property {string} email
 * @property {string} role
 * @property {string} status - ACTIVE | PAUSED
 */

/**
 * @typedef {Object} AppPlayer
 * @property {string} id
 * @property {string} chessId
 * @property {string} name
 * @property {{ rapid: number|null, blitz: number|null, bullet: number|null }} ratings
 * @property {{ rapid: number|null, blitz: number|null, bullet: number|null }} best
 * @property {number|string} maxElo
 * @property {string} joined
 * @property {{ change: string, timestamp: string }} sync
 */

/**
 * @typedef {Object} CurriculumModule
 * @property {string} module_id
 * @property {string} module_name
 * @property {string} [chapter_ids]
 * @property {number} [module_number]
 * @property {string} [themeKey]
 * @property {'draft' | 'active'} [status]
 */

/**
 * @typedef {Object} CurriculumChapter
 * @property {string} chapter_id
 * @property {string} chapter_name
 * @property {string} module_id
 * @property {number} [chapter_number]
 * @property {string} [themeKey]
 * @property {'draft' | 'active'} [status]
 */

/**
 * @typedef {Object} ChapterAssociationCheck
 * @property {boolean} hasContent
 * @property {number} storyCount
 * @property {number} storyIdsCount
 * @property {number} mappingCount
 * @property {number} puzzleCount
 */

/**
 * @typedef {Object} CurriculumStory
 * @property {string} story_id
 * @property {string} title
 * @property {string} [description]
 * @property {string} chapter_id
 * @property {string} module_id
 * @property {string} [status]
 */

/**
 * @typedef {Object} DashboardStats
 * @property {number} totalUsers
 * @property {number} activeStudents
 * @property {number} totalStories
 * @property {number} totalPuzzles
 * @property {number} brilliantMoves
 * @property {Array<{ name: string, value: number }>} roleDistribution
 * @property {Array<{ text: string, time: string, type: string }>} recentActivity
 */

export {};
