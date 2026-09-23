# Agent instructions

Follow `.cursor/rules/no-ceremony.mdc`.

- Do not create videos, screen recordings, walkthroughs, or demo artifacts unless the user explicitly asks for one in that turn.
- Prefer shipping the code diff quickly: implement, bump cache `?v=` when UI changes need it, open or update the PR, and merge to `main` when ready so GitHub Pages updates.
- Avoid extraneous ceremony: no long unsolicited visual-proof loops, no inventing extra polish or tasks beyond the ask, and keep PRs tightly scoped.
- Screenshots are OK only if needed to verify a UI claim and the user did not forbid them. Still prefer finishing over demo theater.
- If the user asks for a video later, that overrides this rule for that request only.
