import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const root = new URL('..', import.meta.url);
globalThis.PDFLib = require(new URL('../vendor/pdf-lib.min.js', import.meta.url).pathname);
globalThis.fontkit = require(new URL('../vendor/fontkit.umd.min.js', import.meta.url).pathname);
new Function(readFileSync(new URL('../quote-model.js', import.meta.url), 'utf8'))();
new Function(readFileSync(new URL('../quote-pdf.js', import.meta.url), 'utf8'))();

const outDir = '/tmp/tqw-pdf';
mkdirSync(outDir, { recursive: true });
const fonts = {
  regular: new Uint8Array(readFileSync(new URL('../fonts/Arimo-Regular.ttf', import.meta.url))),
  bold: new Uint8Array(readFileSync(new URL('../fonts/Arimo-Bold.ttf', import.meta.url)))
};

const failures = [];
function check(name, ok, detail) {
  if (!ok) failures.push(name + (detail ? ': ' + detail : ''));
  else console.log('ok', name);
}

function textOf(pdfPath, page) {
  const args = page ? ['-layout', '-f', String(page), '-l', String(page), pdfPath, '-'] : ['-layout', pdfPath, '-'];
  return execFileSync('pdftotext', args, { encoding: 'utf8' });
}

async function make(name, input) {
  const draft = globalThis.TQW.buildDraft(input);
  if (!draft.ok) throw new Error(name + ' missing ' + draft.missing.map((item) => item.text).join(', '));
  const pdf = await globalThis.TQWPdf.createPdf(draft.payload, fonts);
  const path = join(outDir, name + '.pdf');
  writeFileSync(path, pdf.bytes);
  execFileSync('pdftoppm', ['-png', '-r', '140', path, join(outDir, name)]);
  return { draft, pdf, path, text: textOf(path), page1: textOf(path, 1) };
}

const secret = 'private-note-token';
const sample = globalThis.TQW.sampleInput({
  notes: secret + ' stands in for a saved email MARGIN_SECRET',
  files: [{ name: 'supplier-cost-secret.pdf', type: 'application/pdf', size: 1200 }]
});
const excluded = await make('sample-excluded', sample);
const payloadJson = JSON.stringify(excluded.draft.payload);
check('sample builds', excluded.draft.ok);
check('notes stay out of payload', !payloadJson.includes(secret) && !payloadJson.includes('MARGIN_SECRET'));
check('file name stays out of payload', !payloadJson.includes('supplier-cost-secret'));
check('no cost field', !Object.prototype.hasOwnProperty.call(excluded.draft.payload, 'cost') && !JSON.stringify(Object.keys(excluded.draft.payload.installer)).includes('cost'));
const allowedKeys = ['additional', 'customer', 'dateLabel', 'demo', 'footer', 'glanceNote', 'indoors', 'installer', 'intro', 'leadTime', 'outdoors', 'price', 'reference', 'sections'];
check('payload keys', JSON.stringify(Object.keys(excluded.draft.payload).sort()) === JSON.stringify(allowedKeys));
['Essex', 'REFCOM', 'BESA', 'warranty', 'deposit', 'relief', 'A++', 'SEER', 'SCOP', 'F-Gas', 'F Gas', 'kW', 'isolator'].forEach((word) => {
  check('sample omits ' + word, !excluded.text.includes(word));
});
check('sample price', excluded.text.includes('SAMPLE') && excluded.text.includes('1,950.00'));
check('sample models exact', excluded.text.includes('SAMPLEIW35') && excluded.text.includes('SAMPLEOW35'));
check('fictional labels', excluded.text.includes('Fictional installer for this demo.') && excluded.text.includes('fictional customer'));
check('pending supply', excluded.text.includes('pending verification'));
check('no inference', excluded.text.includes('does not infer either one from the unit capacity'));
check('excluded in price', excluded.text.includes('Electrical works are excluded from this total.'));
check('excluded in additional', excluded.text.includes('Excluded from the total above.'));
check('excluded in scope', excluded.text.includes('Electrical works are excluded.'));
check('excluded in electrical section', excluded.text.includes('Electrical works are excluded from this quotation and from the total above.'));
check('no included electrical wording', !excluded.text.includes('Electrical works are included'));
check('page 1 has glance prices and additional items', ['System at a Glance', 'SAMPLE', '1,950.00', 'Additional items', 'Electrical works', 'SAMPLEIW35', 'SAMPLEOW35'].every((part) => excluded.page1.includes(part)));
check('demo banner', excluded.text.includes('DEMO DRAFT. Not a final quotation.'));
check('not issued', excluded.text.includes('has not been issued as a final quotation'));
check('secret note absent from pdf', !excluded.text.includes(secret) && !excluded.text.includes('MARGIN_SECRET') && !excluded.text.includes('supplier-cost-secret'));
check('vat 20 explicit', excluded.text.includes('Including VAT at 20%.'));
check('no automatic 0 percent', !/VAT at 0%|0% VAT|residential relief/.test(excluded.text));
const dashes = globalThis.TQW.residualDashes(excluded.text, globalThis.TQW.allowList(excluded.draft.payload));
check('no prose dashes in sample pdf', dashes.length === 0, JSON.stringify(dashes) + ' in ' + excluded.text);

const includedInput = globalThis.TQW.sampleInput({
  price: '2100',
  vatBasis: 'excluding20',
  electrical: 'included',
  leadTime: 'About 3 weeks from instruction.',
  anythingElse: 'Please leave the garden tidy.',
  indoors: [
    { room: 'Main bedroom', model: 'SAMPLEIW35', qty: '1' },
    { room: 'Lounge', model: 'RAS-B10S4KVG-E', qty: '1' }
  ],
  facts: [
    {
      kind: 'wifiIntegrated',
      model: 'RAS-B10S4KVG-E',
      statement: '',
      sourcePage: 'https://example.com/model-page',
      sourceDate: '2026-11-01'
    },
    {
      kind: 'wifiAdapterIncluded',
      model: 'SAMPLEOW35',
      statement: '',
      sourcePage: 'Example manufacturer brochure page 4',
      sourceDate: '2026-11-02'
    },
    {
      kind: 'supply',
      model: 'RAS-B10S4KVG-E',
      statement: 'The datasheet names the supply requirement for this exact model.',
      sourcePage: 'https://example.com/supply-note',
      sourceDate: '2026-11-01'
    }
  ]
});
const included = await make('edited-included', includedInput);
check('edited price', included.text.includes('2,100.00') && !included.text.includes('1,950.00'));
check('old excluded wording gone', !included.text.includes('excluded'));
check('included in price', included.text.includes('Electrical works are included in this total.'));
check('included in additional', included.text.includes('Included in the total above.'));
check('included in scope', included.text.includes('Electrical works are included.'));
check('included in electrical section', included.text.includes('Electrical works are included in this quotation and in the total above.'));
check('vat excluding', included.text.includes('Excluding VAT. VAT at 20% is not included in this total.'));
check('second room and exact code', included.page1.includes('Lounge') && included.page1.includes('RAS-B10S4KVG-E'));
check('anything else printed', included.text.includes('Please leave the garden tidy.'));
check('lead time printed', included.text.includes('About 3 weeks from instruction.'));
check('wifi integrated sentence', included.text.includes('WiFi is integrated in RAS-B10S4KVG-E.'));
check('wifi adapter sentence', included.text.includes('A WiFi adapter is included with SAMPLEOW35. It is not stated as fitted.'));
check('pending removed once sourced', !included.text.includes('pending verification'));
check('manufacturer versus electrician', included.text.includes("electrician's final design"));
check('source date british', included.text.includes('1 November 2026') && !included.text.includes('2026-11-01'));
check('edited page 1 still holds prices', included.page1.includes('Additional items') && included.page1.includes('2,100.00') && included.page1.includes('System at a Glance'));
const editedDashes = globalThis.TQW.residualDashes(included.text, globalThis.TQW.allowList(included.draft.payload));
check('no prose dashes after edits', editedDashes.length === 0, editedDashes.join(','));

const partial = globalThis.TQW.buildDraft(globalThis.TQW.sampleInput({
  facts: [{ kind: 'wifiIntegrated', model: 'SAMPLEIW35', statement: '', sourcePage: '', sourceDate: '' }]
}));
check('partial fact does not block', partial.ok);
check('partial fact warned', partial.warnings.length === 1);
check('partial fact omitted', !globalThis.TQW.generatedText(partial.payload).includes('WiFi is integrated'));
check('partial fact still pending', globalThis.TQW.generatedText(partial.payload).includes('pending verification'));

const blank = globalThis.TQW.buildDraft({
  installer: globalThis.TQW.DEMO_PROFILE,
  customer: {},
  indoors: [{ room: '', model: '', qty: '1' }],
  outdoors: [{ model: '', qty: '1' }],
  scope: '',
  price: '',
  vatBasis: '',
  leadTime: '',
  electrical: '',
  notes: secret,
  files: [{ name: 'secret.pdf' }]
});
check('blank does not invent a payload', blank.payload == null);
check('blank asks only for missing facts', blank.missing.some((item) => item.text === 'Customer name') && blank.missing.some((item) => item.text === 'Whether electrical works are included or excluded'));
check('blank ignores secret', !JSON.stringify(blank).includes('secret.pdf') || JSON.stringify(blank.missing).includes('secret') === false);

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const quoteHtml = readFileSync(new URL('../quote.html', import.meta.url), 'utf8');
const terms = readFileSync(new URL('../terms.html', import.meta.url), 'utf8');
const privacy = readFileSync(new URL('../privacy.html', import.meta.url), 'utf8');
const thanks = readFileSync(new URL('../thanks.html', import.meta.url), 'utf8');
const robots = readFileSync(new URL('../robots.txt', import.meta.url), 'utf8');
check('homepage keeps free price', index.includes('>Free<'));
check('homepage keeps five pounds', index.includes('>£5<'));
check('homepage has no ten pound tier', !index.includes('£10'));
check('homepage has no old pack prices', !index.includes('£7.50') && !index.includes('£9.99') && !index.includes('£39') && !index.includes('£79'));
check('homepage says bulk packs later', index.includes('Bulk packs are coming later'));
check('homepage says no card needed', index.includes('No card needed'));
check('homepage trial link', index.includes('href="quote.html"'));
check('homepage enquiry link', index.includes('href="#enquiry"'));
check('homepage keeps enquiry form', index.includes('action="https://api.web3forms.com/submit"') && index.includes('name="access_key" value="588704e4-e474-4f9c-bc24-c46c38b32498"') && index.includes('name="botcheck"') && index.includes('name="redirect" value="https://tradequoteworks.co.uk/thanks.html"') && index.includes('name="subject" value="New Trade Quote Works enquiry"'));
check('homepage has no github pages host', !index.includes('github.io'));
check('sample image remains', index.includes('sample_quote.png'));
check('quote page has no web3forms', !quoteHtml.includes('web3forms'));
check('quote page has the optional box', quoteHtml.includes('Anything else to include or exclude?'));
check('quote page pricing', quoteHtml.includes('£5 per basic quote') && quoteHtml.includes('Bulk packs are coming later') && !quoteHtml.includes('£10'));
check('quote page links to enquiry', quoteHtml.includes('href="index.html#enquiry"'));
check('terms fees and liability', terms.includes('£5 per basic quote') && terms.includes('Bulk packs are coming later') && terms.includes('not liable for the content or prices') && terms.includes('check and approve'));
check('terms date', terms.includes('Last updated 12th November 2026') && !terms.includes('[DATE]'));
check('privacy date and ico placeholder', privacy.includes('Last updated 12th November 2026') && !privacy.includes('[DATE]') && privacy.includes('[ICO NUMBER]'));
check('thanks page', thanks.includes('Thanks, we have got your enquiry') && thanks.includes('href="quote.html"') && thanks.includes('href="index.html"'));
check('robots allows all', robots.includes('User-agent: *') && robots.includes('Allow: /'));
check('no essex cooling in pages', ![index, quoteHtml, terms, privacy, thanks].some((text) => /Essex Cooling/i.test(text)));

function layoutProblems(draws) {
  const problems = [];
  const allowed = new Set([9, 10.5, 13, 14]);
  draws.forEach((draw) => {
    if (!allowed.has(draw.size)) problems.push('size ' + draw.size + ' ' + draw.text);
    if (draw.x < 28) problems.push('left clip ' + draw.text);
    if (draw.x + draw.width > 595.28 - 28) problems.push('right clip ' + draw.text);
    if (!draw.footer && draw.role !== 'banner' && draw.y < 30) problems.push('low y ' + draw.text);
  });
  const pages = new Set(draws.map((draw) => draw.page));
  pages.forEach((page) => {
    const items = draws.filter((draw) => draw.page === page && !draw.footer && draw.role !== 'banner').sort((a, b) => b.y - a.y);
    for (let i = 1; i < items.length; i++) {
      const gap = items[i - 1].y - (items[i].y + items[i].size);
      if (gap > 46) problems.push('gap ' + gap.toFixed(1) + ' before ' + items[i].text);
    }
    const headings = draws.filter((draw) => draw.page === page && draw.role === 'heading');
    headings.forEach((heading) => {
      const follow = draws.find((draw) => draw.page === page && draw !== heading && draw.y < heading.y - 2 && (draw.role === 'body' || draw.role === 'glance' || draw.role === 'price'));
      if (!follow) problems.push('orphan heading ' + heading.text);
    });
  });
  for (let i = 0; i < draws.length; i++) {
    for (let j = i + 1; j < draws.length; j++) {
      const a = draws[i];
      const b = draws[j];
      if (a.page !== b.page || a.footer || b.footer) continue;
      if (Math.abs(a.y - b.y) > 1.5) continue;
      const overlaps = a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1;
      if (overlaps) problems.push('overlap "' + a.text + '" / "' + b.text + '"');
    }
  }
  return problems;
}

const sampleLayout = layoutProblems(excluded.pdf.draws);
check('sample layout', sampleLayout.length === 0, sampleLayout.slice(0, 12).join(' | '));
const editedLayout = layoutProblems(included.pdf.draws);
check('edited layout', editedLayout.length === 0, editedLayout.slice(0, 12).join(' | '));
check('sample page count', excluded.pdf.pageCount === 1, String(excluded.pdf.pageCount));
check('edited page count', included.pdf.pageCount >= 1 && included.pdf.pageCount <= 3, String(included.pdf.pageCount));

console.log('pages', excluded.pdf.pageCount, included.pdf.pageCount);
console.log('images in', outDir);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('all checks passed');
