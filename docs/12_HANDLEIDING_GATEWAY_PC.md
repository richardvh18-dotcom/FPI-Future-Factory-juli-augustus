# 12. Handleiding: Gateway PC Installatie & Configuratie

De **Gateway PC** fungeert als de brug tussen de cloud-omgeving (Firebase/Firestore) en de afgeschermde fysieke apparatuur op de fabrieksvloer (robots, PLC's, netwerkprinters). Omdat fabrieksmachines uit veiligheidsoverwegingen vaak geen directe internetverbinding hebben, luistert de Gateway PC in de cloud naar opdrachten en stuurt deze lokaal via het interne netwerk door naar de machines.

In dit document staat van A tot Z beschreven hoe je een Windows PC inricht als Gateway PC.

---

## 1. Netwerkconfiguratie (Cruciaal)

Een Gateway PC moet met twee werelden kunnen praten:
1. **Het Internet** (om de Firebase opdrachten binnen te halen).
2. **Het Machinenetwerk** (om lokaal met de PLC, robot of printer te praten).

### Scenario A: Twee Netwerkadapters (Sterk Aanbevolen)
Dit is de meest veilige en stabiele optie. De PC fungeert letterlijk als brug.
* **Adapter 1 (Internet):** Bijvoorbeeld de ingebouwde Wi-Fi of Ethernet poort. Deze staat op **Automatisch IP verkrijgen (DHCP)** en zorgt voor de verbinding met het reguliere bedrijfsnetwerk/internet.
* **Adapter 2 (Machine):** Een tweede ethernetpoort (eventueel via een betrouwbare USB-naar-Ethernet dongle). Sluit deze met een netwerkkabel direct aan op de switch van de machine of robot. Geef deze in Windows Netwerkinstellingen een **Statisch IP adres** in dezelfde reeks als de machine. 
  * *Voorbeeld: Als de robot IP `192.168.10.5` heeft, geef Adapter 2 dan handmatig IP `192.168.10.10` met Subnetmasker `255.255.255.0`. Laat de Standaardgateway leeg (want internet gaat via Adapter 1).*

### Scenario B: Één Netwerkadapter
Als de PC maar één netwerkkaart heeft, moeten internet en het machinenetwerk over dezelfde kabel/switch lopen.
* Sluit de PC en de machine(s) aan op dezelfde router of switch.
* De netwerkkaart staat op DHCP (zodat hij internet krijgt).
* **Nadeel:** Je machines bevinden zich dan in het algemene bedrijfsnetwerk, of de router moet complexe VLAN-routing doen. In industriële omgevingen is Scenario A veel beter af te schermen.

---

## 2. Benodigdheden & Bestanden klaarzetten

1. **Node.js Installeren**
   * Download en installeer de laatste 'LTS' (Long Term Support) versie van Node.js via [nodejs.org](https://nodejs.org). Laat tijdens de installatie alles op de standaard instellingen staan.
2. **De Code**
   * Kopieer de volledige map `GatewayPC-main` naar een definitieve locatie op de PC, bijvoorbeeld `C:\GatewayPC`.
3. **Het Sleutelbestand (serviceAccountKey.json)**
   * Haal in Firebase de private key op (`Projectinstellingen > Serviceaccounts > Nieuwe privésleutel genereren`).
   * Noem dit bestand exact `serviceAccountKey.json` en plaats het in de hoofdmap `C:\GatewayPC\`. Dit bestand is het wachtwoord waarmee de PC namens de app de printopdrachten mag inzien!

---

## 3. Installatie van de Software

1. Klik linksonder op Start, typ **CMD**, klik met de rechtermuisknop op *Opdrachtprompt* en kies **Als administrator uitvoeren**.
2. Navigeer naar de map waar je de Gateway PC hebt neergezet:
   ```cmd
   cd C:\GatewayPC
   ```
3. Installeer alle benodigde achtergrondpakketten:
   ```cmd
   npm install
   ```
4. Bouw de software klaar voor productie:
   ```cmd
   npm run build
   ```

*(Optioneel Testen)*: Je kunt het programma nu tijdelijk testen door `npm start` in te typen. Ga op de PC naar `http://localhost:3030/dashboard`. Werkt dit? Druk dan in de CMD op `CTRL + C` om hem weer te stoppen en ga door naar stap 4 om hem definitief te maken.

---

## 4. Automatisch Opstarten met Windows (Als Service)

We willen niet dat iemand per ongeluk een zwart CMD-schermpje wegklikt en daardoor de hele communicatie met de robot of printers platlegt. Ook moet het programma direct opstarten als de PC (bijv. na een stroomstoring) opnieuw opstart.

Hiervoor gebruiken we een tooltje genaamd **NSSM** (Non-Sucking Service Manager).

1. Download NSSM via [nssm.cc/download](https://nssm.cc/download).
2. Haal de map `win64` (uit het ZIP-bestand) en zet het bestand `nssm.exe` bijvoorbeeld direct op je C-schijf (`C:\nssm.exe`).
3. Open CMD als Administrator.
4. Open de NSSM grafische interface met het volgende commando:
   ```cmd
   C:\nssm.exe install "GatewayPC"
   ```
5. Er opent een venster. Vul de volgende zaken in onder het tabblad **Application**:
   * **Path:** `C:\Program Files\nodejs\node.exe` *(óf klik op de ... knop en zoek node.exe op)*
   * **Arguments:** `C:\GatewayPC\dist\server.js`
   * **Details > Startup type:** Laat deze op `Automatic` staan.
   * **Log on:** Zorg dat `Local System account` is geselecteerd (dit is standaard).
6. Klik op **Install service**.

De Gateway PC is nu geïnstalleerd als een diepe Windows achtergrondservice. 

**De service starten:**
Je kunt hem handmatig starten via Windows Services (`services.msc`) of in je CMD intypen:
```cmd
C:\nssm.exe start "GatewayPC"
```

Vanaf nu start de brug tussen de app en de fabrieksmachines elke keer onzichtbaar op, de seconde dat Windows is ingeladen, zelfs als er nog niemand is ingelogd op de computer!
