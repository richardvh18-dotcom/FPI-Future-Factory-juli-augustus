# Responsive Design Implementation

## Overzicht
De FPi Future Factory portal is volledig responsive gemaakt voor gebruik op desktop, tablet en mobiele apparaten.

## Belangrijkste Wijzigingen

### 1. Product Informatie Correctie
- **PVC → GRE**: Alle verwijzingen naar PVC-buizen zijn gecorrigeerd naar GRE (Glass Reinforced Epoxy)
- **EST**: Eastern Standard Time → Epoxy Standard Type
- **CST**: Canadian Standard Time → Conductive Standard Type
- **Productie proces**: Spuitgieten → Lamineren (correct proces voor GRE buizen)

Referentie: https://futurepipe.com/wp-content/uploads/2025/05/GRE-HighPressureProducts.pdf

### 2. Responsive Breakpoints (Tailwind Config)
```javascript
screens: {
  'xs': '475px',   // Extra small devices
  'sm': '640px',   // Mobile landscape
  'md': '768px',   // Tablets
  'lg': '1024px',  // Desktop
  'xl': '1280px',  // Large desktop
  '2xl': '1536px'  // Extra large
}
```

### 3. Mobile Navigation
- **Desktop**: Hover-expand sidebar (16px → 264px)
- **Tablet/Mobile**: Slide-out drawer menu met overlay
- **Hamburger menu**: Toegevoegd aan header voor mobiel
- **Touch-friendly**: Minimale klikgebieden van 44x44px

### 4. Header Aanpassingen
- Responsive zoekbalk met kleinere placeholder op mobiel
- Hamburger menu knop (alleen zichtbaar op mobiel/tablet)
- Systeem status verborgen op kleine schermen
- Logo en branding schalen mee met schermgrootte

### 5. Typography & Spacing
- Base font-size: 16px (desktop) → 14px (tablet) → 13px (mobiel)
- Touch-friendly padding op alle interactieve elementen
- Safe area insets voor moderne apparaten (notch support)

### 6. CSS Optimalisaties
- `-webkit-text-size-adjust: 100%` voorkomt iOS zoom bij input focus
- `-webkit-tap-highlight-color` voor betere touch feedback
- `touch-action: none` op buttons voor betere responsiviteit
- Responsive scrollbar styling (8px breed)

### 7. Viewport Configuration
```html
<meta 
  name="viewport" 
  content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0"
/>
```

## Geteste Schermformaten

### Mobiel (< 768px)
- iPhone SE: 375x667
- iPhone 12/13: 390x844
- Android (gemiddeld): 360x800

### Tablet (768px - 1023px)
- iPad: 768x1024
- iPad Pro: 834x1112
- Android tablets: 800x1280

### Desktop (≥ 1024px)
- Laptop: 1366x768
- Desktop: 1920x1080
- Ultrawide: 2560x1440

## Belangrijke CSS Classes

### Touch Targets
```css
.touch-target        /* Min 44x44px voor touch */
.mobile-padding      /* px-4 py-3 */
.tablet-padding      /* md:px-6 md:py-4 */
```

### Responsive Utilities
```css
.hidden md:flex      /* Verborgen op mobiel, zichtbaar op tablet+ */
.md:hidden           /* Zichtbaar op mobiel, verborgen op tablet+ */
.xs:text-sm md:text-base  /* Responsive tekst */
```

## Testing Checklist

- [x] Mobiele navigatie (hamburger menu)
- [x] Touch-friendly knoppen (min 44px)
- [x] Responsive typography
- [x] Sidebar drawer op mobiel
- [x] Header responsiveness
- [x] Safe area insets (notch)
- [x] Viewport meta tag
- [x] Touch feedback

## Bekende Beperkingen

1. **Landscape mobiel**: Sommige views kunnen beperkt zijn in landscape mode op zeer kleine apparaten
2. **Zeer oude browsers**: IE11 en ouder worden niet ondersteund
3. **Print styling**: Nog niet geoptimaliseerd voor print

## Toekomstige Verbeteringen

- [ ] PWA ondersteuning voor offline gebruik
- [ ] Swipe gestures voor navigatie
- [ ] Pull-to-refresh functionaliteit
- [ ] Haptic feedback op ondersteunde apparaten
- [ ] Landscape optimalisatie voor tablets
- [ ] Dark mode toggle

## Bronnen

- [Future Pipe GRE Products](https://futurepipe.com/wp-content/uploads/2025/05/GRE-HighPressureProducts.pdf)
- [Tailwind CSS Responsive Design](https://tailwindcss.com/docs/responsive-design)
- [MDN Touch Events](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events)
