/**
 * src/utils/connectionFormatter.ts
 * Utility for connection string formatting across the application.
 * - For T-pieces/Wyes/Crosses (3-way fittings): Automatically formats connections to explicit 3-way (CB/CB/CB, TB/TB/TB).
 * - For Reducers/Elbows/Flanges (2-way fittings): Automatically formats connections to 2-way (CB/CB, TB/TB), converting any erroneous 3-way text back to 2-way.
 */

export const formatConnectionForDisplay = (text: string | null | undefined): string => {
  if (!text) return "";
  let str = String(text);

  const isTee = /\b(Tee|T-stuk|T-Stuk|Wye|Cross|UNEQUAL-TEE|EQUAL-TEE)\b/i.test(str);

  if (isTee) {
    // 3-way fitting: Ensure 3 ends (CB/CB/CB, TB/TB/TB)
    if (/\bCB\/CB\/CB\b/i.test(str) || /\bTB\/TB\/TB\b/i.test(str)) {
      return str;
    }
    str = str.replace(/\b(CBCB|CB\/CB)\b/gi, "CB/CB/CB");
    str = str.replace(/\b(TBTB|TB\/TB)\b/gi, "TB/TB/TB");
    str = str.replace(/\bBCCBB0\b/gi, "CB/CB/CB");
  } else {
    // 2-way fitting (RedEcc, RedCon, Reducer, Elbow, etc.): Ensure 2 ends (CB/CB, TB/TB)
    str = str.replace(/\b(CB\/CB\/CB|CB-CB-CB|CBCBCB)\b/gi, "CB/CB");
    str = str.replace(/\b(TB\/TB\/TB|TB-TB-TB|TBTBTB)\b/gi, "TB/TB");
    str = str.replace(/\bCBCB\b/gi, "CB/CB");
    str = str.replace(/\bTBTB\b/gi, "TB/TB");
  }

  return str;
};
