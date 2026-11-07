(function (root) {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  var DEMO_PROFILE = {
    businessName: 'Polar Peak Climate Ltd',
    address: 'Unit 2, Example Park\nExample Town\nEX1 1EX',
    phone: '07000 000000',
    email: 'quotes@example.com'
  };

  function sampleInput(overrides) {
    var input = {
      installer: {
        businessName: DEMO_PROFILE.businessName,
        address: DEMO_PROFILE.address,
        phone: DEMO_PROFILE.phone,
        email: DEMO_PROFILE.email,
        logoDataUrl: ''
      },
      customer: {
        person: 'Mrs B Sample',
        business: '',
        address: '2 Example Road\nExample Town\nEX2 2EX',
        email: 'b.sample@example.com',
        phone: '07000 000001'
      },
      indoors: [{ room: 'Main bedroom', model: 'SAMPLEIW35', qty: '1' }],
      outdoors: [{ model: 'SAMPLEOW35', qty: '1' }],
      scope: 'Supply and install one wall mounted single split in the main bedroom. Indoor and outdoor positions are to be confirmed at survey.',
      price: '1950',
      vatBasis: 'including20',
      leadTime: 'To be confirmed',
      electrical: 'excluded',
      anythingElse: '',
      notes: 'DEMO working note. This stands in for a saved email and is not printed on the customer draft.',
      files: [],
      facts: [],
      reference: 'DEMOSAMPLE01',
      date: new Date(2026, 10, 7)
    };
    if (overrides) {
      Object.keys(overrides).forEach(function (key) { input[key] = overrides[key]; });
    }
    return input;
  }

  function cleanText(value) {
    return String(value == null ? '' : value)
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, ' ')
      .replace(/[^\n\u0020-\u007E\u00A3\u00A0\u00C0-\u00FF]/g, '');
  }

  function tidy(value) {
    return cleanText(value).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function linesOf(value) {
    return tidy(value).split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
  }

  function formatLongDate(date) {
    var d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatIsoDate(iso) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!match) return '';
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return day + ' ' + MONTHS[month - 1] + ' ' + year;
  }

  function parsePrice(raw) {
    var text = tidy(raw).replace(/£/g, '').replace(/,/g, '').replace(/\s/g, '');
    if (!text) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
    var amount = Number(text);
    if (!isFinite(amount) || amount < 0) return null;
    return amount;
  }

  function formatPrice(amount) {
    var fixed = amount.toFixed(2);
    var parts = fixed.split('.');
    var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return 'SAMPLE \u00A3' + whole + '.' + parts[1];
  }

  function positiveInt(raw) {
    var text = tidy(raw);
    if (!/^\d+$/.test(text)) return null;
    var n = Number(text);
    if (n < 1 || n > 99) return null;
    return n;
  }

  function paragraphsFrom(text) {
    return tidy(text).split(/\n\s*\n/).map(function (part) { return part.trim(); }).filter(Boolean);
  }

  function usableRows(rows, fields) {
    return (rows || []).map(function (row, index) {
      var next = { index: index };
      fields.forEach(function (field) { next[field] = tidy(row && row[field]); });
      var started = fields.some(function (field) {
        if (field === 'qty') return Boolean(next.qty) && next.qty !== '1';
        return Boolean(next[field]);
      });
      return started ? next : null;
    }).filter(Boolean);
  }

  function vatCopy(basis) {
    if (basis === 'including20') {
      return {
        short: 'Including VAT at 20%',
        full: 'Including VAT at 20%.'
      };
    }
    if (basis === 'excluding20') {
      return {
        short: 'Excluding VAT at 20%',
        full: 'Excluding VAT. VAT at 20% is not included in this total.'
      };
    }
    if (basis === 'confirm') {
      return {
        short: 'VAT basis to be confirmed',
        full: 'The VAT basis is to be confirmed. Do not treat this total as a VAT inclusive or VAT exclusive figure.'
      };
    }
    return null;
  }

  function electricalCopy(which) {
    if (which === 'included') {
      return {
        price: 'Electrical works are included in this total.',
        additional: 'Included in the total above.',
        scope: 'Electrical works are included.',
        lead: 'Electrical works are included in this quotation and in the total above.'
      };
    }
    if (which === 'excluded') {
      return {
        price: 'Electrical works are excluded from this total.',
        additional: 'Excluded from the total above.',
        scope: 'Electrical works are excluded.',
        lead: 'Electrical works are excluded from this quotation and from the total above.'
      };
    }
    return null;
  }

  function factSentence(fact) {
    var model = tidy(fact.model);
    if (fact.kind === 'wifiIntegrated') return 'WiFi is integrated in ' + model + '.';
    if (fact.kind === 'wifiAdapterIncluded') return 'A WiFi adapter is included with ' + model + '. It is not stated as fitted.';
    if (fact.kind === 'wifiAdapterFitted') return 'A WiFi adapter is included with ' + model + ' and is stated as fitted.';
    return tidy(fact.statement);
  }

  function factComplete(fact) {
    if (!fact || !fact.kind) return false;
    var model = tidy(fact.model);
    var page = tidy(fact.sourcePage);
    var date = formatIsoDate(fact.sourceDate) || tidy(fact.sourceDateDisplay || '');
    if (!model || !page || !date) return false;
    if (fact.kind === 'supply' || fact.kind === 'other') return Boolean(tidy(fact.statement));
    return fact.kind === 'wifiIntegrated' || fact.kind === 'wifiAdapterIncluded' || fact.kind === 'wifiAdapterFitted';
  }

  function sourceLine(fact) {
    var page = tidy(fact.sourcePage);
    var date = formatIsoDate(fact.sourceDate) || tidy(fact.sourceDateDisplay || '');
    return 'Recorded by the installer from ' + page + ', checked on ' + date + '. This trial has not checked that page.';
  }

  function fictionalModels(indoors, outdoors) {
    var models = indoors.map(function (row) { return row.model; }).concat(outdoors.map(function (row) { return row.model; }));
    return models.length > 0 && models.every(function (model) { return model.indexOf('SAMPLE') === 0; });
  }

  function residualDashes(text, allow) {
    var cleaned = String(text || '');
    (allow || []).forEach(function (part) {
      if (part) cleaned = cleaned.split(part).join(' ');
    });
    cleaned = cleaned.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ');
    cleaned = cleaned.replace(/https?:\/\/\S+/gi, ' ');
    cleaned = cleaned.replace(/www\.\S+/gi, ' ');
    var found = [];
    ['-', '\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2212'].forEach(function (ch) {
      if (cleaned.indexOf(ch) !== -1) found.push(ch);
    });
    return found;
  }

  function buildDraft(input) {
    var missing = [];
    var warnings = [];
    var src = input || {};
    var installer = src.installer || {};
    var customer = src.customer || {};
    var businessName = tidy(installer.businessName);
    var installerAddress = linesOf(installer.address);
    var installerPhone = tidy(installer.phone);
    var installerEmail = tidy(installer.email);
    var person = tidy(customer.person);
    var customerBusiness = tidy(customer.business);
    var addressLines = linesOf(customer.address);
    var email = tidy(customer.email);
    var phone = tidy(customer.phone);
    var scope = tidy(src.scope);
    var leadTime = tidy(src.leadTime);
    var anythingElse = tidy(src.anythingElse);
    var vat = vatCopy(src.vatBasis);
    var electrical = electricalCopy(src.electrical);
    var amount = parsePrice(src.price);
    var indoors = usableRows(src.indoors, ['room', 'model', 'qty']);
    var outdoors = usableRows(src.outdoors, ['model', 'qty']);

    if (!businessName) missing.push({ id: 'profile-name', text: 'Your business name' });
    if (!person) missing.push({ id: 'cust-person', text: 'Customer name' });
    if (!addressLines.length) missing.push({ id: 'cust-address', text: 'Installation address' });
    if (!email && !phone) missing.push({ id: 'cust-phone', text: 'Customer email or phone' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) missing.push({ id: 'cust-email', text: 'A complete customer email, or clear it and use a phone number' });

    if (!indoors.length) {
      missing.push({ id: 'indoor-list', text: 'An indoor unit with room, exact model and quantity' });
    } else {
      indoors.forEach(function (row) {
        var label = 'Indoor unit ' + (row.index + 1);
        if (!row.room) missing.push({ id: 'in-room-' + row.index, text: label + ' room' });
        if (!row.model) missing.push({ id: 'in-model-' + row.index, text: label + ' exact model' });
        if (!positiveInt(row.qty)) missing.push({ id: 'in-qty-' + row.index, text: label + ' quantity' });
      });
    }
    if (!outdoors.length) {
      missing.push({ id: 'outdoor-list', text: 'An outdoor unit with exact model and quantity' });
    } else {
      outdoors.forEach(function (row) {
        var label = 'Outdoor unit ' + (row.index + 1);
        if (!row.model) missing.push({ id: 'out-model-' + row.index, text: label + ' exact model' });
        if (!positiveInt(row.qty)) missing.push({ id: 'out-qty-' + row.index, text: label + ' quantity' });
      });
    }
    if (!scope) missing.push({ id: 'scope', text: 'Scope of the work' });
    if (amount == null) missing.push({ id: 'price', text: 'Selling price in pounds' });
    if (!vat) missing.push({ id: 'vat', text: 'VAT basis' });
    if (!leadTime) missing.push({ id: 'lead', text: 'Lead time' });
    if (!electrical) missing.push({ id: 'electrical', text: 'Whether electrical works are included or excluded' });

    var readyFacts = [];
    (src.facts || []).forEach(function (fact, index) {
      var touched = ['kind', 'model', 'statement', 'sourcePage', 'sourceDate'].some(function (key) {
        return tidy(fact && fact[key]);
      });
      if (!touched) return;
      if (!factComplete(fact)) {
        warnings.push({
          id: 'fact-' + index,
          text: 'Manufacturer fact ' + (index + 1) + ' is off the draft. It needs the exact model, the source page and the date' + ((fact.kind === 'supply' || fact.kind === 'other' || !fact.kind) ? ', and the statement' : '') + '.'
        });
        return;
      }
      readyFacts.push({
        kind: fact.kind,
        model: tidy(fact.model),
        sentence: factSentence(fact),
        sourcePage: tidy(fact.sourcePage),
        sourceDate: formatIsoDate(fact.sourceDate) || tidy(fact.sourceDateDisplay || ''),
        source: sourceLine(fact)
      });
    });

    if (missing.length) {
      return { ok: false, missing: missing, warnings: warnings, payload: null };
    }

    var indoorOut = indoors.map(function (row) {
      return { room: row.room, model: row.model, qty: String(positiveInt(row.qty)) };
    });
    var outdoorOut = outdoors.map(function (row) {
      return { model: row.model, qty: String(positiveInt(row.qty)) };
    });
    var supplyFacts = readyFacts.filter(function (fact) { return fact.kind === 'supply'; });
    var noteFacts = readyFacts.filter(function (fact) { return fact.kind !== 'supply'; });
    var electricalParagraphs = [electrical.lead];
    if (supplyFacts.length) {
      supplyFacts.forEach(function (fact) {
        electricalParagraphs.push('Manufacturer specification for ' + fact.model + ', recorded by the installer from ' + fact.sourcePage + ', checked on ' + fact.sourceDate + '.');
        electricalParagraphs.push('This trial has not checked that page.');
      });
      electricalParagraphs.push('This is the manufacturer specification only. It is not the electrician\'s final design. This draft does not state a breaker size or a cable size, and it does not infer either one from the unit capacity.');
    } else {
      electricalParagraphs.push('Manufacturer supply requirements for the exact equipment models are pending verification.');
      electricalParagraphs.push('This draft does not state a breaker size or a cable size. It does not infer either one from the unit capacity.');
      electricalParagraphs.push('The manufacturer specification is separate from the electrician\'s final design.');
    }

    var scopeParagraphs = paragraphsFrom(scope);
    if (scopeParagraphs.join('\n').indexOf(electrical.scope) === -1) scopeParagraphs.push(electrical.scope);

    var intro = ['Hello ' + person + ','];
    if (person === 'Mrs B Sample') intro.push('This names a fictional customer and a fictional site for the demo.');
    intro.push('This demo draft sets out the quoted work for the installation address below. Please check it before it is used.');

    var sections = [];
    if (noteFacts.length) {
      sections.push({
        title: 'Equipment notes',
        paragraphs: noteFacts.reduce(function (list, fact) {
          list.push(fact.sentence);
          list.push(fact.source);
          return list;
        }, [])
      });
    }
    sections.push({ title: 'Scope of works', paragraphs: scopeParagraphs });
    if (anythingElse) sections.push({ title: 'Anything else', paragraphs: paragraphsFrom(anythingElse) });
    sections.push({ title: 'Electrical information', paragraphs: electricalParagraphs });
    sections.push({
      title: 'Installer terms',
      paragraphs: ['The installer provides their own terms with this draft. Trade Quote Works has not added a set of exclusions.']
    });
    sections.push({
      title: 'Next steps',
      paragraphs: [
        '1. Read this demo draft and take your time.',
        '2. Speak to the installer if you would like any changes.',
        '3. This draft is not an order. It has not been issued as a final quotation.'
      ]
    });

    var reference = tidy(src.reference) || 'DEMO';
    var dateLabel = formatLongDate(src.date || new Date());
    var payload = {
      demo: true,
      reference: reference,
      dateLabel: dateLabel,
      installer: {
        businessName: businessName,
        addressLines: installerAddress,
        phone: installerPhone,
        email: installerEmail,
        logoDataUrl: installer.logoDataUrl || '',
        fictional: businessName === DEMO_PROFILE.businessName
      },
      customer: {
        person: person,
        business: customerBusiness,
        addressLines: addressLines,
        email: email,
        phone: phone,
        fictional: person === 'Mrs B Sample'
      },
      indoors: indoorOut,
      outdoors: outdoorOut,
      glanceNote: fictionalModels(indoorOut, outdoorOut) ? 'These model codes are fictional sample codes, not manufacturer model numbers.' : '',
      intro: intro,
      price: {
        amountLabel: formatPrice(amount),
        vatLabel: vat.full,
        vatShort: vat.short,
        electricalLabel: electrical.price
      },
      additional: [{ item: 'Electrical works', detail: electrical.additional }],
      leadTime: leadTime,
      sections: sections,
      footer: 'DEMO DRAFT. Not a final quotation.'
    };

    return { ok: true, missing: [], warnings: warnings, payload: payload };
  }

  function allowList(payload) {
    if (!payload) return [];
    var list = [];
    payload.indoors.forEach(function (row) { list.push(row.model); });
    payload.outdoors.forEach(function (row) { list.push(row.model); });
    if (payload.installer.email) list.push(payload.installer.email);
    if (payload.customer.email) list.push(payload.customer.email);
    payload.sections.forEach(function (section) {
      section.paragraphs.forEach(function (paragraph) {
        var match = paragraph.match(/recorded by the installer from (.+), checked on /i);
        if (match) list.push(match[1]);
      });
    });
    return list.filter(Boolean);
  }

  function generatedText(payload) {
    if (!payload) return '';
    var parts = [
      payload.footer,
      payload.dateLabel,
      payload.reference,
      payload.glanceNote,
      payload.price.amountLabel,
      payload.price.vatLabel,
      payload.price.vatShort,
      payload.price.electricalLabel,
      payload.leadTime
    ];
    payload.intro.forEach(function (line) { parts.push(line); });
    payload.additional.forEach(function (row) { parts.push(row.item, row.detail); });
    payload.sections.forEach(function (section) {
      parts.push(section.title);
      section.paragraphs.forEach(function (paragraph) { parts.push(paragraph); });
    });
    return parts.join('\n');
  }

  root.TQW = {
    DEMO_PROFILE: DEMO_PROFILE,
    sampleInput: sampleInput,
    buildDraft: buildDraft,
    generatedText: generatedText,
    residualDashes: residualDashes,
    allowList: allowList,
    formatPrice: formatPrice,
    parsePrice: parsePrice,
    tidy: tidy
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
