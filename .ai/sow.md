# SOW / KOM — Agent Entry Point

Read the complete implementation guide before changing this feature:

- [`docs/sow.md`](../docs/sow.md)

## Required review order

1. `services/sowTemplate.html` — SOW interface, default questions, dependencies and iframe messages.
2. `components/SowFormEmbed.tsx` — iframe lifecycle, Overview panel, message bridge and backup.
3. `components/OpportunityDetail.tsx` — expediente synchronization and KOM note creation.
4. `components/SettingsModal.tsx` — global SOW Library and default-question overrides.
5. `App.tsx` and `types.ts` — global settings persistence and linked opportunity fields.

## Rules for changes

- Preserve existing `data-key` / flow question keys whenever possible; saved answers and dependencies rely on them.
- Test both directions of any expediente synchronization.
- Do not move the original SOW iframe when opening Overview. The right-side panel uses a second viewer iframe so the current SOW remains visible behind it.
- Built-in question overrides must be global through `globalSowForm.flowOverrides` when a change should affect every SOW.
- Use global custom sections with logic such as `flow_T001 includes Modicon` to hide a complete module until its platform applies.
- Verify the `KOM` button creates a new regular note with pending required questions.
- Run `node .\\node_modules\\vite\\bin\\vite.js build` before handoff.
