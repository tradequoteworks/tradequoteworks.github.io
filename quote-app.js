(function () {
  'use strict';

  var PROFILE_KEY = 'tqw.demoProfile.v1';
  var JOB_KEY = 'tqw.demoJob.v1';
  var REF_KEY = 'tqw.demoRef.v1';
  var fontsPromise = null;
  var logoDataUrl = '';
  var files = [];
  var pdfBytes = null;
  var buildToken = 0;
  var reference = sessionStorage.getItem(REF_KEY) || makeRef();
  sessionStorage.setItem(REF_KEY, reference);

  var indoorList = document.getElementById('indoor-list');
  var outdoorList = document.getElementById('outdoor-list');
  var factList = document.getElementById('fact-list');
  var fileList = document.getElementById('file-list');
  var preview = document.getElementById('preview');
  var missingBox = document.getElementById('missing');
  var warningBox = document.getElementById('warnings');
  var downloadBtn = document.getElementById('download');
  var dockStatus = document.getElementById('dock-status');
  var profileFields = document.getElementById('profile-fields');
  var profileLabel = document.getElementById('profile-label');
  var logoPreview = document.getElementById('logo-preview');

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  document.getElementById('ref-line').textContent = 'Draft reference ' + reference + '. This is not an issued quote number.';

  function makeRef() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = 'DEMO';
    var bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    for (var i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }

  function val(id) {
    return document.getElementById(id).value;
  }

  function setVal(id, value) {
    document.getElementById(id).value = value || '';
  }

  function blankUnit(kind) {
    return kind === 'indoor' ? { room: '', model: '', qty: '1' } : { model: '', qty: '1' };
  }

  function renderUnits(container, kind, rows) {
    container.innerHTML = '';
    (rows.length ? rows : [blankUnit(kind)]).forEach(function (row, index) {
      container.appendChild(unitNode(kind, index, row));
    });
  }

  function unitNode(kind, index, row) {
    var box = document.createElement('div');
    box.className = 'unit';
    var grid = document.createElement('div');
    grid.className = 'grid';
    if (kind === 'indoor') {
      grid.appendChild(field('Room', kind, index, 'room', row.room, 'Main bedroom'));
      grid.appendChild(field('Exact indoor model', kind, index, 'model', row.model, 'Type the model code'));
    } else {
      grid.appendChild(field('Exact outdoor model', kind, index, 'model', row.model, 'Type the model code'));
    }
    grid.appendChild(field('Quantity', kind, index, 'qty', row.qty || '1', '1'));
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn secondary small';
    remove.textContent = 'Remove';
    remove.addEventListener('click', function () {
      var rows = readUnits(kind).filter(function (_, i) { return i !== index; });
      renderUnits(kind === 'indoor' ? indoorList : outdoorList, kind, rows);
      schedule();
    });
    box.appendChild(grid);
    box.appendChild(remove);
    return box;
  }

  function field(label, kind, index, key, value, placeholder) {
    var wrap = document.createElement('div');
    var id = (kind === 'indoor' ? 'in-' : 'out-') + key + '-' + index;
    var lab = document.createElement('label');
    lab.htmlFor = id;
    lab.textContent = label;
    var input = document.createElement('input');
    input.id = id;
    input.dataset.key = key;
    input.value = value || '';
    input.placeholder = placeholder || '';
    input.autocomplete = 'off';
    input.spellcheck = false;
    if (key === 'qty') input.inputMode = 'numeric';
    wrap.appendChild(lab);
    wrap.appendChild(input);
    return wrap;
  }

  function readUnits(kind) {
    var container = kind === 'indoor' ? indoorList : outdoorList;
    return Array.prototype.map.call(container.querySelectorAll('.unit'), function (unit) {
      var data = {};
      Array.prototype.forEach.call(unit.querySelectorAll('input'), function (input) {
        data[input.dataset.key] = input.value;
      });
      return data;
    });
  }

  function renderFacts(rows) {
    factList.innerHTML = '';
    rows.forEach(function (row, index) {
      factList.appendChild(factNode(index, row));
    });
  }

  function factNode(index, row) {
    var box = document.createElement('div');
    box.className = 'fact';
    var grid = document.createElement('div');
    grid.className = 'grid';
    var kindWrap = document.createElement('div');
    kindWrap.className = 'full';
    var kindLabel = document.createElement('label');
    kindLabel.textContent = 'What is it?';
    var kind = document.createElement('select');
    kind.dataset.key = 'kind';
    [
      ['', 'Select'],
      ['supply', 'Manufacturer supply requirement'],
      ['wifiIntegrated', 'WiFi integrated'],
      ['wifiAdapterIncluded', 'WiFi adapter included, not fitted'],
      ['wifiAdapterFitted', 'WiFi adapter included and fitted'],
      ['other', 'Other manufacturer statement']
    ].forEach(function (pair) {
      var option = document.createElement('option');
      option.value = pair[0];
      option.textContent = pair[1];
      kind.appendChild(option);
    });
    kind.value = row.kind || '';
    kindWrap.appendChild(kindLabel);
    kindWrap.appendChild(kind);
    grid.appendChild(kindWrap);
    grid.appendChild(factField('Exact model', 'model', row.model, index, false));
    var statement = factField('Statement', 'statement', row.statement, index, true);
    statement.hidden = row.kind === 'wifiIntegrated' || row.kind === 'wifiAdapterIncluded' || row.kind === 'wifiAdapterFitted';
    grid.appendChild(statement);
    grid.appendChild(factField('Source page or document', 'sourcePage', row.sourcePage, index, false));
    grid.appendChild(factField('Date checked', 'sourceDate', row.sourceDate, index, false, 'date'));
    kind.addEventListener('change', function () {
      statement.hidden = kind.value === 'wifiIntegrated' || kind.value === 'wifiAdapterIncluded' || kind.value === 'wifiAdapterFitted';
      var preview = box.querySelector('.wifi-preview');
      if (preview) preview.textContent = wifiPreview(kind.value, box.querySelector('[data-key="model"]').value);
    });
    var note = document.createElement('p');
    note.className = 'hint wifi-preview';
    note.textContent = wifiPreview(kind.value, row.model);
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn secondary small';
    remove.textContent = 'Remove fact';
    remove.addEventListener('click', function () {
      renderFacts(readFacts().filter(function (_, i) { return i !== index; }));
      schedule();
    });
    box.appendChild(grid);
    box.appendChild(note);
    box.appendChild(remove);
    return box;
  }

  function wifiPreview(kind, model) {
    var code = model || 'the exact model';
    if (kind === 'wifiIntegrated') return 'WiFi is integrated in ' + code + '.';
    if (kind === 'wifiAdapterIncluded') return 'A WiFi adapter is included with ' + code + '. It is not stated as fitted.';
    if (kind === 'wifiAdapterFitted') return 'A WiFi adapter is included with ' + code + ' and is stated as fitted.';
    return '';
  }

  function factField(label, key, value, index, area, type) {
    var wrap = document.createElement('div');
    if (area) wrap.className = 'full';
    var lab = document.createElement('label');
    lab.textContent = label;
    var input = area ? document.createElement('textarea') : document.createElement('input');
    if (!area) input.type = type || 'text';
    input.dataset.key = key;
    input.value = value || '';
    wrap.appendChild(lab);
    wrap.appendChild(input);
    return wrap;
  }

  function readFacts() {
    return Array.prototype.map.call(factList.querySelectorAll('.fact'), function (box) {
      var data = {};
      Array.prototype.forEach.call(box.querySelectorAll('input, select, textarea'), function (input) {
        data[input.dataset.key] = input.value;
      });
      return data;
    });
  }

  function renderFiles() {
    fileList.innerHTML = '';
    if (!files.length) {
      var empty = document.createElement('li');
      empty.textContent = 'No files held.';
      fileList.appendChild(empty);
      return;
    }
    files.forEach(function (file, index) {
      var item = document.createElement('li');
      var text = document.createElement('span');
      text.textContent = file.name + ' (' + (file.type || 'file') + ', ' + Math.max(1, Math.round(file.size / 1024)) + ' KB). Held for this visit. Not uploaded. Not read.';
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn secondary small';
      remove.textContent = 'Remove';
      remove.addEventListener('click', function () {
        files.splice(index, 1);
        renderFiles();
      });
      item.appendChild(text);
      item.appendChild(remove);
      fileList.appendChild(item);
    });
  }

  function readInput() {
    var electrical = document.querySelector('input[name="electrical"]:checked');
    return {
      installer: {
        businessName: val('profile-name'),
        address: val('profile-address'),
        phone: val('profile-phone'),
        email: val('profile-email'),
        logoDataUrl: logoDataUrl
      },
      customer: {
        person: val('cust-person'),
        business: val('cust-business'),
        address: val('cust-address'),
        email: val('cust-email'),
        phone: val('cust-phone')
      },
      indoors: readUnits('indoor'),
      outdoors: readUnits('outdoor'),
      scope: val('scope'),
      price: val('price'),
      vatBasis: val('vat'),
      leadTime: val('lead'),
      electrical: electrical ? electrical.value : '',
      anythingElse: val('anything'),
      notes: val('notes'),
      files: files.map(function (file) { return { name: file.name, type: file.type, size: file.size }; }),
      facts: readFacts(),
      reference: reference,
      date: new Date()
    };
  }

  function profileIsDemo() {
    var seed = TQW.DEMO_PROFILE;
    return val('profile-name') === seed.businessName && val('profile-address') === seed.address && val('profile-phone') === seed.phone && val('profile-email') === seed.email && !logoDataUrl;
  }

  function updateProfileLabel() {
    var name = val('profile-name') || 'No business name yet';
    if (profileIsDemo()) {
      profileLabel.textContent = name + '. Fictional local demo profile. Saved in this browser only. No account and no password.';
    } else {
      profileLabel.textContent = name + '. Saved in this browser only. No account and no password. The draft is still a demo.';
    }
  }

  function saveProfile() {
    var storedLogo = logoDataUrl && logoDataUrl.length < 350000 ? logoDataUrl : '';
    localStorage.setItem(PROFILE_KEY, JSON.stringify({
      businessName: val('profile-name'),
      address: val('profile-address'),
      phone: val('profile-phone'),
      email: val('profile-email'),
      logoDataUrl: storedLogo
    }));
    updateProfileLabel();
  }

  function loadProfile() {
    var data = TQW.DEMO_PROFILE;
    try {
      var raw = localStorage.getItem(PROFILE_KEY);
      if (raw) data = JSON.parse(raw);
    } catch (err) { data = TQW.DEMO_PROFILE; }
    if (!data || !data.businessName) data = TQW.DEMO_PROFILE;
    setVal('profile-name', data.businessName);
    setVal('profile-address', data.address);
    setVal('profile-phone', data.phone);
    setVal('profile-email', data.email);
    logoDataUrl = data.logoDataUrl || '';
    showLogo();
    saveProfile();
  }

  function showLogo() {
    if (!logoDataUrl) {
      logoPreview.hidden = true;
      logoPreview.removeAttribute('src');
      return;
    }
    logoPreview.hidden = false;
    logoPreview.src = logoDataUrl;
    logoPreview.alt = 'Logo on this draft';
  }

  function applyProfileSeed() {
    var seed = TQW.DEMO_PROFILE;
    setVal('profile-name', seed.businessName);
    setVal('profile-address', seed.address);
    setVal('profile-phone', seed.phone);
    setVal('profile-email', seed.email);
    logoDataUrl = '';
    document.getElementById('profile-logo').value = '';
    showLogo();
    saveProfile();
    schedule();
  }

  function persistJob() {
    var electrical = document.querySelector('input[name="electrical"]:checked');
    sessionStorage.setItem(JOB_KEY, JSON.stringify({
      person: val('cust-person'),
      business: val('cust-business'),
      address: val('cust-address'),
      email: val('cust-email'),
      phone: val('cust-phone'),
      indoors: readUnits('indoor'),
      outdoors: readUnits('outdoor'),
      scope: val('scope'),
      price: val('price'),
      vat: val('vat'),
      lead: val('lead'),
      electrical: electrical ? electrical.value : '',
      anything: val('anything'),
      notes: val('notes'),
      facts: readFacts()
    }));
  }

  function restoreJob() {
    var raw = sessionStorage.getItem(JOB_KEY);
    if (!raw) {
      renderUnits(indoorList, 'indoor', []);
      renderUnits(outdoorList, 'outdoor', []);
      renderFacts([]);
      return;
    }
    try { fillJob(JSON.parse(raw)); }
    catch (err) {
      renderUnits(indoorList, 'indoor', []);
      renderUnits(outdoorList, 'outdoor', []);
      renderFacts([]);
    }
  }

  function fillJob(data) {
    setVal('cust-person', data.person);
    setVal('cust-business', data.business);
    setVal('cust-address', data.address);
    setVal('cust-email', data.email);
    setVal('cust-phone', data.phone);
    setVal('scope', data.scope);
    setVal('price', data.price);
    setVal('vat', data.vat);
    setVal('lead', data.lead);
    setVal('anything', data.anything);
    setVal('notes', data.notes);
    document.querySelectorAll('input[name="electrical"]').forEach(function (input) {
      input.checked = input.value === data.electrical;
    });
    renderUnits(indoorList, 'indoor', data.indoors || []);
    renderUnits(outdoorList, 'outdoor', data.outdoors || []);
    renderFacts(data.facts || []);
  }

  function sampleJob() {
    var sample = TQW.sampleInput();
    return {
      person: sample.customer.person,
      business: sample.customer.business,
      address: sample.customer.address,
      email: sample.customer.email,
      phone: sample.customer.phone,
      indoors: sample.indoors,
      outdoors: sample.outdoors,
      scope: sample.scope,
      price: sample.price,
      vat: sample.vatBasis,
      lead: sample.leadTime,
      electrical: sample.electrical,
      anything: sample.anythingElse,
      notes: sample.notes,
      facts: []
    };
  }

  function jobDirty() {
    return Boolean(val('cust-person') || val('scope') || val('price') || readUnits('indoor').some(function (row) { return row.model; }));
  }

  function loadFonts() {
    if (!fontsPromise) {
      fontsPromise = Promise.all([
        fetch('fonts/Arimo-Regular.ttf').then(function (res) { return res.arrayBuffer(); }),
        fetch('fonts/Arimo-Bold.ttf').then(function (res) { return res.arrayBuffer(); })
      ]).then(function (parts) {
        return { regular: parts[0], bold: parts[1] };
      });
    }
    return fontsPromise;
  }

  function showMissing(items) {
    missingBox.hidden = false;
    missingBox.innerHTML = '';
    var title = document.createElement('strong');
    title.textContent = 'Still needed before a draft can be prepared';
    var list = document.createElement('ul');
    items.forEach(function (item) {
      var li = document.createElement('li');
      var link = document.createElement('a');
      link.href = '#' + item.id;
      link.textContent = item.text;
      li.appendChild(link);
      list.appendChild(li);
    });
    missingBox.appendChild(title);
    missingBox.appendChild(list);
    dockStatus.textContent = items.length === 1 ? 'Still needed: ' + items[0].text + '.' : 'Still needed: ' + items.length + ' facts.';
  }

  function showWarnings(items) {
    if (!items.length) {
      warningBox.hidden = true;
      warningBox.textContent = '';
      return;
    }
    warningBox.hidden = false;
    warningBox.innerHTML = '';
    var title = document.createElement('strong');
    title.textContent = 'Left off the draft';
    var list = document.createElement('ul');
    items.forEach(function (item) {
      var li = document.createElement('li');
      li.textContent = item.text;
      list.appendChild(li);
    });
    warningBox.appendChild(title);
    warningBox.appendChild(list);
  }

  function schedule() {
    persistJob();
    saveProfile();
    window.clearTimeout(schedule.timer);
    schedule.timer = window.setTimeout(function () {
      renderPreview(++buildToken);
    }, 160);
  }

  function renderPreview(token) {
    var draft = TQW.buildDraft(readInput());
    showWarnings(draft.warnings || []);
    if (!draft.ok) {
      pdfBytes = null;
      downloadBtn.disabled = true;
      preview.innerHTML = '';
      delete preview.dataset.amount;
      delete preview.dataset.electrical;
      showMissing(draft.missing);
      return;
    }
    missingBox.hidden = true;
    dockStatus.textContent = 'Building the demo draft...';
    downloadBtn.disabled = true;
    loadFonts().then(function (fonts) {
      return TQWPdf.createPdf(draft.payload, fonts);
    }).then(function (result) {
      if (token !== buildToken) return;
      pdfBytes = result.bytes;
      preview.dataset.amount = draft.payload.price.amountLabel;
      preview.dataset.electrical = draft.payload.price.electricalLabel;
      downloadBtn.disabled = false;
      dockStatus.textContent = 'Demo draft ready. Not a final quotation.';
      return paintPdf(result.bytes);
    }).catch(function (error) {
      if (token !== buildToken) return;
      pdfBytes = null;
      downloadBtn.disabled = true;
      dockStatus.textContent = 'The draft could not be built.';
      preview.textContent = error && error.message ? error.message : 'The draft could not be built.';
    });
  }

  function paintPdf(bytes) {
    var task = pdfjsLib.getDocument({ data: bytes.slice(0) });
    return task.promise.then(function (doc) {
      preview.innerHTML = '';
      var chain = Promise.resolve();
      for (var i = 1; i <= doc.numPages; i++) {
        (function (pageNumber) {
          chain = chain.then(function () { return doc.getPage(pageNumber); }).then(function (page) {
            var box = preview.clientWidth || 320;
            var scale = box / page.getViewport({ scale: 1 }).width;
            if (scale < 1.25) scale = 1.25;
            if (scale > 1.45) scale = 1.45;
            var dpr = window.devicePixelRatio || 1;
            var viewport = page.getViewport({ scale: scale * dpr });
            var canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.width = (viewport.width / dpr) + 'px';
            canvas.style.height = (viewport.height / dpr) + 'px';
            return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise.then(function () {
              var figure = document.createElement('figure');
              var caption = document.createElement('figcaption');
              caption.textContent = 'Page ' + pageNumber + ' of ' + doc.numPages;
              figure.appendChild(canvas);
              figure.appendChild(caption);
              preview.appendChild(figure);
            });
          });
        })(i);
      }
      return chain;
    });
  }

  document.getElementById('load-sample').addEventListener('click', function () {
    if (jobDirty() && !window.confirm('Replace the job on screen with the fictional sample?')) return;
    fillJob(sampleJob());
    files = [];
    renderFiles();
    schedule();
    document.getElementById('preview-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('clear-job').addEventListener('click', function () {
    fillJob({
      person: '', business: '', address: '', email: '', phone: '',
      indoors: [], outdoors: [], scope: '', price: '', vat: '', lead: '',
      electrical: '', anything: '', notes: '', facts: []
    });
    files = [];
    renderFiles();
    schedule();
  });

  document.getElementById('add-indoor').addEventListener('click', function () {
    var rows = readUnits('indoor');
    rows.push(blankUnit('indoor'));
    renderUnits(indoorList, 'indoor', rows);
  });
  document.getElementById('add-outdoor').addEventListener('click', function () {
    var rows = readUnits('outdoor');
    rows.push(blankUnit('outdoor'));
    renderUnits(outdoorList, 'outdoor', rows);
  });
  document.getElementById('add-fact').addEventListener('click', function () {
    var rows = readFacts();
    rows.push({ kind: '', model: '', statement: '', sourcePage: '', sourceDate: '' });
    renderFacts(rows);
  });

  document.getElementById('profile-toggle').addEventListener('click', function () {
    var open = profileFields.hidden;
    profileFields.hidden = !open;
    document.getElementById('profile-toggle').textContent = open ? 'Hide business fields' : 'Edit business';
  });
  document.getElementById('profile-reset').addEventListener('click', applyProfileSeed);
  document.getElementById('profile-logo').addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      dockStatus.textContent = 'Use a PNG or JPEG logo.';
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      logoDataUrl = String(reader.result || '');
      showLogo();
      schedule();
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('job-files').addEventListener('change', function (event) {
    Array.prototype.forEach.call(event.target.files || [], function (file) {
      files.push({ name: file.name, type: file.type, size: file.size });
    });
    event.target.value = '';
    renderFiles();
  });
  document.getElementById('download').addEventListener('click', function () {
    if (!pdfBytes) return;
    var blob = new Blob([pdfBytes], { type: 'application/pdf' });
    var link = document.createElement('a');
    var person = (val('cust-person') || 'customer').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    var business = (val('profile-name') || 'installer').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    link.href = URL.createObjectURL(blob);
    link.download = 'DEMO_' + (business || 'installer') + '_' + (person || 'customer') + '_quotation.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  });

  document.body.addEventListener('input', function (event) {
    if (event.target.matches('input, textarea, select')) schedule();
  });
  document.body.addEventListener('change', function (event) {
    if (event.target.matches('input[type="radio"], select')) schedule();
  });

  loadProfile();
  profileFields.hidden = true;
  renderFiles();
  if (new URLSearchParams(window.location.search).get('sample') === '1') fillJob(sampleJob());
  else restoreJob();
  updateProfileLabel();
  renderPreview(++buildToken);
})();
