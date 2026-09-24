/**
 * Regression tests for the P3 Organic Post ID change.
 *
 * Run:  node tests/taxonomy.test.js
 *
 * code.gs is Apps Script, not a module, so it is loaded by evaluating it in
 * this file's scope. The two Apps Script services the parser touches are
 * stubbed; every test here is offline by design, because network-dependent
 * short-link resolution is not something a regression suite should depend on.
 *
 * What this suite is actually protecting:
 *   1. The ad name still has exactly 13 pipe segments, with and without a
 *      post ID. The dynamic table parses that name BY POSITION, so a 14th
 *      segment would shift ext_p3_ad_custom_identifier and silently re-read
 *      every historical row into the wrong column.
 *   2. A name with no organic post is byte-identical to what the generator
 *      produced before this change.
 *   3. URLs that cannot yield a trustworthy key (Facebook pfbid, TikTok Shop
 *      product IDs, Reddit comment IDs) fail loudly instead of emitting one.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

globalThis.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) };
globalThis.UrlFetchApp = { fetch: () => { throw new Error('network disabled in tests'); } };
globalThis.Utilities = { base64EncodeWebSafe: (x) => Buffer.from(String(x)).toString('base64url') };

// runInThisContext, not eval: a strict-mode eval keeps its declarations to
// itself, so the functions under test would never reach this scope.
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'code.gs'), 'utf8'));

let pass = 0, fail = 0;
function eq(desc, got, want) { if (got === want) { pass++; } else { fail++; console.log('FAIL ' + desc + '\n  got  ' + JSON.stringify(got) + '\n  want ' + JSON.stringify(want)); } }
function throws(desc, fn, frag) { try { fn(); fail++; console.log('FAIL ' + desc + ' - expected a throw'); } catch (e) { if (String(e.message).includes(frag)) { pass++; } else { fail++; console.log('FAIL ' + desc + '\n  got  ' + e.message + '\n  want fragment ' + frag); } } }
function t(desc, url, expectStatus, expectId, expectPlatform) {
  const r = organicParseOffline_(url);
  const ok = r.status === expectStatus
    && (expectId === undefined || r.postId === expectId)
    && (expectPlatform === undefined || r.platform === expectPlatform);
  if (ok) { pass++; return; }
  fail++;
  console.log('FAIL: ' + desc + '\n  url=' + url + '\n  got   status=' + r.status + ' id=' + r.postId + ' platform=' + r.platform + '\n  want  status=' + expectStatus + ' id=' + expectId + ' platform=' + expectPlatform + '\n  reason=' + r.reason);
}

// =====================================================================
// A. URL -> post ID extraction
// Numbered cases map to the negative-case corpus in
// Paid-Media-Unified-Data-Table/docs/organic-url-patterns/README.md
// =====================================================================

t('1 Reddit comment permalink -> POST id','https://www.reddit.com/r/cooking/comments/1abc234/great_recipe/lmn5678/','ok','1abc234','reddit');
t('3 TikTok Shop product id rejected','https://shop.tiktok.com/view/product/1729581234567890123','wrong_namespace',undefined,'tiktok');
t('4 FB group post hex segment -> last numeric','https://www.facebook.com/groups/123456789/posts/987654321/','ok','987654321','facebook');
t('5 IG /share/p/ not username "share"','https://www.instagram.com/share/p/AbCdEfGhIjK/','needs_resolution',undefined,'instagram');
t('6 IG Graph API media id rejected','https://www.instagram.com/p/17841400000000000/','malformed_url',undefined,'instagram');
t('7 YouTube id starting with hyphen','https://www.youtube.com/watch?v=-wtIMTCHWuI','ok','-wtIMTCHWuI','youtube');
t('8a YouTube shorts','https://www.youtube.com/shorts/dQw4w9WgXcQ','ok','dQw4w9WgXcQ','youtube');
t('8b YouTube watch dedupes to same id','https://www.youtube.com/watch?v=dQw4w9WgXcQ','ok','dQw4w9WgXcQ','youtube');
t('9 Twitch clip channel is first segment','https://www.twitch.tv/somechannel/clip/AbrasiveTastyPassionfruit','ok','AbrasiveTastyPassionfruit','twitch');
t('10 Twitch same slug other channel','https://www.twitch.tv/otherchannel/clip/AbrasiveTastyPassionfruit','ok','AbrasiveTastyPassionfruit','twitch');
t('12 X Article not dropped','https://x.com/someuser/article/1799999999999999999','ok','1799999999999999999','x');
t('14 Snapchat /p/{uuid}/{num} is a profile','https://www.snapchat.com/p/a1b2c3d4-e5f6/1234567','not_a_post',undefined,'snapchat');
t('16 pin.it needs multi-hop resolution','https://pin.it/2xKq8Lm','needs_resolution',undefined,'pinterest');
t('17 Facebook pfbid must never be a key','https://www.facebook.com/somepage/posts/pfbid02abcdefghijklmnop','needs_resolution',undefined,'facebook');

// ===== Positives =====
t('IG canonical post','https://www.instagram.com/p/DdbhlHZOdfw/','ok','DdbhlHZOdfw','instagram');
t('IG reel','https://www.instagram.com/reel/DdbhlHZOdfw/','ok','DdbhlHZOdfw','instagram');
t('IG user-scoped carries handle','https://www.instagram.com/gisellelangley/p/DdbhlHZOdfw/','ok','DdbhlHZOdfw','instagram');
t('IG reels audio not a post','https://www.instagram.com/reels/audio/123456789/','not_a_post',undefined,'instagram');
t('IG highlight wrong namespace','https://www.instagram.com/stories/highlights/17900000000000000/','wrong_namespace',undefined,'instagram');
t('TikTok canonical','https://www.tiktok.com/@gisellelangley/video/7301234567890123456','ok','7301234567890123456','tiktok');
t('TikTok embed v2 lang AFTER id','https://www.tiktok.com/embed/v2/7301234567890123456/en','ok','7301234567890123456','tiktok');
t('TikTok music page not a post','https://www.tiktok.com/music/original-sound-7301234567890123456','not_a_post',undefined,'tiktok');
t('Threads post','https://www.threads.com/@someuser/post/DdbhlHZOdfw','ok','DdbhlHZOdfw','threads');
t('X status','https://x.com/someuser/status/1799999999999999999','ok','1799999999999999999','x');
t('X i/status handle-less','https://x.com/i/status/1799999999999999999','ok','1799999999999999999','x');
t('X spaces wrong namespace','https://x.com/i/spaces/1YpKkZbqDaXxj','wrong_namespace',undefined,'x');
t('Reddit canonical post','https://www.reddit.com/r/cooking/comments/1abc234/great_recipe/','ok','1abc234','reddit');
t('redd.it short form','https://redd.it/1abc234','ok','1abc234','reddit');
t('Pinterest slug--id double hyphen (real id)','https://www.pinterest.com/pin/sharding-pinterest-how-we-scaled-our-mysql-fleet--217439488248856645/','ok','217439488248856645','pinterest');
t('Pinterest ccTLD','https://www.pinterest.co.uk/pin/217439488248856645/','ok','217439488248856645','pinterest');
t('15 Pinterest 16-digit pin not rejected as short','https://www.pinterest.com/pin/2885187230773305/','ok','2885187230773305','pinterest');
t('Pinterest board id rejected','https://www.pinterest.com/pin/1084663960193467367/','wrong_namespace',undefined,'pinterest');
t('13 Snapchat ids sharing first 25 chars must not dedupe','https://www.snapchat.com/@u/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYc2ltcGxlLXVzZXJuYW1lAX0AAAAB','ok',undefined,'snapchat');
t('Snapchat spotlight','https://www.snapchat.com/@someuser/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYc2ltcGxlLXVzZXJuYW1lAX0AAAAA','ok',undefined,'snapchat');
t('Twitch VOD','https://www.twitch.tv/videos/1234567890','ok','1234567890','twitch');
t('YouTube youtu.be','https://youtu.be/dQw4w9WgXcQ','ok','dQw4w9WgXcQ','youtube');
t('YouTube clip needs resolution','https://www.youtube.com/clip/UgkxABCDEFGHIJKLMNOP','needs_resolution',undefined,'youtube');
t('YouTube community post wrong ns','https://www.youtube.com/post/UgkxABCDEFGHIJKLMNOP','wrong_namespace',undefined,'youtube');
t('LinkedIn urn','https://www.linkedin.com/feed/update/urn:li:activity:7012345678901234567/','ok','7012345678901234567','linkedin');
t('Unwrap FB plugin href','https://www.facebook.com/plugins/post.php?href=https%3A%2F%2Fwww.instagram.com%2Fp%2FDdbhlHZOdfw%2F','ok','DdbhlHZOdfw','instagram');
t('Bare host no scheme','instagram.com/p/DdbhlHZOdfw/','ok','DdbhlHZOdfw','instagram');
t('Not a URL','just some text','malformed_url');
t('Unknown host','https://example.com/p/abc','unsupported_url');

// =====================================================================
// B. Name build / parse round-trip and the Boosted conditional requirement
// =====================================================================
const base = {
  rowNum:'1', adName:'Summer Blowout', assetType:'Darkposted', creativeType:'Influencer Video',
  aspectRatio:'9x16', videoLength:'30', bodyCopy:'Smooth in one pass', cta:'Shop Now',
  domain:'Amazon', productCat:'Hair Dryers', productSku:'DGB-30',
  startDate:'05/01/26', endDate:'06/30/26', influencer:'gisellelangley', customId:'NA'
};

// 1. Segment count must stay 13 with and without a post ID.
const noPost = buildOutput('P3', base);
eq('no post: 13 segments', noPost.replace(/^R#:/,'').split(' | ').length, 13);
eq('no post: influencer slot is handle alone', noPost.replace(/^R#:/,'').split(' | ')[11], 'gisellelangley');

const withPost = buildOutput('P3', Object.assign({}, base, {organicPostUrl:'https://www.instagram.com/p/DdbhlHZOdfw/'}));
eq('with post: 13 segments', withPost.replace(/^R#:/,'').split(' | ').length, 13);
eq('with post: packed slot', withPost.replace(/^R#:/,'').split(' | ')[11], 'gisellelangley ~ DdbhlHZOdfw');
eq('with post: customId still last', withPost.replace(/^R#:/,'').split(' | ')[12], 'NA');

// 2. Round-trip through the reverse parser.
const p = parseName('P3', withPost);
eq('roundtrip ok', p.ok, true);
eq('roundtrip handle', p.values.influencer, 'gisellelangley');
eq('roundtrip postId', p.values.organicPostUrl, 'DdbhlHZOdfw');
const p2 = parseName('P3', noPost);
eq('legacy name parses', p2.ok, true);
eq('legacy handle', p2.values.influencer, 'gisellelangley');
eq('legacy postId empty', p2.values.organicPostUrl, '');

// 3. Historical name with no post ID is byte-identical after the change.
eq('historical byte-identical', noPost,
  'R#:1 | Summer Blowout | Darkposted | Influencer Video | 9x16 | 30 | BC: Smooth in one pass | CTA: Shop Now | LP: Amazon ~ Hair Dryers (DGB-30) | 05/01/26 | 06/30/26 | gisellelangley | NA');

// 4. Boosted requires the post URL.
throws('Boosted without post URL throws', () => buildOutput('P3', Object.assign({}, base, {assetType:'Boosted'})), 'required when Asset Type is "Boosted"');
eq('Boosted with post URL builds', buildOutput('P3', Object.assign({}, base, {assetType:'Boosted', organicPostUrl:'https://www.tiktok.com/@giselle/video/7301234567890123456'})).split(' | ')[11], 'gisellelangley ~ 7301234567890123456');
eq('Darkposted without post URL is fine', buildOutput('P3', base).split(' | ').length, 13);

// 5. Bad URLs fail loudly at build time rather than emitting a broken key.
throws('pfbid refused', () => buildOutput('P3', Object.assign({}, base, {organicPostUrl:'https://www.facebook.com/p/posts/pfbid02abcdef'})), 'not stable identifiers');
throws('TikTok Shop product refused', () => buildOutput('P3', Object.assign({}, base, {organicPostUrl:'https://shop.tiktok.com/view/product/1729581234567890123'})), 'different namespace');

// 6. A generated name pasted back in must round-trip (bare ID accepted).
eq('bare id accepted', buildOutput('P3', Object.assign({}, base, {organicPostUrl:'DdbhlHZOdfw'})).split(' | ')[11], 'gisellelangley ~ DdbhlHZOdfw');

// 7. Validator surfaces the conditional requirement as a field issue.
const vIssues = validateValues('P3', Object.assign({}, base, {assetType:'Boosted'}));
eq('validator flags missing post URL on Boosted', vIssues.filter(i=>i.field==='organicPostUrl').length, 1);
eq('validator quiet when supplied', validateValues('P3', Object.assign({}, base, {assetType:'Boosted', organicPostUrl:'https://www.instagram.com/p/DdbhlHZOdfw/'})).filter(i=>i.field==='organicPostUrl').length, 0);

console.log('\npass=' + pass + '  fail=' + fail);
process.exit(fail === 0 ? 0 : 1);
