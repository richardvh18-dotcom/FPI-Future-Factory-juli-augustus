const { Project, SyntaxKind } = require('ts-morph');
const path = require('path');

const project = new Project();
const sourceFile = project.addSourceFileAtPath(path.join(__dirname, 'src/components/digitalplanning/BM01Hub.tsx'));

const hookCall = `
    const {
        planningOrders,
        deliveryInspectionMismatches,
        deliveryInspectionOverMismatches,
        deliveryInspectionUnderMismatches,
        visibleDeliveryInspectionMismatches,
        selectedOrder,
        selectedDetailEntry,
        selectedSidebarEntryId,
        bm01Products,
        nahardingProducts,
        latestNahardingBatchDateKey,
        nahardingBatchProducts,
        latestNahardingBatchLabel,
        archivedProducts,
        nahardingPrintList,
        completedProducts,
        getNahardingOfferedMillis
    } = useBM01Data({
        orders, products, selectedOrderId, selectedSidebarEntry, activeTab, selectedDate, viewMode, lastNahardingResetAt, deliveryMismatchFilter
    });
`;

// Remove specific types
const typeAliases = sourceFile.getTypeAliases();
const typesToRemove = ["OrderRecord", "ProductRecord", "SidebarEntry", "FinishPayload", "DeliveryMismatch", "TimestampLike", "HistoryEntry"];
typeAliases.forEach(t => {
    if (typesToRemove.includes(t.getName())) {
        t.remove();
    }
});

// Add imports
sourceFile.addImportDeclarations([
    {
        namedImports: ["OrderRecord", "ProductRecord", "SidebarEntry", "FinishPayload", "DeliveryMismatch"],
        moduleSpecifier: "./bm01/bm01Types"
    },
    {
        namedImports: ["useBM01Data"],
        moduleSpecifier: "./bm01/useBM01Data"
    }
]);

// Find the component body
const component = sourceFile.getVariableDeclaration('BM01Hub');
if (!component) throw new Error("Component not found");
const initCall = component.getInitializerIfKind(SyntaxKind.CallExpression);
let body;
if (initCall) {
    const args = initCall.getArguments();
    const arrow = args.find(a => a.getKind() === SyntaxKind.ArrowFunction);
    if (arrow) body = arrow.getBody();
} else {
    const init = component.getInitializerIfKind(SyntaxKind.ArrowFunction);
    if (init) body = init.getBody();
}
if (!body) throw new Error("Component body not found");

if (body.getKind() === SyntaxKind.Block) {
    const stmts = body.getStatements();
    
    // Remove state 'archivedProducts'
    const archivedState = stmts.find(s => s.getText().includes('setArchivedProducts'));
    if (archivedState) archivedState.remove();

    // Remove useMemos and useEffects we moved
    const movedMemos = [
        "planningOrders", "deliveryInspectionMismatches", "deliveryInspectionOverMismatches", 
        "deliveryInspectionUnderMismatches", "visibleDeliveryInspectionMismatches", "selectedOrder",
        "selectedDetailEntry", "selectedSidebarEntryId", "bm01Products", "nahardingProducts",
        "latestNahardingBatchDateKey", "nahardingBatchProducts", "latestNahardingBatchLabel",
        "nahardingPrintList", "completedProducts"
    ];

    const currentStmts = body.getStatements(); // refresh

    currentStmts.forEach(stmt => {
        if (stmt.getKind() === SyntaxKind.VariableStatement) {
            const dec = stmt.getDeclarations()[0];
            if (dec && movedMemos.includes(dec.getName())) {
                stmt.remove();
            }
        }
    });

    // Remove useEffect for archive (activeTab === "completed")
    const effectStmts = body.getStatements().filter(s => s.getKind() === SyntaxKind.ExpressionStatement && s.getText().startsWith("useEffect"));
    effectStmts.forEach(stmt => {
        if (stmt.getText().includes('activeTab !== "completed" && activeTab !== "naharding_batch"')) {
            stmt.remove();
        }
    });

    // Remove getNahardingOfferedMillis
    const getNahardingStmts = body.getStatements().filter(s => s.getKind() === SyntaxKind.VariableStatement && s.getDeclarations()[0].getName() === "getNahardingOfferedMillis");
    getNahardingStmts.forEach(s => s.remove());

    // Insert the hook call right before handleItemClick
    let insertIdx = -1;
    const bodyStmts = body.getStatements();
    for (let i = 0; i < bodyStmts.length; i++) {
        if (bodyStmts[i].getText().includes('const handleItemClick')) {
            insertIdx = i;
            break;
        }
    }
    
    if (insertIdx !== -1) {
        body.insertStatements(insertIdx, hookCall);
    } else {
        body.insertStatements(0, hookCall);
    }
}

// Remove helpers from root
const rootStmts = sourceFile.getStatements();
rootStmts.forEach(stmt => {
    if (stmt.getKind() === SyntaxKind.VariableStatement) {
        const dec = stmt.getDeclarations()[0];
        const name = dec.getName();
        if (["archiveColPath", "toMillisFromMixed", "toDateFromMixed"].includes(name)) {
            stmt.remove();
        }
    }
});

sourceFile.saveSync();
console.log("Refactored BM01Hub.tsx via ts-morph");
