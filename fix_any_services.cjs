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

const snapType = `{ id: string; data: () => Record<string, unknown>; ref?: { path: string } }`;

const replacements = [
  // JSDoc any
  [/\[key: string\]: any/g, '[key: string]: unknown'],
  // Firebase snap
  [/\(d: any\)/g, `(d: ${snapType})`],
  [/\(snap: any\)/g, `(snap: { docs: ${snapType}[]; exists?: () => boolean; id?: string; data?: () => Record<string, unknown> })`],
  // Generic any
  [/db: any/g, 'db: unknown'],
  [/lastDoc: any = null/g, 'lastDoc: unknown = null'],
  [/value: any\)/g, 'value: unknown)'],
  [/value: any\]/g, 'value: unknown]'],
  [/: any\[\]/g, ': unknown[]'],
  [/: any,/g, ': unknown,'],
  [/<any>/g, '<unknown>'],
  [/as any/g, 'as unknown'],
  [/: Record<string, any>/g, ': Record<string, unknown>'],
  [/Record<string, any>/g, 'Record<string, unknown>'],
  // Empty blocks
  [/\} catch \{\s*\}/g, '} catch { /* ignore */ }'],
  [/\} catch \(err\) \{\s*\}/g, '} catch (err) { /* ignore */ }'],
  [/\} catch \(e\) \{\s*\}/g, '} catch (e) { /* ignore */ }'],
  [/\} catch \(e: unknown\) \{\s*\}/g, '} catch (e: unknown) { /* ignore */ }'],
];

for (const file of filesToProcess) {
  replaceInFile(file, replacements);
}
