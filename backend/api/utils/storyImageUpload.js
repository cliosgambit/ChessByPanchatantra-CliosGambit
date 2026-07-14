const fs = require('fs');
const path = require('path');
const multer = require('multer');

// backend/api/utils → repo root → frontend/public/story_images
const STORY_IMAGES_DIR = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'frontend',
  'public',
  'story_images'
);

function ensureStoryImagesDir() {
  if (!fs.existsSync(STORY_IMAGES_DIR)) {
    fs.mkdirSync(STORY_IMAGES_DIR, { recursive: true });
  }
}

ensureStoryImagesDir();

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    ensureStoryImagesDir();
    cb(null, STORY_IMAGES_DIR);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)
      ? ext
      : '.jpg';
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `story-${stamp}${safeExt}`);
  },
});

function fileFilter(_req, file, cb) {
  if (!file.mimetype || !file.mimetype.startsWith('image/')) {
    cb(new Error('Only image files are allowed.'));
    return;
  }
  cb(null, true);
}

const uploadStoryImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
});

function publicUrlForFilename(filename) {
  return `/story_images/${filename}`;
}

module.exports = {
  STORY_IMAGES_DIR,
  ensureStoryImagesDir,
  uploadStoryImage,
  publicUrlForFilename,
};
