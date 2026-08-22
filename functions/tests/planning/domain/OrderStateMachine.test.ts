import { describe, it, expect } from 'vitest';
import { OrderStateMachine } from '../../src/services/planning/domain/OrderStateMachine';

describe('OrderStateMachine', () => {
  describe('canTransition', () => {
    it('allows START from PENDING', () => {
      expect(OrderStateMachine.canTransition('PENDING', 'START')).toBe(true);
      // Ook met genormaliseerde string vanuit de database
      expect(OrderStateMachine.canTransition('pending', 'START')).toBe(true);
      expect(OrderStateMachine.canTransition('wachtend', 'START')).toBe(true);
    });

    it('blocks START from IN_PROGRESS', () => {
      expect(OrderStateMachine.canTransition('IN_PROGRESS', 'START')).toBe(false);
      expect(OrderStateMachine.canTransition('in productie', 'START')).toBe(false);
    });

    it('allows PAUSE and COMPLETE from IN_PROGRESS', () => {
      expect(OrderStateMachine.canTransition('IN_PROGRESS', 'PAUSE')).toBe(true);
      expect(OrderStateMachine.canTransition('IN_PROGRESS', 'COMPLETE')).toBe(true);
    });

    it('blocks COMPLETE from PENDING', () => {
      expect(OrderStateMachine.canTransition('PENDING', 'COMPLETE')).toBe(false);
    });

    it('allows RESUME from ON_HOLD', () => {
      expect(OrderStateMachine.canTransition('ON_HOLD', 'RESUME')).toBe(true);
      expect(OrderStateMachine.canTransition('gepauzeerd', 'RESUME')).toBe(true);
    });

    it('blocks anything other than RESTART from COMPLETED', () => {
      expect(OrderStateMachine.canTransition('COMPLETED', 'START')).toBe(false);
      expect(OrderStateMachine.canTransition('COMPLETED', 'PAUSE')).toBe(false);
      expect(OrderStateMachine.canTransition('COMPLETED', 'COMPLETE')).toBe(false);
      expect(OrderStateMachine.canTransition('COMPLETED', 'RESTART')).toBe(true);
    });
  });

  describe('assertTransition', () => {
    it('throws an error on invalid transition', () => {
      expect(() => {
        OrderStateMachine.assertTransition('COMPLETED', 'START', 'Test Order');
      }).toThrow(/INVALID_STATE_TRANSITION.*Cannot perform action 'START' from state 'COMPLETED'/);
    });

    it('does not throw on valid transition', () => {
      expect(() => {
        OrderStateMachine.assertTransition('PENDING', 'START');
      }).not.toThrow();
    });
  });
});

