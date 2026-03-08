# split-bars

Segment token resource bars with custom split markers.

## Compatibility

- Foundry VTT v13
- Draw Steel system (tested against current v0.10.x behavior)
- `libWrapper` required

## Usage

Open token configuration and enter split rules for `Bar 1 Split Rule` and/or `Bar 2 Split Rule`.
Separate multiple rules with spaces.

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

- `1/3:` -> draws lines at `1/3` and `2/3`
- `1:` -> draws a box-like split at each point

## Draw Steel stamina notes

Draw Steel stamina bars can have a negative minimum (winded range). This affects how splits are interpreted:

- Fraction rules (like `1/3:`) split the *full bar range* (`min -> max`), not strictly `0 -> max`.
- If you need exact recovery breakpoints, use absolute stamina values instead of fractions.

### Recovery threshold guidance

If recovery is exactly `max / 3`:

- `current <= 1/3 max` means you are missing enough for **2 recoveries**.
- `1/3 max < current <= 2/3 max` means you are missing enough for **1 recovery**.
- `current > 2/3 max` means you are missing less than 1 full recovery.

So your idea of thirds is good for quick visual bands, but note:

- `1/3:` gives three equal visual bands.
- The **middle third** (`between 1/3 and 2/3`) corresponds to "missing about 1 recovery", not 2.

For exact "2 recoveries missing" in Draw Steel, place one split at your actor's `1/3 max` absolute stamina value.