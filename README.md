# split-bars

Snap token resource bars to configurable thresholds. The bar fill displays in discrete bands (e.g. thirds) instead of a continuous gradient. **The underlying stored value is unchanged**—only the visual display snaps.

## Compatibility

- Foundry VTT v13
- Draw Steel system (tested against current v0.10.x behavior)
- `libWrapper` required

## Usage

Open token configuration (or prototype token configuration) and enter threshold rules for `Bar 1 Threshold Rule` and/or `Bar 2 Threshold Rule`.
Separate multiple rules with spaces.

### Snapped fill behavior

The bar fill **snaps down** to the highest completed threshold. Examples with `1/3:` (thirds):

- 24 max, 12 current (50%) → bar displays **1/3 full**
- 24 max, 17 current (~71%) → bar displays **2/3 full**
- 24 max, 24 current (100%) → bar displays **full**

Vertical separator lines mark each threshold. The stored resource value (e.g. stamina) is never modified.

### Rule formats

Values less than `1` are treated as fractions of the bar:

1. Decimal:
   - `0.2 0.6 .1`
2. Percentage:
   - `75% 33% 20%`
3. Fraction:
   - `1/3 7/8`

Absolute values are also supported:

- `100 1 3`

Repeat a rule across the bar by appending `:`:

- `1/3:` → thresholds at 1/3 and 2/3 (three bands)
- `1:` → threshold every 1 absolute unit

## Draw Steel stamina notes

Draw Steel stamina bars can have a negative minimum (winded range). You can choose how fractional rules treat this:

- **Full (min..max)** (default): Fraction rules like `1/3:` split the *full bar range* (`min -> max`), including the negative winded section.
- **Positive only (0..max)**: Fraction rules split only the positive resource range (`0 -> max`). No fractional thresholds appear in the winded region.

Use the per-bar **Fraction Range** setting in token configuration to switch modes. For exact recovery breakpoints, use absolute stamina values instead of fractions.

### Recovery threshold guidance

If recovery is exactly `max / 3`:

- `current <= 1/3 max` → bar shows 1/3 full (missing enough for **2 recoveries**)
- `1/3 max < current <= 2/3 max` → bar shows 2/3 full (missing enough for **1 recovery**)
- `current > 2/3 max` → bar shows full (missing less than 1 full recovery)

So `1/3:` gives three equal visual bands, and the **middle third** corresponds to "missing about 1 recovery."
