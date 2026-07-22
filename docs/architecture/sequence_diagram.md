# Workflow: Order Starten (Operator)

Dit sequence diagram toont de stroom van operaties wanneer een operator een productie-order start in het systeem. Dit illustreert hoe de UI, Firebase Firestore en de Audit Trail samenwerken.

```mermaid
sequenceDiagram
    actor Operator
    participant UI as WorkstationHub (React)
    participant Hook as useDigitalPlanning
    participant Repo as DigitalPlanningRepository
    participant DB as Cloud Firestore
    participant Functions as Cloud Functions
    participant Audit as LogService

    Operator->>UI: Klikt "Start Productie"
    UI->>Hook: startOrder(orderId, machineId)
    Hook->>Repo: updateOrderStatus("in_production")
    
    Repo->>DB: setDoc() / updateDoc()
    DB-->>Repo: Acknowledge (WORM Rules applied)
    
    Hook->>Functions: executeAutomationRule("order_status_change")
    Functions-->>Hook: Result (Automation Checks)
    
    Hook->>Audit: createAuditLog("PRODUCTION_STARTED", metadata)
    Audit->>DB: addDoc(future-factory/audit)
    DB-->>Audit: Acknowledge
    
    Hook-->>UI: Succes!
    UI-->>Operator: Toont actieve productie-scherm
```

## Key Concepten
- **WORM Rules**: Firestore regels staan inserts toe op de audit trail, maar verbieden updates en deletes (Write-Once, Read-Many).
- **Cloud Functions**: Zware automatiseringen of het forceren van permissies buiten de Operator rol gebeuren in backend callables (beveiligd met check of de gebruiker geauthenticeerd is).
- **Audit**: Alle kritieke handelingen schrijven een log weg naar de audit collectie via de `logService`.
