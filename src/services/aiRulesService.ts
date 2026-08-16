import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db, logActivity } from '../config/firebase';

export interface AiFactoryRule {
  id: string;
  rule: string;
  category: string;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
}

const RULES_COLLECTION = 'future-factory/settings/ai_factory_rules';

export const aiRulesService = {
  async getRules(): Promise<AiFactoryRule[]> {
    try {
      const q = query(collection(db, RULES_COLLECTION), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AiFactoryRule[];
    } catch (error) {
      console.error('Error fetching AI rules:', error);
      return [];
    }
  },

  async addRule(rule: string, category: string = 'general'): Promise<AiFactoryRule> {
    try {
      const newRule = {
        rule,
        category,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, RULES_COLLECTION), newRule);
      
      await logActivity('system', 'AI_RULE_ADDED', `Nieuwe AI regel toegevoegd: ${rule.substring(0, 30)}...`);
      
      return {
        id: docRef.id,
        ...newRule
      };
    } catch (error) {
      console.error('Error adding AI rule:', error);
      throw error;
    }
  },

  async updateRule(id: string, updates: Partial<AiFactoryRule>): Promise<void> {
    try {
      const ruleRef = doc(db, RULES_COLLECTION, id);
      await updateDoc(ruleRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      await logActivity('system', 'AI_RULE_UPDATED', `AI regel bijgewerkt: ${id}`);
    } catch (error) {
      console.error('Error updating AI rule:', error);
      throw error;
    }
  },

  async deleteRule(id: string): Promise<void> {
    try {
      const ruleRef = doc(db, RULES_COLLECTION, id);
      await deleteDoc(ruleRef);
      await logActivity('system', 'AI_RULE_DELETED', `AI regel verwijderd: ${id}`);
    } catch (error) {
      console.error('Error deleting AI rule:', error);
      throw error;
    }
  }
};
