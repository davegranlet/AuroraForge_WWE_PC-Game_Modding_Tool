const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
['dist', 'portable-release', 'build'].forEach((name) => {
  const target = path.join(root, name);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log('Removed ' + name);
  } else {
    console.log('Already clean: ' + name);
  }
});
