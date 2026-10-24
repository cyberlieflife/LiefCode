# Codex Appearance

## Goal

Provide a Codex-style appearance in two independent layers: a Codex color scheme (`codex-light` / `codex-dark`) and a Codex UI scheme (`style-codex`). Either layer can be combined with any other layer.

## Color scheme

Codex color schemes occupy `.theme-codex-light` and `.theme-codex-dark` in `packages/ui/src/styles.css`. They fill the same semantic token set as the Zai and Claude schemes; no Codex-only token is introduced.

The neutral surface values come from the official Codex desktop product imagery. The table below records the extraction source; `packages/ui/src/styles.css` remains the single source of truth for the shipped token values.

| Role | Dark | Light |
| --- | --- | --- |
| Canvas | `#212121` | `#ffffff` |
| Header / panel | `#242424` | `#ffffff` |
| Sidebar | `#1b1b1b` | `#f7f7f7` |
| Raised input | `#303030` | `#ffffff` |
| Foreground | `#f2f2f2` | `#0d0d0d` |
| Secondary text | `#a8a8a8` | `#5f5f5f` |
| Tertiary text | `#7a7a7a` | `#8f8f8f` |

Codex blue is reserved for links, focus rings, and active indicators. The primary button stays neutral and high contrast: white fill with dark text in dark mode, dark fill with white text in light mode.

The accent value `#5FAFFF` comes from the open-source Codex CLI (`CHATGPT_BLUE_200`). The dark accent is kept as published; the light variant is darkened to `#0b6bcb` so link and focus text keeps at least 4.5:1 contrast on white. This is an approximation built from official product imagery, not an exported Codex design token file.

## UI scheme

`.style-codex` changes geometry and elevation only:

- Radius scale: `xs` 3px, `sm` 5px, `md` 8px, `lg` 10px, `xl` 14px, `2xl` 18px.
- `--window-shell-radius`: 12px.
- Shadows collapse to a hairline; borders and surface contrast carry the hierarchy.
- Markdown headings remain sans-serif with `-0.01em` tracking.

Information density, spacing rhythm, and component layout stay unchanged for the Default and Claude schemes. The Codex scheme is the structural exception because the target interface is defined by its layout:

- **Sidebar**: a 56px icon rail on the left, a title row (`LiefCode` with search) and the project/task list on the right. The rail owns new task, automations, plugins, search, settings, and account entries; the right column keeps only the new-chat row. The rail opts out of the window drag region so its buttons stay clickable. The desktop top overlay hides its logo and back/forward group in this scheme to avoid stacking on the title row.
- **Welcome title**: when a project is selected, replaces the time-based greeting with `What should we build in <project>?`. The project name is the existing project switcher trigger, rendered inline with a dotted underline; clicking it opens the searchable project menu. With no project selected, the time-based greeting stays. The decorative full-size watermark is replaced by an outlined `Lief` wordmark with the same center axis as the composer. The suggested-prompt row is hidden.
- **Composer**: two stacked surfaces sharing the composer's `max-w-2xl` content column. The upper project row is narrower (12px inset on each side), darker, and has a 12px radius; the lower input card is full width, lighter, and has a 16px radius. The upper card overlaps the lower one by 4px. The empty placeholder is `随心输入` / `Type anything`.

## Persistence

- Color scheme: `zcode-theme`, values `system`, `zai-light`, `zai-dark`, `claude-light`, `claude-dark`, `codex-light`, `codex-dark`.
- UI scheme: `zcode-style-theme`, values `default`, `claude`, `codex`.
- Legacy installations without `zcode-style-theme` keep the Claude UI scheme only for Claude color schemes; every other legacy value resolves to Default.

## Verification

- Check Codex Light and Codex Dark at 390px and 1200px with Default, Claude, and Codex UI schemes.
- Check that Codex color scheme with Default UI scheme keeps the standard radius scale, and Zai color scheme with Codex UI scheme keeps the Zai colors.
- Check contrast for body text, secondary text, links, semantic states, diff rows, and terminal output in both Codex modes.
