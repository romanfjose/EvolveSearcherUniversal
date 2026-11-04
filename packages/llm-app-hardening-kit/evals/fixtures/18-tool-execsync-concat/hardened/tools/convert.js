const { execFileSync } = require('child_process');
const path = require('path');

const UPLOADS = '/srv/uploads';

module.exports.convertAudio = function convertAudio(input) {
  const file = path.resolve(UPLOADS, path.basename(String(input.file)));
  execFileSync('ffmpeg', ['-y', '-i', file, '/tmp/out.mp3'], { timeout: 60_000 });
  return { path: '/tmp/out.mp3' };
};
