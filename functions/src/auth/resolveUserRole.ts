// @ts-nocheck

const { db } = require('../config/firebase');
const { USER_ACCOUNTS_COLLECTION } = require('../config/planningConstants');
const { clean } = require('../utils/text');

const resolveUserRoleForContext = async (context) => {
  const tokenRoleCandidates = [
    context?.auth?.token?.role,
    context?.auth?.token?.roles,
    context?.auth?.token?.customClaims?.role,
  ];

  const tokenRole = tokenRoleCandidates
    .map((value) => clean(value).toLowerCase())
    .find(Boolean);
  if (tokenRole) return tokenRole;

  const uid = context?.auth?.uid;
  if (!uid) return '';

  try {
    const userSnap = await db.collection(USER_ACCOUNTS_COLLECTION).doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    return clean(userData?.role).toLowerCase();
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