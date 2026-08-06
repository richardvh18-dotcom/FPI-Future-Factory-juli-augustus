const fs = require('fs');

try {
  let data = fs.readFileSync('firestore_audit_logs.json', 'utf16le');
  if (data.charCodeAt(0) === 0xFEFF || data.charCodeAt(0) === 0xFFFE) {
    data = data.slice(1);
  }
  const logs = JSON.parse(data);
  
  if (logs.length === 0) {
    console.log("No logs found in the file.");
    process.exit(0);
  }

  const methodCounts = {};
  const targetCounts = {};
  const queryCounts = {};

  logs.forEach(log => {
    const payload = log.protoPayload;
    if (!payload) return;

    const method = payload.methodName;
    methodCounts[method] = (methodCounts[method] || 0) + 1;

    // Try to extract the resource or target
    const resource = payload.resourceName || 'Unknown Resource';
    targetCounts[resource] = (targetCounts[resource] || 0) + 1;
    
    // Try to find query details if available
    if (payload.request) {
      const reqStr = JSON.stringify(payload.request);
      // Rough extraction of collection names or query targets
      const match = reqStr.match(/"collectionId":"([^"]+)"/);
      if (match) {
        const col = match[1];
        queryCounts[col] = (queryCounts[col] || 0) + 1;
      }
    }
  });

  console.log("=== Top Methods ===");
  Object.entries(methodCounts).sort((a,b) => b[1]-a[1]).slice(0, 5).forEach(([k,v]) => console.log(`${v}x ${k}`));

  console.log("\n=== Top Resources ===");
  Object.entries(targetCounts).sort((a,b) => b[1]-a[1]).slice(0, 10).forEach(([k,v]) => console.log(`${v}x ${k}`));
  
  console.log("\n=== Top Collections in Requests ===");
  Object.entries(queryCounts).sort((a,b) => b[1]-a[1]).slice(0, 10).forEach(([k,v]) => console.log(`${v}x ${k}`));

} catch (e) {
  console.error("Error analyzing logs:", e.message);
}
