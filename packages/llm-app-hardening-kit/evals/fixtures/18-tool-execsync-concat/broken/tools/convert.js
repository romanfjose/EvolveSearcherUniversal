const { execSync } = require('child_process');

module.exports.convertAudio = function convertAudio(input) {
  // input comes straight from the model's tool call arguments
  execSync('ffmpeg -y -i ' + input.file + ' /tmp/out.mp3');
  return { path: '/tmp/out.mp3' };
};
