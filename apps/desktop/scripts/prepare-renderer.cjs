#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      ...options
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function prepareRenderer() {
  const desktopDir = path.resolve(__dirname, '..');
  const webDir = path.resolve(desktopDir, '../web');
  const rendererDir = path.join(desktopDir, 'renderer');
  const webDistDir = path.join(webDir, 'dist');

  console.log('> Building renderer assets (apps/web)');
  await run('pnpm', ['--dir', webDir, 'build'], {
    env: {
      ...process.env,
      VITE_DESKTOP_APP: '1',
    },
  });

  if (fs.existsSync(rendererDir)) {
    console.log('> Removing previous renderer build');
    fs.rmSync(rendererDir, { recursive: true, force: true });
  }

  if (!fs.existsSync(webDistDir)) {
    throw new Error('Renderer build output not found. Expected apps/web/dist to exist.');
  }

  console.log('> Copying renderer dist into apps/desktop/renderer');
  fs.cpSync(webDistDir, rendererDir, { recursive: true });
}

prepareRenderer().catch((error) => {
  console.error(error);
  process.exit(1);
});
