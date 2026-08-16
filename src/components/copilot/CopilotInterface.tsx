import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { aiService } from '../../services/aiService';
import { Loader2, Send, Wrench, ChevronDown, ChevronUp, Bot, User, AlertTriangle, ThumbsUp, X as LucideX, Trash2, PenTool } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../config/firebase';
import { PATHS, getPathString } from '../../config/dbPaths';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { aiRulesService } from '../../services/aiRulesService';

interface ToolCall {
  name: string;
  args: Record<string, any>;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  toolCalls?: ToolCall[];
}

export const CopilotInterface: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAdminAuth();
  const canEditRules = user?.role === 'admin' || user?.canEditAiRules;
  const [isDictatingRule, setIsDictatingRule] = useState(false);
  
  const WELCOME_MESSAGE: ChatMessage = {
    id: 'welcome-msg',
    role: 'model',
    content: `Hallo! Ik ben de **Future Factory Assistent**. 

Ik kan je helpen met vragen over:
- 🏭 **Machines & Planning** (bijv. "Waar staat order N12345678?")
- 📋 **Catalogus & Toleranties** (bijv. "Wat is de wanddikte van T-stuk EST25?")
- ⚙️ **Systeemregels & Veiligheid**

**Feedback is belangrijk:**
Als ik een fout antwoord geef, gebruik dan het **rode kruisje (X)** bij mijn bericht. Zo kunnen de beheerders mijn kennis direct verbeteren in het AI Beheercentrum!

Hoe kan ik je vandaag helpen?`
  };

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('copilot_chat_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    return [WELCOME_MESSAGE];
  });
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [feedbackSent, setFeedbackSent] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Save to local storage whenever messages change
  useEffect(() => {
    localStorage.setItem('copilot_chat_history', JSON.stringify(messages));
  }, [messages]);

  const clearHistory = () => {
    if (window.confirm(t('copilot.clear_confirm', 'Weet je zeker dat je de chatgeschiedenis wilt wissen?'))) {
      setMessages([WELCOME_MESSAGE]);
      localStorage.removeItem('copilot_chat_history');
      setFeedbackSent(new Set());
    }
  };

  const handleFeedback = async (aiMsg: ChatMessage, isPositive: boolean) => {
    if (feedbackSent.has(aiMsg.id)) return;
    
    // Find the user message right before this AI message
    const index = messages.findIndex(m => m.id === aiMsg.id);
    const userMsg = index > 0 ? messages[index - 1] : null;

    try {
      const colRef = collection(db, getPathString(PATHS.AI_KNOWLEDGE_BASE));
      await addDoc(colRef, {
        question: userMsg?.content || "",
        answer: aiMsg.content,
        feedback: isPositive ? "positive" : "negative",
        type: "Q&A",
        verified: false,
        timestamp: serverTimestamp(),
        userId: auth.currentUser?.uid || "unknown"
      });
      setFeedbackSent(prev => new Set(prev).add(aiMsg.id));
    } catch (e) {
      console.error("Failed to save feedback", e);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const toggleToolExpansion = (msgId: string, toolIndex: number) => {
    const key = `${msgId}-${toolIndex}`;
    setExpandedTools(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsgId = Date.now().toString();
    const newUserMessage: ChatMessage = { id: userMsgId, role: 'user', content: input };
    
    setMessages(prev => [...prev, newUserMessage]);
    setInput('');
    setIsLoading(true);

    if (isDictatingRule) {
      try {
        const prompt = `Converteer de volgende informele tekst naar een beknopte, strikte en formele fabrieksregel voor in het handboek of systeem. Geef ALLEEN de resulterende regel terug, zonder extra uitleg, quotes of opmaak:\n\n"${newUserMessage.content}"`;
        const response = await aiService.askCopilot(prompt, []);
        
        const ruleText = response.answer?.trim() || "";
        if (ruleText) {
          await aiRulesService.addRule(ruleText, 'general');
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'model',
            content: `✅ Nieuwe fabrieksregel succesvol toegevoegd:\n\n*"${ruleText}"*`
          }]);
        }
      } catch (err) {
        console.error('Failed to dictate rule:', err);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'model',
          content: 'Er ging iets mis bij het toevoegen van de regel. Probeer het later opnieuw.'
        }]);
      } finally {
        setIsLoading(false);
        setIsDictatingRule(false);
      }
      return;
    }

    try {
      // Map existing messages (excluding the welcome message) to the format expected by the backend
      const history = messages
        .filter(msg => msg.id !== 'welcome-msg')
        .map(msg => ({
          role: msg.role,
          parts: [{ text: msg.content }]
        }));

      const response = await aiService.askCopilot(newUserMessage.content, history);
      
      const aiMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: aiMsgId,
        role: 'model',
        content: response.answer || '',
        toolCalls: response.toolCalls as ToolCall[]
      }]);
    } catch (error: any) {
      console.error('Copilot Error:', error);
      const errorMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: errorMsgId,
        role: 'model',
        content: t('copilot.error_msg', 'Sorry, er ging iets mis bij het ophalen van het antwoord.') + ' ' + (error.message || '')
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white overflow-hidden shadow-sm border border-slate-200 rounded-xl">
      {/* Header */}
      <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-b border-slate-200">
        <div className="flex flex-col">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 text-white p-2 rounded-xl shadow-sm">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">{t('copilot.title', 'Future Factory Assistent')}</h2>
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mt-0.5 tracking-wide uppercase">
                <AlertTriangle size={12} />
                <span>Let op: AI wordt getraind. Antwoorden controleren aub.</span>
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={clearHistory}
          className="flex items-center gap-2 p-2 px-3 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors font-bold text-xs uppercase tracking-wider"
          title="Chatgeschiedenis wissen"
        >
          <Trash2 size={16} />
          <span className="hidden md:inline">Wissen</span>
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">

        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            
            {/* Tool Calls Rendering (If AI used tools) */}
            {msg.role === 'model' && msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="mb-2 max-w-[85%] space-y-2">
                {msg.toolCalls.map((tool, idx) => {
                  const key = `${msg.id}-${idx}`;
                  const isExpanded = expandedTools.has(key);
                  return (
                    <div key={idx} className="bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm text-sm">
                      <button 
                        onClick={() => toggleToolExpansion(msg.id, idx)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center space-x-2 text-slate-500">
                          <Wrench className="w-4 h-4" />
                          <span className="font-medium font-mono text-xs">{tool.name}</span>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </button>
                      
                      {isExpanded && tool.args && Object.keys(tool.args).length > 0 && (
                        <div className="p-3 bg-white border-t border-slate-100 overflow-x-auto">
                          <pre className="text-xs text-slate-600">
                            {JSON.stringify(tool.args, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Message Bubble */}
            <div className={`flex max-w-[85%] relative ${msg.role === 'user' ? 'justify-end' : 'justify-start group'}`}>
              {msg.role === 'model' && (
                <div className="flex-shrink-0 mr-3 mt-1">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shadow-sm border border-blue-200">
                    <Bot className="w-5 h-5" />
                  </div>
                </div>
              )}
              
              <div className={`
                px-5 py-3 rounded-2xl whitespace-pre-wrap
                ${msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-sm shadow-sm' 
                  : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm leading-relaxed relative'
                }
              `}>
                {msg.content}
                
                {/* Feedback Buttons for AI Messages */}
                {msg.role === 'model' && !feedbackSent.has(msg.id) && (
                  <div className="absolute -top-3 -right-3 hidden group-hover:flex items-center gap-1 bg-white border border-slate-200 rounded-full shadow-sm p-1">
                    <button 
                      onClick={() => handleFeedback(msg, true)}
                      className="p-1 rounded-full hover:bg-green-100 text-slate-400 hover:text-green-600 transition-colors"
                      title="Goed antwoord"
                    >
                      <ThumbsUp size={14} />
                    </button>
                    <button 
                      onClick={() => handleFeedback(msg, false)}
                      className="p-1 rounded-full hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                      title="Foutief of onvolledig"
                    >
                      <LucideX size={14} />
                    </button>
                  </div>
                )}
                {msg.role === 'model' && feedbackSent.has(msg.id) && (
                  <div className="absolute -top-2 -right-2 bg-green-100 border border-green-200 text-green-700 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-sm">
                    Feedback Verzonden
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="flex-shrink-0 ml-3 mt-1">
                  <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center shadow-sm">
                    <User className="w-5 h-5" />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex items-start">
            <div className="flex-shrink-0 mr-3 mt-1">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shadow-sm border border-blue-200">
                <Bot className="w-5 h-5" />
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm flex items-center gap-2">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <span className="text-slate-400 text-sm font-medium italic">Assistent denkt na...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-slate-200 p-4">
        {canEditRules && (
          <div className="flex justify-start px-1 pt-1 pb-3">
             <button type="button" onClick={() => setIsDictatingRule(!isDictatingRule)}
                className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors border ${
                  isDictatingRule 
                    ? 'bg-amber-100 text-amber-700 border-amber-200 shadow-sm' 
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-600'
                }`}>
                <PenTool size={12} /> {isDictatingRule ? 'Regel Dicteren (Actief)' : 'Nieuwe Fabrieksregel Dicteren'}
             </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="relative flex items-center max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isDictatingRule ? "Typ de nieuwe regel in eigen woorden..." : t('copilot.input_placeholder', 'Stel je vraag hier...')}
            className={`w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl pl-5 pr-14 py-4 focus:outline-none focus:ring-2 focus:border-transparent transition-all shadow-inner ${isDictatingRule ? 'focus:ring-amber-500 border-amber-200 bg-amber-50/30' : 'focus:ring-blue-500'}`}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-3 p-2.5 rounded-full text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
