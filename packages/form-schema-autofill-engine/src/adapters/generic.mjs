// Fallback adapter: no platform knowledge; the classifier's generic signals do all the work.
export default {
  id: 'generic',
  label: 'Generic form',
  detect: () => 0.01,
};
