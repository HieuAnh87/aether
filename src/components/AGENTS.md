# src/components/

22 reusable UI components. Barrel-exported via `index.ts`.

## Conventions

- **SolidJS, NOT React** — use `createSignal`, `createEffect`, `<For>`, `<Show>`
- Props interface: `FooProps` naming (e.g. `EditPresetFormProps`)
- Components are standalone `.tsx` files, not grouped into subdirectories
- Styling: Tailwind CSS v4 utility classes + custom glassmorphism tokens from `src/styles/app.css`

## Notes

- Components consume stores from `src/stores/` — check store ownership table before editing
- Modal components (e.g. `AddAccountModal`, `CreatePresetModal`) are typically triggered by parent page state
- Provider-related components use color coding via `providerColor` helper function
