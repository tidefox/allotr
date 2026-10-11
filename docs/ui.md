# Allotr — UI reference

The web app's design system, components, patterns and screens. Decisions:
[ADR 0026](adr/0026-visual-language-v3.md) (visual language),
[0027](adr/0027-navigation-v3.md) (navigation),
[0028](adr/0028-ui-foundation-v2.md) (foundation),
[0029](adr/0029-ui-customisation.md) (customisation, later),
[0016](adr/0016-palette-themes.md) (themes).

The core promise shapes the whole layout: **left today** is the first thing
on every screen, and savings never count toward it.

## 1. Principles

1. **Terminal, not toy.** Flat, square, opaque. A monospace interface on the
   user's terminal palette.
2. **No dead space.** Tiles run edge to edge and stretch to fill. Empty cells
   are blank tiles, never gaps showing the seam colour.
3. **First things first.** The summary bar (left today · on-budget total ·
   pools) is on every screen.
4. **One line per row.** Truncate with "…" and hide columns at narrow widths.
   Never wrap a row.
5. **Mouse-first, touch-friendly, keyboard-complete.** Every action has a
   pointer target, a touch path (long press for moving things) and a key.
6. **Menus, not pickers.** Every choice opens an in-app menu. Native
   `<select>`, date and colour pickers are never used.
7. **Draw the data exactly.** Real axes, exact bar widths, monotone curves,
   and labels in HTML.
8. **The server owns money.** The web app formats amounts, but every sum,
   balance, projection and series comes from the API (architecture §4).
   Two narrow exceptions (ADR 0030): a bar, column or share may be sized
   from a ratio of same-currency server figures, and a form may sum or
   split the amounts the user typed as an input aid. Neither result is
   ever shown as money or sent to the server as fact.
9. **Colour is never the only signal.** Amounts carry a sign and an arrow.
   Status carries text.

## 2. Tokens

### 2.1 Colour (theme roles, ADR 0016)

The interface uses only existing roles, so the theme format does not change.

| Use | Role |
|---|---|
| Tile and content background | `canvas` |
| Title bars, top bar, sidebar, status line, menus, sheets | `chrome` |
| Hover, selected row, bar tracks, raised controls | `card` |
| Seams between tiles and rows (1 px) | `outline-variant` |
| Strong lines: axes, chart borders, control borders, decorative glyphs (tree lines, `[ ]` brackets) | `outline` |
| Primary text | `text` |
| Secondary text, labels, axis labels, units | `text-muted` |
| Accent: selection fill, links, bracket-button labels, focus ring, primary action | `primary` (+ `on-primary` for text on it), `ring` |
| Money in / out / transfer | `positive` / `negative` / `text` (text); `success` / `danger` / `info` (fills and marks) |
| Warnings, bills set aside (borders, marks and fills, never text) | `warning` |
| Left-today edge and figure | `positive` (`hero-tight` / `hero-over` when tight or over) |
| Category, pool and chart series colours | `series-1` … `series-8` |
| Calendar heat | `negative` mixed into `canvas` at 0–55 % (an opaque mix, never transparency) |

Text may use only roles fitted for text (4.5:1): `text`, `text-muted`,
`primary`, `positive`, `negative` and the `on-*` roles. `info`, `success`,
`warning`, `danger`, `outline` and the series roles are fitted for non-text
contrast (3:1), so they colour borders, marks, bars and fills, never text.

`text-muted` is fitted on the page surfaces only (`canvas`, `chrome`,
`card`, `card-raised`), so it keeps the palette's dim tone instead of being
pushed towards `text` by the tinted roles. Text on a container tint or an
accent fill uses `text` or the matching `on-*` role, never `text-muted`.

The default themes, Catppuccin Latte and Mocha, set their own roles in the
family file: a blue `primary` and `ring`, `base` text on the accent, yellow
`warning` and `reserved`, and red `negative`. Other families keep the
default role map.

Do not use translucency (`opacity` or alpha) for surfaces. Use opacity only
on an item while it is being dragged.

### 2.2 Type

| Face | Default | Used for |
|---|---|---|
| Interface & numbers | Geist Mono | Everything by default: buttons, tags, titles, headers, tabs, labels, menus, amounts, times, axes, command line, status line |
| Text | Geist | Content text only: names in rows (payees, accounts, bills, people, budgets), detail values, paragraphs, notes, the log result line |

Numbers use `font-variant-numeric: tabular-nums`. In code, `font-ui` (or
its alias `font-sans`) marks content text; everything else inherits the
interface face.

Interface labels are lower case, as a terminal shows them: navigation,
sub-tabs, tile titles and subtitles, summary and status labels ("left
today", "this cycle", "cover order"). Menu items, sentences, names and
codes keep their usual case.

### 2.3 Scale and sizes

The root is `font-size: 100%` (ADR 0031) and every size is in `rem`. The
table lists design sizes in px; divide by 16 for `rem`. The rendered size
equals the design size.

| Token | Desktop / tablet | Phone (< 600) |
|---|---|---|
| Base text | 13 | 12 |
| Small text (labels, sub-lines) | 11–12 | 10–11 |
| Top bar figure: left today | 34 (≥ 1000) / 26 (≥ 600) | 20 |
| Top bar figure: other | 23 / 19 | 16 |
| Top bar labels and sub-lines | 11 | 10 |
| Top bar pool cell: name / figure | 11 / 15 (≥ 1000), 10 / 12 | 10 / 12 |
| Stat figure (primary / other) | 32 / 26 (≥ 1000), 20 / 20 | 20 / 16 |
| Key figure | 22 (≥ 1000) / 18 | 14 |
| Big figure in tiles | 26 | 20 |
| Title strip height | 36 | 34 |
| Tile title bar height / text | 32 / 12 | 28 / 11.5 |
| Row min height | 30 (46 for tall lists) | 38 |
| Command line height | 42 | 40 |
| Status line height / text | 24 / 11 | — |
| Tab bar button | — | 46 |
| Rail button / sidebar row | 58 / 36 (= title strip) | — |
| Top bar height | 82 (600–999) / 104 (≥ 1000) | auto (two rows) |
| Tile padding | 0 12 10 | 0 12 10 |
| Seam | 1 | 1 |
| Bar height (exact / "left of" / pool) | 8 / 4 / 2–3 | same |

The rendered minimum interactive size must stay ≥ 24 × 24 CSS px (WCAG 2.2
target size).

### 2.4 Breakpoints (container queries on the app frame)

| Width | Navigation | Notes |
|---|---|---|
| < 600 | bottom tab bar | top bar on two rows; extra columns hidden; menus are bottom sheets |
| 600–999 | 72 px icon rail | status line on; menus are popovers |
| ≥ 1000 | 212 px sidebar | list + detail split; top bar shows payday and extras |

Tile grids: 1 column below 720, 2 from 720, 3 from 1100. With the "auto"
column setting, 4 from 1500.

## 3. Shell

```
┌ sidebar ┬ summary bar: left today │ on-budget total │ pools ⊞ │ payday ┐
│ logo    │ (height = logo block)                                         │
├─────────┼ title strip: icon name │ sub-tabs │ … actions │ ⚙ (phone)      │
│ nav row │ (nav rows = title strip height)                               │
│ nav row │ content: tiles                                                │
│ …       │                                                               │
├─────────┼ command line: › input … hints │ [account ▾] │ [+ new] (filled) │
│ settings│ (settings row = command line height, same top edge)           │
└ status line: MODE │ cycle │ payday │ currency │ key hints │ ● synced ───┘
```

- **Summary bar.** Items in order: left today (fixed first) · on-budget total ·
  pools · payday (≥ 1000).
  - Every item has an icon and a lower-case label over its figure, a
    muted sub-line and a "left of" bar. Items sit on 1 px seams.
  - **Left today:** `$36.80 / $55.20` (the allowance a small muted suffix),
    a sub-line with spent and days to payday (`14d to payday`), and a "left"
    bar. Its figure and left edge are `positive`, and it sits on `canvas`.
  - **On-budget total:** "left of" the cycle's on-budget start, with bills
    set aside and free money in the sub-line.
  - **Pools:** a grid of cells, each with an icon for its kind (spending or
    savings) in its series colour, name, balance, a ● if it counts toward
    the daily number, and a "left of" bar for on-budget pools. Pools that do
    not count show a muted figure. From 600 px they form two rows when
    there are more than two pools. Below 600 px they form one row, four
    visible, and the rest scroll sideways.
  - **Payday** (≥ 1000): days left (`14d`), the date and `day 15/28`, and a
    bar of the days left. Days are counted from dates.
  - Each item links to its screen.
- **Title strip.**
  - Sits on `canvas`, parts split by 1 px seams. The screen's icon (in
    `primary`) and name, then either its sub-tabs (full-height cells,
    selected = filled `primary`), the screen's own controls (search, period,
    filter with a count badge) or, on the dashboard, a context line:
    `fri oct 09 · week 41 · payday fri oct 23`. The layout button comes
    with the dashboard layout editor (ADR 0029, later).
  - On phones the label is hidden and a gear opens Settings.
- **Command line.**
  - Sits on `canvas`. `›` prompt and an input for the grammar
    ([grammar.md](grammar.md)).
  - Key hints (≥ 600): `/ focus · ⏎ log`.
  - An account menu: a full-height strip button with a wallet icon, the
    account's name (hidden on phones) and ▾, named "Account to log into".
  - A filled **+ new** menu: expense, income, transfer, split with people,
    payday, bill, IOU. Expense, income and transfer open a form in a bottom
    sheet over the quick entry draft; the "into" account and "transfer from
    here" preset its account. An expense can still be spread over categories
    with its `[split across categories]` lines. **Split with people** records
    a new expense shared with people: the amount is the whole bill, each
    person owes an even share until typed, and the server keeps the rest as
    the user's own share (one IOU request). Payday and IOU open the Budget
    screen's sheets. **Bill** opens a create-bill sheet (name, paying account,
    amount, due day of the month from a menu, optional category); the Bills
    tab has the same `[+ bill]`.
  - After logging, a result line slides up over the content with the amount,
    category, account, "left today" and **undo**.
- **Navigation.** Phone: square bar fixed to the bottom, five equal buttons,
  icon and short label, selected = filled. Rail: icon and short label.
  Short labels: dash, accts, txns, budget, reports, settings; each link is
  still named in full for assistive technology. Labels and icons are muted
  until selected. Sidebar: the `▍allotr` wordmark with the user's name
  under it in the logo block, then rows with icon, full label and key
  number, selected = filled full width; settings at the foot (icon only on
  the rail).
- **Status line** (≥ 600): mode block (filled, the current screen:
  `DASH`, `BUDGET`…), `cycle 15/28`, `payday fri oct 23 · 14d`, currency
  code, key hints, and on the right the sync state with the time of the
  last refresh (`● synced 12:31`). Segments are split by 1 px seams. When a new service worker is waiting, an
  `update` item shows before the sync state: "new version ready" with
  `[reload]` and `[later]`. Reloading is the user's choice, so a typed entry is
  never thrown away. On phones, where the status line is hidden, the same
  offer is a one-line bar (chrome, `primary` text) between the command line
  and the tab bar. It takes no room until a version waits, and its polite
  live region announces it.
- **Overlay scrollbar.** Hide the native bar. Draw a 4 px thumb (7 px on hover
  or drag) over the right edge, which can be dragged, and clicking the track
  scrolls a page. It takes no width.

## 4. Components

| Component | Spec |
|---|---|
| **Tile** (`pane`) | `canvas` background. A title bar on `chrome`: a muted icon, the title (semibold) and a muted subtitle on one truncated line, actions on the right. The body starts 8 px below it and is padded 0 12 10. Focused or primary tiles get a 3 px `primary` inset on the title bar and a `primary` title. Seams come from each tile's own 1 px outline, so empty grid cells show `canvas`. A tile spans 1 or 2 columns, `w3` (3 columns from 1500 px, the full width below) or the full width, and 1 or 2 rows (`h2`, from two columns). |
| **Grid / Stack / Split** | Grid: fixed column counts as in §2.4, `dense` flow, tiles stretch per row, the last row fills to the bottom. Stack: vertical, the last child grows. Split: list + 400 px detail (≥ 1000), the list alone below; `even` shares the width 1.6 : 1 from 1000 and stacks both below. |
| **Row** | One line, `min-height` per §2.3, 1 px seams. Hover and selection span the full tile width. Selection = `card` fill plus a 3 px `primary` inset. Columns come from a per-row template with tablet and phone variants. Hidden columns are removed, not wrapped. |
| **Tree row** | A 24 px lead column: a fold handle (▾ / ▸, keyboard expandable) on parents, or `├` / `└` in `outline` on children. Parents are bold and show the server's `parents` totals (never summed in the browser). React Aria `Tree`. |
| **Amount** | Number font, tabular. `↓ −$14.00` `negative`, `↑ +$2,140.00` `positive`, `↔ $150.00` `text`. Always one formatter (§5.1). |
| **Bracket button** | `[pay]`, with no space inside the brackets, in the surrounding text size. Brackets in `outline`, label in `primary`. Destructive actions in `negative`. An icon goes before the label. Minimum target 26 design px. Links (`[all]`, `[history]`) use the same face. |
| **Primary button** | Filled `primary` with `on-primary`. One per strip (for example **+ new**). |
| **Menu button** | Bordered (`ddb`, 28 px): muted label, value, ▾; with no value the label shows alone (`sort ▾`). Opens a menu. The strip variant is a full-height `hbtn` (icon, value or label, ▾ unless left out, an optional filled count); the bracket variant is `[⋮]`, named by its label. |
| **Toggle group** | Bordered segments. The pressed segment is filled `primary`. |
| **Tag** | Bordered, number font, 11 px: `3d`, `9d late`, `✓ paid`, `review`. Colour by meaning: `negative` and `positive` colour the label and border; muted text has an `outline` border; `warning` colours the border and keeps a `text` label. |
| **Chip** | A filter chip: a muted kind, the value and a remove (×) button. Lives in the chip bar above a list. |
| **Menu** | React Aria `Menu` inside a `Popover` (≥ 600) or a `Modal` bottom sheet (< 600) with a title and a close button. Sections with uppercase headers, radio and checkbox items, nested groups with fold handles, key hints on the right. Rows are 30 px in popovers and 44 px in sheets. Arrow keys move, → / ← fold, Esc closes. A menu re-anchors to the same control after a re-render. |
| **Sheet** | A bottom sheet on `chrome` with a 2 px `primary` top edge and up to 84 % of the height. Used for menus and for details below 1000 px. |
| **Bar** | Exact width on a `card` track, filled `primary` or a category's series colour. A 1 px `text` tick at even pace (days elapsed ÷ period length) reaching 3 px past the track above and below. Over budget fills `negative`. |
| **"Left of" bar** | 2–4 px, showing what remains. Used in the top bar, stats, pools and bills. |
| **Share bar** | Stacked flex segments with 1 px gaps. Used for pools, categories and IOUs. |
| **Allocation** | Stacked bar of the cycle's on-budget money: bills paid · to savings · spent · other · bills set aside · free to spend. "Other" is what the other parts do not explain (money lent, conversions) and may be negative; like any negative part it has an empty share. A 22 px bar; a `text` bracket under the last two reads "on-budget left $X of $Y". Below, a legend strip of seamed cells running to the tile edges (`minmax(130px, 1fr)` columns, 3 on phone): swatch, label, amount (17 px semibold, free money in `positive`) and share. Fills: bills paid `outline`, savings and spent series colours, set aside `reserved`, free `success`. |
| **Stats** | 4 tiles (2 × 2 on phone): label with icon, figure, sub-line, optional "left of" bar. The primary stat gets a 3 px edge and a larger figure: `positive` (the figure in `positive` too) or `primary`. |
| **Key figures** | One line of up to 4 label-over-figure pairs, each as wide as its content (gap 26 px) and truncated with "…". |
| **Formula line** | The daily number as a sum: `on-budget $1,240.00 − bills $412.00 = free $828.00 ÷ 15 days = $55.20/day`. One line ending in "…" on phone. |
| **Chart** | A y-axis label column, then a plot with 1 px gridlines, then x labels. SVG marks in a 0–100 viewBox with `preserveAspectRatio="none"` and `vector-effect: non-scaling-stroke`. Lines use monotone cubic interpolation. An area fill mixes the series colour into `canvas` at 16 % (opaque). The end point is a square marker with an HTML value label. An optional dashed reference line (even pace), which can end in a marker and label like a series, and a dotted `outline` "today" line. End labels sit right of a point in the left 70 % and above-left further right. A legend line below names the marks (solid, dashed, tick). A chart takes a design height (×0.75 on phone, ×1.75 at ≥ 1000 and ×2 at ≥ 1400 px) and can grow to fill its tile. |
| **Columns** | Bar columns with value labels above, x labels below, and a 1 px baseline. |
| **Sparkline** | 20–28 px tall, monotone line, no axes. |
| **Timeline** | A 96 px band: a cycle-day axis with weekly ticks and the dates along the bottom. Events (a 7 px square and a 10 px label such as `Rent $950`) alternate above and below on two levels: bills (`warning`, paid ones muted), payday (`positive`). A 2 px `text` "today" marker and a 3 px elapsed fill (`primary`). Labels are hidden on phone. |
| **Calendar** | A 7-column month grid. Day cells show the day number, marks (b bill, i IOU, $ payday) and the spent amount over a heat fill. Each sits on a small opaque `canvas` chip so the text keeps its contrast at any heat. Blank `canvas` cells pad the first and last weeks. Today is outlined in `primary` and the picked day in `text`. Every day has a text label and there is a table view. |
| **Summary line** | `14 entries · spent $1,201.60 · income $2,140.00 · net +$938.40`. The figures come from the server. |
| **Result line** | After logging: ✓, category icon, amount, account, "left today", **undo**. Stays for 5 s. |
| **Skeleton** | Content-shaped skeleton tiles while loading, never page spinners (kept from 0022). |
| **Category icon** | A Remix glyph (§7) in the category's series colour, 16 design px. |

## 5. Patterns

- **Primary action** sits in the tile title bar (`[+ budget]`) or the command
  line (**+ new**). Rare actions go in a `⋮` menu. Actions on one item go in
  the detail pane or sheet, with icons.
- **Truncation.** Names, labels and subtitles end in "…". Amounts never
  truncate. Columns drop instead, in this order: account, then category,
  then time.
- **List + detail.** Selecting a row updates the detail pane (≥ 1000) or opens
  a sheet (< 1000). The selection is in the URL (`?entry=`, `?account=`).
- **Filters.** A filter menu with type (radio), category tree (checkbox, where
  a parent sets all its children) and accounts (checkbox). Active filters
  show as chips and in the button's count badge. Period, group by and sort
  are separate menus. A payee filter (`?payee=`, the key the payee report
  ranks by) is set by the Reports › Summary payee rows and shows as a chip.
- **Moving items.** No visible handles. Drag the item itself (a row, a tab,
  a tile's title bar) with a mouse. On touch, long-press for 400 ms (with a
  short vibration where supported), then drag. Arrow buttons or "move
  earlier / later" menu items do the same without dragging. Use React Aria
  drag-and-drop for keyboard and screen readers.
- **Empty states** say what will appear and how to add the first one, in a
  blank tile.
- **Focus** is a 2 px `ring` inset outline on every interactive element.
- **Motion** (ADR 0028): instant tab switches. Press and toggle feedback and
  sheet or menu entry on `snappy`. Reduced motion turns these into short
  crossfades or nothing.
- **Keyboard map.** `1`–`5` destinations (in tab order), `[` `]` sub-tabs,
  `/` command line, `,` Settings, `f` filter (Transactions), `Esc` closes.
  Menus use arrow keys, Enter, → / ←.

### 5.1 Money and currency display

All amounts go through one formatter. It takes the amount's own currency and
the display setting: symbol (default, `$12.50`, `€18.00`), ISO code
(`USD 12.50`), or symbol with the code for other currencies. Axis labels use a
short form (`$1.5k`). The formatter only formats. It never adds, converts or
rounds amounts for display totals.

## 6. Screens

Data sources are `/v1` paths. Items marked **(API +)** need an additive API
change (§8).

### Dashboard `/`

Default tiles, in order: this cycle (2 × 2) · needs attention · today's
entries · cycle allocation (`w3`) · budgets · next 7 days · pools ·
emergency fund · net worth (2 wide). While a user is held to two-factor
enrolment no tile mounts: the screen shows a note and a link to the account
settings, so no ledger read is made that the server would refuse.

| Tile | Content | Data |
|---|---|---|
| this cycle (2 × 2) | Key figures (spent day-to-day, which leaves bills out; even pace; pace, the word under or over; days over of days so far), a spent-vs-even-pace chart (nice y ticks, weekly x ticks with today, a dotted today line, end labels on both lines) with its legend line, and the formula line built from server figures only: on-budget − bills (− owed) = free (− set aside) ÷ days = daily; `[history]` opens Reports › cycles | `/v1/today`, `/v1/cycles/{openedOn}/days` |
| needs attention | Tag (`today` / `Nd late` for a due bill, `payday`, `rate`, `review`, `iou`), text, `[action]` (the weekly review's `[open]` opens its sheet), `[⋮]`; `[mark all read]` in the title bar while a reminder is unread | `/v1/today` attention items, `/v1/reminders` |
| today's entries | Time, category icon, payee with its category muted, amount; the title bar shows the count and `spentToday` | `/v1/transactions?on=today`, `/v1/today` |
| cycle allocation (`w3`) | Allocation component: a 22 px bar, the on-budget-left bracket, and a legend strip of seamed cells (swatch, label, amount, share); `other` shows only when it is not zero. The title bar shows `start`; `[plan next payday]` opens the payday plan sheet | `/v1/today` `allocation` (six parts: paid bills, savings, spent, set aside, free, other; each part's `shareBp`, its share of `start` in basis points, is what the legend prints; bar widths are a ratio of two server figures) |
| budgets | A compact, borderless category tree: fold handle or tree line, icon, name (`set aside` muted on set-aside budgets), a bar in the category colour with the period's even-pace tick (none on set-aside budgets), spent (muted), left (a budget past what it had shows its `overflow` with a minus sign; phones drop this column); parent rows are bold throughout; a pace legend line; `[all]` | `/v1/budgets` (`parents`: totals per parent category; `period` for the pace tick) |
| next 7 days | Every day from today, `sat 10` style; days with nothing show `·`; bill, IOU and payday rows with an icon and amount; `[calendar]` opens Reports › calendar | `/v1/reports/calendar` |
| pools | Pool rows (kind icon, name, a `daily` checkbox, balance; bold when the pool counts), then a share bar; the title bar shows on-budget; `[manage]` | `/v1/pools` (`shareBp` per pool), `/v1/today` `onBudget` |
| emergency fund | Figure, `of target · share`, bar, then covers, this cycle and at this rate (`full in N cycles`) | `/v1/insights/emergency-fund` (`addedThisCycle`, `cyclesToTarget`) |
| net worth (2 wide) | Figure and change on one line, area chart over the open cycle (the API's shortest window is a week, so a younger cycle shows that week and says so) | `/v1/insights/net-worth` (`change`) |

### Accounts `/accounts[/on-budget|/off-budget|/credit]`

- Stats, each with an icon and a lower-case label: net worth (primary; the
  server's `change` over the open cycle below it, as on the dashboard) ·
  savings & invest (the off-budget total; the number of savings accounts) ·
  credit owed (`totals.creditOwed` on `/v1/accounts`, signed and in
  `negative` while money is owed; the number of credit accounts) · reconcile
  (how many accounts the server flags `reconcileDue`, never reconciled or not
  for 30 days, with a small muted `need a look`; the first one's name and
  since when). Nothing is summed in the browser. Credit limits, minimum
  payments and due dates are not in the API yet, so there is no limit bar.
- A list tile (`accounts`, subtitle `N accounts in M pools` over the whole
  ledger) with 46 px tree rows: pools → accounts, each pool folding. Credit
  accounts are their own group below the pools and appear only under All
  and Credit; On budget and Off budget show the pools of that kind.
- A pool header row is semibold: fold handle, the pool's kind icon in its
  series colour (by its place among the open pools, as in the top bar), the
  name with a muted `● daily`, `off-budget` or `owed`, a bar of the cycle
  money left on pools that count (from 600 px; the server's `cycle.left` ÷
  `cycle.start`), the pool's balance (the credit total for credit) and
  `[+]`, which opens the new-account sheet.
- The list tile's title bar has `[+ account]`, which opens a sheet with the
  name, currency, whether it counts toward today (on budget) or is savings
  (off budget) and an optional opening balance. The new account opens.
- Each account row: muted kind icon, name, sparkline in the pool's colour
  (`negative` below zero; the last 30 days, fetched when the row scrolls
  into view; from 600 px), `✓ oct 05` reconciled date (from 1000 px),
  balance (`negative` below zero), `[⋮]` (reconcile, transfer from here,
  rename, move to another pool, archive). The open account is
  `?account=ID`; it shows beside the list from 1000 px and in a sheet named
  after it below.
- Detail: the `account` tile (primary edge, kind icon, the type as
  subtitle), or the same content bare in the sheet. The name with its icon
  in the pool's colour and the balance (26 px), a 30-day balance chart
  growing to fill the pane (area in the pool's colour, axis from zero), a
  key-value list (pool and whether it counts toward daily, type and
  currency, reconciled date and whether it needs a look), `recent` (newest
  5: date, category icon, payee, amount; `[all entries]` opens
  `/transactions?accounts=ID&period=all`), then `[✓ reconcile]`
  `[⇆ transfer]` `[✎ edit]` (rename) and `[⋮]` (move to another pool,
  archive).
- Data: `/v1/accounts`, `/v1/pools`, `/v1/accounts/{id}/history`,
  `/v1/transactions?account=`, `/v1/insights/net-worth`.

### Transactions `/transactions`

- The title strip holds search (borderless, full height; it matches the
  note, so the placeholder says "search notes"), a period strip button and a
  filter strip button (the word `filter` and a filled count when filters are
  on). Below 600 px they show only their icons.
- Chip bar for active filters, full width above the list and detail, on
  `chrome`: a filter icon, one chip per filter (a muted kind, `type`,
  `category` or `account`, then the value) and `[clear all]`.
- The `entries` tile: the period as its subtitle, `group day ▾` and `sort ▾`
  bordered menus in its title bar. A summary line (`totals`: count, spent,
  income in `positive`, net; values bold, one block per currency, no
  separators, wrapping on phones), then day headers (lower-case
  `fri oct 09`, `· today` on the user's today, the day total from
  `dayTotals` over exactly the filtered accounts; sticky, a `line2` rule
  under each), or groups by category (`groups`, with each row's `groupKeys`
  saying which groups it is counted in, so a split shows under each of its
  categories), or none.
- Rows (30 px, 38 px on phones; seams between rows only): time (from 600 px),
  category icon, payee (with a `bill` tag from `billId` / `billName`),
  muted `parent ›` category (from 600 px, 16ch below 1000 px and 18ch from
  there), account (from 1000 px), amount with its arrow, right-aligned. The
  selected row has the `card` fill and a 3 px `primary` edge.
- The sort menu sends `sort=date-desc|date-asc|amount-desc|amount-asc`; it is in
  the URL (`?sort=`, default left out). By amount the list is flat (no day
  headers or totals) and same-day reordering is off, as it is for `date-asc`.
  The filter menu takes several accounts and categories (comma-separated
  `accountId` and `categoryId`).
- Detail (`GET /v1/transactions/{id}`): an `entry` tile with the primary
  edge beside the list from 1000 px; below, a sheet titled with the payee
  that holds the same body. Icon and payee with the amount (20 px) on one
  line, then a key-value list (muted keys, values right-aligned): date
  (`fri oct 09 · 12:30`), category (icon and path), account, budget (name
  and what was left after this entry, one row per budget line, from
  `budget.lines[].leftAfter`; no bar, since the budget's amount and spent
  are not sent), cover (`budget.lines[].covers` and what was not covered,
  or `none`), source, history (`earlier version`, `edited since`,
  `deleted since`, `brought back as`, or `—`).
  Below: the versions with `[go back to this]` when there is history, the
  newest three other entries from the same payee (date, account, amount;
  any date; `first time` when none; a `[see all]` link opens
  `/transactions?payee=…&type=expense&period=all`), then a ruled action row:
  edit · split · split with people · cover · move up · move down · delete
  (restore on a deleted entry).
- Lists over 200 rows are virtualised.
- Moving within a day: when grouped by day, rows of a day with more than one
  entry can be dragged (long press on touch) to change their place; there is
  no visible handle. The drag key appears on focus, and the detail has
  `[move up]` and `[move down]`. The day that continues on an unloaded page
  is not movable. With a search or a payee, type, account or category filter
  on, moving is off (drag and the buttons, which say why): the list may hide
  entries of a day, so a visible neighbour is not the neighbour in time. The
  server refuses a move that would break the time order
  of timed entries. A move never changes a date.
- Split with people: an expense in a category has `[split with people]` in its
  detail. A sheet takes each person's name (with names used before as taps)
  and amount, filled as an even share until typed; the server keeps the rest
  as the user's share and replaces the entry (an undo plus the split).

### Budget `/budget/…`

| Sub-tab | Content |
|---|---|
| budgets | Allocation (full width) · budgets (2 wide): the dashboard's budget rows with separators and an action column (`[+ sub]` on a parent header, `[⋮]` on a budget), the server's totals below in muted rows (daily budgets left, held, spent outside any budget, free), and the pace legend; `[+ budget]` and `[plan next period]` (the payday plan) in the title bar · cover this period: one row per source that covered an entry (`/v1/budgets/covers`), then the first three in the cover order with what each has left |
| pools | Two columns from 720. One tile per pool (kind icon, `on-budget` / `off-budget`, the primary edge when it counts; `[+ account]`): a `counts toward daily` checkbox and the balance, a "left of" bar in the pool's series colour with "X left of Y this cycle" for on-budget pools, and its accounts as tree rows (kind icon, name, sparkline, balance; a row opens the account) · "how the daily number works" (full width): a short paragraph and the dashboard's formula line |
| bills | Stacked full-width tiles: bills this cycle (the cycle's dates; timeline, then a summary line: set aside, paid, next with its `3d` tag; `[+ bill]`) · upcoming (count of bills; what is still set aside; rows of date, bill icon, name, account, amount, a `3d` / `today` / `2d late` tag) · paid this cycle (the paid total; the same rows with `✓ paid` and `[⋮]` › Show payment) · not due this cycle, when a bill has no date in it |
| goals | One tile per goal (flag icon, `[⋮]` › Archive): the saved figure with "of $X · N%", a bar in the goal's series colour, where it is held and its date ("by apr 2027" / "no date"), and the chart from today to the target (y from zero); an odd last goal fills the row at two columns. `[+ goal]` sits in the title strip, and in the empty state. The weekly review opens from its "needs attention" item; the payday plan from the budgets sub-tab |
| ious | People (`[+ lend]` `[+ borrow]`): a summary line (owed to you, you owe), then tall rows with an icon, the name and a muted `owes you` / `you owe` / `even`, one status tag (`9d late`, the next due date, `settled`) and the server's per-person figure (`personOpen`; `N open` when IOUs run both ways) · person (from 1000 px; a sheet below): what they owe or you owe, then the history (each loan and its payments) with `[✓ repay]` `[due date]` `[write off]` `[delete entry]` per IOU; "no person selected" until one is picked |
| cover order | Side by side 1.6 : 1 from 1000 px, stacked below. Cover order (primary edge): a short paragraph, then numbered rows (icon, name, what it has: free money, `set aside $X` for set-aside budgets, `$X left` otherwise) with `[↑]` `[↓]`; rows also drag · "what happens next": a paragraph and a try-it form (budget, account, amount) that previews where an overspend would take money from **(server preview: `/v1/budgets/cover-preview`)** |

### Reports `/reports/…`

A toolbar under the sub-tabs (on `chrome`) on summary, trends and plan: the
period menu (this cycle · last cycle · this month · last month; a custom
range is not built) and the dates it covers, `sep 25 – oct 22 · day 15/28`
(the day count only for a running period). Calendar has the layer toggles in
that place; cycles has no toolbar. The sub-tabs sit in one stack with 1 px
seams; the last tile grows to fill the screen. Columns are 8 px apart with the
value on each column, a 1 px baseline and muted labels, and grow with the tile
from their design height (`--h`).

| Sub-tab | Content |
|---|---|
| summary | Stats (spent with `incl. $X bills`, income in `positive`, saved as the cycle's rate with a bar, daily average against the daily number) · by category (14 px share bar, tree rows like the budget rows with the even-pace tick and a pace legend, `[expand all]`; 2 wide) · top payees **(API +)** · spending per day (columns with a value on each, over the daily number in `negative`, a legend, 3 wide) |
| trends | Category trends (multi-line chart with end labels and a legend, 2 wide; a category that dwarfs the others stays out of the scale and is named under it) · this period against the last per category with a sparkline, then total spent per cycle (the running one in orange) **(API +: per-category series across cycles)** |
| plan | Budget vs actual (the budget rows without actions, 2 wide) · savings rate per cycle (columns) · net worth (area chart, 3 wide) |
| calendar | Toolbar: layer toggles (spending heat, bills & dues) and the mark legend · month grid (heat fill, `b` `i` `$` marks, value per day; `[‹] [›] [table]` in its title bar) beside the picked day's list, 1.6 : 1 from 1000 px |
| cycles | Spent and saved per cycle (columns, side by side from 720 px) · past cycles table (cycle, spent, saved in `positive`, rate) |

### Settings `/settings/…`

money (default currency, display mode **(planned, 0029)**, payday rule,
budget period, daily number, exchange rates) · categories (a tree with fold,
drag, `[+ sub]`, rename, icon & colour, move under, merge, archive) ·
policies · app (palette, interface: density, fonts **(planned)**, motion, key
hints; notifications: opt in to Web Push on this device, off until asked,
with a test; tabs, top bar and layouts **(planned)**) · account (sign-in, two-factor,
sessions, invites) · data (export, import, delete account).

Every value row opens a menu or form. There are no inline native controls.

## 7. Category icon map

Stored keys (`categoryIcons` in `@allotr/shared`) stay unchanged. The web app
renders these Remix Icon 4.5.0 glyphs (`-line` variants):

| Key | Remix | Key | Remix | Key | Remix |
|---|---|---|---|---|---|
| banknote | money-dollar-box | baby | parent | beer | beer |
| bike | riding | book-open | book-open | briefcase | briefcase-4 |
| bus | bus | car | car | circle-dollar-sign | money-dollar-circle |
| coffee | cup | credit-card | bank-card | dumbbell | run |
| film | film | fuel | gas-station | gamepad-2 | gamepad |
| gift | gift | graduation-cap | graduation-cap | hand-coins | hand-coin |
| heart-pulse | heart-pulse | house | home-4 | landmark | bank |
| laptop | macbook | lightbulb | lightbulb-flash | music | music-2 |
| paw-print | bear-smile | percent | percent | piggy-bank | safe-2 |
| pill | capsule | plane | plane | receipt | bill |
| repeat | repeat | scissors | scissors-cut | shirt | t-shirt |
| shopping-bag | shopping-bag | shopping-basket | shopping-basket | smartphone | smartphone |
| sparkles | sparkling | tag | price-tag-3 | ticket | ticket |
| train-front | train | tree-pine | tree | trending-up | line-chart |
| umbrella | umbrella | utensils | restaurant-2 | utensils-crossed | restaurant |
| wallet | wallet-3 | wifi | wifi | wrench | tools |

Interface icons (destinations, tile titles, actions) are chosen from the same
set and compiled with them.

## 8. API additions the screens need

Each is an additive `/v1` change ([ADR 0013](adr/0013-api-versioning.md)),
with the figure computed in `packages/core` as a pure function and covered by
property tests:

1. **Cycle allocation**: the cycle's on-budget start split into paid bills,
   moved to savings, spent, bills set aside and free (on `/v1/today`). **Shipped**, with an `other` part for what the five do
   not explain.
2. **Pool cycle figures**: per on-budget pool, its cycle start and what is
   left (on `/v1/pools`). **Shipped.**
3. **Transaction totals**: count, spent, income and net for the filtered set,
   plus per-day (or per-group) totals (on `/v1/transactions`).
   Shipped as `totals` and, with `group=day|category`, `groups`: per currency,
   never converted or summed across currencies. The filter menu's type radio
   is `type=expense|income|transfer`, and "same payee" is `payee=` (the
   report's own key, so it lists exactly the entries a payee was counted
   for). Totals are added up by the database, not by loading the filtered
   entries. Follow-ups, all shipped: `dayTotals` nets exactly the filtered
   accounts; `sort=`; `billId` / `billName` on every entry; `groupKeys` per
   row; the detail's `budget` figures; and on `/v1/reports/categories`
   `spendingTotal`, `incomeTotal`, `days`, `dailyAverage` (over the days so
   far) and `saved`.
4. **Top payees** for a period (count and total) (`/v1/reports/payees`).
5. **Category series across cycles** for trends (on `/v1/reports/categories`
   with a range).
6. **Interface preferences** for account-wide layouts (planned, ADR 0029).
7. **Dashboard figures.** Shipped: the allocation's `savings` (only money
   moved to savings) and `other` parts, `reservedBills` and `reservedIous`
   on `/v1/today`; `parents` totals on `/v1/budgets`; `addedThisCycle` and
   `cyclesToTarget` on the emergency fund; `change` on net worth; and on
   `/v1/accounts` `reconcileDue` per account and `totals.creditOwed`.
   Printed shares are server figures in basis points: `allocation.shareBp`
   per part and `shareBp` per group and child on `/v1/reports/categories`
   (largest-remainder rounding, so they add up to 10 000). Bar widths stay a
   ratio of two server figures (§6).

## 9. Accessibility

- WCAG 2.2 AA. Every role pair is fitted by the theme resolver.
- Charts have a text label (`role="img"` with a summary) and a table
  alternative where there are many values (the calendar has a table view).
- Trees, menus, lists and drag-and-drop use React Aria semantics. Reordering
  works by keyboard.
- Truncated text has its full value available (a title or the detail view).
- Reduced motion and forced-colours mode keep everything usable. Structure
  never depends on colour or shadow.

## 10. Testing

- Playwright at 390 × 844, 820 × 1180 and 1440 × 900 for the shell and each
  destination: axe checks, keyboard paths, and screenshot comparisons.
- Alignment checks: the logo block bottom equals the summary bar bottom, nav
  rows equal the title strip height, the settings row top equals the command
  line top, and no grid cell shows the seam colour.
- Unit and property tests for the chart maths (scales, monotone paths never
  overshoot), the money formatter, and the column templates per breakpoint.
- Synthetic data only.
