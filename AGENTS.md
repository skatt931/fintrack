# Finance PWA — Project Instructions

## Documentation

`FEATURES.md` is the **source of truth** for everything this app does.

**Update it automatically** after every change that affects:
- A new feature or capability
- A removed or renamed feature
- Changed behaviour of an existing feature (filters, sort, navigation, data, charts, etc.)
- Layout or UI structure changes visible to the user
- Changes to the data model or Google Sheets integration

The update should happen in the same response as the code change — not as a separate follow-up step.

**Do not update** for:
- Pure bug fixes that don't change observable behaviour
- Refactors with no user-visible effect
- Style tweaks that don't affect layout or UX

### Excalidraw diagram

`finance-pwa-architecture.excalidraw` is a point-in-time snapshot. Only redraw it when explicitly asked.

---

## Quality Assurance

**The `qa-fintrack` skill is REQUIRED for every feature and bug fix.** It enforces:

- **Edge-case scan before writing code** — answer 5 specific questions about data shape, cache state, empty/full states, mobile keyboard behaviour, drill-down propagation
- **Running the change in a preview browser before claiming done** — not just reading the code
- **Writing a 3–6 item manual test plan for the user** — concrete UI actions with expected results
- **Honest status reporting** — never claim "works" without running it; use "ready for your manual test" instead

Skip ONLY for pure internal refactors with zero user-visible effect.

See `.Codex/skills/qa-fintrack/SKILL.md`.
