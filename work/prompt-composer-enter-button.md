# Prompt for Codex — small change: move the AI submit into the input box, drop "+ add"

Branch: continue on `feat/post-first-flow`. This is a **small, focused UI change** — keep the AI
input as the only way to enter an activity; just fix the button. Follow `CLAUDE.md` (reuse
existing code, always-dark theme, bump the cache-bust tag, mobile ~390px, end with a local link +
smoke test). Don't auto-commit. Don't touch anything else in the composer.

## Anchors (in `outputs/app.js`, `renderPostComposer` ~4150–4360)
- AI input: `<textarea data-pc-caption class="pc-caption" …placeholder="What did you do? …">`
  (~4246), with the foot hint `.pc-caption-foot` "✨ AI reads your words" (~4247).
- The thing to replace — the standalone manual chip:
  `<button class="pc-chip pc-chip-add" data-pc-add>＋ add</button>` (~4181), which toggles
  `postComposerAddOpen` → `renderAddPicker` / `.pc-add-picker` (~4289), handled at ~4359.
- The composer already AI-parses the text and attaches matched activities (the `postComposerParsing`
  / "reading…" path) — reuse that exact parse/attach; don't write a new parser.

## The change
1. **Put a submit button inside the AI box, bottom-right.** Add a round button absolutely
   positioned at the bottom-right of the `.pc-caption` box (opposite the "✨ AI reads your words"
   foot, which is bottom-left). Icon = an up arrow `↑`; `aria-label="Log activity"`. Style it
   green to match: `background:#5cf3b8; color:#06281c;` ~38px circle. Give the textarea enough
   right/bottom padding that typed text never runs under the button.
   - (If you prefer a label over the arrow, a small "Enter" pill is fine — but NOT the word
     "add". Default to the arrow.)
2. **Wire it.** Clicking the button — and pressing **Enter** in the textarea (keydown, no Shift,
   `preventDefault` so it doesn't insert a newline) — runs the **existing** AI parse/attach on the
   current text, then **clears the textarea** so the next line can be typed and submitted to stack
   another activity.
3. **Remove the old "+ add" chip** (`.pc-chip-add` / `data-pc-add`) from under the attached list.
   The AI input + Enter is now the attach path.
   - Keep the manual rule picker (`renderAddPicker` / `.pc-add-picker`) reachable via a small,
     quiet "Add manually" text link beneath the attached chips so the fallback isn't lost — OR, if
     cleaner, leave the picker code in place but unreferenced. Don't expand it into a big control.

Do not change: the attached chips + steppers, the "counts toward" / "posts to" destinations, the
"Share as a post" toggle, or the Log/Post button. Only the input's submit affordance changes.

## Acceptance / smoke test (report pass/fail)
1. The AI box shows a round `↑` submit button bottom-right; the old "＋ add" chip is gone.
2. Type "sleep 7 hours" → press the arrow (or Enter) → the matched activity attaches and the
   textarea clears; typing another line + Enter stacks a second one.
3. Enter does not insert a newline; typed text never overlaps the button; the button has an
   aria-label.
4. Everything else in the composer is unchanged (log-first default, destinations, share toggle,
   Log/Post button).
5. `npm test` and `node --check outputs/app.js` pass.

## Wrap up
- Bump the cache-bust tag on `app.js`/`index.html`/`styles.css`.
- Start the local preview (`npm start`) and give me the clickable local URL.
- Run the `TESTING.md` smoke test + the 5 checks above; report pass/fail.
