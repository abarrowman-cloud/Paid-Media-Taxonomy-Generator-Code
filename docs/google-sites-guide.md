# Google Sites guide

How the live Google Site (`vn-taxonomy-generator`) is put together, and how to change it. Same model
as the PM Operating Hub (`perf-mkrt-operating-hub`): one native Google Sites page per tool, each
embedding the same Apps Script web app with a different `?page=`.

## Page architecture

One web app deployment. `doGet` in `code.gs` reads `?page=` and opens that tool's tab
(`GENERATOR_PAGES`). Inside Google Sites, a page opened with `?page=` hides the in-app tab bar, so
the Sites menu is the only navigation.

| Google Sites page | Published path | Embed URL |
|---|---|---|
| Home (original, full tabbed UI) | `/home` | `EXEC_URL` (no `page`) |
| Generator | `/generator` | `EXEC_URL?page=gen` |
| Extractor & Editor | `/extractor-editor` | `EXEC_URL?page=ext` |
| Taxonomy QA | `/taxonomy-qa` | `EXEC_URL?page=qa` |
| UTM Builder | `/utm-builder` | `EXEC_URL?page=url` |
| URL QA | `/url-qa` | `EXEC_URL?page=urlqa` |

`EXEC_URL` is the web app's `/exec` URL: `https://script.google.com/a/macros/viralnation.com/s/<ID>/exec`.
The reliable place to copy it is the embed on the Home page (Sites editor → click the embed →
pencil). Strip anything after `/exec`.

`?page=` values are case-sensitive. An unknown or missing value falls back to the Generator with
the full tabbed UI, so a mistyped embed still loads, just with a second row of tabs inside it.

Pages are top level and flat, like the Hub. A grouped menu (Platform Taxonomy Tools / UTM Tools)
would need empty parent pages.

## Embed setup

For every page:

1. **Insert → Embed → By URL**, paste the page's Embed URL, choose **Whole page**.
2. Stretch the embed to the full content width, tall enough to avoid an inner scrollbar where
   practical (about 1400px; UTM Builder and URL QA need the most, results render below the form).
3. Keep the native page header hidden or minimal (Title only).
4. Confirm there is only one navigation: the Sites top menu. A second row of tabs inside the
   embed means the `?page=` is missing or mistyped.
5. Set the page's custom path (⋮ → Properties) to the path in the table above.

Never embed a `sites.google.com` or `googleusercontent.com` URL. Only the `script.google.com`
`/exec` URL.

## Changing the web app

Code changes don't need Sites changes: every page embeds the same `/exec` URL. Deploy as the
README says (pull `main`, paste `code.gs` and `Index.html`, publish a **new version** of the
existing deployment so `/exec` stays the same).

Adding a tool means a new panel in `Index.html`, its id in `GENERATOR_PAGES`, and a new Sites page
with that `?page=`. The test suite fails if `GENERATOR_PAGES` and the panels drift apart.

## Validation after a change

1. Open the published Home page.
2. Use the Sites top menu to open each tool page. Each loads its tool directly, with no in-app
   tab bar, at `https://sites.google.com/viralnation.com/vn-taxonomy-generator/<path>`.
3. UTM Builder: pick Brand *Unique Vacations Inc.* and confirm the form appears.
4. Browser Back / Forward moves between pages.
5. Home still shows the full tabbed version.
6. Check one page at a narrow window width.
7. Roll back the Apps Script deployment to the previous version if anything required fails.

## Agent prompt (ChatGPT or Claude browser agent)

To have an agent build or rebuild the pages, paste this. It stops for approval before publishing.

````text
You are updating the Google Site "VN Taxonomy Generator"
(https://sites.google.com/viralnation.com/vn-taxonomy-generator/home) so that each tool has its own
page. Follow the same process used for the Viral Nation PM Operating Hub
(https://sites.google.com/viralnation.com/perf-mkrt-operating-hub): one native Google Sites page per
section, each embedding the same Apps Script web app with a different ?page= value, using
Insert → Embed → By URL, with one global navigation.

RULES
- Do not change the site theme, delete any page, or edit or redeploy the Apps Script project.
- Leave the existing Home page and its embed exactly as they are.
- Never embed a sites.google.com URL or a googleusercontent.com URL. Only the script.google.com /exec URL.
- Do NOT click Publish until I approve. Stop and ask me first (step 5).

STEP 1 — Get the web app URL from the existing Home page
1. Open the site in the Google Sites editor.
2. On the Home page, click the existing embed, then the pencil (edit) icon, and copy its URL.
3. It must look like https://script.google.com/a/macros/viralnation.com/s/<ID>/exec
   or https://script.google.com/macros/s/<ID>/exec
   Remove anything after "/exec" (any ? or #). Call this EXEC_URL.
4. If the URL doesn't match that pattern, stop and tell me what you found.

STEP 2 — Create five top-level pages, in this order
Pages panel → "+" → New page. After creating each one, open its ⋮ menu → Properties
and set the custom path exactly:

| # | Page name           | Custom path        | Embed URL                  |
|---|---------------------|--------------------|----------------------------|
| 1 | Generator           | generator          | EXEC_URL?page=gen          |
| 2 | Extractor & Editor  | extractor-editor   | EXEC_URL?page=ext          |
| 3 | Taxonomy QA         | taxonomy-qa        | EXEC_URL?page=qa           |
| 4 | UTM Builder         | utm-builder        | EXEC_URL?page=url          |
| 5 | URL QA              | url-qa             | EXEC_URL?page=urlqa        |

The ?page= values are case-sensitive and must be exactly as written.

STEP 3 — Add the embed to each page (repeat for all five)
1. Insert → Embed → "By URL" tab → paste that page's Embed URL → choose "Whole page" → Insert.
2. Stretch the embed to the full content width. Make it tall enough that the tool has no
   inner scrollbar where practical (start around 1400px; UTM Builder and URL QA need the most
   height because results render below the form).
3. Keep the native page header hidden or minimal: set the header to "Title only" or remove it,
   matching the Hub.

STEP 4 — Check in Preview (eye icon), on every one of the five pages
- The embed opens directly on that tool. Generator shows the P1/P2/P3 form; UTM Builder shows
  the Brand picker; URL QA shows the URL paste box; and so on.
- There is NO second row of tabs inside the embed (the in-app tab bar hides itself on these
  pages). If you see the in-app tabs, the Embed URL is missing or has a mistyped ?page=;
  fix it.
- Only one navigation: the Google Sites top menu, listing Home plus the five new pages.
- UTM Builder smoke test: pick Brand "Unique Vacations Inc." and confirm the form fields appear.
- Home still shows the original full tabbed version.
- Check one page at a narrow window width too.

STEP 5 — Stop and report before publishing
Give me a table: page name | custom path | Embed URL used | preview result (pass/fail + notes).
Wait for my approval. Once I approve, click Publish.

STEP 6 — Validate the published site (after I approve and you publish)
1. Open https://sites.google.com/viralnation.com/vn-taxonomy-generator/home.
2. Use the top navigation to open each of the five pages; confirm the URL is
   https://sites.google.com/viralnation.com/vn-taxonomy-generator/<custom path>
   and the right tool loads, with no in-app tab bar.
3. Confirm browser Back / Forward moves between the pages.
4. Report the final table with the published URLs.
````
