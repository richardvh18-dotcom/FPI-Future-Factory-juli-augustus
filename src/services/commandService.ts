/**
 * commandService.ts
 *
 * Verantwoordelijk voor het genereren van Idempotency Keys (Command IDs) voor kritieke operaties.
 * Dit helpt bij het voorkomen van dubbele acties (zoals dubbel klikken) aan de server-zijde.
 */

// Simple string hash function
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to positive base36 string
  return Math.abs(hash).toString(36).substring(0, 4).toUpperCase().padStart(4, '0');
}

export const generateCommandId = (stationId?: string, uniquePayloadString?: string): string => {
  const stationSegment = stationId ? stationId.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8) : 'SYS';
  
  const nu = new Date();
  const year = nu.getFullYear();
  const month = String(nu.getMonth() + 1).padStart(2, '0');
  const day = String(nu.getDate()).padStart(2, '0');
  const dateSegment = `${year}${month}${day}`;

  let randomSegment = '';
  if (uniquePayloadString) {
    randomSegment = simpleHash(uniquePayloadString);
  } else {
    // Genereer een random string van 4 karakters voor uniciteit
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 4; i++) {
      randomSegment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }

  // Voorbeeld output: CMD-BH18-20260821-X9K2 of hash
  return `CMD-${stationSegment}-${dateSegment}-${randomSegment}`;
};
