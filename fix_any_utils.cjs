const fs = require('fs');
const path = require('path');

const replaceInFile = (filePath, replacements) => {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  for (const [regex, replacer] of replacements) {
    content = content.replace(regex, replacer);
  }
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
};

const utilsPath = path.join(__dirname, 'src', 'utils');
const repoPath = path.join(__dirname, 'src', 'repositories');

const filesToProcess = [];

const walk = (dir) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      filesToProcess.push(fullPath);
    }
  }
};

walk(utilsPath);
walk(repoPath);

const snapType = `{ id: string; data: () => Record<string, unknown>; ref?: { path: string } }`;

const replacements = [
  // JSDoc any
  [/\[key: string\]: any/g, 'Record<string, unknown>'],
  // Firebase snap
  [/\(d: any\)/g, `(d: ${snapType})`],
  [/\(snap: any\)/g, `(snap: { docs: ${snapType}[]; exists?: () => boolean; id?: string; data?: () => Record<string, unknown> })`],
  // Generic any
  [/db: any/g, 'db: unknown'],
  [/lastDoc: any = null/g, 'lastDoc: unknown = null'],
  [/value: any/g, 'value: unknown'],
  [/: any\[\]/g, ': unknown[]'],
  [/: any\)/g, ': unknown)'],
  [/: any,/g, ': unknown,'],
  [/<any>/g, '<unknown>'],
];

for (const file of filesToProcess) {
  replaceInFile(file, replacements);
}
