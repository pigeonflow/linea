# Linea — Context Tools Plan

## Overview
Three interconnected tools that give the architect real-world context about the building site.
All three feed the same data: once the user pins their lot, every tool knows sun angles, neighbors, setbacks, and zoning.

---

## Tool 1: Vizinho (Neighbor Awareness)

### Problem
Brazilian law (NBR + municipal codes) restricts windows and openings based on proximity to neighboring properties:
- **CC Art. 1301**: Cannot open window, balcony, or skylight within **1.5m of the neighbor's boundary** if it overlooks their property
- **Afastamento lateral mínimo**: typically 1.5m for up to 2 floors, increases with height (varies by municipality)
- **Afastamento frontal**: typically 5m from street
- **Afastamento de fundos**: typically 3m

### What it does
- User defines the **lot boundary** (drawn on canvas or imported from site pin)
- Vizinho overlay shows **exclusion zones** (red hatched areas near boundaries where windows are forbidden)
- When AI places a window near a boundary, it warns: "Esta janela está a 80cm do vizinho — NBR exige mínimo 1.5m"
- Can show simulated neighbor buildings as grey masses on canvas
- Panel shows: lot dimensions, setback rules for the detected municipality, any violations highlighted

### Data sources
- Lot boundary: drawn manually or from Mapbox/OSM parcel data
- Municipality rules: hardcoded ruleset per city (São Paulo, Rio, etc.) — start with SP municipal code
- AI integration: system prompt gets lot context → AI knows where not to place openings

### UI
- Sidebar panel: "Vizinho" tab
- Toggle: show/hide exclusion zones on canvas
- Violation badge on shapes that break rules
- Button: "Verificar conformidade" → lists all violations

---

## Tool 2: Sol (Sun Position)

### Problem
Architects need to know sun angles to orient rooms correctly:
- Living areas should face north in Brazil (southern hemisphere = north = sun)
- Bedrooms benefit from morning sun (east)
- Service areas (laundry, garage) can face south

### What it does
- Shows a **sun arc overlay** on the canvas for any given date/time
- Animated sun path across the canvas (summer solstice, winter solstice, equinox)
- Shadow casting: given a building height, projects shadows onto the canvas
- Compass rose always visible on canvas
- AI integration: "posicione a sala de estar virada para o norte" → AI uses actual north based on lot orientation

### Data sources
- Sun position: [SunCalc](https://github.com/mourner/suncalc) — lightweight JS library, no API needed
- Location: from the Site Pin tool (lat/lng) or manual city input
- Date/time: user-controlled slider in the panel

### UI
- "Sol" panel with date/time slider
- Toggle: "Mostrar trajetória solar"
- Toggle: "Mostrar sombras" (requires building height input)
- Color gradient on canvas: yellow/warm = sun-facing, blue/cool = shade
- Real-time update as user moves the time slider

---

## Tool 3: Terreno / Site Pin

### The hub — everything else depends on this

### What it does
1. User clicks "Definir Terreno" button
2. Map modal opens (Mapbox or Leaflet + OSM)
3. User searches address OR drops a pin
4. User draws the **lot polygon** on the map (or it's auto-detected from cadastral data)
5. System extracts:
   - Lat/lng centroid → feeds Sun tool
   - Lot polygon → feeds Vizinho tool (setback zones)
   - Street orientation → rotates canvas north indicator
   - Municipality (reverse geocode) → loads correct zoning rules for Vizinho
   - Nearby buildings from OSM → renders as grey neighbor masses on canvas
6. Canvas updates: north arrow rotates to match real-world orientation

### Data sources
- Map tiles: Mapbox GL JS or Leaflet + CartoDB (already used in EasyBooking)
- Geocoding: Mapbox Geocoding API or Nominatim (free)
- Lot/parcel data: ideally from INCRA/prefeitura APIs — but fallback is manual polygon draw
- OSM buildings: Overpass API (`building=*` within bbox) — free
- Reverse geocode → municipality detection → zoning rule lookup

### UI
- "Terreno" button in toolbar
- Full-screen map modal
- Search bar at top
- Draw polygon tool on map
- Confirm button → closes modal, canvas gets site context
- Mini map thumbnail visible in canvas corner (always shows lot location)

---

## Integration: How they connect

```
Site Pin (lat/lng, lot polygon, municipality)
    ├── → Sun Tool (lat/lng → solar angles for any date/time)
    ├── → Vizinho Tool (lot polygon → setback zones → violation detection)
    └── → AI System Prompt (gets injected with site context)
            "Terreno em São Paulo, SP. Frente para Rua X (orientação: NE).
             Afastamentos: frontal 5m, lateral 1.5m, fundos 3m.
             O norte real está a 35° do eixo do canvas."
```

The AI becomes site-aware: it knows the real north, the setback rules, neighboring buildings.
"Crie uma sala de estar com boa incidência solar" → AI places it on the north-facing side of the lot.

---

## Phasing

### Phase A (can build now, no external APIs)
- Sun arc using SunCalc (pure JS, just needs lat/lng)
- Compass rose on canvas
- Vizinho exclusion zones drawn manually on canvas
- Hardcoded SP/RJ setback rules

### Phase B (needs map integration)
- Mapbox map modal for site pin
- Reverse geocode → municipality detection
- Canvas mini-map

### Phase C (nice to have)
- OSM building neighbors rendered on canvas
- Automated violation detection with AI
- Cadastral lot import (INCRA/prefeitura)

---

## Effort estimate
- Phase A: ~1 day (SunCalc + canvas overlays)
- Phase B: ~2 days (map modal + geocoding + canvas sync)
- Phase C: ~3 days (OSM + AI violation detection)
