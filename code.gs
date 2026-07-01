/**
 * Conair Corp Taxonomy Tool — Web App edition
 * ---------------------------------------------
 * Standalone Apps Script deployed as a Google Web App. Meant to be embedded in
 * a Google Site (or accessed directly by URL). All three tools (Generator,
 * Extractor, QA Check) run in the browser via the same HTML UI.
 *
 * Data sources:
 *   - Hardcoded TAXONOMY defaults (below)
 *   - "Taxonomy Config"   tab in the data spreadsheet (allowed-values overrides)
 *   - "Taxonomy Products" tab in the data spreadsheet (product catalogue)
 *
 * Permissions: the Web App is deployed with "Execute as user accessing",
 * which means each user's own Google identity is used to read the data sheet
 * and create any exported spreadsheets. Share the data sheet with edit
 * permission for admins and at least view permission for all users.
 *
 * Required setup:
 *   1. Replace DATA_SHEET_ID below with the ID of your data spreadsheet.
 *      (The ID is the long string in the sheet URL after /d/.)
 *   2. In the Apps Script editor, run ensureConfigSheet() once,
 *      ensureProductsSheet() once, and ensureDomainMapSheet() once — these
 *      seed the three data tabs on the data sheet.
 *   3. Deploy > New deployment > type=Web app, execute as "User accessing",
 *      access="Anyone" (or your domain). Save the Web App URL.
 *   4. In Google Sites: Insert > Embed > paste the Web App URL > Publish.
 */

// =========================================================================
// CONFIG
// =========================================================================

/** The ID of the data spreadsheet that holds Taxonomy Config + Taxonomy Products + Taxonomy Domain Map tabs.
 *  Points to the "2026 Naming Convention Fields" workbook. */
const DATA_SHEET_ID = '17dmHwLzwkyJy7mi-UonYkiESx81ioyx6-Mu1DgU0lY4';

const CONFIG_SHEET_NAME = 'Taxonomy Config';
const CONFIG_HEADER = ['Level', 'Field Key', 'Field Label', 'Allowed Values (one per line, or | separated)'];
const PRODUCTS_SHEET_NAME = 'Taxonomy Products';
const PRODUCTS_HEADER = ['Brand', 'Product SKU', 'Product Category', 'Product Name', 'Retailer URLs'];
/**
 * Preferred per-brand format: one tab per brand, named "Products: <Brand>".
 * Columns: Product SKU | Product Category | Product Name (brand implicit from tab).
 * If these tabs exist, they take priority over the single legacy Taxonomy Products tab.
 */
const PER_BRAND_TAB_PREFIX = 'Products: ';
const PER_BRAND_HEADER = ['Product SKU', 'Product Category', 'Product Name', 'Retailer URLs'];
const DOMAIN_MAP_SHEET_NAME = 'Taxonomy Domain Map';
const DOMAIN_MAP_HEADER = ['URL Hostname (e.g., amazon.com)', 'LP Domain Value', 'Brand (blank = any brand)'];

/** Characters that must never appear in free-text values because they are
 *  used as taxonomy separators. Any user-entered value containing these is
 *  rejected at build/validate time. */
const RESERVED_CHARS = ['|', '~'];

/** Fallback list of brands that use the product format (Funding + SKU + Category).
 *  The actual list is derived at runtime from the Products sheet — any brand with
 *  at least one non-"Mixed" SKU is treated as product-based. This default kicks
 *  in only when no Products sheet exists. */
const PRODUCT_BRANDS_DEFAULT = ['Conair', 'BaBylissPRO', 'Cuisinart'];

/** Returns the set of product-based brand names as an array of strings. */
function getProductBrands_() {
  const products = loadProducts();
  if (products && products.byBrand) {
    const real = Object.keys(products.byBrand).filter(function(brand) {
      return (products.byBrand[brand] || []).some(function(p) {
        return p.sku && String(p.sku).toLowerCase() !== 'mixed';
      });
    });
    if (real.length > 0) return real;
  }
  return PRODUCT_BRANDS_DEFAULT.slice();
}

function isProductBrand_(brand) {
  if (!brand) return false;
  return getProductBrands_().indexOf(String(brand).trim()) !== -1;
}

// =========================================================================
// SPEC — built-in defaults. Config sheet can override allowed values.
// =========================================================================

const FUNNEL_MAP = {
  'Awareness (Impressions)': 'Upper Funnel',
  'Awareness (Reach)':       'Upper Funnel',
  'Awareness (Video Views)': 'Upper Funnel',
  'Video Views':             'Upper Funnel',
  'Traffic':                 'Middle Funnel',
  'Engagement':              'Middle Funnel',
  'Lead Generation':         'Lower Funnel',
  'Sales':                   'Lower Funnel'
};

const TAXONOMY = {
  P1: {
    label: 'Campaign (P1)',
    fields: [
      { key: 'jobCode',   label: 'Project / Job Code',  type: 'text',     required: true },
      { key: 'agency',    label: 'Agency',              type: 'fixed',    value: 'VN', required: true },
      { key: 'brand',     label: 'Brand',               type: 'dropdown', required: true,  options: ['Conair','BaBylissPRO','Cuisinart'] },
      { key: 'funding',   label: 'Funding Type',        type: 'dropdown', required: false, options: ['BRD','DTC'], note: 'Required for product-based brands (Conair / BaBylissPRO / Cuisinart). Omit for other brands.' },
      { key: 'campaign',  label: 'Campaign Name',       type: 'text',     required: true },
      { key: 'geo',       label: 'Geo',                 type: 'dropdown', required: true,  options: ['USA','USA & CAN','UK','Europe','US & CA & UK'] },
      { key: 'objective', label: 'Objective',           type: 'dropdown', required: true,  options: Object.keys(FUNNEL_MAP) },
      { key: 'funnel',    label: 'Funnel Level',        type: 'auto',     derivedFrom: 'objective', map: FUNNEL_MAP },
      { key: 'bid',       label: 'Bid Strategy',        type: 'dropdown', required: true,  options: ['ABO','CBO'] },
      { key: 'startDate', label: 'Start Date',          type: 'date',     required: true },
      { key: 'endDate',   label: 'End Date',            type: 'date',     required: true },
      { key: 'customId',  label: 'Custom Identifier',   type: 'text',     required: false, emptyDefault: 'NA' }
    ]
  },
  P2: {
    label: 'Ad Set (P2)',
    fields: [
      { key: 'targeting',  label: 'Targeting Type',       type: 'dropdown', required: true,  options: ['INT','LAL','OPEN','SMRT','MIXED RTG','MIXED PROSP'] },
      { key: 'audience',   label: 'Target Audience',      type: 'text',     required: true },
      { key: 'campaign',   label: 'Campaign Name',        type: 'text',     required: true,  note: 'Must match a P1 Campaign Name' },
      { key: 'geo',        label: 'Geo',                  type: 'dropdown', required: true,  options: ['USA','USA & CAN','UK','Europe','US & CA & UK'] },
      { key: 'gender',     label: 'Gender',               type: 'dropdown', required: true,  options: ['MF','F','M'] },
      { key: 'minAge',     label: 'Min Age',              type: 'dropdown', required: true,  options: ['13','16','18','21','23','25','30','35','40','45'] },
      { key: 'maxAge',     label: 'Max Age',              type: 'dropdown', required: true,  options: ['24','34','44','54','64','65+'], note: 'Include "65+" as an option for open-ended upper caps' },
      { key: 'optEvent',   label: 'Optimization Event',   type: 'dropdown', required: true,  options: ['Engagements','Landing Page Clicks','Landing Page Views','Link Clicks','Purchase','Reach','Video Views'] },
      { key: 'platform',   label: 'Platform',             type: 'dropdown', required: true,  options: ['FB+IG','IG','LI','Meta','TT','YT','Pinterest'] },
      { key: 'placement',  label: 'Placement',            type: 'dropdown', required: true,  options: ['FEED','MIXED','SHORTS'] },
      { key: 'startDate',  label: 'Start Date',           type: 'date',     required: true },
      { key: 'endDate',    label: 'End Date',             type: 'date',     required: true },
      { key: 'influencer', label: 'Influencer Handle',   type: 'text',     required: false, emptyDefault: 'NA' },
      { key: 'customId',   label: 'Custom Identifier',   type: 'text',     required: false, emptyDefault: 'NA' }
    ]
  },
  P3: {
    label: 'Ad Name (P3)',
    fields: [
      { key: 'rowNum',      label: 'Creative Variant / Row Number', type: 'text',     required: true,  note: 'Do NOT enter "R#:" — it is auto-prefixed' },
      { key: 'adName',      label: 'Ad Name',                       type: 'text',     required: true },
      { key: 'assetType',   label: 'Asset Type',                    type: 'dropdown', required: true,  options: ['Darkposted','Boosted','Organic'] },
      { key: 'creativeType',label: 'Creative Type',                 type: 'dropdown', required: true,  options: ['Brand Carousel','Brand Video','Brand Static','Influencer Video','Influencer Static','Catalog'] },
      { key: 'aspectRatio', label: 'Aspect Ratio',                  type: 'dropdown', required: true,  options: ['1x1','9x16','4x5','16x9','MIX'] },
      { key: 'videoLength', label: 'Video Length (sec)',            type: 'dropdown', required: true,  options: ['NA','6','15','25','30','45','55','60','90'], note: 'Use NA for static/catalog assets' },
      { key: 'bodyCopy',    label: 'Body Copy',                     type: 'text',     required: true,  note: 'Do NOT enter "BC:" — it is auto-prefixed' },
      { key: 'cta',         label: 'CTA',                           type: 'dropdown', required: true,  options: ['Shop Now','Book Now','Learn More','Sign Up','Download','Get Offer','Apply Now','Watch More','Contact Us','Subscribe'] },
      { key: 'domain',      label: 'Landing Page Domain',           type: 'dropdown', required: true,  options: ['Owned','Amazon','Retailer','Multi-Retailer','Walmart','Target','BestBuy'] },
      { key: 'productCat',  label: 'Product Category',              type: 'text',     required: false, note: 'Required for product-based brands (Conair / BaBylissPRO / Cuisinart)' },
      { key: 'productSku',  label: 'Product SKU Code',              type: 'text',     required: false, note: 'Just the SKU (e.g., DGB-30). Required for product-based brands' },
      { key: 'landingPage', label: 'Landing Page',                  type: 'text',     required: false, note: 'Free-form label used by non-product brands (e.g., Turks Caicos, Sign Up)' },
      { key: 'startDate',   label: 'Start Date',                    type: 'date',     required: true },
      { key: 'endDate',     label: 'End Date',                      type: 'date',     required: true },
      { key: 'influencer',  label: 'Influencer Handle',             type: 'text',     required: false, emptyDefault: 'NA' },
      { key: 'customId',    label: 'Custom Identifier',             type: 'text',     required: false, emptyDefault: 'NA' }
    ]
  }
};

// =========================================================================
// DATA-SHEET ACCESS
// =========================================================================

function getDataSpreadsheet_() {
  if (!DATA_SHEET_ID || DATA_SHEET_ID === 'PASTE_YOUR_DATA_SPREADSHEET_ID_HERE') {
    throw new Error('DATA_SHEET_ID is not configured. Open Code.gs in the Apps Script editor and paste your data spreadsheet ID.');
  }
  return SpreadsheetApp.openById(DATA_SHEET_ID);
}

function getDataSheetUrl() {
  try {
    return getDataSpreadsheet_().getUrl();
  } catch (e) {
    return null;
  }
}

// =========================================================================
// WEB APP ENTRY POINT
// =========================================================================

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Taxonomy Tools')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =========================================================================
// OUTPUT BUILDERS — mirror the exact formulas in your sheet
// =========================================================================

function buildOutput(level, v) {
  const f = (x) => (x === undefined || x === null) ? '' : String(x).trim();
  const d = (x) => formatDate(x);

  // Block any free-text field value that contains taxonomy-reserved characters.
  // Without this guard, generated names would be unparseable / corrupt.
  const fields = (TAXONOMY[level] || {}).fields || [];
  fields.forEach(function(fld) {
    if (fld.type !== 'text') return;
    const val = f(v[fld.key]);
    if (!val) return;
    RESERVED_CHARS.forEach(function(c) {
      if (val.indexOf(c) !== -1) {
        throw new Error('Field "' + fld.label + '" contains the reserved character "' + c + '". Remove it before generating (reserved characters: ' + RESERVED_CHARS.join(' ') + ').');
      }
    });
  });

  if (level === 'P1') {
    const customId = f(v.customId) || 'NA';
    const funding  = f(v.funding);
    const campaign = f(v.campaign);
    // Product-based brands (Conair/BaBylissPRO/Cuisinart) include a "FUNDING - "
    // prefix on the campaign segment. Non-product brands (Samsung, Sandals,
    // corporate, etc.) omit it entirely — segment 4 is just the campaign name.
    const campaignSegment = funding ? (funding + ' - ' + campaign) : campaign;
    return [
      'P#: ' + f(v.jobCode),
      f(v.agency),
      f(v.brand),
      campaignSegment,
      f(v.geo),
      f(v.objective),
      FUNNEL_MAP[f(v.objective)] || '',
      f(v.bid),
      d(v.startDate),
      d(v.endDate),
      customId
    ].join(' | ');
  }

  if (level === 'P2') {
    // Strip a leading "@" from the influencer handle for consistency — users
    // sometimes paste handles with the "@" prefix; we always emit them clean.
    const influencer = f(v.influencer).replace(/^@+/, '') || 'NA';
    const customId   = f(v.customId)   || 'NA';
    return f(v.targeting) + ': ' + [
      f(v.audience),
      f(v.campaign),
      f(v.geo),
      f(v.gender),
      f(v.minAge) + '-' + f(v.maxAge),
      f(v.optEvent),
      f(v.platform),
      f(v.placement),
      d(v.startDate),
      d(v.endDate),
      influencer,
      customId
    ].join(' | ');
  }

  if (level === 'P3') {
    // Strip leading "@" from the influencer handle for consistency.
    const influencer = f(v.influencer).replace(/^@+/, '') || 'NA';
    const customId   = f(v.customId)   || 'NA';
    const productCat = f(v.productCat);
    const productSku = f(v.productSku);
    const landingPage = f(v.landingPage);
    // Build the LP segment based on which fields are populated:
    //   - Product format:      LP: {domain} ~ {category} ({sku})
    //   - Non-product format:  LP: {domain} ~ {landingPage}
    // If both are set, product format wins (keeps existing Conair behaviour).
    let lpSegment;
    if (productSku && productCat) {
      lpSegment = 'LP: ' + f(v.domain) + ' ~ ' + productCat + ' (' + productSku + ')';
    } else if (landingPage) {
      lpSegment = 'LP: ' + f(v.domain) + ' ~ ' + landingPage;
    } else {
      // Fallback: single NA as landing page so the output stays well-formed
      lpSegment = 'LP: ' + f(v.domain) + ' ~ NA';
    }
    return 'R#:' + [
      f(v.rowNum),
      f(v.adName),
      f(v.assetType),
      f(v.creativeType),
      f(v.aspectRatio),
      f(v.videoLength),
      'BC: ' + f(v.bodyCopy),
      'CTA: ' + f(v.cta),
      lpSegment,
      d(v.startDate),
      d(v.endDate),
      influencer,
      customId
    ].join(' | ');
  }

  throw new Error('Unknown level: ' + level);
}

// =========================================================================
// PARSERS — reverse of buildOutput. Used by Extractor + QA.
// =========================================================================

/**
 * When a taxonomy name's segment count doesn't match what the level expects,
 * walk the expected fields against the actual segments using per-field
 * matchers (strict patterns for fields with known formats like "BC:",
 * "LP:", date patterns, fixed value lists, etc.) and identify which
 * field(s) most likely went missing.
 *
 * Returns an array of human-readable issue strings — e.g.:
 *   ["Body Copy field appears to be missing — segment 7 'CTA: Shop Now'
 *    does not look like a valid Body Copy value (expected to start with 'BC: ')"]
 *
 * Algorithm: greedy walk — when a strict-matcher field doesn't fit the
 * current segment, mark it missing and try the next field on the same
 * segment. When a loose-matcher (free-text) field is encountered, consume
 * the segment as its value. This handles the most common error class
 * (missing required strict field) and produces clean per-field reports
 * instead of cascading every downstream slot as broken.
 */
function diagnoseSegments_(level, parts) {
  const ISO_DATE = /^\d{4}-\d{1,2}-\d{1,2}$/;
  const MDY_DATE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
  const isDateLike = function(s) {
    s = String(s || '').trim();
    return MDY_DATE.test(s) || ISO_DATE.test(s);
  };

  // Matchers are PATTERN-based, not LIST-based. They answer "does this segment
  // look like the right KIND of value for this slot?" — not "is it in the
  // allowed-values list?" Strict value validation runs separately in
  // validateValues() once the structure is known to be intact.
  //
  // Example: Video Length 70 is a valid number-kind value even if 70 isn't
  // in the spec's allowed list ['NA','6','15','25','30','45','55','60','90'].
  // The diagnostic should accept "70" as Video-Length-shaped and let value
  // validation catch the out-of-list issue separately. If the matcher were
  // list-based, the diagnostic would falsely blame Video Length for being
  // "missing" whenever a non-standard duration was used.
  // Spec slots include a `key` matching the TAXONOMY field key the slot maps to
  // (or, for slots that combine multiple sub-fields like P3's "LP" segment,
  // a stand-in key that downstream code can recognize). The walker uses these
  // keys to attach structured field-issue objects and produce an aligned
  // segments array — empty strings inserted where fields are missing — that
  // parseName can use directly for value extraction.
  let spec;
  if (level === 'P1') {
    spec = [
      { key: 'jobCode',   label: 'Project / Job Code',  match: null },
      { key: 'agency',    label: 'Agency',              match: function(v) { return /^VN$/i.test(String(v).trim()); } },
      { key: 'brand',     label: 'Brand',               match: function(v) { return /^[A-Za-z][A-Za-z0-9]*$/.test(String(v).trim()); } },
      { key: 'campaign',  label: 'Campaign Name',       match: null },
      { key: 'geo',       label: 'Geo',                 match: function(v) { return /^(USA|USA & CAN|UK|Europe|US & CA & UK|CAN|EU|GLOBAL)$/i.test(String(v).trim()); } },
      { key: 'objective', label: 'Objective',           match: function(v) { return /^(Awareness|Video Views|Traffic|Engagement|Lead Generation|Sales|App Promotion|Conversions|Reach|Impressions)/i.test(String(v).trim()); } },
      { key: 'funnel',    label: 'Funnel Level',        match: function(v) { return /^(Upper|Middle|Lower)\s+Funnel$/i.test(String(v).trim()); } },
      { key: 'bid',       label: 'Bid Strategy',        match: function(v) { return /^(ABO|CBO)$/i.test(String(v).trim()); } },
      { key: 'startDate', label: 'Start Date',          match: isDateLike },
      { key: 'endDate',   label: 'End Date',            match: isDateLike },
      { key: 'customId',  label: 'Custom Identifier',   match: null }
    ];
  } else if (level === 'P2') {
    spec = [
      { key: 'audience',   label: 'Target Audience',     match: null },
      { key: 'campaign',   label: 'Campaign Name',       match: null },
      { key: 'geo',        label: 'Geo',                 match: function(v) { return /^(USA|USA & CAN|UK|Europe|US & CA & UK|CAN|EU|GLOBAL)$/i.test(String(v).trim()); } },
      { key: 'gender',     label: 'Gender',              match: function(v) { return /^(MF|F|M)$/i.test(String(v).trim()); } },
      { key: 'minAge',     label: 'Age Range',           match: function(v) { return /^\d+-\d+\+?$/.test(String(v).trim()); } },
      { key: 'optEvent',   label: 'Optimization Event',  match: null },
      { key: 'platform',   label: 'Platform',            match: function(v) { return /^[A-Z][A-Za-z0-9+]{0,15}$/.test(String(v).trim()); } },
      { key: 'placement',  label: 'Placement',           match: function(v) { return /^(FEED|MIXED|SHORTS|REELS|STORIES|EXPLORE|HOME)$/i.test(String(v).trim()); } },
      { key: 'startDate',  label: 'Start Date',          match: isDateLike },
      { key: 'endDate',    label: 'End Date',            match: isDateLike },
      { key: 'influencer', label: 'Influencer Handle',   match: null },
      { key: 'customId',   label: 'Custom Identifier',   match: null }
    ];
  } else if (level === 'P3') {
    spec = [
      { key: 'rowNum',       label: 'Creative Variant / Row Number', match: null },
      { key: 'adName',       label: 'Ad Name',             match: null },
      { key: 'assetType',    label: 'Asset Type',          match: function(v) { return /^(Darkposted|Boosted|Organic)$/i.test(String(v).trim()); } },
      { key: 'creativeType', label: 'Creative Type',       match: function(v) { return /^((Brand|Influencer)\s+\w+|Catalog)$/i.test(String(v).trim()); } },
      { key: 'aspectRatio',  label: 'Aspect Ratio',        match: function(v) { return /^(\d+x\d+|MIX)$/i.test(String(v).trim()); } },
      { key: 'videoLength',  label: 'Video Length',        match: function(v) { return /^(NA|\d+)$/i.test(String(v).trim()); } },
      { key: 'bodyCopy',     label: 'Body Copy',           match: function(v) { return /^BC:\s/.test(String(v).trim()); } },
      { key: 'cta',          label: 'CTA',                 match: function(v) { return /^CTA:\s/.test(String(v).trim()); } },
      // P3's LP slot combines domain/category/SKU (or domain/landing-page);
      // we tag the missing-segment issue with the 'domain' field key since
      // that's always required in the LP segment, and parseName will split
      // the combined value into its sub-fields downstream.
      { key: 'domain',       label: 'Landing Page',        match: function(v) { return /^LP:\s/.test(String(v).trim()); } },
      { key: 'startDate',    label: 'Start Date',          match: isDateLike },
      { key: 'endDate',      label: 'End Date',            match: isDateLike },
      { key: 'influencer',   label: 'Influencer Handle',   match: null },
      { key: 'customId',     label: 'Custom Identifier',   match: null }
    ];
  } else {
    return { issues: [], alignedParts: [] };
  }

  // -----------------------------------------------------------------------
  // POSITIVE-SHIFT CASE: too many segments because a "|" leaked into a
  // free-text field (e.g. the user typed "AFC-4 | Video 3 Cinnamon Rolls"
  // in Ad Name and the pipe split it into two segments). When this happens
  // the strict-matcher anchors downstream still hold their shape, so we can
  // brute-force try joining adjacent segments and pick the merge that walks
  // cleanly. The resulting issue clearly names the offending field instead
  // of cascading "X missing" errors down the rest of the row.
  // -----------------------------------------------------------------------
  if (parts.length > spec.length && parts.length - spec.length <= 3) {
    const extras = parts.length - spec.length;
    // Identify the first strict-matcher slot — extras must merge BEFORE it
    // (otherwise the strict matchers downstream wouldn't be hitting where
    // they hit). Try positions starting from rightmost-loose just before
    // the first strict, then fall back to the others.
    let firstStrictFIdx = spec.length;
    for (let i = 0; i < spec.length; i++) {
      if (spec[i].match) { firstStrictFIdx = i; break; }
    }
    const tryPositions = [];
    for (let p = firstStrictFIdx - 1; p >= 0; p--) {
      if (!spec[p].match) tryPositions.push(p);
    }
    // Fallback: any other position
    for (let p = 0; p < spec.length; p++) {
      if (tryPositions.indexOf(p) === -1) tryPositions.push(p);
    }
    for (let i = 0; i < tryPositions.length; i++) {
      const mergeAt = tryPositions[i];
      // Merge `extras + 1` adjacent segments starting at `mergeAt`
      if (mergeAt + extras + 1 > parts.length) continue;
      const merged = parts.slice(0, mergeAt)
        .concat([parts.slice(mergeAt, mergeAt + extras + 1).join(' | ')])
        .concat(parts.slice(mergeAt + extras + 1));
      // Walk the merged list and check if it walks cleanly (zero issues)
      let sIdx2 = 0;
      let cleanWalk = true;
      for (let fIdx = 0; fIdx < spec.length; fIdx++) {
        const f2 = spec[fIdx];
        if (sIdx2 >= merged.length) { cleanWalk = false; break; }
        if (f2.match) {
          if (f2.match(merged[sIdx2])) { sIdx2++; }
          else { cleanWalk = false; break; }
        } else {
          sIdx2++;
        }
      }
      if (cleanWalk && sIdx2 === merged.length) {
        const f = spec[mergeAt];
        return {
          issues: [{
            field: f.key,
            message: f.label + ' contains a reserved "|" character. The "|" is used as the segment separator — remove it from this field\'s value.'
          }],
          alignedParts: merged
        };
      }
    }
    // No clean merge found — fall through to the regular walker
  }

  const issues = [];
  const alignedParts = [];
  let sIdx = 0;
  for (let fIdx = 0; fIdx < spec.length; fIdx++) {
    const f = spec[fIdx];
    if (sIdx >= parts.length) {
      issues.push({ field: f.key, message: f.label + ' field appears to be missing' });
      alignedParts.push('');
      continue;
    }
    if (f.match) {
      if (f.match(parts[sIdx])) {
        alignedParts.push(parts[sIdx]);
        sIdx++;
      } else {
        // Strict matcher rejected — flag this field missing, push empty into
        // the aligned position, and retry the same segment against the next field.
        issues.push({ field: f.key, message: f.label + ' field appears to be missing' });
        alignedParts.push('');
      }
    } else {
      // Loose matcher (free-text): consume the segment as this field's value
      alignedParts.push(parts[sIdx]);
      sIdx++;
    }
  }
  if (sIdx < parts.length) {
    issues.push({ field: null, message: (parts.length - sIdx) + ' extra segment(s) at the end' });
  }
  return { issues: issues, alignedParts: alignedParts };
}

function parseName(level, name) {
  name = String(name || '').trim();
  // Normalize whitespace around pipe separators. The pipe is a reserved
  // character in every free-text field (we block it at build and flag it at
  // parse time), so ANY pipe must be acting as a segment separator — it's
  // safe to collapse " |", "| ", and "|" alike into the canonical " | ".
  // This prevents cosmetic issues like a missing space from cascading into
  // a dozen downstream validation errors.
  name = name.replace(/\s*\|\s*/g, ' | ');
  const issues = [];
  const values = {};

  try {
    if (level === 'P1') {
      if (!/^P#:\s*/.test(name)) {
        issues.push('Missing "P#:" prefix');
        return { ok: false, values: values, issues: issues };
      }
      const body = name.replace(/^P#:\s*/, '');
      const parts = body.split(' | ');
      if (parts.length !== 11) {
        const diag = diagnoseSegments_('P1', parts);
        const countMsg = 'Expected 11 segments, found ' + parts.length + '.';
        const fieldIssues = [{ field: null, message: countMsg }].concat(diag.issues);
        issues.push(countMsg);
        diag.issues.forEach(function(d) { issues.push(d.message); });
        const ap = diag.alignedParts;
        const alignedValues = { jobCode: ap[0] || '', agency: ap[1] || '', brand: ap[2] || '', geo: ap[4] || '', objective: ap[5] || '', funnel: ap[6] || '', bid: ap[7] || '', startDate: ap[8] || '', endDate: ap[9] || '', customId: ap[10] || '' };
        const camp = (ap[3] || '').match(/^([^\s-][^-]*?)\s-\s(.+)$/);
        if (camp) { alignedValues.funding = camp[1].trim(); alignedValues.campaign = camp[2].trim(); }
        else      { alignedValues.funding = ''; alignedValues.campaign = ap[3] || ''; }
        return { ok: false, values: alignedValues, issues: issues, fieldIssues: fieldIssues, structureBroken: true };
      }
      values.jobCode  = parts[0] || '';
      values.agency   = parts[1] || '';
      values.brand    = parts[2] || '';
      // Segment 4 can be either "FUNDING - Campaign Name" (product-based brands
      // like Conair / BaBylissPRO / Cuisinart) or just "Campaign Name" (other
      // brands). Try the product pattern first; if it doesn't match, treat the
      // whole thing as the campaign name — don't flag as an issue.
      const m = (parts[3] || '').match(/^([^\s-][^-]*?)\s-\s(.+)$/);
      if (m) {
        values.funding  = m[1].trim();
        values.campaign = m[2].trim();
      } else {
        values.funding  = '';
        values.campaign = parts[3] || '';
      }
      values.geo       = parts[4] || '';
      values.objective = parts[5] || '';
      values.funnel    = parts[6] || '';
      values.bid       = parts[7] || '';
      values.startDate = parts[8] || '';
      values.endDate   = parts[9] || '';
      values.customId  = parts[10] || '';
      return { ok: issues.length === 0, values: values, issues: issues };
    }

    if (level === 'P2') {
      const m = name.match(/^([^:]+):\s(.+)$/);
      if (!m) {
        issues.push('Missing "TARGETING: " prefix');
        return { ok: false, values: values, issues: issues };
      }
      values.targeting = m[1].trim();
      const body = m[2];
      const parts = body.split(' | ');
      if (parts.length !== 12) {
        const diag = diagnoseSegments_('P2', parts);
        const countMsg = 'Expected 12 segments after targeting prefix, found ' + parts.length + '.';
        const fieldIssues = [{ field: null, message: countMsg }].concat(diag.issues);
        issues.push(countMsg);
        diag.issues.forEach(function(d) { issues.push(d.message); });
        const ap = diag.alignedParts;
        const alignedValues = { targeting: values.targeting, audience: ap[0] || '', campaign: ap[1] || '', geo: ap[2] || '', gender: ap[3] || '', optEvent: ap[5] || '', platform: ap[6] || '', placement: ap[7] || '', startDate: ap[8] || '', endDate: ap[9] || '', influencer: ap[10] || '', customId: ap[11] || '' };
        const ageM = (ap[4] || '').match(/^([0-9]+)-([0-9]+\+?)$/);
        if (ageM) { alignedValues.minAge = ageM[1]; alignedValues.maxAge = ageM[2]; }
        else      { alignedValues.minAge = ''; alignedValues.maxAge = ''; }
        return { ok: false, values: alignedValues, issues: issues, fieldIssues: fieldIssues, structureBroken: true };
      }
      values.audience   = parts[0] || '';
      values.campaign   = parts[1] || '';
      values.geo        = parts[2] || '';
      values.gender     = parts[3] || '';
      const ageMatch = (parts[4] || '').match(/^([0-9]+)-([0-9]+\+?)$/);
      if (ageMatch) {
        values.minAge = ageMatch[1];
        values.maxAge = ageMatch[2];
      } else {
        values.minAge = '';
        values.maxAge = '';
        if (parts[4]) issues.push('Age range "' + parts[4] + '" does not match MIN-MAX pattern');
      }
      values.optEvent   = parts[5] || '';
      values.platform   = parts[6] || '';
      values.placement  = parts[7] || '';
      values.startDate  = parts[8] || '';
      values.endDate    = parts[9] || '';
      values.influencer = parts[10] || '';
      values.customId   = parts[11] || '';
      return { ok: issues.length === 0, values: values, issues: issues };
    }

    if (level === 'P3') {
      if (!/^R#:/.test(name)) {
        issues.push('Missing "R#:" prefix');
        return { ok: false, values: values, issues: issues };
      }
      const body = name.replace(/^R#:/, '');
      const parts = body.split(' | ');
      if (parts.length !== 13) {
        const diag = diagnoseSegments_('P3', parts);
        const countMsg = 'Expected 13 segments, found ' + parts.length + '.';
        const fieldIssues = [{ field: null, message: countMsg }].concat(diag.issues);
        issues.push(countMsg);
        diag.issues.forEach(function(d) { issues.push(d.message); });
        const ap = diag.alignedParts;
        // Build base values from aligned slots, stripping the "BC: " / "CTA: "
        // prefixes where present (matching the structurally-valid extraction path).
        const alignedValues = {
          rowNum: ap[0] || '', adName: ap[1] || '', assetType: ap[2] || '',
          creativeType: ap[3] || '', aspectRatio: ap[4] || '', videoLength: ap[5] || '',
          bodyCopy: (ap[6] || '').replace(/^BC:\s*/, ''),
          cta:      (ap[7] || '').replace(/^CTA:\s*/, ''),
          startDate: ap[9] || '', endDate: ap[10] || '',
          influencer: ap[11] || '', customId: ap[12] || ''
        };
        // Parse the LP segment (slot 8) into domain/category/SKU or domain/landingPage.
        const lpSeg = (ap[8] || '').replace(/^LP:\s*/, '');
        if (lpSeg) {
          const prodM = lpSeg.match(/^(.+?)\s~\s(.+?)\s\(([^()]+)\)$/);
          if (prodM) {
            alignedValues.domain = prodM[1].trim();
            alignedValues.productCat = prodM[2].trim();
            alignedValues.productSku = prodM[3].trim();
            alignedValues.landingPage = '';
          } else {
            const simpleM = lpSeg.match(/^(.+?)\s~\s(.+)$/);
            if (simpleM) {
              alignedValues.domain = simpleM[1].trim();
              alignedValues.productCat = ''; alignedValues.productSku = '';
              alignedValues.landingPage = simpleM[2].trim();
            } else {
              alignedValues.domain = ''; alignedValues.productCat = ''; alignedValues.productSku = ''; alignedValues.landingPage = lpSeg;
            }
          }
        } else {
          alignedValues.domain = ''; alignedValues.productCat = ''; alignedValues.productSku = ''; alignedValues.landingPage = '';
        }
        return { ok: false, values: alignedValues, issues: issues, fieldIssues: fieldIssues, structureBroken: true };
      }
      values.rowNum       = parts[0] || '';
      values.adName       = parts[1] || '';
      values.assetType    = parts[2] || '';
      values.creativeType = parts[3] || '';
      values.aspectRatio  = parts[4] || '';
      values.videoLength  = parts[5] || '';
      if (/^BC:\s/.test(parts[6] || '')) {
        values.bodyCopy = (parts[6] || '').replace(/^BC:\s/, '');
      } else {
        values.bodyCopy = parts[6] || '';
        if (parts[6]) issues.push('Body Copy segment missing "BC: " prefix');
      }
      if (/^CTA:\s/.test(parts[7] || '')) {
        values.cta = (parts[7] || '').replace(/^CTA:\s/, '');
      } else {
        values.cta = parts[7] || '';
        if (parts[7]) issues.push('CTA segment missing "CTA: " prefix');
      }
      const lp = parts[8] || '';
      if (/^LP:\s/.test(lp)) {
        const lpBody = lp.replace(/^LP:\s/, '');
        // Product format first: "domain ~ category (SKU)" — ends with parens
        const productMatch = lpBody.match(/^(.+?)\s~\s(.+?)\s\(([^()]+)\)$/);
        if (productMatch) {
          values.domain      = productMatch[1].trim();
          values.productCat  = productMatch[2].trim();
          values.productSku  = productMatch[3].trim();
          values.landingPage = '';
        } else {
          // Non-product format: "domain ~ landing page" (no parens at the end)
          const simpleMatch = lpBody.match(/^(.+?)\s~\s(.+)$/);
          if (simpleMatch) {
            values.domain      = simpleMatch[1].trim();
            values.productCat  = '';
            values.productSku  = '';
            values.landingPage = simpleMatch[2].trim();
          } else {
            values.domain = ''; values.productCat = ''; values.productSku = ''; values.landingPage = '';
            issues.push('Landing-page segment "' + lp + '" does not match "LP: DOMAIN ~ CATEGORY (SKU)" or "LP: DOMAIN ~ LANDING PAGE"');
          }
        }
      } else {
        values.domain = ''; values.productCat = ''; values.productSku = ''; values.landingPage = '';
        if (lp) issues.push('Landing-page segment missing "LP: " prefix');
      }
      values.startDate  = parts[9]  || '';
      values.endDate    = parts[10] || '';
      values.influencer = parts[11] || '';
      values.customId   = parts[12] || '';
      return { ok: issues.length === 0, values: values, issues: issues };
    }

    throw new Error('Unknown level: ' + level);
  } catch (e) {
    issues.push('Parser error: ' + e.message);
    return { ok: false, values: values, issues: issues };
  }
}

function detectLevel(name) {
  name = String(name || '').trim();
  if (/^P#:\s/.test(name))                return 'P1';
  if (/^R#:/.test(name))                  return 'P3';
  if (/^[^:|]+:\s[^|]+\s\|\s/.test(name)) return 'P2';
  return null;
}

// =========================================================================
// VALIDATION
// =========================================================================

function validateValues(level, values, spec) {
  // Returns an array of { field: <fieldKey|null>, message: <string> }.
  // Callers that want plain strings can do .map(function(i){return i.message;}).
  // `spec` optionally overrides the default TAXONOMY — pass the merged spec
  // (defaults + Config-sheet overrides) so allowed-values checks respect
  // user-edited values like added CTAs, LP Domain "NA", extra Video Lengths, etc.
  const activeSpec = spec || TAXONOMY;
  const issues = [];
  const fields = activeSpec[level].fields;
  const add = function(fieldKey, message) { issues.push({ field: fieldKey, message: message }); };

  fields.forEach(function(fld) {
    const raw = values[fld.key];
    const val = (raw === undefined || raw === null) ? '' : String(raw).trim();

    if (!val) {
      if (fld.required && !fld.emptyDefault) add(fld.key, fld.label + ': required but empty');
      return;
    }

    // Free-text reserved-character guard
    if (fld.type === 'text') {
      for (let ci = 0; ci < RESERVED_CHARS.length; ci++) {
        if (val.indexOf(RESERVED_CHARS[ci]) !== -1) {
          add(fld.key, fld.label + ': contains reserved character "' + RESERVED_CHARS[ci] + '" (not allowed in free-text fields)');
          break;
        }
      }
    }

    if (fld.type === 'dropdown' && Array.isArray(fld.options)) {
      if (fld.options.indexOf(val) === -1) {
        add(fld.key, fld.label + ': "' + val + '" is not in allowed values (' + fld.options.join(', ') + ')');
      }
    }

    if (fld.type === 'fixed' && fld.value && val !== fld.value) {
      add(fld.key, fld.label + ': must be "' + fld.value + '" — got "' + val + '"');
    }

    if (fld.validate === 'numeric' && !/^\d+$/.test(val)) {
      add(fld.key, fld.label + ': "' + val + '" is not numeric');
    }

    if (fld.type === 'date') {
      if (!/^\d{2}\/\d{2}\/\d{2}$/.test(val)) {
        add(fld.key, fld.label + ': "' + val + '" is not in MM/DD/YY format');
      }
    }

    if (fld.type === 'auto' && fld.derivedFrom && fld.map) {
      const driver = String(values[fld.derivedFrom] || '').trim();
      const expected = fld.map[driver];
      if (expected && val !== expected) {
        add(fld.key, fld.label + ': "' + val + '" does not match expected "' + expected + '" (derived from ' + fld.derivedFrom + '="' + driver + '")');
      }
    }
  });

  if (values.startDate && values.endDate &&
      /^\d{2}\/\d{2}\/\d{2}$/.test(values.startDate) &&
      /^\d{2}\/\d{2}\/\d{2}$/.test(values.endDate)) {
    const s = parseMDY(values.startDate);
    const e = parseMDY(values.endDate);
    if (s && e && s > e) {
      add('endDate', 'Start Date (' + values.startDate + ') is after End Date (' + values.endDate + ')');
    }
  }

  if (level === 'P2' && values.minAge && values.maxAge) {
    const mn = parseInt(values.minAge, 10);
    const mxRaw = values.maxAge.replace('+', '');
    const mx = parseInt(mxRaw, 10);
    if (!isNaN(mn) && !isNaN(mx) && mn > mx) {
      add('maxAge', 'Min Age (' + values.minAge + ') is greater than Max Age (' + values.maxAge + ')');
    }
  }

  if (level === 'P3') {
    const products = loadProducts();
    const hasProductFields = !!(values.productSku || values.productCat);
    const hasLandingPage   = !!values.landingPage;
    // A P3 name must carry either a Product SKU+Category pair OR a Landing Page
    if (!hasProductFields && !hasLandingPage) {
      add('landingPage', 'P3 name must have either a Product SKU + Category (product brands) OR a Landing Page (non-product brands)');
    }
    if (hasProductFields && values.productSku) {
      const sku = String(values.productSku).trim();
      if (sku.toLowerCase() !== 'mixed' && products && products.bySku) {
        const prod = products.bySku[sku];
        if (!prod) {
          add('productSku', 'Product SKU "' + sku + '" not found in the Products sheet');
        } else if (values.productCat && values.productCat !== prod.category) {
          add('productCat', 'Product Category "' + values.productCat + '" does not match mapped category "' + prod.category + '" for SKU "' + sku + '"');
        }
      }
      if (!values.productCat) {
        add('productCat', 'Product Category required when Product SKU is set');
      }
    }
    // When the LP segment fell through to non-product format (because it
    // didn't match "DOMAIN ~ Category (SKU)" exactly), check if the LP value
    // actually looks like a product reference written in the wrong shape.
    // Three signals: brand name, known SKU substring, known Category match.
    if (!hasProductFields && hasLandingPage) {
      const lpVal = String(values.landingPage).trim();
      const productBrands = getProductBrands_();
      const matchedBrand = productBrands.find(function(b) {
        return String(b).toLowerCase() === lpVal.toLowerCase();
      });

      // Detect known SKU appearing inside the LP value (handles cases like
      // "Air Fryer AIR-200NAS" — missing parens — or "AIR-200NAS" — only SKU).
      let matchedSku = null;
      if (products && products.bySku) {
        const skuKeys = Object.keys(products.bySku);
        for (let i = 0; i < skuKeys.length; i++) {
          const sku = skuKeys[i];
          if (sku.toLowerCase() === 'mixed') continue;
          if (lpVal.indexOf(sku) !== -1) { matchedSku = sku; break; }
        }
      }

      // Detect known Category appearing inside the LP value (handles cases like
      // "Air Fryer" — only category — or partial concatenations).
      let matchedCat = null;
      if (products && products.categoriesByBrand) {
        const brandKeys = Object.keys(products.categoriesByBrand);
        for (let i = 0; i < brandKeys.length && !matchedCat; i++) {
          const cats = products.categoriesByBrand[brandKeys[i]] || [];
          for (let j = 0; j < cats.length; j++) {
            const c = cats[j];
            if (!c || c.toLowerCase() === 'mixed') continue;
            if (lpVal === c || lpVal.indexOf(c) !== -1) { matchedCat = c; break; }
          }
        }
      }

      const expected = 'Expected format: "LP: ' + (values.domain || 'Owned') + ' ~ <Category> (<SKU>)"';

      if (matchedBrand) {
        add('productSku',
          'Landing-page value "' + lpVal + '" is a product brand. Product Category and Product SKU appear to be missing. ' + expected + '.');
      } else if (matchedSku && matchedCat) {
        add('productSku',
          'Product Category and Product SKU appear to be malformed in the Landing Page segment. ' + expected + '.');
      } else if (matchedSku && !matchedCat) {
        add('productCat',
          'Product Category appears to be missing. ' + expected + '.');
      } else if (matchedCat && !matchedSku) {
        add('productSku',
          'Product SKU appears to be missing. ' + expected + '.');
      }
    }
  }

  // P1 brand-aware validation: if the selected brand is product-based, require
  // the Funding Type. Non-product brands (Samsung, Sandals, corporate, etc.)
  // don't use a funding prefix — absence is fine.
  if (level === 'P1' && values.brand) {
    if (isProductBrand_(values.brand) && !values.funding) {
      add('funding', 'Funding Type: required for product-based brand "' + values.brand + '" (BRD or DTC)');
    }
  }

  return issues;
}

function qaCheck(namesArray) {
  // Load the merged spec (defaults + Config-sheet overrides) ONCE per batch
  // so QA validates against the user's actual allowed values, not just defaults.
  let activeSpec;
  try { activeSpec = getMergedSpec_(); }
  catch (e) { activeSpec = TAXONOMY; }

  const results = [];
  namesArray.forEach(function(raw) {
    const name = String(raw || '').trim();
    if (!name) return;

    const level = detectLevel(name);
    if (!level) {
      results.push({
        name: name, level: 'UNKNOWN', status: 'FAIL',
        issues: ['Could not detect level (name does not start with "P#: ", "R#:", or "TARGETING: ")'],
        fieldIssues: [{ field: null, message: 'Could not detect level' }],
        values: {}
      });
      return;
    }

    const parsed = parseName(level, name);
    // Prefer parseName's structured fieldIssues (from diagnoseSegments_ when
    // structure is broken) — they carry the field key so the QA results
    // table can highlight the right column red. Fall back to wrapping plain
    // parse-issue strings with field=null when no structured form exists.
    const fieldIssues = parsed.fieldIssues
      ? parsed.fieldIssues.slice()
      : parsed.issues.map(function(m) { return { field: null, message: m }; });
    if (!parsed.structureBroken && (parsed.ok || parsed.values)) {
      validateValues(level, parsed.values, activeSpec).forEach(function(i) { fieldIssues.push(i); });
    }
    const issuesText = fieldIssues.map(function(i) { return i.message; });

    results.push({
      name: name,
      level: level,
      status: fieldIssues.length === 0 ? 'PASS' : 'FAIL',
      issues: issuesText,          // back-compat (flat strings) for the UI
      fieldIssues: fieldIssues,    // structured issues for the export
      values: parsed.values || {}
    });
  });
  return results;
}

// =========================================================================
// GENERATOR
// =========================================================================

/**
 * Zip a map of paired field-key → values arrays into row objects.
 * Each "paired" field contributes one column. Length rules:
 *   - All paired fields must have either 1 value (constant — repeated on every
 *     row) OR the same length N (the maximum across paired fields).
 *   - A paired field with N values contributes one value per row, in order.
 *   - A paired field with 1 value is treated as a constant for all rows.
 *   - If lengths conflict (e.g., 3 ad names but 2 influencers, neither is 1),
 *     throw a clear error so the user can fix their input.
 *
 * Returns: array of { fieldKey: value, ... } objects, one per row.
 *   - Empty input → [{}] (one empty row, useful as a cartesian factor).
 */
function zipPairedFields_(map) {
  const keys = Object.keys(map || {});
  if (keys.length === 0) return [{}];
  const lengths = keys.map(function(k) { return (map[k] || []).length; });
  const maxLen = Math.max.apply(null, lengths);
  if (maxLen === 0) return [{}];
  // Validate: each paired field must be length 1 OR maxLen
  keys.forEach(function(k) {
    const len = (map[k] || []).length;
    if (len !== 1 && len !== maxLen) {
      throw new Error(
        'Paired field "' + k + '" has ' + len + ' value' + (len === 1 ? '' : 's') +
        ' — expected either 1 (constant) or ' + maxLen + ' (to align row-by-row with the other paired fields).'
      );
    }
  });
  const rows = [];
  for (let i = 0; i < maxLen; i++) {
    const row = {};
    keys.forEach(function(k) {
      const vals = map[k];
      row[k] = vals.length === 1 ? vals[0] : vals[i];
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Parse a date string in either ISO (YYYY-MM-DD, what HTML date inputs emit)
 * or US short form (MM/DD/YY or MM/DD/YYYY). Returns a Date or null if
 * the string is empty / unparseable.
 */
function parseGenDate_(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (!str) return null;
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
  const us = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    let yr = parseInt(us[3], 10);
    if (yr < 100) yr += 2000;
    return new Date(yr, parseInt(us[1], 10) - 1, parseInt(us[2], 10));
  }
  return null;
}

/**
 * Pair start dates with end dates row-by-row. Dates always pair (no opt-in
 * checkbox) since cartesian-multiplying starts × ends produces nonsense
 * date ranges (e.g., "May 1 → April 17"). Validates:
 *   - If both lists are non-empty, lengths must match.
 *   - For every paired (start, end), start must be on or before end.
 */
function pairDates_(startList, endList) {
  const sList = (startList || []).slice();
  const eList = (endList || []).slice();
  if (sList.length === 0 && eList.length === 0) {
    return [{ startDate: '', endDate: '' }];
  }
  if (sList.length !== 0 && eList.length !== 0 && sList.length !== eList.length) {
    throw new Error(
      'Start dates count (' + sList.length + ') must equal End dates count (' + eList.length + '). ' +
      'Each date range needs both a start and an end picked in the same order.'
    );
  }
  const len = Math.max(sList.length, eList.length);
  const rows = [];
  for (let i = 0; i < len; i++) {
    const s = sList[i] || '';
    const e = eList[i] || '';
    const sd = parseGenDate_(s);
    const ed = parseGenDate_(e);
    if (sd && ed && sd > ed) {
      throw new Error(
        'Date pair ' + (i + 1) + ': start date ' + s + ' is after end date ' + e + '. ' +
        'Start must be on or before End.'
      );
    }
    rows.push({ startDate: s, endDate: e });
  }
  return rows;
}

/**
 * Unified generator used by every level. Splits fields into three groups:
 *   (a) Paired text/dropdown fields (opt-in via selections.pairedFieldKeys) → zipped row-by-row.
 *   (b) Start + End dates → always paired row-by-row, validated.
 *   (c) Everything else → cartesian-multiplied as before.
 * Output rows = (a) × (b) × cartesian(c) × P3 SKU/LP factor (for P3 only).
 */
function generateAtLevel_(level, selections, pairedKeys) {
  const pairedSet = {};
  (pairedKeys || []).forEach(function(k) { pairedSet[k] = true; });

  // P3-specific: derive the pair list (SKU/Cat) or LP list up front
  let p3Pairs = null;
  let p3Lps   = null;
  if (level === 'P3') {
    const products = loadProducts();
    const skuList  = toTrimmedArray(selections.productSku);
    const catList  = toTrimmedArray(selections.productCat);
    const lpList   = toTrimmedArray(selections.landingPage);
    p3Pairs = [];
    p3Lps   = [];
    if (skuList.length > 0) {
      skuList.forEach(function(sku) {
        if (sku.toLowerCase() === 'mixed') {
          const cats = catList.length > 0 ? catList : ['Mixed'];
          cats.forEach(function(c) { p3Pairs.push({ sku: 'Mixed', cat: c }); });
        } else {
          const prod = products && products.bySku ? products.bySku[sku] : null;
          const cat = prod ? prod.category : (catList[0] || '');
          if (!cat) {
            throw new Error('Product SKU "' + sku + '" has no mapped category. Add it to the Products sheet or enter a Category manually.');
          }
          p3Pairs.push({ sku: sku, cat: cat });
        }
      });
    } else if (lpList.length > 0) {
      lpList.forEach(function(lp) { p3Lps.push(lp); });
    } else if (catList.length > 0) {
      catList.forEach(function(c) { p3Pairs.push({ sku: 'Mixed', cat: c }); });
    } else {
      throw new Error('Missing required field: Product SKU (product brands) or Landing Page (non-product brands)');
    }
  }

  const fields = TAXONOMY[level].fields;
  const pairedTextValues = {};                 // paired non-date fields → zipped
  const dateValues = { startDate: [], endDate: [] };
  const unpairedKeys = [];
  const unpairedValueLists = [];

  fields.forEach(function(fld) {
    if (fld.type === 'auto') return;
    if (level === 'P3' && (fld.key === 'productSku' || fld.key === 'productCat' || fld.key === 'landingPage')) return;

    // Fixed fields (e.g. Agency = 'VN') ignore the user's input and always
    // contribute a single constant value. They do not participate in pairing
    // and do not multiply combinations.
    if (fld.type === 'fixed') {
      unpairedKeys.push(fld.key);
      unpairedValueLists.push([String(fld.value || '')]);
      return;
    }

    let vals = selections[fld.key];
    if (!Array.isArray(vals)) vals = [vals];
    vals = vals
      .map(function(v) { return (v === undefined || v === null) ? '' : String(v).trim(); })
      .filter(function(v) { return v.length > 0; });
    if (vals.length === 0) {
      if (fld.emptyDefault) vals = [fld.emptyDefault];
      else if (fld.required) throw new Error('Missing required field: ' + fld.label);
      else vals = [''];
    }

    if (fld.type === 'date' && (fld.key === 'startDate' || fld.key === 'endDate')) {
      dateValues[fld.key] = vals;
    } else if (pairedSet[fld.key]) {
      pairedTextValues[fld.key] = vals;
    } else {
      unpairedKeys.push(fld.key);
      unpairedValueLists.push(vals);
    }
  });

  const pairedRows = zipPairedFields_(pairedTextValues);
  // Dates are paired INTERNALLY (start[i] always with end[i], start ≤ end,
  // counts must match) — pairDates_ enforces all of that. The resulting
  // (start, end) tuples are then cartesian-multiplied with every other field
  // factor, so 3 paired text rows × 2 date pairs = 6 outputs (each text row
  // appears once with each date pair).
  const dateRows   = pairDates_(dateValues.startDate, dateValues.endDate);

  // P3 product/LP factor (always cartesian against everything else)
  const p3Factor = [];
  if (level === 'P3') {
    if (p3Pairs && p3Pairs.length > 0) {
      p3Factor.push(p3Pairs.map(function(p) { return { __pair__: p }; }));
    } else if (p3Lps && p3Lps.length > 0) {
      p3Factor.push(p3Lps.map(function(lp) { return { __lp__: lp }; }));
    }
  }

  // Cartesian factor list: paired text rows × date pairs × P3 SKU/LP × everything else.
  const factors = [pairedRows, dateRows].concat(p3Factor).concat(unpairedValueLists);

  return cartesian(factors).map(function(combo) {
    const v = {};
    let idx = 0;
    Object.assign(v, combo[idx++]);   // paired text row (object, possibly empty)
    Object.assign(v, combo[idx++]);   // date pair (object {startDate, endDate})
    if (level === 'P3' && p3Factor.length > 0) {
      const item = combo[idx++];
      if (item.__pair__) {
        v.productSku  = item.__pair__.sku;
        v.productCat  = item.__pair__.cat;
        v.landingPage = '';
      } else if (item.__lp__ != null) {
        v.productSku  = '';
        v.productCat  = '';
        v.landingPage = item.__lp__;
      }
    }
    for (let j = 0; j < unpairedKeys.length; j++) {
      v[unpairedKeys[j]] = combo[idx + j];
    }
    return buildOutput(level, v);
  });
}

function generateNames(level, selections) {
  return generateAtLevel_(level, selections || {}, (selections && selections.pairedFieldKeys) || []);
}

function generateP3Names(selections) {
  return generateAtLevel_('P3', selections || {}, (selections && selections.pairedFieldKeys) || []);
}

function toTrimmedArray(v) {
  if (!Array.isArray(v)) v = [v];
  return v
    .map(function(x) { return (x === undefined || x === null) ? '' : String(x).trim(); })
    .filter(function(s) { return s.length > 0; });
}

function cartesian(lists) {
  if (!lists || lists.length === 0) return [[]];
  return lists.reduce(function(acc, cur) {
    const next = [];
    acc.forEach(function(a) { cur.forEach(function(c) { next.push(a.concat([c])); }); });
    return next;
  }, [[]]);
}

// =========================================================================
// DATES
// =========================================================================

function formatDate(v) {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{2}\/\d{2}\/\d{2}$/.test(v.trim())) return v.trim();

  let d;
  if (v instanceof Date) {
    d = v;
  } else if (typeof v === 'string' && v.trim()) {
    const s = v.trim();
    const mdY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (mdY)      d = new Date(parseInt(mdY[3], 10), parseInt(mdY[1], 10) - 1, parseInt(mdY[2], 10));
    else if (mdy) d = new Date(2000 + parseInt(mdy[3], 10), parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10));
    else if (ymd) d = new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
    else          d = new Date(s);
  } else {
    return '';
  }

  if (!d || isNaN(d.getTime())) return String(v);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return mm + '/' + dd + '/' + yy;
}

function parseMDY(s) {
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  return new Date(2000 + parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
}

// =========================================================================
// RPC ENDPOINTS — called from Index.html via google.script.run
// =========================================================================

function getTaxonomyWithSource() {
  const overrides      = loadConfigOverrides();
  const products       = loadProducts();
  const domainMappings = loadDomainMappings();
  const merged         = overrides
    ? mergeTaxonomyOverrides(TAXONOMY, overrides)
    : JSON.parse(JSON.stringify(TAXONOMY));

  let brandsForP3 = products && products.byBrand ? Object.keys(products.byBrand).sort() : [];
  if (brandsForP3.length === 0) {
    const p1Brand = merged.P1.fields.find(function(f) { return f.key === 'brand'; });
    brandsForP3 = (p1Brand && Array.isArray(p1Brand.options)) ? p1Brand.options.slice() : [];
  }

  let sourceParts = [overrides ? 'Config sheet' : 'defaults'];
  if (products)       sourceParts.push('Products sheet');
  if (domainMappings) sourceParts.push('Domain Map sheet');

  // Product-brand classification: any brand with at least one non-"Mixed" SKU
  // in the Products sheet is treated as product-based (Funding + SKU + Category
  // format). Everything else uses the non-product format (no Funding, Landing
  // Page instead of SKU/Category).
  const productBrands = getProductBrands_();

  return {
    taxonomy: merged,
    products: products,
    brandsForP3: brandsForP3,
    productBrands: productBrands,
    domainMappings: domainMappings,
    reservedChars: RESERVED_CHARS,
    urlBuilder: {
      supportedBrands:       URL_BUILDER_SUPPORTED_BRANDS,
      platformTemplates:     URL_BUILDER_PLATFORM_TEMPLATES,
      platformInstructions:  URL_BUILDER_PLATFORM_INSTRUCTIONS,
      sourceToPlatform:      URL_BUILDER_SOURCE_TO_PLATFORM,
      utc:                   URL_BUILDER_UTC_CONFIG,
      utcBannedChars:        URL_BUILDER_UTC_BANNED_CHARS
    },
    source: sourceParts.join(' + '),
    dataSheetUrl: getDataSheetUrl(),
    currentUserEmail: getCurrentUserEmail_()
  };
}

function getCurrentUserEmail_() {
  try { return Session.getActiveUser().getEmail() || ''; }
  catch (e) { return ''; }
}

function runGenerator(level, selections) {
  try { return { ok: true, names: generateNames(level, selections) }; }
  catch (e) { return { ok: false, error: e.message }; }
}

function runExtractor(level, name) {
  const lv = level || detectLevel(name);
  if (!lv) return { ok: false, error: 'Could not auto-detect level. Please select P1, P2, or P3 manually.' };
  const parsed = parseName(lv, name);
  return { ok: true, level: lv, values: parsed.values, parseIssues: parsed.issues };
}

function runRebuild(level, values) {
  try {
    // Auto-sync derived fields (e.g., Funnel Level from Objective) so a user
    // who changed Objective but not Funnel in the Extractor form still gets a
    // correctly-rebuilt name. buildOutput already uses the derived value for
    // the P1 output segment, but mirroring it into `values` keeps server-side
    // state consistent if callers re-validate.
    if (level === 'P1' && values && values.objective && FUNNEL_MAP[String(values.objective).trim()]) {
      values.funnel = FUNNEL_MAP[String(values.objective).trim()];
    }
    return { ok: true, name: buildOutput(level, values) };
  } catch (e) { return { ok: false, error: e.message }; }
}

function runQA(namesArray) {
  try { return { ok: true, results: qaCheck(namesArray || []) }; }
  catch (e) { return { ok: false, error: e.message }; }
}

/**
 * Apply the same field overrides to many existing taxonomy names.
 * Each name is parsed → overrides merged → rebuilt. Overrides that don't
 * apply to a given level (e.g., setting "bid" on a P3 row) are silently
 * skipped per row — a log line is included so the user can see it.
 *
 * Params:
 *   names         - array of existing taxonomy strings
 *   globalChanges - array of { field, value } applied to every row
 *   perRowChanges - optional object { fullName: { field: value, ... } } from CSV upload
 */
function runBulkEdit(names, globalChanges, perRowChanges) {
  const results = [];
  const nameList = Array.isArray(names) ? names : [];
  const global = Array.isArray(globalChanges) ? globalChanges : [];
  const perRow = perRowChanges && typeof perRowChanges === 'object' ? perRowChanges : {};

  // Load merged spec (defaults + Config-sheet overrides) once, so validation
  // respects any allowed-value customizations the user has made.
  let activeSpec;
  try { activeSpec = getMergedSpec_(); } catch (e) { activeSpec = TAXONOMY; }

  nameList.forEach(function(rawName) {
    const name = String(rawName || '').trim();
    if (!name) return;
    const level = detectLevel(name);
    if (!level) {
      results.push({
        original: name, level: 'UNKNOWN',
        error: 'Could not detect level (doesn\'t start with "P#: ", "R#:", or "TARGETING: ")',
        revised: null, changed: false, applied: [], skipped: []
      });
      return;
    }
    const parsed = parseName(level, name);

    // BLOCK REBUILD IF ORIGINAL IS STRUCTURALLY MALFORMED.
    // parseName reports issues for missing prefixes (BC:, CTA:, LP:), wrong
    // segment counts, broken age-range patterns, etc. If the source doesn't
    // match the level's format, rebuilding would silently reshape content —
    // the user would get a "valid" P3 taxonomy with fields in the wrong slots.
    if (parsed.issues && parsed.issues.length > 0) {
      results.push({
        original: name, level: level,
        revised: null, changed: false, applied: [], skipped: [],
        error: 'Source does not match ' + level + ' format — fix the original before bulk-editing. Issues: ' + parsed.issues.join('; ')
      });
      return;
    }

    // Also surface validation warnings from the parsed (pre-override) values
    const sourceWarnings = validateValues(level, parsed.values, activeSpec).map(function(i){ return i.message; });

    const applied = [];
    const skipped = [];
    const v = {};
    Object.keys(parsed.values).forEach(function(k) { v[k] = parsed.values[k]; });

    // Apply global changes (same change across every row)
    global.forEach(function(c) {
      if (!c || !c.field) return;
      if (fieldExistsInLevel_(level, c.field)) {
        v[c.field] = c.value;
        applied.push(c.field);
      } else {
        skipped.push(c.field + ' (not in ' + level + ')');
      }
    });

    // Apply per-row overrides (from CSV template upload)
    const rowOverrides = perRow[name] || {};
    Object.keys(rowOverrides).forEach(function(k) {
      const val = rowOverrides[k];
      if (val === '' || val == null) return;
      if (fieldExistsInLevel_(level, k)) {
        v[k] = val;
        applied.push(k);
      } else {
        skipped.push(k + ' (not in ' + level + ')');
      }
    });

    // AUTO-DERIVE Funnel Level from Objective for P1. buildOutput always emits
    // FUNNEL_MAP[objective] in the output, so if the user overrides Objective
    // without also overriding Funnel, we sync the in-memory value here too —
    // otherwise post-validation would compare a stale parsed funnel against
    // the new expected funnel and falsely flag a mismatch.
    if (level === 'P1' && v.objective && FUNNEL_MAP[String(v.objective).trim()]) {
      const derivedFunnel = FUNNEL_MAP[String(v.objective).trim()];
      if (v.funnel !== derivedFunnel) {
        v.funnel = derivedFunnel;
        if (applied.indexOf('objective') !== -1 && applied.indexOf('funnel') === -1) {
          applied.push('funnel (auto-derived from objective)');
        }
      }
    }

    // AUTO-DERIVE Product Category from Product SKU for P3.
    // If the user changed the SKU but didn't override the Category, look up the
    // new SKU in the Products sheet and apply its mapped category so the LP
    // segment stays consistent. Skipped for SKU="Mixed" (catch-all — user picks).
    if (level === 'P3' && applied.indexOf('productSku') !== -1 && applied.indexOf('productCat') === -1) {
      const newSku = String(v.productSku || '').trim();
      if (newSku && newSku.toLowerCase() !== 'mixed') {
        const products = loadProducts();
        if (products && products.bySku && products.bySku[newSku] && products.bySku[newSku].category) {
          v.productCat = products.bySku[newSku].category;
          applied.push('productCat (auto-matched to ' + newSku + ')');
        }
      }
    }

    try {
      const revised = buildOutput(level, v);

      // Normalize any date fields to MM/DD/YY before post-validation — the
      // HTML date picker emits ISO (YYYY-MM-DD) and buildOutput converts to
      // MM/DD/YY in the output, but the raw value in v is still ISO. Without
      // this normalization, post-validation would falsely flag "2026-04-01 is
      // not in MM/DD/YY format" even though the revised name is correct.
      const levelFields = (TAXONOMY[level] || {}).fields || [];
      levelFields.forEach(function(fld) {
        if (fld.type === 'date' && v[fld.key]) {
          v[fld.key] = formatDate(v[fld.key]);
        }
      });

      // POST-APPLY VALIDATION: make sure the overrides didn't introduce a
      // now-invalid value (e.g. user picked an LP Domain that's not in the
      // allowed list after override).
      const postValidation = validateValues(level, v, activeSpec).map(function(i){ return i.message; });

      let errorMsg = null;
      if (postValidation.length > 0) {
        errorMsg = 'Revised name has validation errors: ' + postValidation.join('; ');
      } else if (sourceWarnings.length > 0) {
        errorMsg = 'Source had validation warnings (revised inherits them): ' + sourceWarnings.join('; ');
      }

      results.push({
        original: name,
        level: level,
        revised: revised,
        changed: revised !== name,
        applied: applied,
        skipped: skipped,
        error: errorMsg
      });
    } catch (e) {
      results.push({ original: name, level: level, error: e.message, revised: null, applied: applied, skipped: skipped, changed: false });
    }
  });

  return { ok: true, results: results };
}

function fieldExistsInLevel_(level, fieldKey) {
  const fields = (TAXONOMY[level] && TAXONOMY[level].fields) || [];
  return fields.some(function(f) { return f.key === fieldKey; });
}

/** Export bulk-edit results into a NEW Google Sheet with Original / Revised columns. */
function exportBulkResultsToNewSheet(results) {
  if (!results || results.length === 0) return { ok: false, error: 'No results to export' };
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd HHmm');
  const title = 'Taxonomy Bulk Edit - ' + stamp;
  const ss = SpreadsheetApp.create(title);
  const sheet = ss.getActiveSheet();
  sheet.setName('Bulk Edit');
  const header = ['Level', 'Original', 'Revised', 'Changed?', 'Applied Fields', 'Skipped', 'Error'];
  sheet.getRange(1, 1, 1, header.length)
       .setValues([header])
       .setFontWeight('bold')
       .setBackground('#000000')
       .setFontColor('#FFC227');
  const rows = results.map(function(r) {
    return [
      r.level || '',
      r.original || '',
      r.revised || '',
      r.changed ? 'YES' : (r.error ? 'ERROR' : 'NO'),
      (r.applied || []).join(', '),
      (r.skipped || []).join(', '),
      r.error || ''
    ];
  });
  sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  const statusBgs = rows.map(function(row) {
    if (row[3] === 'ERROR') return ['#F4CCCC'];
    if (row[3] === 'YES')   return ['#D9EAD3'];
    return ['#FFFFFF'];
  });
  sheet.getRange(2, 4, rows.length, 1).setBackgrounds(statusBgs);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 60);
  sheet.setColumnWidth(2, 380);
  sheet.setColumnWidth(3, 380);
  sheet.setColumnWidth(4, 90);
  return { ok: true, url: ss.getUrl(), name: title, count: rows.length };
}

/** Create a NEW standalone Google Sheet in the calling user's Drive with the generated names. */
function exportGeneratedToNewSheet(level, names) {
  if (!names || names.length === 0) return { ok: false, error: 'No names to export' };
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd HHmm');
  const title = 'Taxonomy ' + level + ' Export - ' + stamp;
  const ss = SpreadsheetApp.create(title);
  const sheet = ss.getActiveSheet();
  sheet.setName('Generated ' + level);
  sheet.getRange(1, 1).setValue('Generated ' + level + ' Taxonomy (' + stamp + ')').setFontWeight('bold');
  sheet.getRange(2, 1, names.length, 1).setValues(names.map(function(n) { return [n]; }));
  sheet.setColumnWidth(1, 700);
  return { ok: true, url: ss.getUrl(), name: title, count: names.length };
}

/**
 * Export QA results into a NEW Google Sheet:
 *  - One Summary tab listing every row (Full Name, Brand, Level, Status, Issues).
 *  - One tab per (Brand, Level) pair — e.g., "Cuisinart - P3" — with each
 *    taxonomy field broken out into its own column. Cells for fields that
 *    contributed to a validation error are highlighted red.
 */
function exportQAResultsToNewSheet(results) {
  if (!results || results.length === 0) return { ok: false, error: 'No QA results to export' };
  const products = loadProducts();

  // Tag each row with an inferred brand for grouping
  const tagged = results.map(function(r) {
    return Object.assign({}, r, { _brand: inferBrand_(r, products) });
  });

  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd HHmm');
  const title = 'Taxonomy QA Results - ' + stamp;
  const ss = SpreadsheetApp.create(title);

  // ----- Summary tab (default) -----
  const summary = ss.getActiveSheet();
  summary.setName('Summary');
  const summaryHeader = ['Timestamp', 'Full Name', 'Brand', 'Level', 'Status', 'Issue Count', 'Issues'];
  summary.getRange(1, 1, 1, summaryHeader.length)
         .setValues([summaryHeader])
         .setFontWeight('bold')
         .setBackground('#000000')
         .setFontColor('#FFC227');
  const now = new Date();
  const summaryRows = tagged.map(function(r) {
    return [now, r.name, r._brand || '—', r.level, r.status, (r.fieldIssues || []).length, (r.issues || []).join('; ')];
  });
  summary.getRange(2, 1, summaryRows.length, summaryHeader.length).setValues(summaryRows);
  const statusBgs = summaryRows.map(function(row) { return [row[4] === 'PASS' ? '#D9EAD3' : '#F4CCCC']; });
  summary.getRange(2, 5, summaryRows.length, 1).setBackgrounds(statusBgs);
  summary.setFrozenRows(1);
  summary.autoResizeColumns(1, summaryHeader.length);

  // ----- Per-(brand, level) tabs -----
  const buckets = {}; // key = brand||level  -> { brand, level, rows }
  tagged.forEach(function(r) {
    if (r.level === 'UNKNOWN') return;
    const brand = r._brand || 'Unknown';
    const key = brand + '||' + r.level;
    if (!buckets[key]) buckets[key] = { brand: brand, level: r.level, rows: [] };
    buckets[key].rows.push(r);
  });

  Object.keys(buckets).sort().forEach(function(key) {
    const b = buckets[key];
    const fields = TAXONOMY[b.level].fields;
    const tabName = (b.brand + ' - ' + b.level).slice(0, 95); // Sheet name 100-char limit
    const tab = ss.insertSheet(tabName);

    const header = ['Full Name', 'Status', 'Issues']
      .concat(fields.map(function(f) { return f.label; }));
    tab.getRange(1, 1, 1, header.length)
       .setValues([header])
       .setFontWeight('bold')
       .setBackground('#000000')
       .setFontColor('#FFC227');

    const values = [];
    const cellBgs = [];
    b.rows.forEach(function(r) {
      const row = [r.name, r.status, (r.issues || []).join('; ')];
      const bg  = [
        '#FFFFFF',
        r.status === 'PASS' ? '#D9EAD3' : '#F4CCCC',
        '#FFFFFF'
      ];
      const problemFields = new Set();
      (r.fieldIssues || []).forEach(function(i) { if (i.field) problemFields.add(i.field); });
      fields.forEach(function(f) {
        const v = r.values[f.key];
        row.push(v == null ? '' : String(v));
        bg.push(problemFields.has(f.key) ? '#F4CCCC' : '#FFFFFF');
      });
      values.push(row);
      cellBgs.push(bg);
    });

    if (values.length > 0) {
      tab.getRange(2, 1, values.length, header.length).setValues(values);
      tab.getRange(2, 1, values.length, header.length).setBackgrounds(cellBgs);
    }
    tab.setFrozenRows(1);
    tab.setFrozenColumns(1);
    tab.setColumnWidth(1, 420); // Full Name column
    for (let ci = 2; ci <= header.length; ci++) tab.setColumnWidth(ci, 140);
  });

  return { ok: true, url: ss.getUrl(), name: title, count: results.length, tabCount: 1 + Object.keys(buckets).length };
}

/** Best-effort brand inference per QA row: P1 has brand directly; P3 looks up SKU in catalogue. */
function inferBrand_(r, products) {
  const v = r.values || {};
  if (r.level === 'P1' && v.brand) return String(v.brand).trim();
  if (r.level === 'P3' && v.productSku && products && products.bySku) {
    const p = products.bySku[String(v.productSku).trim()];
    if (p && p.brand) return p.brand;
  }
  // P2 and everything else: brand not directly in the name. Try to match by campaign
  // name against known P1 campaigns from the same QA batch if available, else Unknown.
  return '';
}

// =========================================================================
// CONFIG SHEET — allowed-value overrides
// =========================================================================

/** Internal: returns TAXONOMY with Config-sheet overrides applied (lightweight — no product/domain reads). */
function getMergedSpec_() {
  const overrides = loadConfigOverrides();
  if (!overrides) return TAXONOMY;
  return mergeTaxonomyOverrides(TAXONOMY, overrides);
}

function loadConfigOverrides() {
  let sheet;
  try {
    sheet = getDataSpreadsheet_().getSheetByName(CONFIG_SHEET_NAME);
  } catch (e) {
    return null; // data sheet not set or inaccessible
  }
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;
  const overrides = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const level = String(row[0] || '').trim();
    const key   = String(row[1] || '').trim();
    const label = String(row[2] || '').trim();
    const optsRaw = String(row[3] || '');
    if (!level || !key) continue;
    if (!overrides[level]) overrides[level] = {};
    const opts = optsRaw.split(/\n|\|/).map(function(s) { return s.trim(); }).filter(Boolean);
    overrides[level][key] = { label: label || null, options: opts.length > 0 ? opts : null };
  }
  return overrides;
}

function mergeTaxonomyOverrides(defaults, overrides) {
  const merged = JSON.parse(JSON.stringify(defaults));
  Object.keys(overrides || {}).forEach(function(level) {
    if (!merged[level]) return;
    merged[level].fields.forEach(function(fld) {
      const over = overrides[level][fld.key];
      if (!over) return;
      if (over.label) fld.label = over.label;
      if (over.options && fld.type === 'dropdown') fld.options = over.options;
    });
  });
  return merged;
}

/** One-off: seed the Config tab on the data sheet. Run from the Apps Script editor. */
function ensureConfigSheet() {
  const ss = getDataSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  const existed = !!sheet;
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET_NAME);
    sheet.getRange(1, 1, 1, CONFIG_HEADER.length)
         .setValues([CONFIG_HEADER])
         .setFontWeight('bold')
         .setBackground('#EEEEEE');
    const rows = [];
    ['P1', 'P2', 'P3'].forEach(function(level) {
      TAXONOMY[level].fields.forEach(function(fld) {
        if (fld.type === 'auto') return;
        const opts = (fld.type === 'dropdown' && Array.isArray(fld.options)) ? fld.options.join('\n') : '';
        rows.push([level, fld.key, fld.label, opts]);
      });
    });
    sheet.getRange(2, 1, rows.length, CONFIG_HEADER.length).setValues(rows);
    sheet.setColumnWidth(1, 50);
    sheet.setColumnWidth(2, 130);
    sheet.setColumnWidth(3, 180);
    sheet.setColumnWidth(4, 400);
    sheet.setFrozenRows(1);
    sheet.getRange(2, 4, rows.length, 1).setWrap(true).setVerticalAlignment('top');
    const levelRule = SpreadsheetApp.newDataValidation().requireValueInList(['P1', 'P2', 'P3'], true).build();
    sheet.getRange(2, 1, rows.length, 1).setDataValidation(levelRule);
  }
  return { ok: true, existed: existed, sheetName: CONFIG_SHEET_NAME, url: ss.getUrl() };
}

// =========================================================================
// PRODUCTS SHEET — SKU catalogue per brand
// =========================================================================

function loadProducts() {
  // Preferred format: one tab per brand ("Products: Cuisinart", "Products: Conair", ...)
  const perBrand = loadProductsFromPerBrandTabs_();
  if (perBrand) return perBrand;
  // Fallback: single legacy "Taxonomy Products" tab with Brand in column A
  return loadProductsFromSingleTab_();
}

function loadProductsFromPerBrandTabs_() {
  let ss;
  try { ss = getDataSpreadsheet_(); } catch (e) { return null; }
  const sheets = ss.getSheets();
  const brandSheets = sheets.filter(function(s) {
    const n = s.getName();
    return n.indexOf(PER_BRAND_TAB_PREFIX) === 0 &&
           n.substring(PER_BRAND_TAB_PREFIX.length).trim().length > 0;
  });
  if (brandSheets.length === 0) return null;

  const byBrand = {}, bySku = {}, categoriesByBrand = {};

  brandSheets.forEach(function(sheet) {
    const brand = sheet.getName().substring(PER_BRAND_TAB_PREFIX.length).trim();
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return;

    // Flexible column mapping from header row (case-insensitive, accepts common synonyms)
    const header = data[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
    const skuCol  = findProductCol_(header, ['product sku', 'sku', 'product id', 'product sku code']);
    const catCol  = findProductCol_(header, ['product category', 'category']);
    const nameCol = findProductCol_(header, ['product name', 'name']);
    // Optional retailer URL column — multi-line cell content, one URL per line
    const urlsCol = findProductCol_(header, ['retailer urls', 'retailer url', 'retailer links', 'urls']);
    if (skuCol === -1) return;

    for (let i = 1; i < data.length; i++) {
      const sku  = String(data[i][skuCol]  || '').trim();
      const cat  = catCol  !== -1 ? String(data[i][catCol]  || '').trim() : '';
      const name = nameCol !== -1 ? String(data[i][nameCol] || '').trim() : '';
      const urls = urlsCol !== -1 ? parseRetailerUrlsCell_(data[i][urlsCol]) : [];
      if (!sku) continue;
      const item = { sku: sku, category: cat, name: name, retailerUrls: urls };
      if (!byBrand[brand]) byBrand[brand] = [];
      byBrand[brand].push(item);
      if (sku.toLowerCase() !== 'mixed') bySku[sku] = { brand: brand, category: cat, name: name, retailerUrls: urls };
      if (!categoriesByBrand[brand]) categoriesByBrand[brand] = [];
      if (cat && categoriesByBrand[brand].indexOf(cat) === -1 && cat.toLowerCase() !== 'mixed') {
        categoriesByBrand[brand].push(cat);
      }
    }
  });

  if (Object.keys(byBrand).length === 0) return null;

  Object.keys(byBrand).forEach(function(b) {
    byBrand[b].sort(function(a, c) {
      if (a.sku.toLowerCase() === 'mixed') return 1;
      if (c.sku.toLowerCase() === 'mixed') return -1;
      return a.sku.localeCompare(c.sku);
    });
    categoriesByBrand[b].sort();
  });
  return { byBrand: byBrand, bySku: bySku, categoriesByBrand: categoriesByBrand };
}

function loadProductsFromSingleTab_() {
  let sheet;
  try {
    sheet = getDataSpreadsheet_().getSheetByName(PRODUCTS_SHEET_NAME);
  } catch (e) {
    return null;
  }
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;

  const byBrand = {}, bySku = {}, categoriesByBrand = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const brand = String(row[0] || '').trim();
    const sku   = String(row[1] || '').trim();
    const cat   = String(row[2] || '').trim();
    const name  = String(row[3] || '').trim();
    const urls  = parseRetailerUrlsCell_(row[4]);  // 5th column, optional
    if (!brand || !sku) continue;
    const item = { sku: sku, category: cat, name: name, retailerUrls: urls };
    if (!byBrand[brand]) byBrand[brand] = [];
    byBrand[brand].push(item);
    if (sku.toLowerCase() !== 'mixed') bySku[sku] = { brand: brand, category: cat, name: name, retailerUrls: urls };
    if (!categoriesByBrand[brand]) categoriesByBrand[brand] = [];
    if (cat && categoriesByBrand[brand].indexOf(cat) === -1 && cat.toLowerCase() !== 'mixed') {
      categoriesByBrand[brand].push(cat);
    }
  }
  Object.keys(byBrand).forEach(function(b) {
    byBrand[b].sort(function(a, c) {
      if (a.sku.toLowerCase() === 'mixed') return 1;
      if (c.sku.toLowerCase() === 'mixed') return -1;
      return a.sku.localeCompare(c.sku);
    });
    categoriesByBrand[b].sort();
  });
  return { byBrand: byBrand, bySku: bySku, categoriesByBrand: categoriesByBrand };
}

/**
 * Parse a "Retailer URLs" cell value into an array of trimmed URLs.
 * Sheet cells can hold multi-line content (Alt+Enter inside Google Sheets);
 * we accept either newlines, commas, or semicolons as URL separators so
 * users can paste URLs in whatever format is natural for them.
 */
function parseRetailerUrlsCell_(cellValue) {
  const raw = String(cellValue == null ? '' : cellValue).trim();
  if (!raw) return [];
  return raw.split(/\r?\n|[,;]/)
            .map(function(s) { return String(s || '').trim(); })
            .filter(function(s) { return s.length > 0; });
}

function findProductCol_(headerLower, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const idx = headerLower.indexOf(candidates[i].toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

/** One-off: seed the Products tab on the data sheet. Run from the Apps Script editor. */
function ensureProductsSheet() {
  const ss = getDataSpreadsheet_();
  let sheet = ss.getSheetByName(PRODUCTS_SHEET_NAME);
  const existed = !!sheet;
  if (!sheet) {
    sheet = ss.insertSheet(PRODUCTS_SHEET_NAME);
    sheet.getRange(1, 1, 1, PRODUCTS_HEADER.length)
         .setValues([PRODUCTS_HEADER])
         .setFontWeight('bold')
         .setBackground('#EEEEEE');
    const seed = [
      ['Cuisinart',   'DGB-30',    'Coffee Maker',     'Custom Grind & Brew Single-Cup Coffee Maker',                              ''],
      ['Cuisinart',   'AIR-200',   'Air Fryer',        'Compact AirFryer',                                                          ''],
      ['Cuisinart',   'ICE-FD10',  'Ice Cream Maker',  'Ice Cream & Gelato Maker',                                                  ''],
      ['Cuisinart',   'TOA-70NAS', 'Air Fryer',        'Air Fryer Toaster Oven with Grill',                                         ''],
      ['Cuisinart',   'FTPS22-6',  'Cookware',         'FusionElite+ Nonstick Tri-Ply Stainless Steel 6-Pc Skillet Set',           ''],
      ['Cuisinart',   '77-17N',    'Cookware',         'Chef\u2019s Classic Stainless 17-Piece Set',                                ''],
      ['Cuisinart',   '77-11G',    'Cookware',         'Chef\u2019s Classic Stainless 11-Piece Set',                                ''],
      ['Cuisinart',   'Mixed',     'Mixed',            'Mixed Products (catch-all)',                                                ''],
      ['Conair',      'ADZ-112',   'Air Fryer',        '11-qt Dual Basket Air Fryer Pro',                                           ''],
      ['Conair',      'Mixed',     'Mixed',            'Mixed Products (catch-all)',                                                ''],
      ['BaBylissPRO', 'Mixed',     'Mixed',            'Mixed Products (catch-all)',                                                '']
    ];
    sheet.getRange(2, 1, seed.length, PRODUCTS_HEADER.length).setValues(seed);
    sheet.setColumnWidth(1, 130);   // Brand
    sheet.setColumnWidth(2, 140);   // Product SKU
    sheet.setColumnWidth(3, 200);   // Product Category
    sheet.setColumnWidth(4, 320);   // Product Name
    sheet.setColumnWidth(5, 380);   // Retailer URLs (multi-line cell)
    // Wrap text in the Retailer URLs column so multi-line URLs render readably
    sheet.getRange(2, 5, seed.length, 1).setWrap(true).setVerticalAlignment('top');
    sheet.setFrozenRows(1);
  }
  return { ok: true, existed: existed, sheetName: PRODUCTS_SHEET_NAME, url: ss.getUrl() };
}

/**
 * Migrate the existing "Taxonomy Products" single tab into per-brand tabs.
 * Reads the single tab grouped by column A (Brand), then writes one tab per
 * brand named "Products: <Brand>" with columns Product SKU / Product Category
 * / Product Name. Does NOT delete the original tab — safe to run multiple times.
 *
 * Run once from the Apps Script editor after redeploying to switch formats.
 */
function migrateProductsToPerBrand() {
  const ss = getDataSpreadsheet_();
  const src = ss.getSheetByName(PRODUCTS_SHEET_NAME);
  if (!src) return { ok: false, error: 'No "' + PRODUCTS_SHEET_NAME + '" tab to migrate. Either create it and fill it in, or run ensureProductsTabsPerBrand() to seed per-brand tabs from scratch.' };
  const data = src.getDataRange().getValues();
  if (data.length < 2) return { ok: false, error: 'Source tab has no data rows to migrate' };

  // Group rows by brand (column A), keeping SKU / Category / Name / Retailer URLs
  const groups = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const brand = String(row[0] || '').trim();
    const sku   = String(row[1] || '').trim();
    const cat   = String(row[2] || '').trim();
    const name  = String(row[3] || '').trim();
    const urls  = String(row[4] || '');  // preserve cell content as-is (incl. newlines)
    if (!brand || !sku) continue;
    if (!groups[brand]) groups[brand] = [];
    groups[brand].push([sku, cat, name, urls]);
  }

  const brandList = Object.keys(groups).sort();
  if (brandList.length === 0) return { ok: false, error: 'No valid rows found in the source tab.' };

  const createdTabs = [];
  const overwrittenTabs = [];
  brandList.forEach(function(brand) {
    const tabName = PER_BRAND_TAB_PREFIX + brand;
    let tab = ss.getSheetByName(tabName);
    if (tab) {
      overwrittenTabs.push(tabName);
      tab.clear();
    } else {
      tab = ss.insertSheet(tabName);
      createdTabs.push(tabName);
    }
    tab.getRange(1, 1, 1, PER_BRAND_HEADER.length)
       .setValues([PER_BRAND_HEADER])
       .setFontWeight('bold')
       .setBackground('#000000')
       .setFontColor('#FFC227');
    tab.getRange(2, 1, groups[brand].length, PER_BRAND_HEADER.length).setValues(groups[brand]);
    tab.setFrozenRows(1);
    tab.setColumnWidth(1, 160);   // Product SKU
    tab.setColumnWidth(2, 200);   // Product Category
    tab.setColumnWidth(3, 340);   // Product Name
    tab.setColumnWidth(4, 380);   // Retailer URLs
    tab.getRange(2, 4, groups[brand].length, 1).setWrap(true).setVerticalAlignment('top');
    // Annotate which brand this tab represents (column 6, past the data columns)
    tab.getRange(1, 6).setValue('Brand (implicit): ' + brand).setFontColor('#555').setFontStyle('italic');
  });

  return {
    ok: true,
    brands: brandList,
    createdTabs: createdTabs,
    overwrittenTabs: overwrittenTabs,
    totalRows: data.length - 1,
    message: 'Migrated ' + (data.length - 1) + ' SKUs into ' + brandList.length + ' per-brand tab(s). The original "' + PRODUCTS_SHEET_NAME + '" tab is unchanged — you can delete or archive it after verifying.'
  };
}

/**
 * Seed per-brand Product tabs from scratch (empty Products sheet).
 * Creates "Products: Conair", "Products: BaBylissPRO", "Products: Cuisinart"
 * with a few example rows + a Mixed catch-all each.
 */
function ensureProductsTabsPerBrand() {
  const ss = getDataSpreadsheet_();
  const seeds = {
    Cuisinart: [
      ['DGB-30',    'Coffee Maker',     'Custom Grind & Brew Single-Cup Coffee Maker',                              ''],
      ['AIR-200',   'Air Fryer',        'Compact AirFryer',                                                          ''],
      ['ICE-FD10',  'Ice Cream Maker',  'Ice Cream & Gelato Maker',                                                  ''],
      ['TOA-70NAS', 'Air Fryer',        'Air Fryer Toaster Oven with Grill',                                         ''],
      ['FTPS22-6',  'Cookware',         'FusionElite+ Nonstick Tri-Ply Stainless Steel 6-Pc Skillet Set',           ''],
      ['77-17N',    'Cookware',         'Chef\u2019s Classic Stainless 17-Piece Set',                                ''],
      ['77-11G',    'Cookware',         'Chef\u2019s Classic Stainless 11-Piece Set',                                ''],
      ['Mixed',     'Mixed',            'Mixed Products (catch-all)',                                                '']
    ],
    Conair: [
      ['ADZ-112',   'Air Fryer',        '11-qt Dual Basket Air Fryer Pro',                                           ''],
      ['Mixed',     'Mixed',            'Mixed Products (catch-all)',                                                '']
    ],
    BaBylissPRO: [
      ['Mixed',     'Mixed',            'Mixed Products (catch-all)',                                                '']
    ]
  };
  const createdTabs = [];
  const existingTabs = [];
  Object.keys(seeds).forEach(function(brand) {
    const tabName = PER_BRAND_TAB_PREFIX + brand;
    let tab = ss.getSheetByName(tabName);
    if (tab) { existingTabs.push(tabName); return; }
    tab = ss.insertSheet(tabName);
    tab.getRange(1, 1, 1, PER_BRAND_HEADER.length)
       .setValues([PER_BRAND_HEADER])
       .setFontWeight('bold')
       .setBackground('#000000')
       .setFontColor('#FFC227');
    const rows = seeds[brand];
    tab.getRange(2, 1, rows.length, PER_BRAND_HEADER.length).setValues(rows);
    tab.setFrozenRows(1);
    tab.setColumnWidth(1, 160);   // Product SKU
    tab.setColumnWidth(2, 200);   // Product Category
    tab.setColumnWidth(3, 340);   // Product Name
    tab.setColumnWidth(4, 380);   // Retailer URLs
    tab.getRange(2, 4, rows.length, 1).setWrap(true).setVerticalAlignment('top');
    tab.getRange(1, 6).setValue('Brand (implicit): ' + brand).setFontColor('#555').setFontStyle('italic');
    createdTabs.push(tabName);
  });
  return { ok: true, createdTabs: createdTabs, existingTabs: existingTabs };
}

// =========================================================================
// URL BUILDER (UTM parameter appender)
// =========================================================================

/** Brands supported by the URL Builder. Other brands won't show up in the tab. */
const URL_BUILDER_SUPPORTED_BRANDS = ['Conair', 'BaBylissPRO', 'Cuisinart', 'Unique Vacations Inc.'];

/**
 * Platform-driven UTM templates. Used by Conair / BaBylissPRO / Cuisinart.
 * The value after "?" is appended to the destination URL verbatim — the
 * placeholder tokens ({{campaign.id}}, __CAMPAIGN_ID__, {campaignid}) are
 * dynamic variables the ad platform fills at serve time. They are NOT
 * user inputs.
 */
const URL_BUILDER_PLATFORM_TEMPLATES = {
  'Meta':              '?utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}',
  'TikTok (Smart+)':   '?utm_source=tiktok&utm_campaign=__CAMPAIGN_ID__&utm_medium=paid_social&utm_content=__ADID_V2__',
  'TikTok (Standard)': '?utm_source=tiktok&utm_medium=paid_social&utm_content=__AID__&utm_campaign=__CAMPAIGN_ID__',
  'YouTube':           '?utm_source=google&utm_medium=paid_social&utm_campaign={campaignid}&utm_content={creative}&utm_term={adgroupid}',
  // Pinterest dynamic tracking macros (curly-brace style, like Google/YouTube).
  // {campaignid} and {adid} (Pin promotion ID) are filled by Pinterest at serve
  // time. Pinterest uses no utm_term. Parameter order is intentional — matches
  // the client-approved template. https://help.pinterest.com/en/business/article/third-party-and-dynamic-tracking
  'Pinterest':         '?utm_campaign={campaignid}&utm_medium=paid_social&utm_source=pinterest&utm_content={adid}'
};

/**
 * Per-platform implementation instructions shown to traffickers — what to copy
 * (Full URL vs UTM String) and where to paste it inside each ad-platform UI.
 * Each entry also has an optional `screenshotUrl` — a publicly-readable image
 * URL (Drive public link, CDN, or data URI). When the UTM Builder output
 * contains a single platform, the UI renders the matching screenshot inline
 * above the results table; the image is also linked from the Sheet/CSV export.
 *
 * To add screenshots:
 *   1. Upload the example image to a Google Drive folder shared "Anyone with link → Viewer".
 *   2. Get its file ID (the long string in the URL after /file/d/).
 *   3. Paste it below as: 'https://drive.google.com/uc?id=<FILE_ID>&export=view'
 *      (the /uc?...&export=view form embeds; the standard /view link does not).
 */
const URL_BUILDER_PLATFORM_INSTRUCTIONS = {
  'Meta': {
    column: 'UTM String',
    short:  "Paste the UTM String (column B) into Meta's URL parameters field.",
    full:   "Add 'UTM String' — column B — directly to the Tracking > URL Parameters field for each ad driving to this destination URL. This field is typically located at the end of the ad details.",
    screenshotUrl: 'https://drive.google.com/thumbnail?id=1Ihe8VcNIs9yae24H6Ho0J5HFZFhWl2mw&sz=w1600'
  },
  'TikTok (Smart+)': {
    column: 'Full URL',
    short:  "Paste the Full URL (column A) into TikTok's Destination URL field. Auto-detect: OFF.",
    full:   "Add 'Full URL' — column A — directly to the Destination URL for each ad driving to this destination URL. Once added, ensure all parameters append correctly by selecting 'edit' under 'Preview' in the UI. Ensure auto-detect is turned off!",
    screenshotUrl: 'https://drive.google.com/thumbnail?id=1NUCLKg_6jnfwOZKaHM39wCub8TjbMfQT&sz=w1600'
  },
  'TikTok (Standard)': {
    column: 'Full URL',
    short:  "Paste the Full URL (column A) into TikTok's Destination URL field. Auto-detect: OFF.",
    full:   "Add 'Full URL' — column A — directly to the Destination URL for each ad driving to this destination URL. Once added, ensure all parameters append correctly by selecting 'edit' under 'Preview' in the UI. Ensure auto-detect is turned off!",
    screenshotUrl: 'https://drive.google.com/thumbnail?id=1NUCLKg_6jnfwOZKaHM39wCub8TjbMfQT&sz=w1600'
  },
  'YouTube': {
    column: 'UTM String',
    short:  "Paste the UTM String (column B) into Google Ads → Ad URL options → Final URL Suffix.",
    full:   "Add 'UTM String' — column B — directly to the Final URL Suffix field for all ads driving to an owned landing page (e.g., Conair.com). This field is typically located at the end of the ad details: Ad URL options > Final URL Suffix. Leverage the 'Test' button to ensure the URL is loading correctly.",
    screenshotUrl: 'https://drive.google.com/thumbnail?id=1rjgVdu72hatKcjjLxf7iVzNjeX6dYbS8&sz=w1600'
  },
  'Pinterest': {
    column: 'Full URL',
    short:  "Paste the Full URL (column A) into Pinterest's Destination link field. Validate via the ad's URL preview.",
    full:   "Add 'Full URL' — column A — directly to the Destination link field for the ad. To validate: at the ad level, select 'Edit' on an ad; in the Ad details section, expand the 'URL preview' dropdown and confirm the dynamic UTM parameters ({campaignid}, {adid}) are populated; then click the previewed link to open it in a new tab and confirm the page loads properly. FYI — this account also has account-level UTM auto-tagging enabled (Business Manager → URL tracking), which appends the same parameters automatically; Pinterest will NOT override parameters you enter manually, so entering the Full URL here is safe.",
    screenshotUrl: ''  // TODO: add a Pinterest URL-preview screenshot (Drive thumbnail link) when one is available
  }
};

/**
 * Reverse map utm_source → platform key. Used by the URL QA feature to
 * detect which platform a pasted URL was built for.
 */
const URL_BUILDER_SOURCE_TO_PLATFORM = {
  'meta':   ['Meta'],
  'tiktok': ['TikTok (Smart+)', 'TikTok (Standard)'],
  'google': ['YouTube'],
  'pinterest': ['Pinterest']
};

/** Composite UTM campaign config for Unique Vacations Inc. (Sandals / Beaches). */
const URL_BUILDER_UTC_CONFIG = {
  medium: 'cpc',
  campaignPrefix: 'viralnation',
  // Objective (user-facing) → funnel-level token for the composite
  funnelMap: {
    'Awareness':       'upperfunnel',
    'Video Views':     'upperfunnel',
    'Traffic':         'middlefunnel',
    'Engagement':      'middlefunnel',
    'App Promotion':   'lowerfunnel',
    'Lead Generation': 'lowerfunnel',
    'Conversions':     'lowerfunnel',
    'Sales':           'lowerfunnel'
  },
  sourceOptions:       ['facebookinstagram', 'facebook', 'instagram', 'tiktok', 'google', 'na'],
  geoOptions:          ['usa', 'can', 'usacan', 'na', 'northeast', 'south', 'midwest', 'west'],
  objectiveOptions:    ['Awareness', 'Video Views', 'Traffic', 'Engagement', 'App Promotion', 'Lead Generation', 'Conversions', 'Sales'],
  hotelOptions:        ['SSV', 'SND', 'BTC', 'SRB', 'SLU', 'SNG', 'SDR', 'SCR'],
  creativeTypeOptions: ['video', 'carousel', 'static']
};

/** Regex of characters stripped from every composite segment before joining. */
const URL_BUILDER_STRIP_REGEX = /[-_~ ()+=\[\],<>&?]/g;

/** Characters that are HARD-BLOCKED in UTC free-text fields (Campaign Name,
 *  Influencer, Asset Version, Ad ID). Includes:
 *    - URL-structural chars: ? & # = / \ %  (would break the UTM string)
 *    - Taxonomy-reserved:     | ~          (used as separators elsewhere)
 *    - HTML / quote hazards:  " ' < >      (dangerous when pasted into code)
 *  Spaces are allowed on input; the sanitizer strips them before they hit
 *  the composite string so the user sees "Sandals Q1 Campaign" → "sandalsq1campaign".
 */
const URL_BUILDER_UTC_BANNED_CHARS = ['?', '&', '#', '=', '/', '\\', '%', '|', '~', '"', "'", '<', '>', '\n', '\r', '\t'];

function urlBuilderSanitize_(v) {
  return String(v == null ? '' : v).toLowerCase().replace(URL_BUILDER_STRIP_REGEX, '');
}

/** Build a UTM-tagged URL for one input. Returns { fullUrl, utmString, breakout }. */
function buildUtmUrl(params) {
  const brand = String((params && params.brand) || '').trim();
  const destUrl = String((params && params.destinationUrl) || '').trim();
  if (!brand) throw new Error('Brand is required');
  if (!destUrl) throw new Error('Destination URL is required');
  if (!/^https?:\/\//i.test(destUrl)) throw new Error('Destination URL must start with http:// or https://');
  if (destUrl.indexOf('?') !== -1) throw new Error('Destination URL already contains query parameters — paste the plain URL without "?..."');

  let utmString;
  const breakout = { source: '', medium: '', campaign: '', term: '', content: '' };

  if (brand === 'Unique Vacations Inc.') {
    // Hard-block URL-structural and taxonomy-reserved characters in free-text
    // fields BEFORE sanitization. Fields like Campaign Name / Influencer /
    // Asset Version / Ad ID are user-entered and must not carry chars that
    // could break the UTM string or collide with taxonomy separators.
    const freeTextFields = [
      { key: 'campaign',     label: 'Campaign Name' },
      { key: 'influencer',   label: 'Influencer Handle' },
      { key: 'assetVersion', label: 'Asset Version' },
      { key: 'adId',         label: 'Ad ID' }
    ];
    for (let fi = 0; fi < freeTextFields.length; fi++) {
      const f = freeTextFields[fi];
      const val = String(params[f.key] == null ? '' : params[f.key]);
      for (let ci = 0; ci < URL_BUILDER_UTC_BANNED_CHARS.length; ci++) {
        const c = URL_BUILDER_UTC_BANNED_CHARS[ci];
        if (val.indexOf(c) !== -1) {
          const displayChar = (c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t' : c);
          throw new Error(f.label + ' contains "' + displayChar + '", which would break the UTM string. Banned characters: ' + URL_BUILDER_UTC_BANNED_CHARS.filter(function(x){return x !== '\n' && x !== '\r' && x !== '\t';}).join(' ') + ' plus line breaks and tabs.');
        }
      }
    }

    // Composite build — every field lowercased + reserved chars stripped
    const source = urlBuilderSanitize_(params.source);
    if (!source) throw new Error('UTM Source is required for Unique Vacations Inc.');
    const objective = String(params.objective || '').trim();
    const funnel = URL_BUILDER_UTC_CONFIG.funnelMap[objective];
    if (!funnel) throw new Error('Objective "' + objective + '" has no mapped funnel level. Pick one of: ' + Object.keys(URL_BUILDER_UTC_CONFIG.funnelMap).join(', '));

    const campaignStr = [
      URL_BUILDER_UTC_CONFIG.campaignPrefix,
      funnel,
      urlBuilderSanitize_(params.campaign),
      urlBuilderSanitize_(params.geo),
      urlBuilderSanitize_(params.objective),
      urlBuilderSanitize_(params.influencer),
      urlBuilderSanitize_(params.hotel),
      urlBuilderSanitize_(params.creativeType),
      urlBuilderSanitize_(params.assetVersion),
      urlBuilderSanitize_(params.adId)
    ].join('_');

    utmString = '?utm_source=' + source + '&utm_medium=' + URL_BUILDER_UTC_CONFIG.medium + '&utm_campaign=' + campaignStr;
    breakout.source   = source;
    breakout.medium   = URL_BUILDER_UTC_CONFIG.medium;
    breakout.campaign = campaignStr;
  } else {
    // Platform-driven build (Conair / BaBylissPRO / Cuisinart)
    if (URL_BUILDER_SUPPORTED_BRANDS.indexOf(brand) === -1) {
      throw new Error('Brand "' + brand + '" is not supported by the URL Builder. Supported: ' + URL_BUILDER_SUPPORTED_BRANDS.join(', '));
    }
    const platformKey = String(params.platform || '').trim();
    const template = URL_BUILDER_PLATFORM_TEMPLATES[platformKey];
    if (!template) throw new Error('Platform "' + platformKey + '" is not supported. Supported: ' + Object.keys(URL_BUILDER_PLATFORM_TEMPLATES).join(', '));
    utmString = template;

    // Parse breakout from the template
    template.replace(/^\?/, '').split('&').forEach(function(kv) {
      const idx = kv.indexOf('=');
      if (idx === -1) return;
      const key = kv.slice(0, idx);
      const val = kv.slice(idx + 1);
      if (key === 'utm_source')   breakout.source   = val;
      if (key === 'utm_medium')   breakout.medium   = val;
      if (key === 'utm_campaign') breakout.campaign = val;
      if (key === 'utm_term')     breakout.term     = val;
      if (key === 'utm_content')  breakout.content  = val;
    });
  }

  return { fullUrl: destUrl + utmString, utmString: utmString, breakout: breakout };
}

/**
 * Batch-check destination URL liveness using UrlFetchApp.fetchAll (parallel).
 * Strips query params before the fetch since dynamic platform tokens like
 * {{campaign.id}} aren't real IDs yet — only the destination URL is testable.
 * Returns array of { alive, code, reason } aligned with input order.
 */
function checkUrlsLive_(urls) {
  if (!urls || urls.length === 0) return [];
  const requests = urls.map(function(u) {
    const destOnly = String(u || '').split('?')[0];
    return {
      url: destOnly,
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true,
      // Brand sites (Sandals, Walmart, etc.) often respond to server-side
      // user-agents with 403/406. Sending a realistic browser UA gets us past
      // most of those bot-detection layers without breaking anything.
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    };
  });
  let responses;
  try {
    responses = UrlFetchApp.fetchAll(requests);
  } catch (e) {
    return urls.map(function() {
      return { alive: false, code: 0, reason: 'Batch fetch failed: ' + (e && e.message || e) };
    });
  }
  // Codes that typically mean "the page is live but the server blocked our
  // server-side fetch" — treat as alive with a note. Real browsers will
  // resolve these pages fine; only the Apps Script side-channel is blocked.
  const BLOCKED_BUT_LIVE = { 401: 1, 403: 1, 406: 1, 429: 1, 503: 1 };
  return responses.map(function(r, i) {
    if (!r) return { alive: false, code: 0, reason: 'No response from ' + urls[i] };
    try {
      const code = r.getResponseCode();
      if (code >= 200 && code < 400) return { alive: true, code: code };
      if (BLOCKED_BUT_LIVE[code]) {
        return {
          alive: true,
          code: code,
          reason: 'Server returned HTTP ' + code + ' to the bot check — page is likely live in a browser.'
        };
      }
      return { alive: false, code: code, reason: 'HTTP ' + code };
    } catch (e) {
      return { alive: false, code: 0, reason: 'Response error: ' + (e && e.message || e) };
    }
  });
}

/** RPC: build URL(s) and attach liveness for each. */
function runUrlBuilder(inputsArray) {
  const results = [];
  (inputsArray || []).forEach(function(input) {
    try {
      const out = buildUtmUrl(input || {});
      results.push({
        ok: true, input: input,
        fullUrl: out.fullUrl, utmString: out.utmString, breakout: out.breakout
      });
    } catch (e) {
      results.push({ ok: false, input: input, error: e.message });
    }
  });

  // Check destination liveness in parallel for every successful build
  const okResults = results.filter(function(r) { return r.ok; });
  const liveness = checkUrlsLive_(okResults.map(function(r) { return r.fullUrl; }));
  let j = 0;
  results.forEach(function(r) {
    if (r.ok) { r.liveness = liveness[j++]; }
  });

  return { ok: true, results: results };
}

/** Export URL Builder results to a new standalone Google Sheet.
 *  Now also writes a Platform column, an Implementation Instructions column,
 *  and (when a single platform is in play) an Instructions sheet that embeds
 *  the platform's example screenshot.
 */
function exportUrlBuilderToNewSheet(results) {
  if (!results || results.length === 0) return { ok: false, error: 'No results to export' };
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd HHmm');
  const title = 'URL Builder Export - ' + stamp;
  const ss = SpreadsheetApp.create(title);
  const sheet = ss.getActiveSheet();
  sheet.setName('URL Builder');
  const header = ['Full URL', 'UTM String', 'Platform', 'Implementation Instructions', 'Source', 'Medium', 'Campaign', 'Term', 'Content', 'Liveness', 'Status Code', 'Error / Reason'];
  sheet.getRange(1, 1, 1, header.length)
       .setValues([header])
       .setFontWeight('bold')
       .setBackground('#000000')
       .setFontColor('#FFC227');
  const platformsSeen = {};
  const rows = results.map(function(r) {
    const b = r.breakout || {};
    const live = r.liveness || {};
    const utmString = (r.utmString || '').replace(/^\?/, '');  // drop the leading "?"
    const platform = (r.input && r.input.platform) || '';
    if (platform) platformsSeen[platform] = true;
    const instr = (URL_BUILDER_PLATFORM_INSTRUCTIONS[platform] && URL_BUILDER_PLATFORM_INSTRUCTIONS[platform].full) || '';
    return [
      r.fullUrl || '',
      utmString,
      platform,
      instr,
      b.source || '',
      b.medium || '',
      b.campaign || '',
      b.term || '',
      b.content || '',
      r.error ? '' : (live.alive ? 'LIVE' : 'DEAD'),
      r.error ? '' : String(live.code || ''),
      r.error || (live.alive ? '' : (live.reason || ''))
    ];
  });
  sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  // Wrap the long instruction text
  sheet.getRange(2, 4, rows.length, 1).setWrap(true).setVerticalAlignment('top');
  // Colour the Liveness column (column 10 in the new layout)
  const livenessBgs = rows.map(function(row) {
    if (row[9] === 'LIVE') return ['#D9EAD3'];
    if (row[9] === 'DEAD') return ['#F4CCCC'];
    return ['#FFFFFF'];
  });
  sheet.getRange(2, 10, rows.length, 1).setBackgrounds(livenessBgs);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 520);   // Full URL
  sheet.setColumnWidth(2, 380);   // UTM String
  sheet.setColumnWidth(3, 140);   // Platform
  sheet.setColumnWidth(4, 480);   // Instructions
  for (let c = 5; c <= 9; c++) sheet.setColumnWidth(c, 140);
  sheet.setColumnWidth(10, 90);   // Liveness
  sheet.setColumnWidth(11, 90);   // Code
  sheet.setColumnWidth(12, 260);  // Error/Reason

  // Add an Instructions tab when there's a single platform across all rows —
  // this keeps the screenshot and the verbose copy in a dedicated, readable spot.
  const uniquePlatforms = Object.keys(platformsSeen);
  if (uniquePlatforms.length === 1) {
    try {
      const platform = uniquePlatforms[0];
      const inst = URL_BUILDER_PLATFORM_INSTRUCTIONS[platform] || {};
      const tab = ss.insertSheet('Instructions');
      tab.getRange(1, 1).setValue('How to implement these URLs in ' + platform)
        .setFontWeight('bold').setFontSize(14).setBackground('#000000').setFontColor('#FFC227');
      tab.getRange(2, 1).setValue('What to copy:').setFontWeight('bold');
      tab.getRange(2, 2).setValue(inst.column ? (inst.column + ' (column ' + (inst.column === 'Full URL' ? 'A' : 'B') + ')') : '');
      tab.getRange(3, 1).setValue('Where to paste:').setFontWeight('bold');
      tab.getRange(3, 2).setValue(inst.full || '').setWrap(true);
      if (inst.screenshotUrl) {
        tab.getRange(5, 1).setValue('Visual example:').setFontWeight('bold');
        // Try to embed the image inline; falls back to a hyperlink if Drive
        // blocks IMAGE() (e.g. file is not publicly viewable).
        try {
          tab.getRange(6, 1).setFormula('=IMAGE("' + inst.screenshotUrl.replace(/"/g, '') + '")');
          tab.setRowHeight(6, 360);
        } catch (eImg) {
          tab.getRange(6, 1).setFormula('=HYPERLINK("' + inst.screenshotUrl + '","Open visual example")');
        }
      }
      tab.setColumnWidth(1, 180);
      tab.setColumnWidth(2, 720);
    } catch (e) {
      // If the Instructions tab fails to render for any reason, keep the main export.
    }
  }
  return { ok: true, url: ss.getUrl(), name: title, count: rows.length, platforms: uniquePlatforms };
}

// =========================================================================
// URL QA — validate pasted URLs against expected platform templates
// =========================================================================

/** Parse a URL's query string into { utm_source, utm_medium, utm_campaign, utm_content, utm_term }. */
function parseUtmParams_(url) {
  const out = { utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '', _other: {} };
  const qIdx = String(url || '').indexOf('?');
  if (qIdx === -1) return out;
  const qs = url.slice(qIdx + 1);
  qs.split('&').forEach(function(pair) {
    if (!pair) return;
    const eq = pair.indexOf('=');
    const k = (eq === -1 ? pair : pair.slice(0, eq));
    const v = (eq === -1 ? '' : pair.slice(eq + 1));
    if (Object.prototype.hasOwnProperty.call(out, k)) out[k] = v;
    else out._other[k] = v;
  });
  return out;
}

/** Pull expected key/value pairs from a template for a given platform. */
function templateExpectedParams_(platform) {
  const tpl = URL_BUILDER_PLATFORM_TEMPLATES[platform];
  if (!tpl) return null;
  const expected = {};
  tpl.replace(/^\?/, '').split('&').forEach(function(pair) {
    const eq = pair.indexOf('=');
    if (eq === -1) return;
    expected[pair.slice(0, eq)] = pair.slice(eq + 1);
  });
  return expected;
}

/**
 * Validate a UTC composite-campaign UTM string. UTC URLs don't use
 * platform templates — they use a single utm_campaign string with 10
 * underscore-separated tokens that follow the formula:
 *   viralnation_<funnel>_<campaign>_<geo>_<objective>_<influencer>_<hotel>_<creativeType>_<assetVersion>_<adId>
 * Plus utm_source from a fixed list, utm_medium = 'cpc'.
 */
function qaUtmUrlAgainstUtc_(params) {
  const issues = [];
  const cfg = URL_BUILDER_UTC_CONFIG;

  // utm_source must be in the allowed UTC source list
  const src = String(params.utm_source || '').toLowerCase();
  if (!src) {
    issues.push('Missing utm_source');
  } else if (cfg.sourceOptions.indexOf(src) === -1) {
    issues.push('utm_source = "' + params.utm_source + '" — not in the allowed Unique Vacations Inc. source list: ' + cfg.sourceOptions.join(', '));
  }

  // utm_medium must be 'cpc'
  const med = String(params.utm_medium || '').toLowerCase();
  if (!med) {
    issues.push('Missing utm_medium (Unique Vacations Inc. URLs require utm_medium = "' + cfg.medium + '")');
  } else if (med !== cfg.medium) {
    issues.push('utm_medium = "' + params.utm_medium + '" — Unique Vacations Inc. URLs must use utm_medium = "' + cfg.medium + '"');
  }

  // utm_campaign must be a 10-token composite
  const camp = String(params.utm_campaign || '');
  if (!camp) {
    issues.push('Missing utm_campaign');
  } else {
    const tokens = camp.split('_');
    if (tokens.length !== 10) {
      issues.push('utm_campaign must have exactly 10 underscore-separated segments — got ' + tokens.length + '. Format: viralnation_<funnel>_<campaign>_<geo>_<objective>_<influencer>_<hotel>_<creativeType>_<assetVersion>_<adId>');
    } else {
      const prefix       = tokens[0];
      const funnel       = tokens[1];
      const campaignName = tokens[2];
      const geo          = tokens[3];
      const objective    = tokens[4];
      const influencer   = tokens[5];
      const hotel        = tokens[6];
      const creativeType = tokens[7];
      const assetVersion = tokens[8];
      const adId         = tokens[9];

      if (prefix !== cfg.campaignPrefix) {
        issues.push('utm_campaign segment 1 (prefix) = "' + prefix + '" — expected "' + cfg.campaignPrefix + '"');
      }
      const funnelOptions = ['upperfunnel', 'middlefunnel', 'lowerfunnel'];
      if (funnelOptions.indexOf(funnel) === -1) {
        issues.push('utm_campaign segment 2 (funnel) = "' + funnel + '" — expected one of: ' + funnelOptions.join(', '));
      }
      if (!campaignName) {
        issues.push('utm_campaign segment 3 (campaign name) is empty');
      }
      if (!geo) {
        issues.push('utm_campaign segment 4 (geo) is empty');
      } else if (cfg.geoOptions.indexOf(geo) === -1) {
        issues.push('utm_campaign segment 4 (geo) = "' + geo + '" — expected one of: ' + cfg.geoOptions.join(', '));
      }
      const objectivesSanitized = cfg.objectiveOptions.map(function(o){ return urlBuilderSanitize_(o); });
      if (!objective) {
        issues.push('utm_campaign segment 5 (objective) is empty');
      } else if (objectivesSanitized.indexOf(objective) === -1) {
        issues.push('utm_campaign segment 5 (objective) = "' + objective + '" — expected one of: ' + objectivesSanitized.join(', '));
      }
      if (!influencer) {
        issues.push('utm_campaign segment 6 (influencer) is empty');
      }
      const hotelsSanitized = cfg.hotelOptions.map(function(h){ return h.toLowerCase(); });
      if (!hotel) {
        issues.push('utm_campaign segment 7 (hotel) is empty');
      } else if (hotelsSanitized.indexOf(hotel) === -1) {
        issues.push('utm_campaign segment 7 (hotel) = "' + hotel + '" — expected one of: ' + hotelsSanitized.join(', '));
      }
      if (!creativeType) {
        issues.push('utm_campaign segment 8 (creative type) is empty');
      } else if (cfg.creativeTypeOptions.indexOf(creativeType) === -1) {
        issues.push('utm_campaign segment 8 (creative type) = "' + creativeType + '" — expected one of: ' + cfg.creativeTypeOptions.join(', '));
      }
      if (!assetVersion) {
        issues.push('utm_campaign segment 9 (asset version) is empty');
      }
      if (!adId) {
        issues.push('utm_campaign segment 10 (ad ID) is empty');
      }
    }
  }

  // utm_content / utm_term are NOT used by UTC — flag any presence
  if (params.utm_content) {
    issues.push('Unexpected utm_content = "' + params.utm_content + '" — Unique Vacations Inc. URLs do not use utm_content');
  }
  if (params.utm_term) {
    issues.push('Unexpected utm_term = "' + params.utm_term + '" — Unique Vacations Inc. URLs do not use utm_term');
  }
  return issues;
}

/**
 * QA a list of pasted destination URLs against the expected URL Builder output
 * for a CALLER-SPECIFIED brand (and platform, if the brand is product-driven).
 * The caller must pick the brand up front — the validator branches on whether
 * the brand uses platform-driven UTMs (Conair / BaBylissPRO / Cuisinart) or
 * the UTC composite-campaign format.
 *
 * Cross-platform mistakes (a Meta UTM pasted into a TikTok ad's URL) and
 * cross-brand mistakes (a UTC URL pasted into a Cuisinart QA) are both
 * surfaced clearly.
 *
 * Returns: [{ url, status, brand, platform, issues, expected, found }]
 */
function qaUtmUrls(urls, brand, expectedPlatform) {
  const out = [];
  const brandKey = String(brand || '').trim();
  if (!brandKey) {
    throw new Error('Pick a brand before running URL QA — Unique Vacations Inc. and product brands use different UTM formats.');
  }
  if (URL_BUILDER_SUPPORTED_BRANDS.indexOf(brandKey) === -1) {
    throw new Error('Brand "' + brandKey + '" is not supported by URL QA. Supported: ' + URL_BUILDER_SUPPORTED_BRANDS.join(', '));
  }
  const isUtc = (brandKey === 'Unique Vacations Inc.');

  let platformKey = '';
  let expected = null;
  if (!isUtc) {
    platformKey = String(expectedPlatform || '').trim();
    if (!platformKey) {
      throw new Error('Pick a platform — product brands (' + brandKey + ') use platform-driven UTM templates.');
    }
    if (!URL_BUILDER_PLATFORM_TEMPLATES[platformKey]) {
      throw new Error('Platform "' + platformKey + '" is not supported. Supported: ' + Object.keys(URL_BUILDER_PLATFORM_TEMPLATES).join(', '));
    }
    expected = templateExpectedParams_(platformKey);
  }
  // Reverse-lookup the expected utm_source values that match this platform
  // (TikTok Smart+ and TikTok Standard both have utm_source=tiktok).
  const expectedSource = (expected && expected.utm_source) || '';

  (urls || []).forEach(function(rawUrl) {
    const url = String(rawUrl || '').trim();
    if (!url) return;
    const issues = [];

    // Basic structural checks
    if (!/^https?:\/\//i.test(url)) {
      out.push({ url: url, status: 'FAIL', brand: brandKey, platform: platformKey, issues: ['URL does not start with http:// or https://'], expected: expected || {}, found: {} });
      return;
    }
    const qIdx = url.indexOf('?');
    if (qIdx === -1) {
      out.push({ url: url, status: 'FAIL', brand: brandKey, platform: platformKey, issues: ['No query string — URL has no UTM parameters appended'], expected: expected || {}, found: {} });
      return;
    }

    const params = parseUtmParams_(url);
    const found = {
      utm_source:   params.utm_source,
      utm_medium:   params.utm_medium,
      utm_campaign: params.utm_campaign,
      utm_content:  params.utm_content,
      utm_term:     params.utm_term
    };

    if (isUtc) {
      // ---- UTC composite-campaign validation ----
      // Cross-brand sanity: if utm_source looks like a product-brand platform
      // (meta / tiktok / google), the URL was likely built for the wrong brand.
      const actualSrc = (params.utm_source || '').toLowerCase();
      const productPlatforms = URL_BUILDER_SOURCE_TO_PLATFORM[actualSrc] || [];
      if (productPlatforms.length > 0 && URL_BUILDER_UTC_CONFIG.sourceOptions.indexOf(actualSrc) === -1) {
        issues.push(
          'utm_source = "' + params.utm_source + '" — looks like a ' + productPlatforms.join(' or ') +
          ' URL pasted into a Unique Vacations Inc. QA. UTC URLs use sources from: ' + URL_BUILDER_UTC_CONFIG.sourceOptions.join(', ') + '.'
        );
      }
      qaUtmUrlAgainstUtc_(params).forEach(function(i){ issues.push(i); });
      out.push({
        url: url,
        status: issues.length === 0 ? 'PASS' : 'FAIL',
        brand: brandKey, platform: '',
        issues: issues, expected: { format: 'UTC composite-campaign' }, found: found
      });
      return;
    }

    // ---- Product-brand template validation ----
    // Cross-platform detection
    const actualSrc = (params.utm_source || '').toLowerCase();
    if (actualSrc && expectedSource && actualSrc !== expectedSource) {
      // If the source is in the UTC list, that's a brand mistake, not a platform mistake
      if (URL_BUILDER_UTC_CONFIG.sourceOptions.indexOf(actualSrc) !== -1) {
        issues.push(
          'utm_source = "' + params.utm_source + '" — looks like a Unique Vacations Inc. URL pasted into the ' + platformKey + ' QA. ' +
          'Expected utm_source = "' + expectedSource + '". Switch to the Unique Vacations Inc. brand if you meant to QA Unique Vacations Inc. URLs.'
        );
      } else {
        const detectedCandidates = URL_BUILDER_SOURCE_TO_PLATFORM[actualSrc] || [];
        const detectedPlatformLabel = detectedCandidates.length ? detectedCandidates.join(' or ') : 'unknown';
        issues.push(
          'utm_source = "' + params.utm_source + '" — looks like a ' + detectedPlatformLabel +
          ' URL pasted into the ' + platformKey + ' QA. Expected utm_source = "' + expectedSource + '".'
        );
      }
    }

    // Compare against expected template
    if (expected) {
      Object.keys(expected).forEach(function(k) {
        const expVal = expected[k];
        const gotVal = found[k] || '';
        if (!gotVal) {
          issues.push('Missing required parameter "' + k + '" (expected literal "' + expVal + '" or a dynamic platform token)');
          return;
        }
        // Determine whether the expected value is a dynamic placeholder. Three
        // forms used by ad platforms:
        //   {{name}}      Meta-style       e.g. {{campaign.id}}
        //   __NAME__      TikTok-style     e.g. __CAMPAIGN_ID__
        //   {name}        Google Ads-style e.g. {campaignid}
        const isPlaceholder = /^\{\{.+\}\}$/.test(expVal) || /^__.+__$/.test(expVal) || /^\{[a-zA-Z]+\}$/.test(expVal);

        if (!isPlaceholder) {
          if (gotVal !== expVal) {
            issues.push('Parameter "' + k + '" = "' + gotVal + '" — expected "' + expVal + '"');
          }
          return;
        }

        if (gotVal === expVal) return;  // unfilled template — accepted

        const hasBrace = /[\{\}]/.test(gotVal);
        const hasDoubleUnderscore = /__/.test(gotVal);
        if (hasBrace || hasDoubleUnderscore) {
          issues.push('Parameter "' + k + '" = "' + gotVal + '" — looks like a malformed dynamic token. Expected either the literal placeholder "' + expVal + '" (URL not yet served) or a fully-resolved value with no leftover { } or __ characters.');
        }
      });
      // Flag unexpected utm_* params
      ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k) {
        if (!expected[k] && found[k]) {
          issues.push('Unexpected parameter "' + k + '" = "' + found[k] + '" — not in the ' + platformKey + ' template');
        }
      });
    }

    out.push({
      url: url,
      status: issues.length === 0 ? 'PASS' : 'FAIL',
      brand: brandKey, platform: platformKey,
      issues: issues, expected: expected || {}, found: found
    });
  });
  return out;
}

/** RPC wrapper for client. */
function runUrlQA(urls, brand, expectedPlatform) {
  try {
    const results = qaUtmUrls(urls || [], brand, expectedPlatform);
    return { ok: true, results: results };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Export URL QA results to a new standalone Google Sheet. */
function exportUrlQAToNewSheet(results) {
  if (!results || results.length === 0) return { ok: false, error: 'No QA results to export' };
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd HHmm');
  const title = 'URL QA Export - ' + stamp;
  const ss = SpreadsheetApp.create(title);
  const sheet = ss.getActiveSheet();
  sheet.setName('URL QA');
  const header = ['Status', 'URL', 'Brand', 'Platform', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'Issues'];
  sheet.getRange(1, 1, 1, header.length)
       .setValues([header])
       .setFontWeight('bold')
       .setBackground('#000000')
       .setFontColor('#FFC227');
  const rows = results.map(function(r) {
    const f = r.found || {};
    return [
      r.status || '',
      r.url || '',
      r.brand || '',
      r.platform || '',
      f.utm_source || '', f.utm_medium || '', f.utm_campaign || '', f.utm_content || '', f.utm_term || '',
      (r.issues || []).join('\n')
    ];
  });
  sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  sheet.getRange(2, 10, rows.length, 1).setWrap(true).setVerticalAlignment('top');
  const statusBgs = rows.map(function(row) { return [row[0] === 'PASS' ? '#D9EAD3' : '#F4CCCC']; });
  sheet.getRange(2, 1, rows.length, 1).setBackgrounds(statusBgs);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 70);    // Status
  sheet.setColumnWidth(2, 520);   // URL
  sheet.setColumnWidth(3, 160);   // Brand
  sheet.setColumnWidth(4, 140);   // Platform
  for (let c = 5; c <= 9; c++) sheet.setColumnWidth(c, 160);
  sheet.setColumnWidth(10, 480);  // Issues
  return { ok: true, url: ss.getUrl(), name: title, count: rows.length };
}

// =========================================================================
// DOMAIN MAP — URL hostname → LP Domain value
// =========================================================================

/**
 * Returns an array of { pattern, lpValue, brand } rules read from the
 * Taxonomy Domain Map sheet. If no sheet exists, returns null.
 *
 * Matching logic (UI side): given a URL, extract the hostname (strip www.),
 * and find the first rule where the hostname contains the `pattern` AND
 * (rule.brand is blank OR rule.brand === selected brand).
 */
function loadDomainMappings() {
  let sheet;
  try { sheet = getDataSpreadsheet_().getSheetByName(DOMAIN_MAP_SHEET_NAME); }
  catch (e) { return null; }
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;
  const rules = [];
  for (let i = 1; i < data.length; i++) {
    const pattern = String(data[i][0] || '').trim().toLowerCase().replace(/^www\./, '');
    const lpValue = String(data[i][1] || '').trim();
    const brand   = String(data[i][2] || '').trim();
    if (!pattern || !lpValue) continue;
    rules.push({ pattern: pattern, lpValue: lpValue, brand: brand });
  }
  return rules;
}

/** One-off: seed the Domain Map tab. Run from Apps Script editor. */
function ensureDomainMapSheet() {
  const ss = getDataSpreadsheet_();
  let sheet = ss.getSheetByName(DOMAIN_MAP_SHEET_NAME);
  const existed = !!sheet;
  if (!sheet) {
    sheet = ss.insertSheet(DOMAIN_MAP_SHEET_NAME);
    sheet.getRange(1, 1, 1, DOMAIN_MAP_HEADER.length)
         .setValues([DOMAIN_MAP_HEADER])
         .setFontWeight('bold')
         .setBackground('#EEEEEE');
    const seed = [
      ['amazon.com',      'Amazon',         ''],
      ['walmart.com',     'Walmart',        ''],
      ['target.com',      'Target',         ''],
      ['bestbuy.com',     'BestBuy',        ''],
      ['cuisinart.com',   'Owned',          'Cuisinart'],
      ['conair.com',      'Owned',          'Conair'],
      ['babylisspro.com', 'Owned',          'BaBylissPRO']
    ];
    sheet.getRange(2, 1, seed.length, DOMAIN_MAP_HEADER.length).setValues(seed);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 260);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 160);
    sheet.getRange(1, 5).setValue(
      'How to use: list URL hostname patterns (e.g., amazon.com, cuisinart.com) and the LP Domain ' +
      'value they should resolve to. If a rule only applies to a specific brand (e.g., brand-owned ' +
      'domains that map to "Owned"), put the brand in column C. Leave column C blank for rules that ' +
      'apply to any brand (e.g., retailers). Reopen the sidebar after editing.'
    ).setFontColor('#555').setFontStyle('italic');
  }
  return { ok: true, existed: existed, sheetName: DOMAIN_MAP_SHEET_NAME, url: ss.getUrl() };
}
