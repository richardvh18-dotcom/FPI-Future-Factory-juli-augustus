import * as admin from 'firebase-admin';

export class AiUsageTracker {
  // Limieten per rol per dag
  private readonly LIMITS: Record<string, number> = {
    'operator': 25,
    'standard': 25,
    'teamleader': 100,
    'planner': 100,
    'admin': 99999, // practically unlimited
    'engineer': 99999
  };

  /**
   * Genereert een YYYY-MM-DD string gebaseerd op Europe/Amsterdam tijd
   */
  private getTodayString(): string {
    const now = new Date();
    // Eenvoudige ISO datum (voldoende voor de meeste toepassingen, maar let op UTC)
    return now.toISOString().split('T')[0];
  }

  /**
   * Controleert of de gebruiker zijn dagelijkse quota heeft bereikt
   * Werpt een error als de limiet is bereikt.
   */
  async checkQuota(uid: string, role: string = 'operator'): Promise<void> {
    const limit = this.LIMITS[role] || this.LIMITS['operator'];
    if (limit >= 99999) return; // Geen echte check nodig voor admins

    const db = admin.firestore();
    const today = this.getTodayString();
    
    // Check de usage teller document voor vandaag
    const usageRef = db.collection('future-factory/settings/ai_usage_logs').doc(`${uid}_${today}`);
    
    try {
      const docSnap = await usageRef.get();
      if (docSnap.exists) {
        const data = docSnap.data();
        const count = data?.count || 0;
        
        if (count >= limit) {
          throw new Error(`Je dagelijkse limiet van ${limit} AI vragen is bereikt. Probeer het morgen opnieuw of neem contact op met je teamleader.`);
        }
      }
    } catch (e: any) {
      if (e.message.includes('limiet')) {
        throw e;
      }
      // Bij andere db errors laten we het doorgaan om de app niet te blokkeren bij een Firebase hickup
      console.error("Fout bij ophalen quota:", e);
    }
  }

  /**
   * Logt een succesvolle vraag in de dagelijkse teller
   */
  async logUsage(uid: string, query: string, role: string = 'operator'): Promise<void> {
    const db = admin.firestore();
    const today = this.getTodayString();
    const usageRef = db.collection('future-factory/settings/ai_usage_logs').doc(`${uid}_${today}`);
    
    try {
      await db.runTransaction(async (t) => {
        const docSnap = await t.get(usageRef);
        if (!docSnap.exists) {
          t.set(usageRef, {
            uid,
            role,
            date: today,
            count: 1,
            lastQuery: query,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          t.update(usageRef, {
            count: admin.firestore.FieldValue.increment(1),
            lastQuery: query,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      });
      
      // Sla optioneel een volledige log op voor audit in een subcollectie
      await usageRef.collection('queries').add({
        query,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

    } catch (e) {
      console.error("Fout bij opslaan quota:", e);
    }
  }
}

export const aiUsageTracker = new AiUsageTracker();
