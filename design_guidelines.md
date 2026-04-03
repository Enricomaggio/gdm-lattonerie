# Platform One - Design Guidelines

## Design Approach
**Reference-Based**: Linear + Notion aesthetic - professional B2B SaaS dashboard with clean, minimalist interface optimized for data-heavy workflows and multi-tenant CRM operations.

## Brand Identity

**Primary Colors**:
- Primary (Dark Blue): #050B41 - Main brand color, used for sidebar, headers, primary buttons
- Secondary (Bright Blue): #4563FF - Accent interactions, links, secondary buttons
- Accent (Green): #61CE85 - Success states, positive actions, CTAs
- Background: #FDFDFD - Clean white background

**Font Stack**: 
- Primary: Inter (Google Fonts) - all UI text
- Fallback: "Spoqa Han Sans Neo", sans-serif
- Monospace: JetBrains Mono - data/IDs when needed

---

## Core Design Principles
1. **Clarity First**: Information hierarchy supports quick scanning and decision-making
2. **Data Density**: Efficient use of space for tables and lists without feeling cramped
3. **Subtle Elegance**: Refinement through restraint - no unnecessary visual noise
4. **Responsive Professionalism**: Seamless mobile-to-desktop experience

---

## Typography

**Hierarchy**:
- Page Titles: text-2xl font-semibold (32px)
- Section Headers: text-lg font-medium (18px)
- Body Text: text-sm (14px) - default for most UI
- Small Text: text-xs (12px) - metadata, timestamps, labels
- Table Headers: text-xs font-medium uppercase tracking-wide

---

## Layout System

**Spacing Units**: Use Tailwind units of **2, 3, 4, 6, 8** for consistent rhythm
- Component padding: p-4, p-6
- Gaps between elements: gap-3, gap-4
- Section spacing: space-y-6, space-y-8

**Dashboard Structure**:
```
┌─────────────────────────────────────┐
│  Top Bar (h-16)                     │
├──────┬──────────────────────────────┤
│      │                              │
│ Side │  Main Content Area           │
│ bar  │  (max-w-7xl mx-auto px-6)    │
│(w-64)│                              │
│      │                              │
└──────┴──────────────────────────────┘
```

**Sidebar**: Fixed w-64, dark blue background (bg-primary), white text
**Top Bar**: Fixed h-16, border-b, contains user menu and global actions
**Content**: Responsive padding (px-4 sm:px-6 lg:px-8), max-w-7xl container

---

## Component Library

**Login Page**:
- Centered card on light background
- Logo/brand at top
- Form with email and password fields
- Primary button for submit
- Link to registration

**Navigation Sidebar**:
- Dark blue background (primary color)
- Company logo at top (p-6)
- Menu items with icons (Lucide React): py-2 px-3 rounded-md
- Active state: secondary blue highlight
- White text on dark background

**Top Bar**:
- Left: Breadcrumbs or page context
- Right: Search, notifications, user avatar dropdown
- Height: h-16 with items-center justify-between

**Tables** (Leads List):
- Bordered style with subtle dividers
- Header: bg-muted with text-xs uppercase
- Rows: py-3 px-4, hover state with gentle background
- Actions column: right-aligned icon buttons
- Status badges: Small rounded pills with color coding

**Buttons**:
- Primary: Dark blue background, white text
- Secondary: Bright blue background, white text
- Accent: Green background for success actions
- Icon-only: p-2 square with icon centered

**Cards**: 
- White background, subtle border
- Padding p-6
- Shadow: subtle or none (Linear-style flatness)

**Form Inputs**:
- Border style with rounded-md
- Height h-10
- Focus ring with secondary blue
- Labels: text-sm font-medium mb-2

**Modals/Dialogs**:
- Centered overlay with backdrop blur
- Max-w-lg, rounded-lg
- Header with close button
- Footer with action buttons (right-aligned)

---

## Status Indicators (Lead Status)
- Nuovo: Secondary blue
- Contattato: Yellow/Amber
- Opportunità: Purple
- Chiuso: Accent green

---

## Italian Language UI

**Key Labels**:
- "Accedi" (Login)
- "Registrati" (Register)
- "Email", "Password"
- "Aggiungi Lead" (Add Lead button)
- "Dashboard", "Lead", "Impostazioni"
- "Cerca..." (Search placeholder)
- "Modifica", "Elimina", "Dettagli" (table actions)
- "Salva", "Annulla" (form actions)
- "Nessun risultato" (empty states)

---

## Accessibility

- Focus indicators on all interactive elements
- ARIA labels in Italian
- Keyboard navigation support
- Adequate contrast ratios (WCAG AA)
- Skip navigation links

---

## Images
**No hero images required** - this is a dashboard application focused on data and functionality, not marketing content.
