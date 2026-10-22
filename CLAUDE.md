# Tillroll

Before changing anything the user sees (a view, a dialog, a style, a label), read
[docs/visual-guidelines.md](docs/visual-guidelines.md) and follow it. When a change sets a new visual rule, add it
there in the same commit.

The rules people forget most:

- Every dialog has a ✕ in its top right corner (`.dialog-close`), and all dialogs share one size: never set a width
  on one.
- Colours come from the tokens in `src/index.css`, never a hex value. Category colours go on dots, bars and tints,
  never on text.
- Plain English everywhere, no em dashes.
