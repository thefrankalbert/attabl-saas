# KDS Market Benchmark - Competitive Research & UX Patterns

**Author**: Alex (PM Agent)
**Date**: 2026-04-01
**Status**: Complete
**Purpose**: Benchmark top KDS solutions to identify gaps in ATTABL's implementation

---

## Executive Summary

This document synthesizes research across five market-leading Kitchen Display Systems (Toast, Square, Fresh KDS, Lightspeed, Oracle MICROS) plus general KDS UX best practices from design case studies and industry guides. The goal is to establish a clear picture of what "table stakes" features every KDS must have, what differentiating features separate the best from the rest, and what design principles are non-negotiable for kitchen environments.

**Key takeaway**: The KDS market has converged on a set of core patterns (color-coded timers, station routing, bump-to-complete, expo view). Differentiation now comes from intelligent pacing, batch prep views, analytics, and seamless multi-channel order consolidation. Any KDS that lacks the core patterns will feel broken to experienced kitchen staff.

---

## 1. Individual Competitor Profiles

### 1.1 Toast KDS

**Overview**: Hardware + software bundle tightly integrated with Toast POS. Durable hardware rated to 120F / 49C, spill and grease resistant. Runs on Toast's proprietary Flex 3 hardware.

**Key UX Features**:

- **Color-coded ticket headers by age**: Ticket header bar changes color as time elapses (green -> yellow -> red pattern). Configurable time thresholds per restaurant.
- **Flash animation on new/changed tickets**: Visual attention-grab when a ticket arrives or is modified mid-prep.
- **Color-coded modifiers and allergens**: Individual menu items and modifiers can be assigned custom colors from a Light or Dark mode palette. Use cases: item size differentiation, allergy alerts, cross-station item identification.
- **Adjustable text size on-device**: Staff can change text size directly from the overflow menu on each KDS screen. Changing text size also changes ticket card size and the number of visible tickets.
- **Green checkmark per item**: When individual items are fulfilled on a prep station, a green check appears next to the item. Ticket disappears only when all items are checked.
- **Recall and recently fulfilled**: Instantly reopen or review completed tickets for corrections.
- **Multi-language support**: Display names can be customized by language or even emojis per station.
- **Production item counts**: Aggregate counts of items across all open tickets to support batch prep.
- **Course pacing**: Fire tickets on a per-course schedule so all courses arrive together.
- **Multi-channel consolidation**: Dine-in, takeout, delivery, and curbside on a single display.

**Ticket Flow**:

1. Order placed at POS / online -> instant push to KDS
2. Ticket appears with flash animation, green header
3. Header transitions yellow -> red based on configured time thresholds
4. Staff taps individual items to mark fulfilled (green check)
5. When all items fulfilled, ticket auto-bumps (disappears)
6. Ticket moves to "Recently Fulfilled" for recall if needed

**Station Routing**: Items route to specific prep stations based on menu item configuration. Expo station shows all items across all stations with per-item fulfillment status.

---

### 1.2 Square KDS

**Overview**: Android-based app that connects with Square POS ecosystem. Runs on commercial tablets and touchscreens (Microtouch, Elo, Samsung Galaxy Tab, Lenovo M10).

**Key UX Features**:

- **Two station roles**: Prep (granular item-level view) and Expo (order-level view bridging FOH/BOH).
- **Gray dot system for prep-to-expo**: When a prep station marks an item complete, a gray dot appears next to that item on the Expo screen. Simple, low-cognitive-load visual.
- **Ticket color-coding by fulfillment type**: Different background colors for dine-in vs. takeout vs. delivery orders.
- **Customizable layout**: Toggle between layouts optimized for different text sizes and ticket density.
- **Auto-text on pickup completion**: Automatically texts diners when their pickup order is marked complete.
- **Item priority by time delay**: Customizable time-based priority system.
- **Single-tap completion**: Tap an item to mark done, or tap the ticket header to complete the entire order.
- **Third-party order integration**: Pulls in DoorDash, Uber Eats, etc. automatically.

**Ticket Flow**:

1. Order placed -> appears on relevant Prep station(s)
2. Prep staff tap individual items as completed
3. Gray dot appears on Expo screen for each completed item
4. Expo staff verifies all items, bumps the full ticket
5. For pickup: auto-SMS sent to customer

**Station Routing**: Items route to Prep stations by category. Expo sees all. Orders don't physically "move" between devices -- visual indicators sync state.

---

### 1.3 Fresh KDS

**Overview**: Software-only KDS that integrates with multiple POS systems (Square, Clover, Toast, Lightspeed, etc.). Runs on iPads and Android tablets. Known for flexibility and independent operation.

**Key UX Features**:

- **Three display modes**:
  - **Classic View**: Single horizontal row, left-to-right. Mimics traditional paper ticket rail. Most familiar to experienced kitchen staff.
  - **Tiled View**: Grid layout, top-to-bottom then left-to-right. Maximizes ticket density on screen.
  - **Split View**: Two horizontal rows split by order type (e.g., dine-in on top, takeout on bottom).
- **Each mode available in Light, Dark, or System Settings theme**.
- **Keyword-based modifier styling**: Color and text formatting applied automatically when specific keywords appear (e.g., "allergy" triggers red highlight, "extra" triggers bold).
- **Automatic order sorting by prep/pickup time**: Orders auto-reorder so the team always works on what's due next.
- **Ticket rearrangement and pausing**: Manually drag tickets to reorder, or pause a ticket until the right time to prep.
- **Real-time ingredient totals**: Aggregate ingredient counts across all open orders for batch prep.
- **Real-time performance analytics on-screen**: Average ticket times, order counts, and status breakdowns displayed directly on the KDS.
- **Long ticket pagination**: Long tickets break into multiple cards so all content is visible without scrolling.
- **Multi-POS integration**: Single KDS screen can aggregate orders from multiple POS systems.
- **Customizable sounds per event type**: Different audio alerts for new orders, updates, etc.

**Ticket Flow**:

1. Order arrives from any connected POS or online platform
2. Auto-sorted by prep/pickup time priority
3. Staff works left-to-right (Classic) or top-down (Tiled)
4. Items bumped individually or as full tickets
5. Analytics update in real-time on screen

**Station Routing**: Configurable per item category. Supports prep -> expo chain. Can consolidate identical items across tickets into a batch view.

---

### 1.4 Lightspeed KDS

**Overview**: Integrated with Lightspeed Restaurant K-Series POS. Cloud-based, $30 USD/month per screen. Claims 5-minute setup.

**Key UX Features**:

- **Three-stage color timer**: Ticket header transitions green -> yellow -> red. Configurable thresholds per order type (dine-in vs. takeout can have different urgency timers).
- **Order status sequence**: New -> Preparing -> Ready to Collect -> Completed. Each status is a manual "bump".
- **Course pacing with Meal-Pacing AI**: Factors item cook times, seat numbers, and promise-to-table timestamps. Auto-fires courses to arrive within +/- 30 seconds of each other.
- **Consolidated items list**: Groups identical items from all tickets into a batch view for faster prep (e.g., "6x Caesar Salad across tables 3, 7, 12").
- **Custom production instructions**: Kitchen-specific instructions that don't appear on guest checks.
- **Automatic allergen highlights**: Allergens flagged automatically on kitchen tickets based on menu item metadata.
- **Diner name display**: Shows the customer's name for personalized service.
- **Multi-channel consolidation**: DoorDash, Uber Eats, Grubhub, and direct online orders in one queue.
- **Table pacing** (March 2026): Coordinates timing across an entire table, not just individual courses.
- **Multi-location support**: Consistent configuration across chains.

**Ticket Flow**:

1. Order placed at POS or online channel -> instant sync to KDS
2. Ticket appears as "New" (green header)
3. Staff bumps to "Preparing" (yellow transition)
4. Header turns red if exceeding time threshold
5. Staff bumps to "Ready to Collect"
6. FOH picks up, marks "Completed"

**Station Routing**: Named stations (e.g., "Grill", "Cold Service", "Bar"). Items auto-route based on configuration. Single-screen mode also available.

---

### 1.5 Oracle MICROS KDS

**Overview**: Enterprise-grade KDS for large restaurant operations, hotels, and chains. Hardware includes KDC-210 controller, 23.8" touchscreen (1920x1080), IP-54 rated. Supports bump bars (10 or 20 key).

**Key UX Features**:

- **Two display modes**:
  - **Chit Mode**: Traditional ticket cards, scrolling left/right one chit at a time.
  - **List Mode**: Vertical list scrolling up/down, line by line.
- **8-level priority system**: Priority 1 (highest) through Priority 8 (lowest). Priority shown in top-right corner of chit (chit mode) or Attn column (list mode). Supports VIP, Rush, and Recalled priority overrides.
- **Menu Item Class sorting**: Items with "KDS Sort Priority Above Normal" enabled automatically sort their containing tickets ahead of standard tickets.
- **Combo meal indentation**: Combo components display indented beneath the combo name for clear visual hierarchy.
- **Cook Summary window**: Orders sorted by status in a consolidated view, accessed via toolbar or bump bar.
- **Color-coded orders by source**: Different colors for POS, website, and mobile app orders.
- **Integrated soundbar option**: Water-resistant 2.5W stereo speakers with distinct audio alerts for new tickets, changes, and overdue tickets. Includes IR proximity sensor.
- **Bump bar support**: Physical button bar for hands-free operation (10 or 20 key). Critical for gloved/wet-hand environments.
- **Ventless, IP-54 rated hardware**: Sealed against humidity, grease, and airborne contaminants.

**Ticket Flow**:

1. Order placed at POS -> routed through KDC-210 controller to appropriate KDS clients
2. Ticket appears in chit or list mode
3. Manager can assign Priority 1-8, VIP, or Rush status
4. Staff bumps items or full tickets via touchscreen or bump bar
5. Tickets with same priority sort by arrival time

**Station Routing**: Full suborder routing. Items decompose to prep stations, then roll up to expo. Supports complex multi-station kitchens typical of hotels and large restaurants.

---

## 2. Section A: Common UX Patterns Across All Top KDS

These are **table stakes** -- features that ALL market leaders implement. Missing any of these will make a KDS feel incomplete to experienced restaurant staff.

### 2.1 Real-Time Order Push

- Orders appear on KDS instantly when placed at POS or online
- Zero manual refresh required
- New ticket notification (visual flash/animation + optional audio)

### 2.2 Color-Coded Time-Based Urgency

- Ticket header or border changes color as time elapses
- Universal pattern: **Green** (on time) -> **Yellow/Orange** (approaching limit) -> **Red** (overdue)
- Configurable time thresholds (typically per order type)
- Timer visible on each ticket showing elapsed time

### 2.3 Station/Zone Routing

- Items route to specific prep stations based on menu item categories
- Each station sees only its relevant items
- Expo/expeditor station sees all items across all stations

### 2.4 Bump-to-Complete Workflow

- Single tap or bump bar press to mark items or tickets as done
- Item-level granularity (mark individual items, not just whole tickets)
- Ticket auto-removes from queue when all items are fulfilled

### 2.5 Order Type Differentiation

- Visual distinction between dine-in, takeout, delivery, curbside
- Typically via ticket background color or badge/icon
- All order types on a single screen (no switching between views)

### 2.6 Modifier and Special Instructions Display

- Modifiers listed beneath each item, visually distinct from item name
- Special instructions/comments clearly visible
- Allergens highlighted (color, icon, or both)

### 2.7 Ticket Recall

- Ability to recall recently completed tickets
- Used for corrections, reprints, or quality checks
- Accessed via dedicated button or gesture

### 2.8 Multi-Channel Order Consolidation

- Online orders (website, delivery apps) appear alongside POS orders
- Source identified visually (badge, color, or label)
- Single unified queue

### 2.9 Adjustable Display Density

- Text size adjustment (affects ticket size and visible ticket count)
- Multiple layout options (grid, list, horizontal rail)
- Adapts to screen size (tablet through 22" commercial display)

### 2.10 Audio Notifications

- Sound alert on new ticket arrival
- Distinct sound for ticket modifications/updates
- Optional alert for overdue tickets

---

## 3. Section B: Differentiating Features

Features that only the best KDS solutions implement. These represent opportunities for competitive advantage.

### 3.1 Intelligent Course/Meal Pacing (Lightspeed, Toast)

- AI-driven course firing that factors cook times, seat count, and promise times
- Auto-delays shorter-cook-time items so all courses arrive simultaneously
- Reduces "cold food" complaints and expo coordination burden
- **Competitive edge**: Lightspeed's +/- 30-second arrival window is industry-leading

### 3.2 Batch Prep / Ingredient Aggregation (Fresh KDS, Lightspeed, Toast)

- Consolidates identical items across all open tickets into one count
- "You need 8 Caesar Salads across 5 tables" view
- Real-time ingredient totals across all active orders
- **Competitive edge**: Dramatically speeds up high-volume kitchens

### 3.3 Keyword-Based Modifier Auto-Styling (Fresh KDS)

- Automatic color/formatting rules based on modifier keywords
- "allergy" -> red bold, "extra" -> blue, "no [item]" -> strikethrough
- No manual configuration per modifier -- pattern matching handles it
- **Competitive edge**: Reduces configuration burden and catches edge cases

### 3.4 On-Screen Real-Time Analytics (Fresh KDS)

- Average ticket time, order count, status breakdown visible on KDS itself
- Kitchen staff see performance metrics without leaving the ticket view
- **Competitive edge**: Drives accountability and continuous improvement in real-time

### 3.5 8-Level Priority System with VIP/Rush Overrides (Oracle MICROS)

- Granular priority (1-8) plus special Rush and VIP flags
- VIP and Rush always sort above numbered priorities
- Menu item classes can auto-elevate ticket priority
- **Competitive edge**: Essential for hotels and fine dining with VIP workflows

### 3.6 Physical Bump Bar Support (Oracle MICROS, Shift4)

- 10 or 20 key wired/wireless bump bars
- Allows hands-free operation when hands are wet, gloved, or greasy
- Haptic feedback designed for glove use
- **Competitive edge**: Critical for high-hygiene environments (hotels, catering)

### 3.7 Automatic Customer Notification (Square)

- Auto-SMS to customer when pickup order marked complete
- No FOH intervention needed
- **Competitive edge**: Reduces counter congestion and staff interruptions

### 3.8 Split View by Order Type (Fresh KDS)

- Screen divided into zones by order type (dine-in top, takeout bottom)
- Each zone scrolls independently
- **Competitive edge**: Kitchens that handle high volumes of mixed order types

### 3.9 Ticket Drag-and-Reorder (Fresh KDS)

- Manually rearrange ticket position in the queue
- Pause tickets and resume later
- **Competitive edge**: Kitchen manager flexibility for real-world chaos

### 3.10 Colorblind Accessibility Mode (Multiple)

- Alternative color schemes for color-vision-deficient staff
- Uses patterns/shapes in addition to color for status indication
- **Competitive edge**: Inclusive design, legally relevant for larger employers

### 3.11 Multi-POS Aggregation (Fresh KDS)

- Single KDS connects to multiple POS systems simultaneously
- Critical for food halls, shared kitchens, ghost kitchens
- **Competitive edge**: Unique operational flexibility

### 3.12 Combo Meal Visual Hierarchy (Oracle MICROS)

- Combo components indented beneath combo name
- Clear parent-child relationship in ticket layout
- **Competitive edge**: Reduces errors for complex menu structures

---

## 4. Section C: Design Principles for Kitchen Environments

### 4.1 Typography and Readability

| Element                       | Minimum Size | Recommended Size  | Notes                                     |
| ----------------------------- | ------------ | ----------------- | ----------------------------------------- |
| Item name                     | 18px / 14pt  | 22-28px / 16-20pt | Must be readable at 3-5 feet distance     |
| Modifier text                 | 14px / 11pt  | 16-20px / 12-14pt | Slightly smaller than item, still legible |
| Ticket header (table/order #) | 20px / 15pt  | 24-32px / 18-24pt | Largest text on ticket, scanned first     |
| Timer/elapsed time            | 16px / 12pt  | 18-24px / 14-18pt | Always visible, often in header bar       |
| Quantity                      | 20px / 15pt  | 24-28px / 18-20pt | Bold, high contrast, left-aligned         |

**Font choice**: Sans-serif only. High x-height fonts (Roboto, Inter, SF Pro, Noto Sans) for maximum legibility. Avoid thin/light weights -- medium or bold minimum.

**Line spacing**: 1.4-1.6x line height minimum. Kitchen staff scan vertically; tight line spacing causes errors.

### 4.2 Color Contrast Requirements

| Context                          | Requirement                           | Rationale                                          |
| -------------------------------- | ------------------------------------- | -------------------------------------------------- |
| Text on ticket background        | WCAG AAA (7:1 contrast ratio minimum) | Steam, grease, and glare reduce effective contrast |
| Status colors (green/yellow/red) | Must be distinguishable at 5+ feet    | Peripheral vision detection                        |
| Dark mode default                | Recommended for most kitchens         | Reduces glare, less eye strain in mixed lighting   |
| Light mode option                | Required for bright/outdoor kitchens  | Some environments have strong ambient light        |
| Anti-glare considerations        | Use matte/frosted UI elements         | Glossy surfaces reflect kitchen lighting           |

**Color palette guidance**:

- Green (on time): #22C55E or similar, but NOT neon -- should be calm
- Yellow/Orange (warning): #F59E0B or #EAB308 -- high visibility, no alarm
- Red (overdue): #EF4444 -- unmistakable urgency
- Background (dark mode): #1A1A2E or #0F172A -- deep, non-reflective
- Background (light mode): #F8FAFC -- warm white, not pure white (reduces glare)
- Ticket card: Slight elevation/shadow to distinguish from background

### 4.3 Touch Target Sizes

| Element                  | Minimum Size   | Recommended Size | Notes                                  |
| ------------------------ | -------------- | ---------------- | -------------------------------------- |
| Bump/complete button     | 44x44px (WCAG) | 48-60px          | Wet/gloved fingers need larger targets |
| Individual item tap area | 44px height    | 48-56px height   | Full-width row, not small checkbox     |
| Navigation buttons       | 44x44px        | 48x48px          | Bottom or side of screen               |
| Ticket header tap area   | 48px height    | 56-64px height   | Used to bump entire ticket             |

**Critical consideration**: Kitchen staff often have wet, greasy, or gloved hands. Touch targets should be 10-20% larger than standard mobile guidelines. Gap between adjacent touch targets should be minimum 8px to prevent mis-taps.

### 4.4 Animation and Motion Guidelines

| Pattern                  | Duration            | Purpose                           | Notes                                                |
| ------------------------ | ------------------- | --------------------------------- | ---------------------------------------------------- |
| New ticket entrance      | 200-300ms           | Draw attention to new order       | Flash/pulse, not slide-in (needs instant visibility) |
| Ticket removal (bump)    | 150-250ms           | Confirm action, smooth transition | Fade-out or slide-off. Remaining tickets reflow.     |
| Timer color transition   | 500ms ease          | Gradual urgency change            | No jarring snap -- gradual blend                     |
| Priority change          | 200ms + brief pulse | Confirm priority assignment       | Ticket briefly highlights then settles               |
| Error/modification alert | 300ms + 2-3 pulses  | Urgent attention needed           | Ticket border or header flashes                      |

**Core principle**: Kitchen staff GLANCE, they don't STARE. Animations must communicate state changes in peripheral vision within 200-300ms. Avoid:

- Animations longer than 500ms (blocks visual scanning)
- Continuous animations (distracting, increases cognitive load)
- Slide-from-edge animations for new tickets (too slow to register)
- Auto-scrolling (disorienting when staff looks away and back)

### 4.5 Sound and Notification Patterns

| Event                   | Sound Character                | Duration        | Notes                          |
| ----------------------- | ------------------------------ | --------------- | ------------------------------ |
| New order               | Short chime/ding               | 0.3-0.5s        | Distinct but not alarming      |
| Order modification      | Double-tap/click               | 0.3s            | Different from new order       |
| Rush/priority order     | Urgent tone (higher pitch)     | 0.5-0.8s        | Must cut through kitchen noise |
| Overdue ticket          | Repeating alert (every 30-60s) | 0.5s per repeat | Persistent but not constant    |
| All clear (queue empty) | Soft confirmation              | 0.3s            | Optional, morale boost         |

**Volume**: Must be adjustable. Kitchen noise levels range from 70-95 dB. Alerts should be 10-15 dB above ambient. Some systems add visual flash when audio may not be heard.

**Key insight from Oracle MICROS**: Water-resistant speakers are important. Standard tablet speakers are often insufficient for kitchen noise levels.

---

## 5. Section D: Ticket Layout Best Practices

### 5.1 Ticket Anatomy (Top to Bottom)

```
+------------------------------------------+
| [STATUS COLOR BAR - full width]          |
|                                          |
| [Order Type Icon] #247  Table 12    3:42 |
| Server: Maria          [PRIORITY BADGE]  |
|------------------------------------------|
| 1x  Grilled Salmon                      |
|     - No butter (ALLERGY)               |
|     - Extra lemon                        |
|                                          |
| 2x  Caesar Salad                         |
|     - Dressing on side                   |
|                                          |
| 1x  Truffle Fries                        |
|------------------------------------------|
| [SPECIAL INSTRUCTIONS / COMMENTS]        |
| "Birthday dinner - add candle to dessert"|
+------------------------------------------+
```

### 5.2 Ticket Header (Top Section)

| Element             | Position                   | Styling               | Purpose                                |
| ------------------- | -------------------------- | --------------------- | -------------------------------------- |
| Status color bar    | Top edge, full width       | Green/Yellow/Red fill | Instant status recognition at distance |
| Order number        | Top-left                   | Large, bold           | Primary identifier                     |
| Table/customer name | Top-right or after order # | Bold                  | Location context                       |
| Elapsed timer       | Top-right                  | Monospace, updating   | Time pressure awareness                |
| Server name         | Below order #              | Regular weight        | Communication context                  |
| Order type badge    | Top-left corner            | Icon + color          | Dine-in/Takeout/Delivery at a glance   |
| Priority badge      | Top-right corner           | Bright color, icon    | VIP/Rush/Priority level                |

### 5.3 Item List (Middle Section)

| Element            | Styling                                     | Notes                                 |
| ------------------ | ------------------------------------------- | ------------------------------------- |
| Quantity           | Bold, left-aligned, same size as item name  | Must be instantly scannable           |
| Item name          | Bold or semi-bold, primary text color       | Primary information                   |
| Modifiers          | Indented, slightly smaller, secondary color | Visually subordinate to item name     |
| Allergen modifiers | Red or orange, bold, possibly with icon     | MUST stand out from regular modifiers |
| Removed items      | Strikethrough or "NO" prefix in red         | Clear negative indication             |
| Added items        | Green "ADD" prefix or plus icon             | Clear positive indication             |
| Comments per item  | Italic or distinct color, indented          | Differentiated from modifiers         |
| Fulfilled items    | Green checkmark or strikethrough            | Visual progress indication            |

### 5.4 Footer (Bottom Section)

| Element               | Purpose                               | Notes                               |
| --------------------- | ------------------------------------- | ----------------------------------- |
| Ticket-level comments | Special instructions for entire order | Visually distinct box or background |
| Course indicator      | Which course this ticket represents   | Color-coded bar or label            |
| Item count summary    | "3 items"                             | Quick verification                  |

### 5.5 How Urgency Is Communicated

Urgency uses a **layered approach** -- no single signal carries all the information:

1. **Color** (primary): Header bar color transition green -> yellow -> red
2. **Timer** (secondary): Elapsed time displayed numerically
3. **Position** (tertiary): Some systems auto-sort overdue tickets to the left/top
4. **Sound** (quaternary): Audio alert when threshold crossed
5. **Animation** (quinary): Subtle pulse or flash on threshold crossing
6. **Priority badge** (explicit): Manual VIP/Rush flag from manager

### 5.6 How Items Are Grouped

| Strategy             | When Used               | Implementation                                  |
| -------------------- | ----------------------- | ----------------------------------------------- |
| By ticket (default)  | Standard service        | All items for one order on one card             |
| By course            | Fine dining             | Separate cards per course, fired sequentially   |
| By station           | Multi-station kitchen   | Items decomposed to relevant stations           |
| By item type (batch) | High-volume/fast-casual | Identical items across tickets consolidated     |
| By order type        | Mixed dine-in/takeout   | Split view with separate zones                  |
| By time priority     | All contexts            | Auto-sort by due time (pickup time, table wait) |

---

## 6. Feature Comparison Matrix

| Feature                      | Toast            | Square             | Fresh KDS     | Lightspeed | Oracle MICROS |
| ---------------------------- | ---------------- | ------------------ | ------------- | ---------- | ------------- |
| Real-time order push         | Yes              | Yes                | Yes           | Yes        | Yes           |
| Color-coded urgency timer    | Yes              | Limited            | Yes           | Yes        | Yes           |
| Green/Yellow/Red progression | Yes              | No (color by type) | Yes           | Yes        | Yes           |
| Station routing              | Yes              | Yes                | Yes           | Yes        | Yes           |
| Expo view                    | Yes              | Yes                | Yes           | Yes        | Yes           |
| Item-level bump              | Yes              | Yes                | Yes           | Yes        | Yes           |
| Ticket recall                | Yes              | Yes                | Yes           | Yes        | Yes           |
| Order type badges            | Yes              | Yes                | Yes           | Yes        | Yes           |
| Allergen highlighting        | Yes              | Basic              | Yes (keyword) | Yes (auto) | Yes           |
| Course pacing                | Yes              | No                 | No            | Yes (AI)   | Yes           |
| Batch prep view              | Yes              | No                 | Yes           | Yes        | No            |
| On-screen analytics          | No               | No                 | Yes           | No         | No            |
| Bump bar support             | No               | No                 | No            | No         | Yes           |
| Multi-POS support            | No               | No                 | Yes           | No         | No            |
| Split view by type           | No               | No                 | Yes           | No         | No            |
| Ticket reorder/pause         | No               | No                 | Yes           | No         | Yes           |
| Auto-customer SMS            | No               | Yes                | No            | No         | No            |
| Priority levels (8)          | No               | No                 | No            | No         | Yes           |
| VIP/Rush flags               | No               | No                 | No            | No         | Yes           |
| Colorblind mode              | Toast Dark/Light | No                 | Yes           | No         | No            |
| Ingredient aggregation       | Partial          | No                 | Yes           | Yes        | No            |
| Multi-language               | Yes              | No                 | No            | No         | Yes           |
| Dark mode                    | Yes              | No                 | Yes           | No         | Yes           |
| Adjustable text size         | Yes              | Yes                | Yes           | Implied    | Yes           |
| Combo item hierarchy         | No               | No                 | No            | No         | Yes           |
| Custom sounds per event      | Basic            | Basic              | Yes           | Basic      | Yes           |

---

## 7. Implications for ATTABL KDS

### Must-Have (Table Stakes)

These features must be present for ATTABL's KDS to be taken seriously:

1. Real-time order push with sub-second latency
2. Color-coded time-based urgency (green/yellow/red header bar with configurable thresholds)
3. Station routing with expo view
4. Item-level bump-to-complete with visual progress (checkmarks)
5. Order type visual differentiation (dine-in / takeout / delivery badges)
6. Modifier and allergen display with color highlighting
7. Ticket recall for recently completed orders
8. Adjustable text size and display density
9. Audio notification for new and modified orders
10. Elapsed time timer on every ticket
11. Dark mode (kitchen default) and light mode option
12. Multi-channel order consolidation (QR, POS, online)

### Should-Have (Competitive Parity)

Features that put ATTABL on par with the best:

1. Keyword-based modifier auto-styling (Fresh KDS pattern)
2. Multiple display modes (Classic rail, Tiled grid, Split by type)
3. Batch prep / ingredient aggregation view
4. Course pacing support
5. Ticket drag-to-reorder and pause capability
6. Auto-customer notification when order is ready
7. Colorblind accessibility mode

### Could-Have (Differentiators)

Features that could give ATTABL a unique edge:

1. On-screen real-time analytics (Fresh KDS is the only one doing this well)
2. AI-powered meal pacing (Lightspeed just launched this)
3. Multi-language with emoji support (relevant for ATTABL's African market)
4. Priority system with VIP flags (relevant for hotel clients like Radisson)
5. Integrated customer feedback loop (QR order -> KDS -> customer notified -> customer rates)

---

## 8. Sources

### Product Pages

- [Toast KDS - Hardware](https://pos.toasttab.com/hardware/kitchen-display-system)
- [Toast KDS - Platform Guide Overview](https://doc.toasttab.com/doc/platformguide/platformKDSOverview.html)
- [Toast KDS - Ticket Configuration](https://doc.toasttab.com/doc/platformguide/platformKitchenConfiguringTickets.html)
- [Toast KDS - Color-Code Modifiers](https://central.toasttab.com/s/article/Kitchen-Tickets-Print-Default-Modifiers-Black-Selected-Modifiers-Red-1492786557965)
- [Square KDS](https://squareup.com/us/en/point-of-sale/restaurants/kitchen-display-system)
- [Square KDS - Complete and Recall Orders](https://squareup.com/help/us/en/article/8171-complete-orders-with-square-kds)
- [Square KDS - Setup Guide](https://squareup.com/help/us/en/article/7944-get-started-with-square-kds-android)
- [Fresh KDS - Features](https://www.fresh.technology/kitchen-display-system)
- [Fresh KDS - Classic View](https://www.fresh.technology/kds-features/classic-view)
- [Fresh KDS - 17 Must-Have Features](https://www.fresh.technology/blog/kitchen-display-system-features-you-need)
- [Fresh KDS - Display Modes](https://www.fresh.technology/blog/kds-display-modes)
- [Lightspeed KDS](https://www.lightspeedhq.com/pos/restaurant/kitchen-display-system/)
- [Lightspeed KDS 2.0 - Using Guide](https://k-series-support.lightspeedhq.com/hc/en-us/articles/22708154090267-Using-the-Kitchen-Display-System-2-0)
- [Lightspeed KDS - About](https://k-series-support.lightspeedhq.com/hc/en-us/articles/4418209500443-About-the-Lightspeed-Kitchen-Display-System)
- [Lightspeed - March 2026 Update (Table Pacing)](https://k-series-support.lightspeedhq.com/hc/en-us/articles/47746434645275-What-s-new-March-2026-Table-pacing-digital-checklists-reservations-and-more)
- [Oracle MICROS KDS - Features](https://docs.oracle.com/cd/E76065_01/doc.29/e69880/c_featuresandupdates_kds.htm)
- [Oracle MICROS KDS - Chit Layouts](https://docs.oracle.com/cd/E76065_01/doc.29/e69879/r_kds_chit_layouts.htm)
- [Oracle MICROS KDS - Priority](https://docs.oracle.com/cd/F32325_01/doc.192/f32331/c_kds_prioritize_mi.htm)
- [Oracle MICROS KDS - Restaurant Page](https://www.oracle.com/food-beverage/restaurant-pos-systems/kds-kitchen-display-systems/)

### UX Design Case Studies

- [KDS UX Case Study - Osama Haashir (Medium)](https://medium.com/@osamahaashir/cooking-up-success-revamping-kitchen-display-system-kds-ux-case-study-6a6c92784fb9)
- [KDS Product Design Case Study - Gwenn Le Pechoux (Medium)](https://gwenndesign.medium.com/product-design-case-study-kitchen-display-system-52a5e9cab81e)
- [KDS UI Design - Kohli Design](https://www.kohli.design/work/kitchen-display-system)
- [KDS UI/UX Design - Behance (Istiak Remon)](<https://www.behance.net/gallery/187918001/Kitchen-Display-Systems-(KDS)-UX-Design-UI-Design>)

### Industry Guides and Best Practices

- [Restaurant365 - KDS Guide](https://www.restaurant365.com/blog/kitchen-display-system/)
- [Chowbus - KDS Everything You Need to Know](https://www.chowbus.com/blog/kds-kitchen-display-system)
- [Webstaurant Store - KDS Guide](https://www.webstaurantstore.com/article/1002/kitchen-display-systems.html)
- [NovaTab - Why Restaurants Need KDS in 2026](https://www.novatab.com/blog/kitchen-display-system-kds-why-every-modern-restaurant-needs-one)
- [TechRyde - KDS Guide 2026](https://www.techryde.com/blog/kitchen-display-system-guide-2026/)
- [Loman AI - 6 Best KDS Systems](https://loman.ai/blog/best-kitchen-display-systems-order-routing)
- [RocketBox - Best KDS Guide 2025](https://blog.rocketbox.io/blog/best-kitchen-display-system)
- [WCAG 2.1 - Touch Target Size Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)
- [Kitchen Bump Bar Solutions - PrehKeyTec](https://www.prehkeytec.com/solutions/industry-solutions/bump-bar/)
