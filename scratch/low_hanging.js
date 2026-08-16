const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('src');
let replacedCount = 0;
let anyCountReplaced = 0;

for (const f of files) {
    let content = fs.readFileSync(f, 'utf8');
    let original = content;
    
    // Low hanging fruit replacements
    const catchMatch = content.match(/catch \(([^:]+): any\)/g);
    if (catchMatch) anyCountReplaced += catchMatch.length;
    content = content.replace(/catch \(([^:]+): any\)/g, 'catch ($1: unknown)');
    
    const recordMatch = content.match(/Record<string, any>/g);
    if (recordMatch) anyCountReplaced += recordMatch.length;
    content = content.replace(/Record<string, any>/g, 'Record<string, unknown>');
    
    const indexMatch = content.match(/\[key: string\]: any/g);
    if (indexMatch) anyCountReplaced += indexMatch.length;
    content = content.replace(/\[key: string\]: any/g, '[key: string]: unknown');
    
    // Not replacing `(e: any)` because that broke strict typings in digitalplanning before!
    // But we'll do `any[]` -> `unknown[]` for simple things.
    const arrayMatch = content.match(/: any\[\]/g);
    if (arrayMatch) anyCountReplaced += arrayMatch.length;
    content = content.replace(/: any\[\]/g, ': unknown[]');
    
    if (content !== original) {
        fs.writeFileSync(f, content);
        replacedCount++;
    }
}
console.log('Global scan complete. Low hanging fruit replaced in ' + replacedCount + ' files.');
console.log('Total any occurrences removed in this step: ' + anyCountReplaced);
