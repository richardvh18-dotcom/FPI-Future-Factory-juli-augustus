/**
 * Gemini API Helper
 * Bevat configuratie en functies voor de AI assistent.
 */

// Haal API key uit env of gebruik fallback (let op: env is veiliger)
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

import i18n from "../i18n";

export const callGemini = async (userQuery, systemPrompt) => {
  if (!apiKey) {
    console.error(i18n.t("gemini.api_key_missing_log", "Gemini API Key ontbreekt."));
    return i18n.t("gemini.api_key_missing", "Configuratie fout: API sleutel ontbreekt.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);

    const result = await response.json();
    return (
      result.candidates?.[0]?.content?.parts?.[0]?.text ||
      i18n.t("gemini.no_response", "Geen antwoord ontvangen.")
    );
  } catch (error) {
    console.error(i18n.t("gemini.error_log", "Gemini Fout:"), error);
    return i18n.t("gemini.connection_error", "Er ging iets mis bij het verbinden met de AI.");
  }
};
