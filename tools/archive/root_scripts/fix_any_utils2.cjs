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

const replacements = [
  [/as any/g, 'as unknown'],
  [/: Record<string, any>/g, ': Record<string, unknown>'],
  [/Record<string, any>/g, 'Record<string, unknown>'],
  // Replace specific empty blocks that fail
  [/\} else \{\s*\}/g, '}'],
];

for (const file of filesToProcess) {
  replaceInFile(file, replacements);
}
