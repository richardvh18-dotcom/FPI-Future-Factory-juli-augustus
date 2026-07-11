import React from 'react';
import { 
  BookOpen, 
  Server, 
  Database, 
  Workflow, 
  Printer, 
  ShieldCheck,
  Cpu,
  MonitorSmartphone,
  Layers,
  Sparkles,
  Zap,
  HardDrive,
  Bot,
  Cloud,
  Rocket
} from "lucide-react";

export const SystemDocumentationView = ({ t }: { t: any }) => {
  return (
    <div className="p-8 lg:p-12 max-w-6xl mx-auto space-y-16 overflow-y-auto h-full scrollbar-thin scrollbar-thumb-gray-200 bg-white">
      
      {/* HEADER SECTION */}
      <div className="border-b border-gray-200 pb-8 relative">
        <div className="absolute top-0 right-0 opacity-10 pointer-events-none">
          <Server size={120} />
        </div>
        <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-4">
          <BookOpen size={14} /> Versie 5.1 (Master Release)
        </div>
        <h1 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">FUTURE-FACTORY</h1>
        <p className="text-xl text-blue-600 mt-2 font-black tracking-wide uppercase">Systeemdocumentatie & Architectuur</p>
        <div className="mt-4 flex gap-6 text-sm text-slate-500 font-medium">
          <p><strong>Auteur:</strong> Richard van Heerde</p>
          <p><strong>Domein:</strong> Manufacturing Execution System (MES) - FPi Fittings</p>
        </div>
      </div>

      {/* 1. SYSTEEMOVERZICHT & DOELSTELLING */}
      <section className="space-y-6">
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 border-b border-slate-100 pb-4">
          <Rocket className="text-blue-500" /> 1. Systeemoverzicht & Doelstelling
        </h2>
        <div className="bg-slate-50 p-6 rounded-2xl text-slate-700 leading-relaxed space-y-4">
          <p>
            De <b>Future-Factory</b> applicatie fungeert als een intelligent Manufacturing Execution System (MES). Het slaat een digitale brug tussen de kantoorlaag (Infor-LN ERP) en de fysieke werkvloer (mensen en machines).
          </p>
          <div>
            <strong className="block text-slate-900 mb-2">Kernfunctionaliteiten:</strong>
            <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
              <li>Real-time ordermanagement en planning op de werkvloer.</li>
              <li>Volledig papierloze kwaliteitsregistratie en traceerbaarheid (LOT-nummers).</li>
              <li>Hardware-aansturing: Direct printen (Zebra ZPL) en PLC-uitlezing (Beckhoff).</li>
              <li>AI-ondersteuning voor preventieve analyses en operator-support.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 2. SYSTEEMARCHITECTUUR */}
      <section className="space-y-6">
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 border-b border-slate-100 pb-4">
          <Server className="text-purple-500" /> 2. Systeemarchitectuur
        </h2>
        <div className="space-y-4 text-slate-700 leading-relaxed">
          <p>
            Het systeem maakt gebruik van een <strong>Hybrid Cloud Architectuur</strong>, waarbij de voordelen van Cloud-schaalbaarheid worden gecombineerd met lokale (Edge) hardware-integratie.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-xl p-5">
              <h4 className="font-bold text-slate-900 flex items-center gap-2 mb-2"><MonitorSmartphone className="w-4 h-4 text-blue-500"/> Frontend</h4>
              <p className="text-sm">React (Vite), Tailwind CSS, Lucide Icons. Gehost op Vercel / Firebase Hosting.</p>
            </div>
            <div className="border border-slate-200 rounded-xl p-5">
              <h4 className="font-bold text-slate-900 flex items-center gap-2 mb-2"><Cloud className="w-4 h-4 text-indigo-500"/> Backend</h4>
              <p className="text-sm">Firebase Cloud Functions (Node.js). Verwerkt alle schrijfacties (CQRS-patroon).</p>
            </div>
            <div className="border border-slate-200 rounded-xl p-5">
              <h4 className="font-bold text-slate-900 flex items-center gap-2 mb-2"><Database className="w-4 h-4 text-green-500"/> Database</h4>
              <p className="text-sm">Google Cloud Firestore (NoSQL, Real-time).</p>
            </div>
            <div className="border border-slate-200 rounded-xl p-5">
              <h4 className="font-bold text-slate-900 flex items-center gap-2 mb-2"><HardDrive className="w-4 h-4 text-red-500"/> Edge Gateway</h4>
              <p className="text-sm">Lokale Node.js server in de fabriek voor OT (Operational Technology) integratie (Printers, PLC's, ATPS).</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. DATAMODEL */}
      <section className="space-y-6">
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 border-b border-slate-100 pb-4">
          <Database className="text-green-500" /> 3. Datamodel (Firestore)
        </h2>
        <div className="space-y-4 text-slate-700 leading-relaxed">
          <p>
            De database hanteert een strikte scheiding tussen de test- en productieomgeving via een dynamische ROOT-variabele (beheerd in <code className="bg-slate-100 px-1 rounded">src/config/dbPaths.ts</code>).
          </p>
          <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
            <h4 className="font-bold text-slate-900 mb-3">Primaire Collecties (<code className="text-xs font-mono bg-white px-1">/future-factory/production/data/</code>)</h4>
            <ul className="space-y-2 text-sm">
              <li><strong className="text-slate-800">planning:</strong> Geconsolideerde orders uit Infor-LN.</li>
              <li><strong className="text-slate-800">tracked_products:</strong> De actuele status van producten in bewerking. Gekoppeld aan specifieke LOT-nummers en metingen.</li>
              <li><strong className="text-slate-800">system_logs / audit:</strong> Onweerlegbare logboeken van elke systeemwijziging (ISO 9001/27001 vereiste).</li>
              <li><strong className="text-slate-800">print_queue:</strong> Wachtrij voor documenten/labels die lokaal geprint moeten worden.</li>
              <li><strong className="text-slate-800">insights:</strong> Door AI gegenereerde waarschuwingen en analyses.</li>
              <li><strong className="text-slate-800">wik_documents:</strong> Digitale Werk Instructie Kaarten (JSON formaat).</li>
            </ul>
          </div>
          <div className="bg-slate-900 text-slate-300 p-5 rounded-xl font-mono text-xs overflow-x-auto shadow-inner">
            <div className="text-green-400 mb-2">// Schema (Document Voorbeeld planning)</div>
            <pre>
{`{
  "orderId": "N20025089",
  "itemCode": "EL9AESS08R...",
  "machine": "BH18",
  "status": "active",
  "quantity": 10,
  "toDoQty": 10,
  "totalPlannedHours": 0.95,
  "operations": {
    "1740": { "planned": 0.95, "actual": 0 }
  },
  "deliveryDate": "2026-06-12T00:00:00.000Z",
  "isRework": false
}`}
            </pre>
          </div>
        </div>
      </section>

      {/* 4. FRONTEND KERNMODULES */}
      <section className="space-y-6">
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 border-b border-slate-100 pb-4">
          <Layers className="text-orange-500" /> 4. Frontend Kernmodules (React)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border border-slate-200 rounded-xl p-5 shadow-sm">
            <h4 className="font-bold text-slate-900 mb-2">4.1 Order Consolidatie</h4>
            <p className="text-xs text-slate-500 font-mono mb-2">PlanningImportModal.tsx</p>
            <p className="text-sm text-slate-700">Zet de ruwe Infor-LN Excel-dump (tisfc140) om naar werkbare MES-orders.</p>
            <ul className="text-xs text-slate-600 mt-2 list-disc list-inside">
              <li><strong>Logica:</strong> Groepeert bewerkingsregels (1715, 1740, 1020) onder één uniek orderId.</li>
              <li><strong>Capaciteit:</strong> Telt Production Time op tot totalPlannedHours.</li>
              <li><strong>Extractie:</strong> Herkent &quot;Order Creation Date&quot;, &quot;Special Instructions&quot; en filtert afgesloten orders uit.</li>
            </ul>
          </div>
          <div className="border border-slate-200 rounded-xl p-5 shadow-sm">
            <h4 className="font-bold text-slate-900 mb-2">4.2 Operator Terminals</h4>
            <p className="text-xs text-slate-500 font-mono mb-2">TerminalProductionView.tsx</p>
            <p className="text-sm text-slate-700">De tablet-interface ontworpen volgens Fitts' Law (grote knoppen, hoog contrast).</p>
            <ul className="text-xs text-slate-600 mt-2 list-disc list-inside">
              <li><strong>Scanner Modus:</strong> Luistert continu naar toetsenbordaanslagen van Bluetooth-scanners.</li>
              <li><strong>Flow:</strong> Start &rarr; Print Label &rarr; Wikkelen &rarr; Lossen &amp; Meten.</li>
            </ul>
          </div>
          <div className="border border-slate-200 rounded-xl p-5 shadow-sm">
            <h4 className="font-bold text-slate-900 mb-2">4.3 ZPL Label Engine</h4>
            <p className="text-xs text-slate-500 font-mono mb-2">zplHelper.ts</p>
            <p className="text-sm text-slate-700">Vervangt de NiceLabel-afhankelijkheid. Genereert native Zebra Programming Language (ZPL).</p>
            <ul className="text-xs text-slate-600 mt-2 list-disc list-inside">
              <li><strong>Zero-Waste:</strong> Berekent dynamisch de labellengte (<code className="bg-slate-100 px-1">^LL</code>) op basis van de batchgrootte.</li>
              <li><strong>Smart Cutting:</strong> Activeert de snij-functie (<code className="bg-slate-100 px-1">^GS</code>) pas na het laatste label in een lus.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 5. BACKEND & CLOUD FUNCTIONS */}
      <section className="space-y-6">
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 border-b border-slate-100 pb-4">
          <Cloud className="text-indigo-500" /> 5. Backend & Cloud Functions
        </h2>
        <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded-r-xl mb-4 text-sm text-indigo-900">
          Om ISO-compliance te garanderen, mag de frontend alleen lezen. Schrijven gebeurt via Cloud Functions (<code className="bg-indigo-100 px-1 rounded">functions/src/callables/</code>).
        </div>
        <div className="space-y-4">
          <div className="border border-slate-200 rounded-xl p-5 shadow-sm bg-white">
            <h4 className="font-bold text-slate-900 mb-2">5.1. Audit Wrapper (auditWrapper.js)</h4>
            <p className="text-sm text-slate-700 mb-2">Elke actie (bijv. order starten, NCR melden) wordt door deze wrapper gehaald:</p>
            <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1 ml-2">
              <li>Controleert het Firebase Auth token (Rechten check).</li>
              <li>Haalt de <strong>Before</strong> staat van het document op.</li>
              <li>Voert de actie uit.</li>
              <li>Schrijft een <strong>Before</strong> en <strong>After</strong> snapshot naar de audit/logs collectie.</li>
            </ol>
          </div>
          <div className="border border-slate-200 rounded-xl p-5 shadow-sm bg-white">
            <h4 className="font-bold text-slate-900 mb-2">5.2. Custom Claims (resolveUserRole.js & setRole.js)</h4>
            <p className="text-sm text-slate-700">Maakt gebruik van Firebase Custom Claims voor Role-Based Access Control (RBAC). Rollen (admin, operator, teamleader) zitten ingebakken in het inlogtoken, wat database-queries bespaart.</p>
          </div>
        </div>
      </section>

      {/* 6. HARDWARE & EDGE INTEGRATIES */}
      <section className="space-y-6">
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 border-b border-slate-100 pb-4">
          <Cpu className="text-red-500" /> 6. Hardware & Edge Integraties
        </h2>
        <div className="space-y-4 text-slate-700 leading-relaxed">
          <p>
            De Cloud-omgeving wordt verbonden met de lokale fabrieksmachines via een Edge Gateway (een lokale Dual-Homed PC).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-slate-200 rounded-xl p-5 shadow-sm">
              <h4 className="font-bold text-slate-900 mb-2 text-sm">6.1. Beckhoff PLC Integratie</h4>
              <p className="text-xs text-slate-500 font-mono mb-2">machine_bridge_with_ui.js</p>
              <ul className="text-xs text-slate-600 list-disc list-inside space-y-1">
                <li>Gebruikt de <code className="bg-slate-100 px-1">ads-client</code> module.</li>
                <li>Leest via poort 851 (ADS) variabelen uit de PLC (bijv. <code>GVL.bOvenCycleFinished</code>).</li>
                <li>Zodra de oven klaar is, schrijft dit lokale script een signaal naar Firestore, waarna de Cloud Function alle orders in die oven op 'GEREED' zet.</li>
              </ul>
            </div>
            <div className="border border-slate-200 rounded-xl p-5 shadow-sm">
              <h4 className="font-bold text-slate-900 mb-2 text-sm">6.2. Direct Printing</h4>
              <p className="text-xs text-slate-500 font-mono mb-2">WebUSB / Zadig</p>
              <ul className="text-xs text-slate-600 list-disc list-inside space-y-1">
                <li>Voor werkstations met een direct aangesloten Zebra-printer.</li>
                <li>Maakt gebruik van de <code className="bg-slate-100 px-1">navigator.usb</code> API in de browser.</li>
                <li>Overschrijft de Windows Print Spooler via Zadig (WinUSB driver) voor 0 ms latency en RAW-data transfer.</li>
              </ul>
            </div>
            <div className="border border-slate-200 rounded-xl p-5 shadow-sm">
              <h4 className="font-bold text-slate-900 mb-2 text-sm">6.3. ATPS / NFC Integratie</h4>
              <p className="text-xs text-slate-500 font-mono mb-2">atps_sync_gateway.js</p>
              <ul className="text-xs text-slate-600 list-disc list-inside space-y-1">
                <li>Leest de OData-feed ("Gegevensverzameling Medewerkers") van de lokale ATPS-server.</li>
                <li>Synchroniseert Personeelsnummers met Firestore.</li>
                <li>Stelt operators in staat in te loggen op de tablets door hun NFC-badge (ATPS-druppel) te scannen.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 7. AI & AUTOMATISERING */}
      <section className="space-y-6">
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 border-b border-slate-100 pb-4">
          <Bot className="text-amber-500" /> 7. AI & Automatisering (Gemini)
        </h2>
        <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl">
          <p className="text-sm text-amber-900 mb-4">
            Geïntegreerd via Vertex AI (<code className="bg-amber-100 px-1">@google-cloud/vertexai</code>) op het <strong>gemini-1.5-flash</strong> model.
          </p>
          <div className="space-y-4">
            <div>
              <strong className="block text-slate-900 text-sm">Reactive Watchdog:</strong>
              <p className="text-sm text-slate-700">Triggert op <code className="bg-white px-1 border border-slate-200">onUpdate</code> in Firestore. Als een operator meetgegevens invoert, toetst de AI deze direct aan de product-specificaties. Bij fouten krijgt de order een <code className="text-red-500">ai_flag</code>.</p>
            </div>
            <div>
              <strong className="block text-slate-900 text-sm">Proactive Planner:</strong>
              <p className="text-sm text-slate-700">Een Scheduled Cloud Function (Cronjob) die 's nachts de bezetting (Capacity Matrix) en de openstaande orders vergelijkt om bottlenecks en achterstanden te voorspellen.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 8. BEVEILIGING & AUTORISATIE */}
      <section className="space-y-6">
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 border-b border-slate-100 pb-4">
          <ShieldCheck className="text-slate-700" /> 8. Beveiliging & Autorisatie
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-slate-200 rounded-xl p-5 shadow-sm">
            <h4 className="font-bold text-slate-900 mb-2">8.1. Wachtwoordbeheer Operators</h4>
            <p className="text-sm text-slate-700 leading-relaxed">
              Operators gebruiken virtuele e-mailadressen (personeelsnummer@fpi.nl). Omdat er geen mailbox is, beschikt de beheerder (Admin) over een Admin Reset Tool om wachtwoorden via de Admin SDK te overschrijven zonder reset-mail te sturen.
            </p>
          </div>
          <div className="border border-slate-200 rounded-xl p-5 shadow-sm">
            <h4 className="font-bold text-slate-900 mb-2">8.2. Firestore Rules</h4>
            <p className="text-sm text-slate-700 mb-2">Volgt het Deny-By-Default principe:</p>
            <div className="bg-slate-900 text-slate-300 p-3 rounded-lg font-mono text-xs overflow-x-auto">
<pre>{`// Voorbeeld:
match /future-factory/production/digital_planning/{document=**} {
  allow read: if isSignedIn();
  allow write: if false; // Alleen de backend mag schrijven
}`}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* 9. DEPLOYMENT & OMGEVINGSBEHEER */}
      <section className="space-y-6">
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 border-b border-slate-100 pb-4">
          <Zap className="text-yellow-500" /> 9. Deployment & Omgevingsbeheer
        </h2>
        <div className="space-y-4">
          <div className="border border-slate-200 p-5 rounded-xl bg-white shadow-sm">
            <h4 className="font-bold text-slate-900 mb-3 text-sm">9.1. CI/CD (GitHub Actions / Vercel)</h4>
            <ul className="space-y-2 text-sm text-slate-700">
              <li><span className="w-3 h-3 inline-block bg-blue-500 rounded-full mr-2"></span><strong>Production</strong> (future-factory.com): Blauw thema. Strikte productie-data (<code className="bg-slate-100 px-1">/future-factory/production/</code>).</li>
              <li><span className="w-3 h-3 inline-block bg-amber-500 rounded-full mr-2"></span><strong>Preview</strong> (test.future-factory.com): Amber/Oranje thema. Gelinkt aan pull-requests in GitHub. Gebruikt test-paden (<code className="bg-slate-100 px-1">/artifacts/</code>).</li>
            </ul>
          </div>
          <div className="border border-slate-200 p-5 rounded-xl bg-white shadow-sm">
            <h4 className="font-bold text-slate-900 mb-3 text-sm">9.2. Lokaal Testen</h4>
            <div className="bg-slate-900 text-slate-300 p-4 rounded-lg font-mono text-xs overflow-x-auto">
<pre>{`npm run dev           # Start de React frontend lokaal
npm run type-check    # Controleert TypeScript types
npm run validate      # Verwijdert dubbele bestanden, checkt ESLint en test de build`}</pre>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
};
