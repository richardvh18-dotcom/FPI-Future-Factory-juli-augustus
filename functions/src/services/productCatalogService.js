const { db, admin } = require('../config/firebase');

const PRODUCTS_COLLECTION = db.collection('future-factory').doc('production').collection('products');

const cleanText = (value) => String(value || '').trim();

function sanitizeProductData(input = {}) {
  const data = { ...input };
  delete data.id;
  delete data.createdAt;
  delete data.lastUpdated;
  return data;
}

async function saveProductRecordService({ productId = '', productData = {}, actorUid = '' }) {
  const normalizedId = cleanText(productId);
  const cleanData = sanitizeProductData(productData);

  if (!cleanData.name && !normalizedId) {
    throw new Error('Productnaam is verplicht voor nieuwe records.');
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  if (!normalizedId) {
    const payload = {
      ...cleanData,
      createdAt: now,
      lastUpdated: now,
      lastModifiedBy: actorUid || 'system',
    };
    const docRef = await PRODUCTS_COLLECTION.add(payload);
    return { ok: true, productId: docRef.id, operation: 'create' };
  }

  await PRODUCTS_COLLECTION.doc(normalizedId).set(
    {
      ...cleanData,
      lastUpdated: now,
      lastModifiedBy: actorUid || 'system',
    },
    { merge: true }
  );

  return { ok: true, productId: normalizedId, operation: 'update' };
}

async function deleteProductRecordService({ productId = '' }) {
  const normalizedId = cleanText(productId);
  if (!normalizedId) {
    throw new Error('productId is verplicht.');
  }

  await PRODUCTS_COLLECTION.doc(normalizedId).delete();
  return { ok: true, productId: normalizedId };
}

async function verifyProductRecordService({ productId = '', actor = {}, isAdmin = false }) {
  const normalizedId = cleanText(productId);
  if (!normalizedId) {
    throw new Error('productId is verplicht.');
  }

  const productRef = PRODUCTS_COLLECTION.doc(normalizedId);
  const snap = await productRef.get();
  if (!snap.exists) {
    throw new Error('Product niet gevonden.');
  }

  const current = snap.data() || {};
  if (current.lastModifiedBy && current.lastModifiedBy === actor.uid && !isAdmin) {
    return {
      ok: false,
      code: 'self-verify-blocked',
      message: 'Vier-ogen principe: Je mag je eigen wijzigingen niet verifiëren.',
    };
  }

  await productRef.set(
    {
      verificationStatus: 'verified',
      verifiedBy: {
        uid: actor.uid || 'system',
        name: actor.name || actor.email || 'Unknown',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      },
      selfVerifiedByAdmin: current.lastModifiedBy === actor.uid && Boolean(isAdmin),
      active: true,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true, productId: normalizedId };
}

module.exports = {
  saveProductRecordService,
  deleteProductRecordService,
  verifyProductRecordService,
};
