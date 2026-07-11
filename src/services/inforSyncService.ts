/**
 * Infor LN Sync Service (Stub)
 * 
 * Dit is een voorbereiding voor de API koppeling met Infor LN Enterprise Planning (CP).
 * Hier vertalen we de "Vrachtwagen-Horizon" en "Spoolbouw-Pull" naar de Future-Factory app.
 */

export interface InforOrderMeta {
  orderId: string;
  deliveryDate?: Date; // Vrachtwagen-horizon
  isSpoolbouwWaiting?: boolean; // Pull: uitzonderingsboodschap vanuit LN
  isUrgent?: boolean;
}

class InforSyncService {
  /**
   * Mock functie om Infor LN order metadata op te halen.
   * In de toekomst: fetch() naar een middleware of direct naar LN API.
   */
  async fetchOrderMetadata(orderIds: string[]): Promise<Map<string, InforOrderMeta>> {
    const metaMap = new Map<string, InforOrderMeta>();
    
    // MOCK DATA voor testdoeleinden:
    // We doen alsof sommige orders dringend zijn (Vrachtwagen deze week) 
    // en sommigen wachten op Spoolbouw.
    orderIds.forEach((id, index) => {
      const today = new Date();
      // Om de paar orders een mock scenario
      if (index % 3 === 0) {
        metaMap.set(id, {
          orderId: id,
          deliveryDate: new Date(today.getTime() + (2 * 24 * 60 * 60 * 1000)), // Over 2 dagen
          isSpoolbouwWaiting: false
        });
      } else if (index % 5 === 0) {
        metaMap.set(id, {
          orderId: id,
          deliveryDate: new Date(today.getTime() + (7 * 24 * 60 * 60 * 1000)), // Over een week
          isSpoolbouwWaiting: true, // SPOOLBOUW WACHT!
          isUrgent: true
        });
      }
    });

    return metaMap;
  }
}

export const inforSyncService = new InforSyncService();
