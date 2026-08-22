export type OrderState = 
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'REJECTED'
  | 'ARCHIVED';

export type OrderAction = 
  | 'START'
  | 'PAUSE'
  | 'RESUME'
  | 'COMPLETE'
  | 'REJECT'
  | 'RESTART';

export class OrderStateMachine {
  private static readonly transitions: Record<OrderState, OrderAction[]> = {
    'PENDING': ['START', 'REJECT'],
    'IN_PROGRESS': ['PAUSE', 'COMPLETE', 'REJECT'],
    'ON_HOLD': ['RESUME', 'REJECT'],
    'COMPLETED': ['RESTART'],
    'REJECTED': ['RESTART'],
    'ARCHIVED': []
  };

  /**
   * Checks if an action is valid given the current state of an order.
   * @param currentState The current state of the order
   * @param action The action being attempted
   * @returns boolean indicating if the transition is allowed
   */
  static canTransition(currentState: string, action: OrderAction): boolean {
    const normalizedState = OrderStateMachine.normalizeState(currentState);
    
    // If we don't recognize the state, we conservatively block (or we could allow for backwards compatibility)
    if (!this.transitions[normalizedState]) {
      console.warn(`[OrderStateMachine] Unrecognized state: ${currentState}, defaulting to PENDING checks`);
      return false; 
    }

    return this.transitions[normalizedState].includes(action);
  }

  /**
   * Enforces that a transition is valid. Throws an error if invalid.
   */
  static assertTransition(currentState: string, action: OrderAction, contextInfo: string = '') {
    if (!this.canTransition(currentState, action)) {
      throw new Error(`INVALID_STATE_TRANSITION: Cannot perform action '${action}' from state '${currentState}'. ${contextInfo}`);
    }
  }

  /**
   * Helper to normalize database status strings to formal states
   */
  private static normalizeState(dbStatus: string): OrderState {
    const raw = String(dbStatus || '').trim().toLowerCase();
    
    if (raw === 'pending' || raw === 'wachtend' || raw === 'planned' || raw === 'new') return 'PENDING';
    if (raw === 'in_progress' || raw === 'actief' || raw === 'running' || raw === 'in productie') return 'IN_PROGRESS';
    if (raw === 'on_hold' || raw === 'gepauzeerd' || raw === 'paused' || raw === 'hold') return 'ON_HOLD';
    if (raw === 'completed' || raw === 'gereed' || raw === 'finished' || raw === 'done') return 'COMPLETED';
    if (raw === 'rejected' || raw === 'afkeur' || raw === 'afgekeurd') return 'REJECTED';
    if (raw === 'archived' || raw === 'gearchiveerd') return 'ARCHIVED';

    return 'PENDING'; // Default fallback
  }
}

