import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { aiRulesService, AiFactoryRule } from '../../services/aiRulesService';
import { Plus, Trash2, Edit2, Save, X, Check, ShieldAlert, BookOpen, AlertCircle, Loader2, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { doc, getDoc } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useNotifications } from "../../contexts/NotificationContext";
import { saveAiContextConfig } from "../../services/planningSecurityService";

export const AdminAiRules: React.FC = () => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const [rules, setRules] = useState<AiFactoryRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newRuleText, setNewRuleText] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState('general');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRuleText, setEditRuleText] = useState('');
  
  // System context states
  const [contextPrompt, setContextPrompt] = useState('');
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [isContextExpanded, setIsContextExpanded] = useState(false);

  const loadRules = async () => {
    setIsLoading(true);
    try {
      const fetchedRules = await aiRulesService.getRules();
      setRules(fetchedRules);
    } catch (error) {
      console.error('Failed to load rules:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
    
    const loadContext = async () => {
      try {
        const aiConfigPath = PATHS?.AI_CONFIG || ['future-factory', 'settings', 'ai_config', 'main'];
        const docRef = doc(db, ...(aiConfigPath as [string, ...string[]]));
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setContextPrompt(snap.data()?.systemPrompt || '');
        }
      } catch (err) {
        console.error('Failed to load system context:', err);
      }
    };
    
    loadContext();
  }, []);

  const handleSaveContext = async () => {
    setIsSavingContext(true);
    try {
      await saveAiContextConfig(contextPrompt);
      await logActivity(auth.currentUser?.uid || "system", "AI_CONTEXT_UPDATE", "AI System Prompt updated via Rules panel");
      showSuccess(t('ai.context.save_success', 'Systeem context succesvol opgeslagen'));
    } catch (err: any) {
      console.error(t('ai.context.save_error'), err);
      showError(t('ai.context.save_error', 'Fout bij opslaan systeem context'));
    } finally {
      setIsSavingContext(false);
    }
  };

  const handleAddRule = async () => {
    if (!newRuleText.trim()) return;
    try {
      await aiRulesService.addRule(newRuleText, newRuleCategory);
      setNewRuleText('');
      setIsAdding(false);
      loadRules();
    } catch (error) {
      console.error('Failed to add rule:', error);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await aiRulesService.updateRule(id, { isActive: !currentActive });
      setRules(prev => prev.map(r => r.id === id ? { ...r, isActive: !currentActive } : r));
    } catch (error) {
      console.error('Failed to toggle rule active state:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('ai.rules.confirm_delete', 'Weet je zeker dat je deze regel wilt verwijderen?'))) return;
    try {
      await aiRulesService.deleteRule(id);
      setRules(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const startEdit = (rule: AiFactoryRule) => {
    setEditingId(rule.id);
    setEditRuleText(rule.rule);
  };

  const saveEdit = async (id: string) => {
    try {
      await aiRulesService.updateRule(id, { rule: editRuleText });
      setRules(prev => prev.map(r => r.id === id ? { ...r, rule: editRuleText } : r));
      setEditingId(null);
    } catch (error) {
      console.error('Failed to update rule:', error);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col bg-white">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <BookOpen className="text-indigo-600" />
            {t('ai.rules.title', 'Dynamische Fabrieksregels (Copilot Grondwet)')}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {t('ai.rules.subtitle', 'Deze regels worden altijd meegegeven aan de AI voordat deze antwoordt op een vraag.')}
          </p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={18} />
          {t('ai.rules.add_button', 'Nieuwe Regel')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* System Context Box */}
        <div className="mb-8 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <button 
            onClick={() => setIsContextExpanded(!isContextExpanded)}
            className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-2 text-slate-800 font-bold">
              <Settings className="text-blue-600" size={20} />
              Basis Systeem Context (Systeem Prompt)
            </div>
            {isContextExpanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
          </button>
          
          {isContextExpanded && (
            <div className="p-4 border-t border-slate-200">
              <p className="text-sm text-slate-500 mb-3">
                Beheer hier de basisinstructies en algemene kennis van de AI. Gebruik Markdown voor structuur.
              </p>
              <textarea
                value={contextPrompt}
                onChange={(e) => setContextPrompt(e.target.value)}
                className="w-full h-[300px] p-4 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm text-slate-700 focus:border-blue-500 focus:ring-2 outline-none resize-y"
                placeholder="Voer hier de systeem prompt in..."
              />
              <div className="flex justify-end mt-3">
                <button
                  onClick={handleSaveContext}
                  disabled={isSavingContext}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isSavingContext ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  Opslaan
                </button>
              </div>
            </div>
          )}
        </div>

        {isAdding && (
          <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl mb-4">
            <h3 className="font-semibold text-indigo-900 mb-2">{t('ai.rules.add_title', 'Nieuwe Regel Toevoegen')}</h3>
            <textarea
              value={newRuleText}
              onChange={e => setNewRuleText(e.target.value)}
              className="w-full p-3 rounded-lg border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
              rows={3}
              placeholder={t('ai.rules.placeholder', 'Bijv: "De BH18 machine maakt momenteel uitsluitend T-stukken. Wijk hier niet vanaf."')}
            />
            <div className="flex justify-between items-center">
              <select
                value={newRuleCategory}
                onChange={e => setNewRuleCategory(e.target.value)}
                className="p-2 rounded-lg border border-indigo-200 bg-white focus:outline-none"
              >
                <option value="general">Algemeen</option>
                <option value="machine">Machines</option>
                <option value="planning">Planning</option>
                <option value="safety">Veiligheid</option>
              </select>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-indigo-100 rounded-lg transition-colors"
                >
                  Annuleren
                </button>
                <button
                  onClick={handleAddRule}
                  disabled={!newRuleText.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
                >
                  Toevoegen
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : rules.length === 0 && !isAdding ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-100">
            <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Er zijn nog geen specifieke fabrieksregels ingesteld.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map(rule => (
              <div
                key={rule.id}
                className={`p-4 rounded-xl border transition-all ${
                  rule.isActive ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
                        {rule.category}
                      </span>
                      {!rule.isActive && (
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-1 rounded-md flex items-center gap-1">
                          <AlertCircle size={12} /> Inactief
                        </span>
                      )}
                    </div>
                    
                    {editingId === rule.id ? (
                      <div className="mt-2">
                        <textarea
                          value={editRuleText}
                          onChange={e => setEditRuleText(e.target.value)}
                          className="w-full p-2 rounded-lg border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          rows={3}
                        />
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={() => setEditingId(null)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                            <X size={16} />
                          </button>
                          <button onClick={() => saveEdit(rule.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                            <Check size={16} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-slate-800 ${!rule.isActive && 'line-through text-slate-500'}`}>
                        {rule.rule}
                      </p>
                    )}
                  </div>
                  
                  {editingId !== rule.id && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleActive(rule.id, rule.isActive)}
                        className={`p-2 rounded-lg transition-colors ${
                          rule.isActive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'
                        }`}
                        title={rule.isActive ? 'Deactiveren' : 'Activeren'}
                      >
                        <ShieldAlert size={18} />
                      </button>
                      <button
                        onClick={() => startEdit(rule)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Bewerken"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Verwijderen"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
