#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const desktopDir = path.resolve(__dirname, '..');
const outputPath = path.join(desktopDir, 'config.json');

const wsUrlCandidates = [
  process.env.DESKTOP_WS_URL,
  process.env.VITE_WS_URL,
  process.env.WS_URL,
];

const candidate = wsUrlCandidates.find((value) => typeof value === 'string' && value.trim().length > 0);
const fallbackPort = process.env.WS_PORT || '8080';
const fallback = `ws://localhost:${fallbackPort}`;

const config = {
  wsUrl: (candidate || fallback).trim(),
};

fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
console.log(`Desktop config written to ${outputPath}`);
