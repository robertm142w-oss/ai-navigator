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
console.log('Prepared www/index.html for Android packaging');
