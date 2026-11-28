const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'index.html');
const html = fs.readFileSync(source, 'utf8');
for (const marker of ['id="aiPrompt"','id="teamMode"','id="clearMemory"']) {
  if (!html.includes(marker)) throw new Error('Missing required AI control: '+marker);
}
const target = path.join(root, 'www');
fs.mkdirSync(target, {recursive:true});
fs.copyFileSync(source,path.join(target,'index.html'));
const assets = path.join(target, 'assets');
fs.mkdirSync(assets, {recursive:true});
fs.copyFileSync(path.join(root, 'assets', 'compass-emblem.webp'), path.join(assets, 'compass-emblem.webp'));
const modules = path.join(target, 'src');
fs.mkdirSync(modules, {recursive:true});
for (const file of ['commander-workflow.js', 'device-pairing.js', 'lesson-sharing.js']) {
  fs.copyFileSync(path.join(root, 'src', file), path.join(modules, file));
}
console.log('Prepared www/index.html for Android packaging');
