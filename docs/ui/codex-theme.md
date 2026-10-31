# Codex Appearance

## Goal

Provide the full set of Codex desktop color schemes, plus the Codex UI scheme (`style-codex`) as an independent layer. Either layer can be combined with any other layer.

## Color schemes

Codex ships 28 theme families with 43 light/dark variants. `packages/ui/src/lib/codexThemes.ts` is the single source of truth for their ids, labels, families, variants, and canvas colors. Each variant occupies a `.theme-<id>` block in `packages/ui/src/styles.css` and fills the same semantic token set as the Zai and Claude schemes; no Codex-only token is introduced.

| Source | Theme ids |
| --- | --- |
| Codex bundled shiki themes | `codex-dark`, `codex-light`, `absolutely-*`, `linear-*`, `lobster-dark`, `matrix-dark`, `notion-*`, `proof-light`, `raycast-*`, `sentry-dark`, `temple-dark`, `vercel-*`, `xcode-*`, `oscurange` |
| `@shikijs/themes` | `ayu-dark`, `catppuccin-latte`, `catppuccin-mocha`, `dark-plus`, `dracula`, `everforest-*`, `github-*-default`, `gruvbox-*-medium`, `light-plus`, `material-theme-darker`, `monokai`, `night-owl`, `nord`, `one-dark-pro`, `one-light`, `rose-pine-dawn`, `rose-pine-moon`, `solarized-*`, `tokyo-night` |

`codex-light` and `codex-dark` are the Codex defaults. Catppuccin remains available as `catppuccin-latte` and `catppuccin-mocha`. The previous `codex-light`/`codex-dark` values were Catppuccin Latte/Mocha; saved preferences keep their value and now resolve to the Codex defaults.

## Generation

`scripts/generate-codex-ui-themes.mjs` reads `scripts/codex-theme-palettes.json` (the extracted Codex surface, ink, accent, semantic, and syntax colors) and rewrites:

- the generated block in `packages/ui/src/styles.css`;
- `packages/ui/src/lib/codexThemes.ts`;
- the first-paint palette tables in `packages/web/index.html`.

The script fails when a semantic surface or remote descriptor falls below 4.5:1 on the theme's own backgrounds. Run it from the repository root:

```sh
node scripts/generate-codex-ui-themes.mjs
```

## Persistence

- Color scheme: `zcode-theme`, values `system`, `zai-light`, `zai-dark`, `claude-light`, `claude-dark`, plus every id in `CODEX_UI_THEMES`.
- UI scheme: `zcode-style-theme`, values `default`, `claude`, `codex`.
- Legacy installations without `zcode-style-theme` keep the Claude UI scheme only for Claude color schemes; every other legacy value resolves to Default.

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

## Verification

- Check light and dark Codex themes at 390px and 1200px with Default, Claude, and Codex UI schemes.
- `packages/ui/test/semanticSurfaceContrast.test.ts` discovers every `.theme-*` block and enforces 4.5:1 for body text, semantic surfaces, and remote descriptor tokens.
- Check that a Codex color scheme with Default UI scheme keeps the standard radius scale, and Zai color scheme with Codex UI scheme keeps the Zai colors.
- Check contrast for links, focus rings, diff rows, and terminal output in both modes of each family.
