const fs = require('fs');
const path = 'src/components/admin/ProjectStructureExpertView.tsx';
let content = fs.readFileSync(path, 'utf8');

const missingDetails = `
  "src/main.tsx": {
    title: "Applicatie Entry Point",
    desc: "Het absolute startpunt van de React applicatie. Hier wordt de root gerenderd en worden globale providers (zoals i18n, Router en NotificationContext) geïnjecteerd.",
    tags: ["Core", "Setup", "React"]
  },
  "src/App.tsx": {
    title: "Hoofd Application Component",
    desc: "Beheert de globale routing-structuur, authenticatie-state en thema's. Schakelt tussen de publieke login-pagina en de beveiligde interne hub-routes.",
    tags: ["Core", "Routing", "Auth"]
  },
  "src/components/digitalplanning/WorkstationHub.tsx": {
    title: "Werkstation Hub",
    desc: "De kerncomponent voor werkstations (bijv. Wikkelbanken). Haalt de orders op die specifiek aan dit station zijn toegewezen via geoptimaliseerde Firestore-queries en delegatiet naar Terminal views.",
    tags: ["Planning", "Hub", "Data"]
  },
  "src/components/digitalplanning/Terminal.tsx": {
    title: "Terminal UI Orkestrator",
    desc: "De hoofd-UI voor de productieterminals (zoals BH18). De actielogica en datastromen zijn recent geëxtraheerd naar custom hooks, waardoor deze component nu dient als een pure en overzichtelijke UI-wrapper.",
    tags: ["Terminal", "UI", "Orkestrator"]
  },
  "src/components/digitalplanning/modals/ProductDossierModal.tsx": {
    title: "Product Dossier Viewer",
    desc: "Een modal die het volledige technische dossier van een product weergeeft (specificaties, revisies, en gekoppelde matrijs-tekeningen) voor referentie tijdens de productie.",
    tags: ["Producten", "Documentatie", "Modal"]
  },
  "src/components/digitalplanning/modals/OrderEditModal.tsx": {
    title: "Order Editor",
    desc: "Hiermee kunnen planners de parameters van een specifieke productie-order wijzigen, zoals aantallen, prioriteit of de gekoppelde machine, zonder de Infor LN sync te breken.",
    tags: ["Planning", "Beheer", "Modal"]
  },
  "src/components/digitalplanning/modals/LotOverrideModal.tsx": {
    title: "Lotnummer Overschrijving",
    desc: "Een supervisor-modal waarmee handmatig afgeweken kan worden van het automatisch berekende lotnummer of weeknummer, bijvoorbeeld bij een storing of historische correctie.",
    tags: ["Productie", "Beheer", "Modal"]
  },
  "src/components/digitalplanning/terminal/TerminalPlanningView.tsx": {
    title: "Terminal Planning Overzicht",
    desc: "Toont de komende wachtrij van orders op een terminal. Operators kunnen hiermee vooruit kijken en anticiperen op toekomstige productieruns en materiaalbehoeften.",
    tags: ["Terminal", "Planning", "UI"]
  },
  "src/components/digitalplanning/terminal/TerminalManualInput.tsx": {
    title: "Handmatige Terminal Invoer",
    desc: "Laat operators handmatig gegevens invoeren of correcties doorvoeren op productieparameters wanneer barcode-scanners falen of orders ontbreken in de digitale wachtrij.",
    tags: ["Terminal", "Fallback", "UI"]
  },
  "src/components/admin/AdminDatabaseView.tsx": {
    title: "Database Configuratie View",
    desc: "Een beheerderspaneel om directe parameters en systeem-brede database-instellingen (zoals sync-intervallen en retentie) te bekijken en tweaken.",
    tags: ["Admin", "Database", "Instellingen"]
  },
  "src/components/admin/FactoryStructureManager.tsx": {
    title: "Factory Layout Manager",
    desc: "Beheert de virtuele weergave van de fabriek: afdelingen, werkstations, en hun onderlinge hiërarchie. Wordt gebruikt voor capaciteitsplanning en routing.",
    tags: ["Admin", "Configuratie", "Layout"]
  },
  "src/components/admin/matrixmanager/AdminMatrixManager.tsx": {
    title: "Matrix Manager Hub",
    desc: "Het zenuwcentrum voor het instellen van de productie-matrices, waarbij productafmetingen gekoppeld worden aan specifieke normtijden en machinemogelijkheden.",
    tags: ["Admin", "Matrix", "Configuratie"]
  },
  "src/components/admin/matrixmanager/DimensionsView.tsx": {
    title: "Dimensie Configuratie",
    desc: "Een sub-view van de Matrix Manager voor het fijnmazig instellen van de toegestane diameters, lengtes, en productklassen die de fabriek aankan.",
    tags: ["Admin", "Specificaties", "Matrix"]
  },
  "src/components/admin/matrixmanager/MatrixGrid.tsx": {
    title: "Productie Matrix Grid",
    desc: "Een interactieve spreadsheet-achtige UI waar engineers complexe correlaties (bijv. diameter X vs lengte Y) kunnen invullen of kalibreren voor de automatische calculator.",
    tags: ["Admin", "UI", "Matrix"]
  },
  "src/utils/pdfGenerator.js": {
    title: "PDF Generator Engine",
    desc: "Genereert dynamisch PDF-rapporten of etiketten vanuit de frontend met behulp van templates. Ideaal voor rapportages en audits waarbij een hard-copy verplicht is.",
    tags: ["Export", "PDF", "Rapportage"]
  },
  "firebase.json": {
    title: "Firebase Configuratiebestand",
    desc: "Het root-configuratiebestand voor de Firebase CLI. Bepaalt welke directories gedeployd worden naar Hosting, regels voor Storage, en configuratie voor Cloud Functions.",
    tags: ["Config", "Infrastructuur", "Deploy"]
  },
  "package.json": {
    title: "NPM Package Manifest",
    desc: "Definieert alle project-dependencies, versie-nummers, en bevat de scripts voor development, bouwen, linten, en deployen (zoals 'verify:build-output').",
    tags: ["Config", "Dependencies", "Scripts"]
  },
  "vite.config.ts": {
    title: "Vite Bundler Configuratie",
    desc: "Configureren van de Vite bundler: alias-resolutie, proxy-instellingen voor de dev-server, HMR, en build-optimalisaties voor de uiteindelijke SPA.",
    tags: ["Config", "Build", "Optimalisatie"]
  },
`;

// Insert the missing details just before the closing brace of fileDetails
content = content.replace(
  '  "src/data/constants.js": {\n    title: "Applicatie Constanten",',
  missingDetails + '\n  "src/data/constants.js": {\n    title: "Applicatie Constanten",'
);

fs.writeFileSync(path, content, 'utf8');
console.log("Missing files injected");
