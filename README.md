# Paid Media Taxonomy Generator Code

The Google Apps Script web app behind the Viral Nation paid-media naming convention —
campaign/ad-set/ad name generation and the `FUNNEL_MAP` objective-to-funnel mapping that the
Paid Media skills read downstream.

---

## Working agreement — read this before you touch anything

`main` is the source of truth. Work happens on a branch, gets validated, then merges to `main`.
Two steps after the merge are **requirements**, not housekeeping, and both are easy to skip.

### 1. Pull after every merge to `main` — REQUIRED

**Merging a PR does NOT change the folder on your machine.** Nothing syncs automatically, in
either direction. `push` sends your work up; `pull` brings `main` down. Both are manual.

```bash
git checkout main && git pull
```

**Why this matters more here than in a normal repo:** this is an Apps Script project that is
**deployed from your local folder**. A stale folder means you can push last week's `code.gs` to
the live web app and overwrite work that only ever existed on GitHub — the deploy will look
completely normal while doing it.

The second consumer is downstream: the paid-media skills read this repo's `FUNNEL_MAP` for
objective-to-funnel mapping. A stale local copy produces confidently wrong funnel levels in
reporting, with nothing to flag it.

⚠️ Especially important when work is done in another tool (ChatGPT/Codex, a cloud agent, a second
machine). Those push to GitHub but never touch this folder, so the drift is invisible from here.

### 2. Delete dead branches — REQUIRED

A branch is **dead** once merged into `main`. Delete it locally and on the remote. Dead branches
look like live work, and reviving one re-applies changes `main` has already moved past.

```bash
git branch --merged main          # list branches safe to delete
git branch -d <branch>            # delete locally
git push origin --delete <branch> # delete on GitHub
```

Merging through `gh pr merge --delete-branch` handles both in one step; prefer it.

⚠️ A branch checked out by a **worktree** cannot be deleted until that worktree is removed
(`git worktree list` → `git worktree remove <path>`). Check for this if a delete is refused.

### 3. Keep the working folder on `main`

Don't leave the folder parked on a feature branch after that branch merges. A merged branch and
`main` diverge from the moment the next PR lands.

---

## Layout

| file | what it is |
|---|---|
| `code.gs` | Apps Script server code — name generation and `FUNNEL_MAP` |
| `Index.html` | The generator UI served by the web app |
| `appsscript.json` | Apps Script project manifest |

## Deploying

Deploy from this folder to the Apps Script project. **Pull first** (rule 1) — confirm the folder
matches `main` before any deployment, and confirm the deployment URL belongs to the intended
environment before publishing.
