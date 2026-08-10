// @ts-nocheck

const { db } = require('../config/firebase');
const { USER_ACCOUNTS_COLLECTION } = require('../config/planningConstants');
const { clean } = require('../utils/text');

const normalizeRoleValue = (value) => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeRoleValue(entry);
      if (normalized) return normalized;
    }
    return '';
  }

  if (value && typeof value === 'object') {
    const nestedCandidates = [value.role, value.roles];
    for (const nested of nestedCandidates) {
      const normalized = normalizeRoleValue(nested);
      if (normalized) return normalized;
    }
    return '';
  }

  return clean(value).toLowerCase();
};

const resolveUserRoleForContext = async (context) => {
  const tokenRoleCandidates = [
    context?.auth?.token?.role,
    context?.auth?.token?.roles,
    context?.auth?.token?.customClaims?.role,
    context?.auth?.token?.customClaims?.roles,
  ];

  for (const candidate of tokenRoleCandidates) {
    const normalized = normalizeRoleValue(candidate);
    if (normalized) return normalized;
  }

  const uid = context?.auth?.uid;
  if (!uid) return '';

  try {
    const userSnap = await db.collection(USER_ACCOUNTS_COLLECTION).doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    return normalizeRoleValue(userData?.role);
  } catch (error) {
    console.warn('resolveUserRoleForContext fallback vanwege Firestore-fout', {
      uid,
      message: error?.message || String(error),
      code: error?.code ?? null,
    });
    return '';
  }
};

module.exports = {
  resolveUserRoleForContext,
};