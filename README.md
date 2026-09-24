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
| `code.gs` | Apps Script server code — name generation, `FUNNEL_MAP`, organic-URL parsing |
| `Index.html` | The generator UI served by the web app |
| `appsscript.json` | Apps Script project manifest |
| `tests/taxonomy.test.js` | Offline regression suite — `node tests/taxonomy.test.js` |

## Organic Post ID in the P3 ad name

A P3 name carries the organic post its creative came from **inside the Influencer
Handle segment**, not as a segment of its own:

```
R#:1 | … | 05/01/26 | 06/30/26 | gisellelangley ~ DdbhlHZOdfw | NA
                                 └── slot 11 ──────────────┘
```

**Why it is packed rather than appended.** `PAID_MEDIA_UNIFIED` parses the ad name
**by position** (`SPLIT(ad_name,'|')`, slot 11 = influencer, slot 12 = custom
identifier), and it re-parses all history on every refresh. A 14th segment would
shift `ext_p3_ad_custom_identifier` and start reading new and historical ads into
the same column with different meanings — with no error raised. Packing keeps the
count at 13 and mirrors the existing `LP: {domain} ~ {category} ({sku})` segment.

Verified against live data before deployment: the new parse returns byte-identical
values on all 3,169,663 rows / 57,985 ads.

**What the user pastes.** The Organic Post URL field takes a full post URL and
extracts the ID; a bare ID is also accepted so a generated name round-trips.
Parsing follows `docs/organic-url-patterns/` in the `Paid-Media-Unified-Data-Table`
repo. Two consequences worth knowing:

- **The handle is usually not in the URL.** `instagram.com/p/{code}/`,
  `youtube.com/watch?v=`, `/pin/`, and Reddit links carry no username at all, so
  Influencer Handle stays a manual field that the URL fills in only when it can.
- **Some URLs are refused on purpose.** Facebook `pfbid` tokens are not stable
  identifiers, and TikTok Shop product IDs and Reddit comment IDs are the same
  shape as post IDs from other namespaces. These fail loudly rather than emitting
  a key that would join to the wrong thing, or to nothing.

**Required when Asset Type is `Boosted`** — a boosted ad is an organic post with
spend behind it, so it always has a parent post. The rule is declared once, on the
field's `requiredWhen` in `code.gs`, and read from there by the form, the validator
and the build path.

**Empty means "not recorded", never "no organic post"** — every ad named before
this field existed has a NULL `ext_p3_organic_post_id`.

## Deploying

Deploy from this folder to the Apps Script project. **Pull first** (rule 1) — confirm the folder
matches `main` before any deployment, and confirm the deployment URL belongs to the intended
environment before publishing.
