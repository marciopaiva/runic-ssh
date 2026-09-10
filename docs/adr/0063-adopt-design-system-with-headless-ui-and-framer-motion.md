# ADR-0063: Adopt a design system with Headless UI primitives and Framer Motion

* **Status**: Accepted
* **Date**: 2026-09-09

## Context

The interface has 50+ presentational components built directly with Tailwind utilities mapped from design tokens (`src/styles/tokens.css`). While functional and token-compliant, the visual quality targets "modern AAA": micro-interactions (hover, press, focus, loading), depth/elevation (shadow scale, glass/blur), fluid typography, spring-based motion for orchestration (sidebar collapse, tab switching, dialogs), and a consistent primitive library (Button, Input, Card, Tooltip, Dropdown, Dialog, Tabs, Sidebar).

Current constraints:
- All colors must come from tokens (enforced by `tests/design-tokens.test.ts`)
- Light theme is token-swapped only; no visual adjustments for true parity
- No motion tokens, shadow scale, radius scale, or z-index scale exist
- Canvas (`design/canvas/`) is the single source of visual truth; 30+ artboards generated from `gen.py`
- No runtime dependencies without ADR (CLAUDE.md §4)
- Security rules forbid credentials in IPC, secrets in logs, widen Tauri capabilities without ADR

The request is for a full design system: token v2 (motion, shadows, radius, z-index), primitive component library, canvas documentation, and UX pattern improvements (command palette v2, onboarding, dashboard).

## Options considered

### Option A: Incremental Design System Extraction (Chosen)
Extend tokens with v2 scales. Add `@headlessui/react` (accessibility primitives: focus trap, ARIA, keyboard nav) and `framer-motion` (orchestration: sidebar, tabs, dialogs, shared layout transitions). Build primitives in `src/components/ui/` styled exclusively with token utilities. Refactor existing components one-by-one, updating canvas per component. Add `Primitives.dc.html` artboard.

### Option B: Canvas-First Redesign
Redesign all 30+ artboards first with new token scales and primitives, then implement in single sweep. No incremental refactor; old and new don't coexist.

### Option C: Zero-Dependency Polish
Extend tokens v2. Build all primitives from scratch using only React + CSS (`@starting-style`, `transition-behavior`, `view-transition`). No Headless UI, no Framer Motion.

## Decision

Option A: Incremental Design System Extraction with Headless UI + Framer Motion.

**Tradeoffs accepted**:
- Four new runtime dependencies: `@headlessui/react` (~12KB) and `framer-motion` (~50KB gzipped) for the primitives and their motion, plus `clsx` and `tailwind-merge` (~1KB and ~7KB gzipped) behind the `cn` helper, so a caller's class can override a primitive's own without depending on stylesheet order. ADR required and granted for all four; the follow-up below always listed them, and this line counted two
- Framer Motion adds bundle weight; mitigated by using it only for orchestration (sidebar, tabs, dialogs, shared layout), not micro-interactions (handled by CSS transitions)
- Headless UI primitives are unstyled; we own 100% of visual output via tokens: no design opinion leakage
- Incremental migration means temporary coexistence of old/new component patterns; managed by per-component canvas updates

## Consequences

**Good**:
- Accessibility (focus management, ARIA, keyboard nav) handled by battle-tested Headless UI primitives
- Spring physics and shared layout transitions via Framer Motion for "AAA" feel
- Token v2 scales (motion, shadow, radius, z-index) enable consistent design language
- Primitives library (`Button`, `Input`, `Card`, `Tooltip`, `Dropdown`, `Dialog`, `Tabs`, `Sidebar`, `Table`, `Toast`) eliminates ad-hoc styling
- Canvas documents the system: `Tokens.dc.html` + `Primitives.dc.html` + updated artboards
- Per-component migration allows maintainer review, rollback, parallel UX work
- UX patterns (command palette v2, onboarding, dashboard) built on primitives, not one-offs

**Bad**:
- Bundle size increase (~62KB gzipped for two deps)
- Framer Motion learning curve for team; animations must respect `prefers-reduced-motion`
- Headless UI API changes require migration (mitigated: v2 stable, widely used)
- Token v2 additions require canvas regeneration pipeline updates (`gen.py`)
- Temporary inconsistency during migration (old components alongside new primitives)

**Follow-up**:
1. Add token v2 scales to `tokens.css` (motion durations/easings, shadow 1-5, radius sm-xl, z-index scale)
2. Update `gen.py` palette with new token names
3. Install `@headlessui/react`, `framer-motion`, `clsx`, `tailwind-merge`
4. Build primitives in `src/components/ui/` with tests
5. Add `Primitives.dc.html` canvas artboard
6. Migrate components incrementally (priority: Button, Input, Card, Tooltip, Sidebar, Tabs, Dialog)
7. Update all canvas artboards to use primitives
8. Build UX patterns: CommandPalette v2, Onboarding, Dashboard
9. Revisit if bundle size exceeds budget or Framer Motion causes performance issues on low-end