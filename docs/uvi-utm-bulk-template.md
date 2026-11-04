# UVI UTM bulk template — Claude instructions

How the team turns a Meta (or TikTok) bulk export into URLs for **Unique Vacations Inc.**
(Sandals / Beaches) without typing each one into the UTM Builder.

```
Meta Ads Manager ── Export (bulk edit sheet) ──► Claude.ai ── fills ──► uvi-utm-bulk-template.csv
                                                                              │
             Ads Manager ◄── Import ── meta-url-tags-import.csv ◄── UTM Builder (Bulk sheet upload)
```

1. **Export.** Ads Manager → select the ads → Export & import → *Export selected* (or all).
2. **Claude.** Start a chat in Claude.ai, attach the export, and paste the prompt in [the prompt section](#prompt-to-paste-into-claudeai).
   Claude returns `uvi-utm-bulk-template.csv` and a short exceptions list.
3. **Build.** In the generator: UTM Builder → Brand *Unique Vacations Inc.* → Mode *Bulk sheet upload* →
   upload the CSV → **Build URL**. Every row is built, validated, and its destination checked for liveness.
   A row with a bad value fails on its own and the rest still build.
4. **Traffic.** Either copy the **UTM String** into each ad's *Tracking → URL parameters* field, or click
   **Download Meta bulk-import file** and import it (Export & import → Import ads in bulk).
   **Import one ad first** and open its *Preview URL* to confirm the parameters resolve before you import the rest.

---

## The template

One row per ad. Column order does not matter (the upload matches headers), but header text does.

| Column | Required | What goes in it |
|---|---|---|
| Platform Campaign ID | | Copied from the export, prefix included (`cg:…`). Carried to the output, never part of the URL. |
| Platform Ad Set ID | | Same, `c:…` |
| Platform Ad ID | | Same, `a:…`. Needed for the Meta bulk-import file. |
| Ad Name | | Copied. Lets a human match the output row to the ad. |
| Destination URL | ✓ | The landing page, **no `?` or anything after it**. Case kept exactly. |
| UTM Source | ✓ | `facebookinstagram`, `facebook`, `instagram`, `tiktok`, `google`, `na` |
| Campaign Name | ✓ | Free text, e.g. `Beaches Always On` (generator lowercases and strips spaces) |
| Geo | ✓ | `usa`, `can`, `usacan`, `na`, `northeast`, `south`, `midwest`, `west` |
| Objective | ✓ | `Awareness`, `Video Views`, `Traffic`, `Engagement`, `App Promotion`, `Lead Generation`, `Conversions`, `Sales` |
| Influencer Handle | ✓ | Handle + audience word, e.g. `mccall.mitchell lookalike` |
| Hotel Code | ✓ | `SSV`, `SND`, `BTC`, `SRB`, `SLU`, `SNG`, `SDR`, `SCR`, `SGO` |
| Creative Type | ✓ | `video`, `carousel`, `static`, `influencervideo`, `influencercarousel` |
| Asset Version | ✓ | Usually `1`, `2`, … |
| UTM Ad ID | ✓ | A dynamic token (below) or a literal numeric ad ID |

Platform and placement are **not** columns: the generator appends them automatically (see below).

## What the URL looks like

Everything dynamic lives in `utm_campaign`, because GA4 only receives source / medium / campaign for these
sessions. `utm_source` and `utm_medium` don't change, so GA4 channel grouping doesn't change either.

```
utm_source=facebookinstagram&utm_medium=cpc&utm_campaign=
viralnation_<funnel>_<campaign>_<geo>_<objective>_<influencer>_<hotel>_<creativeType>_<assetVersion>_<adId>_<platform>_<placement>
 1           2        3          4     5           6            7       8              9              10     11         12+
```

| Platform | Segments 10–12 as built | What GA4 receives after a click |
|---|---|---|
| Meta | `{{ad.id}}_{{site_source_name}}_{{placement}}` | `120251072809800107_fb_Facebook_Desktop_Feed` (real test click) |
| TikTok | `__ADID_V2___tiktok___PLACEMENT__` | `1848619894102082_tiktok_TikTok` |
| Google / na | `{creative}` (no 11–12) | unchanged 10-segment string |

**Reading it back.** Segments 1–10 are where they have always been. Segment 11 is the platform: `fb`, `ig`,
`msg`, `an`, `th` or `tiktok`. Segment 12 is the placement. **Re-join segment 12 onward with `_`**, because
Meta's placement values contain underscores (`instagram_stories`, `audience_network_rewarded_video`).
GA4 already holds 9- and 10-segment UVI campaigns side by side, so anything that reads them already copes with
a variable segment count. It needs one change: read 11 and 12+ when they exist.

**Known values.** Meta documents `{{site_source_name}}` as `fb`, `ig`, `msg`, `an`, `th`. For `{{placement}}` it
documents only 11 values: `facebook_feed`, `facebook_instream`, `facebook_marketplace`, `facebook_right_column`,
`instagram_feed`, `instagram_stories`, `messenger_inbox`, `messenger_sponsored_messages`, `threads_stream`,
`audience_network_classic`, `audience_network_rewarded_video`. **Reels, Facebook Stories, Explore and Search
are not on the list.** TikTok documents `__PLACEMENT__` as the app (TikTok / Pangle), not feed vs. search.
Confirm what both platforms actually send during the test week before building reports on segment 12.

**Observed (Meta preview click, 2026-11-03):** Meta sent `Facebook_Desktop_Feed`, **not** the documented
`facebook_feed`: capitalised, and with the device included. Treat segment 12 as free text from Meta. Lowercase
it in reporting (GA4 is case-sensitive), and don't hard-code the documented list. Meta also appends its own
`utm_id` (campaign), `utm_content` (ad), `utm_term` (ad set), `campaign_id`, `ad_id` and `fbclid` on accounts with
automatic URL parameters on. These don't touch `utm_campaign`. Meta's `ad_id` should equal segment 10 on a
delivered click, which makes it a built-in check.

### UTM Ad ID: dynamic tokens

The platform replaces the token with the real ad ID when someone clicks, so a URL can be built **before the ad
exists**. That removes the old loop of launching, exporting, copying each ID, rebuilding and re-uploading.

| Platform | Token | Note |
|---|---|---|
| Meta | `{{ad.id}}` | Use with source `facebookinstagram` / `facebook` / `instagram` |
| TikTok | `__ADID_V2__` | Smart+ macro, TikTok's default campaign type. **Not `__AID__`**: that is the *ad group* ID. |
| Google / YouTube | `{creative}` | |

The generator refuses a token that doesn't match the row's UTM Source.

---

## Prompt to paste into Claude.ai

> Attach the bulk export first. Copy everything inside the box.

````text
You are filling the Viral Nation "UVI UTM bulk template" from the Meta Ads bulk export I attached.
Output ONE CSV file named uvi-utm-bulk-template.csv with exactly these headers, in this order:

Platform Campaign ID,Platform Ad Set ID,Platform Ad ID,Ad Name,Destination URL,UTM Source,Campaign Name,Geo,Objective,Influencer Handle,Hotel Code,Creative Type,Asset Version,UTM Ad ID

The export is a tab-separated, UTF-16 file. One output row per export row that has an "Ad ID". Never invent a value.
If a rule below cannot produce a value, leave the cell blank and list the row in the exceptions table.

ID and name columns, copied verbatim (keep prefixes like "a:", "c:", "cg:"):
- Platform Campaign ID = "Campaign ID"; Platform Ad Set ID = "Ad Set ID"; Platform Ad ID = "Ad ID"; Ad Name = "Ad Name".

Destination URL = "Link" with the "?" and everything after it removed. Do not change letter case.

STEP A — If "Link" already carries a UVI utm_campaign (it starts "viralnation_" and has 10 or more
"_"-separated segments), REUSE it, so reporting values stay continuous:
  segment 3 → Campaign Name, 4 → Geo, 5 → Objective (map "traffic"→Traffic, "awareness"→Awareness,
  "videoviews"→Video Views, "engagement"→Engagement, "apppromotion"→App Promotion,
  "leadgeneration"→Lead Generation, "conversions"→Conversions, "sales"→Sales),
  6 → Influencer Handle, 7 → Hotel Code (uppercase), 8 → Creative Type, 9 → Asset Version,
  and utm_source → UTM Source. Ignore segment 10 onward (old typed ad ID, platform, placement).
  Copy these exactly as they appear (lowercase, no spaces is fine: the generator normalises both forms).
  Still reuse them, but ADD AN EXCEPTION when the reused value disagrees with the ad's own name:
  - segment 6 does not start with Ad Name segment 12's handle (compare lowercase, ignore spaces), or
  - Ad Name segment 13 has "V<number>" and segment 9 is a different number.

STEP B — Otherwise derive each value from the names (" | "-separated segments, counting from 1):
- UTM Source from "Publisher Platforms": facebook + instagram → facebookinstagram; facebook only → facebook;
  instagram only → instagram. Anything else (messenger, audience_network, threads included) → exception.
- Campaign Name = Campaign Name segments 3 and 4 joined with a space ("VN | Beaches | Always On | …" → "Beaches Always On").
- Geo = Ad Set Name segment 3, lowercased ("Midwest" → midwest; "USA" → usa; "Canada" → can; "USA + CAN" → usacan).
  Must be one of: usa, can, usacan, na, northeast, south, midwest, west.
- Objective from "Campaign Objective": Traffic → Traffic; Awareness → Awareness; Engagement → Engagement;
  Leads → Lead Generation; Sales → Sales; App promotion → App Promotion.
- Influencer Handle = Ad Name segment 12 (only the part before " ~ " if present), a space, then the audience word
  from Ad Set Name segment 1: starts "LAL" → lookalike; contains "RTG" → retargeting; anything else → exception.
- Hotel Code from the Destination URL:
    beaches.com/resorts/turks-caicos → BTC     sandals.com/royal-bahamian → SRB
    sandals.com/sandals-saint-vincent → SSV    sandals.com/negril → SNG
    sandals.com/dunns-river → SDR              sandals.com/royal-curacao → SCR
    sandals.com/ochi → SGO
  Match on host + path, ignoring "https://", "www." and a trailing "/". Any other page → exception.
- Creative Type = Ad Name segment 4 lowercased with spaces removed ("Influencer Video" → influencervideo).
  Must be one of: video, carousel, static, influencervideo, influencercarousel.
- Asset Version = the number after "V" in Ad Name segment 13 ("Reel V2" → 2); if there is none → 1, and list
  the row as an exception so a human confirms it.

ALWAYS (both steps):
- UTM Ad ID = {{ad.id}}   (Meta's dynamic ad ID token, typed exactly like that)

Apply the allowed-value lists above (UTM Source, Geo, Objective, Hotel Code, Creative Type) to EVERY row,
from either step. A value outside its list → exception.

Then reply with:
1. The CSV file.
2. A count: rows written, rows from STEP A, rows from STEP B.
3. An exceptions table (Platform Ad ID, Ad Name, column, reason). Include every row whose "Link" had no UTM at all
   (column: "all UTM fields").
````

### TikTok exports

Same template. UTM Source is `tiktok` and UTM Ad ID is `__ADID_V2__`. There is no TikTok re-import file yet. Paste the **Full URL** into each ad's destination URL.

---

## Why the UTM goes in URL parameters, not the website URL

Meta documents its dynamic parameters for the *URL parameters* field (bulk sheet column **URL Tags**). The
re-import file therefore writes the clean landing page to **Link** and the UTM string to **URL Tags**. Leaving
the old UTM in Link as well would send every parameter twice.

Ads built on an **existing post** (boosted / partnership ads) can refuse a Link change. If the test import
rejects Link on those, drop that column and import URL Tags only, after removing the old UTM from the post's link.
