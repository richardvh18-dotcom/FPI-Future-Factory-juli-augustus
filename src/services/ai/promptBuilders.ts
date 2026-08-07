
import { clamp, SYSTEM_PROMPT_BUDGET } from '../aiService';

export const composeSystemPrompt = (basePrompt: string, dbContext: string) => {
    const base = String(basePrompt || '');
    const ctx = String(dbContext || '');
    if (!ctx.trim()) return clamp(base, SYSTEM_PROMPT_BUDGET);

    const ctxBudget = Math.min(7000, Math.floor(SYSTEM_PROMPT_BUDGET * 0.62));
    const baseBudget = SYSTEM_PROMPT_BUDGET - ctxBudget;

    const trimmedContext = clamp(ctx, ctxBudget);
    const trimmedBase = clamp(base, baseBudget);

    return `${trimmedContext}\n\n## BASISINSTRUCTIES\n${trimmedBase}`;
  }
