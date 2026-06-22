import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-future-factory',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('Firestore Security Rules', () => {
  const adminContext = { uid: 'admin_123', token: { email: 'admin@test.com', role: 'admin' } };
  const teamleaderContext = { uid: 'teamleader_123', token: { email: 'tl@test.com', role: 'teamleader' } };
  const operatorContext = { uid: 'operator_123', token: { email: 'op@test.com', role: 'operator' } };

  describe('future-factory/production/digital_planning (Planning Orders)', () => {
    it('Operator cannot write to digital_planning', async () => {
      const db = testEnv.authenticatedContext(operatorContext.uid, operatorContext.token).firestore();
      await assertFails(db.collection('future-factory/production/digital_planning').doc('order_1').set({ plan: 100 }));
    });

    it('Admin cannot write to digital_planning directly either (ISO hardening)', async () => {
      const db = testEnv.authenticatedContext(adminContext.uid, adminContext.token).firestore();
      await assertFails(db.collection('future-factory/production/digital_planning').doc('order_1').set({ plan: 100 }));
    });
    
    it('Admin can read digital_planning', async () => {
      const db = testEnv.authenticatedContext(adminContext.uid, adminContext.token).firestore();
      await assertSucceeds(db.collection('future-factory/production/digital_planning').get());
    });
  });

  describe('future-factory/audit (Audit logs)', () => {
    it('Admin can read audit logs', async () => {
      const db = testEnv.authenticatedContext(adminContext.uid, adminContext.token).firestore();
      await assertSucceeds(db.collection('future-factory/audit/logs').get());
    });

    it('Admin cannot write audit logs directly', async () => {
      const db = testEnv.authenticatedContext(adminContext.uid, adminContext.token).firestore();
      await assertFails(db.collection('future-factory/audit/logs').doc('log_1').set({ action: 'TEST' }));
    });

    it('Operator cannot read audit logs', async () => {
      const db = testEnv.authenticatedContext(operatorContext.uid, operatorContext.token).firestore();
      await assertFails(db.collection('future-factory/audit/logs').get());
    });
  });

  describe('future-factory/settings/factory_configs', () => {
    it('Admin can write to factory_configs', async () => {
      const db = testEnv.authenticatedContext(adminContext.uid, adminContext.token).firestore();
      await assertSucceeds(db.collection('future-factory/settings/factory_configs').doc('main').set({ test: true }));
    });

    it('Teamleader cannot write to factory_configs', async () => {
      const db = testEnv.authenticatedContext(teamleaderContext.uid, teamleaderContext.token).firestore();
      await assertFails(db.collection('future-factory/settings/factory_configs').doc('main').set({ test: true }));
    });

    it('Operator can read factory_configs', async () => {
      const db = testEnv.authenticatedContext(operatorContext.uid, operatorContext.token).firestore();
      await assertSucceeds(db.collection('future-factory/settings/factory_configs').doc('main').get());
    });
  });
});
