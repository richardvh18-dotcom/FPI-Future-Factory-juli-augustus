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

const servicePath = path.join(__dirname, 'src', 'services');
const filesToProcess = [
  path.join(servicePath, 'aiService.ts'),
  path.join(servicePath, 'planningContext.ts'),
];

const replacements = [
  [/specifications\?: any;/g, 'specifications?: unknown;'],
  [/tolerance\?: any;/g, 'tolerance?: unknown;'],
  [/public functions: any;/g, 'public functions: unknown;'],
  [/public aiProxyGenerate: any;/g, 'public aiProxyGenerate: unknown;'],
  [/\(order: any\)/g, '(order: Record<string, unknown>)'],
  [/scenario: any = null/g, 'scenario: unknown = null'],
  [/\(row: any\)/g, '(row: Record<string, unknown>)'],
  [/catch \(error: any\)/g, 'catch (error: unknown)'],
  [/\(m: any\)/g, '(m: Record<string, unknown>)'],
  [/\{\s*\}/g, '{ /* empty */ }'],
];

for (const file of filesToProcess) {
  replaceInFile(file, replacements);
}
