(function (root) {
  'use strict';

  var PAGE_W = 595.28;
  var PAGE_H = 841.89;
  var LEFT = 40;
  var CONTENT_W = PAGE_W - LEFT * 2;
  var LIMIT = 798;
  var GREEN = null;
  var GREEN_DEEP = null;
  var CHARCOAL = null;
  var MUTED = null;
  var PALE = null;
  var WHITE = null;
  var LINE = null;

  function paint(PDFLib) {
    GREEN = PDFLib.rgb(31 / 255, 77 / 255, 53 / 255);
    GREEN_DEEP = PDFLib.rgb(22 / 255, 58 / 255, 39 / 255);
    CHARCOAL = PDFLib.rgb(47 / 255, 52 / 255, 56 / 255);
    MUTED = PDFLib.rgb(70 / 255, 78 / 255, 82 / 255);
    PALE = PDFLib.rgb(244 / 255, 246 / 255, 244 / 255);
    WHITE = PDFLib.rgb(1, 1, 1);
    LINE = PDFLib.rgb(210 / 255, 216 / 255, 212 / 255);
  }

  function wrapText(text, font, size, maxWidth) {
    var lines = [];
    String(text == null ? '' : text).split('\n').forEach(function (raw) {
      var words = raw.trim().split(/\s+/).filter(Boolean);
      if (!words.length) return;
      var line = '';
      words.forEach(function (word) {
        breakWord(word, font, size, maxWidth).forEach(function (chunk) {
          if (!line) {
            line = chunk;
            return;
          }
          var trial = line + ' ' + chunk;
          if (font.widthOfTextAtSize(trial, size) <= maxWidth) line = trial;
          else {
            lines.push(line);
            line = chunk;
          }
        });
      });
      if (line) lines.push(line);
    });
    return lines.length ? lines : [''];
  }

  function breakWord(word, font, size, maxWidth) {
    if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
    var out = [];
    var cur = '';
    for (var i = 0; i < word.length; i++) {
      var trial = cur + word.charAt(i);
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) cur = trial;
      else {
        if (cur) out.push(cur);
        cur = word.charAt(i);
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  function lineStep(size) {
    return size + 2.6;
  }

  function textWidth(text, font, size) {
    return font.widthOfTextAtSize(text, size);
  }

  function Doc(pdf, font, bold) {
    this.pdf = pdf;
    this.font = font;
    this.bold = bold;
    this.pages = [];
    this.page = null;
    this.y = 0;
    this.phase = 'page1';
    this.draws = [];
    this.installerName = '';
  }

  Doc.prototype.addPage = function () {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = 0;
    this.banner();
    if (this.pages.length > 1) this.runningHeader();
  };

  Doc.prototype.ensure = function (height) {
    if (this.y + height <= LIMIT) return;
    if (this.phase === 'page1') {
      var error = new Error('The system, the prices and the additional items do not fit on page 1 at the set type sizes.');
      error.code = 'PAGE1';
      throw error;
    }
    this.addPage();
  };

  Doc.prototype.rect = function (x, top, w, h, color) {
    this.page.drawRectangle({
      x: x,
      y: PAGE_H - top - h,
      width: w,
      height: h,
      color: color
    });
  };

  Doc.prototype.rule = function (x, top, w) {
    this.page.drawRectangle({
      x: x,
      y: PAGE_H - top,
      width: w,
      height: 0.6,
      color: LINE
    });
  };

  Doc.prototype.draw = function (text, x, top, size, font, color, role) {
    if (!text) return 0;
    var baseline = top + size * 0.78;
    var pdfY = PAGE_H - baseline;
    var width = font.widthOfTextAtSize(text, size);
    this.page.drawText(text, { x: x, y: pdfY, size: size, font: font, color: color });
    this.draws.push({
      page: this.pages.length,
      text: text,
      x: x,
      y: pdfY,
      size: size,
      width: width,
      role: role || 'body',
      footer: false
    });
    return width;
  };

  Doc.prototype.banner = function () {
    var h = 20;
    this.rect(0, 0, PAGE_W, h, GREEN_DEEP);
    var label = 'DEMO DRAFT. Not a final quotation. Trade Quote Works trial.';
    var size = 9;
    var width = textWidth(label, this.bold, size);
    this.draw(label, (PAGE_W - width) / 2, 5, size, this.bold, WHITE, 'banner');
    this.y = h + 6;
  };

  Doc.prototype.runningHeader = function () {
    var top = this.y;
    var name = this.installerName || '';
    var size = 9;
    this.draw(name, LEFT, top, size, this.bold, GREEN, 'running');
    var mark = 'DEMO DRAFT';
    var markW = textWidth(mark, this.bold, size);
    this.draw(mark, LEFT + CONTENT_W - markW, top, size, this.bold, GREEN, 'running');
    this.y = top + lineStep(size) + 2;
    this.rule(LEFT, this.y, CONTENT_W);
    this.y += 8;
  };

  Doc.prototype.paragraph = function (text, size, font, color, width, x, role) {
    var lines = wrapText(text, font, size, width || CONTENT_W);
    var self = this;
    lines.forEach(function (line) {
      self.ensure(lineStep(size));
      self.draw(line, x == null ? LEFT : x, self.y, size, font, color, role || 'body');
      self.y += lineStep(size);
    });
    return lines;
  };

  function createPdf(payload, fontBytes) {
    var PDFLib = root.PDFLib;
    if (!PDFLib) throw new Error('PDF library is not loaded.');
    if (!root.fontkit) throw new Error('Font library is not loaded.');
    paint(PDFLib);
    return PDFLib.PDFDocument.create().then(function (pdf) {
      pdf.registerFontkit(root.fontkit);
      return Promise.all([
        pdf.embedFont(fontBytes.regular, { subset: true }),
        pdf.embedFont(fontBytes.bold, { subset: true }),
        embedLogo(pdf, payload.installer.logoDataUrl)
      ]).then(function (faces) {
        var font = faces[0];
        var bold = faces[1];
        var logo = faces[2];
        var doc = new Doc(pdf, font, bold);
        doc.installerName = payload.installer.businessName;
        doc.addPage();
        drawMasthead(doc, payload, logo);
        drawTitle(doc, payload);
        drawParties(doc, payload);
        drawIntro(doc, payload);
        drawGlance(doc, payload);
        drawPrice(doc, payload);
        doc.phase = 'flow';
        payload.sections.forEach(function (section) {
          drawSection(doc, section.title, section.paragraphs);
        });
        drawFooters(doc, payload);
        pdf.setTitle('DEMO draft quotation ' + payload.reference);
        pdf.setAuthor(payload.installer.businessName);
        pdf.setSubject('DEMO draft. Not a final quotation.');
        pdf.setCreator('Trade Quote Works trial');
        return pdf.save().then(function (bytes) {
          return { bytes: bytes, draws: doc.draws, pageCount: doc.pages.length };
        });
      });
    });
  }

  function embedLogo(pdf, dataUrl) {
    if (!dataUrl) return Promise.resolve(null);
    var match = /^data:image\/(png|jpeg);base64,(.+)$/i.exec(dataUrl);
    if (!match) return Promise.resolve(null);
    var bytes = Uint8Array.from(atob(match[2]), function (ch) { return ch.charCodeAt(0); });
    var kind = match[1].toLowerCase();
    var pending = kind === 'png' ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
    return pending.catch(function () { return null; });
  }

  function drawMasthead(doc, payload, logo) {
    var installer = payload.installer;
    var top = doc.y;
    var logoW = 0;
    var logoH = 0;
    if (logo) {
      var scale = Math.min(108 / logo.width, 34 / logo.height, 1);
      logoW = logo.width * scale;
      logoH = logo.height * scale;
      doc.page.drawImage(logo, {
        x: LEFT,
        y: PAGE_H - top - logoH,
        width: logoW,
        height: logoH
      });
    }
    var textX = LEFT + (logoW ? logoW + 10 : 0);
    var rightW = 168;
    var leftW = CONTENT_W - (logoW ? logoW + 10 : 0) - rightW - 8;
    var nameLines = wrapText(installer.businessName, doc.bold, 13, leftW);
    var cursor = top;
    nameLines.forEach(function (line) {
      doc.draw(line, textX, cursor, 13, doc.bold, GREEN, 'heading');
      cursor += lineStep(13);
    });
    installer.addressLines.forEach(function (line) {
      wrapText(line, doc.font, 10.5, leftW).forEach(function (part) {
        doc.draw(part, textX, cursor, 10.5, doc.font, CHARCOAL, 'body');
        cursor += lineStep(10.5);
      });
    });
    var rightCursor = top;
    [installer.phone, installer.email].filter(Boolean).forEach(function (line) {
      var wrapped = wrapText(line, doc.font, 10.5, rightW);
      wrapped.forEach(function (part) {
        var w = textWidth(part, doc.font, 10.5);
        doc.draw(part, LEFT + CONTENT_W - w, rightCursor, 10.5, doc.font, CHARCOAL, 'body');
        rightCursor += lineStep(10.5);
      });
    });
    doc.y = Math.max(cursor, rightCursor, top + logoH) + 2;
    if (installer.fictional) {
      doc.paragraph('Fictional installer for this demo.', 10.5, doc.font, MUTED, CONTENT_W, LEFT, 'body');
    }
    doc.y += 2;
  }

  function drawTitle(doc, payload) {
    var h = 24;
    doc.ensure(h);
    doc.rect(LEFT, doc.y, CONTENT_W, h, GREEN);
    doc.draw('Installation quotation', LEFT + 8, doc.y + 5.5, 13, doc.bold, WHITE, 'heading');
    var date = payload.dateLabel;
    var dateW = textWidth(date, doc.font, 10.5);
    doc.draw(date, LEFT + CONTENT_W - dateW - 8, doc.y + 6.5, 10.5, doc.font, WHITE, 'body');
    doc.y += h + 6;
  }

  function partyHeight(doc, lines, width) {
    var cursor = lineStep(13) + 1;
    lines.forEach(function (line) {
      cursor += wrapText(line, doc.font, 10.5, width).length * lineStep(10.5);
    });
    return cursor;
  }

  function partyColumn(doc, title, lines, x, width, top) {
    doc.draw(title, x, top, 13, doc.bold, GREEN, 'heading');
    var cursor = top + lineStep(13) + 1;
    lines.forEach(function (line) {
      wrapText(line, doc.font, 10.5, width).forEach(function (part) {
        doc.draw(part, x, cursor, 10.5, doc.font, CHARCOAL, 'body');
        cursor += lineStep(10.5);
      });
    });
    return cursor;
  }

  function drawParties(doc, payload) {
    var customer = payload.customer;
    var leftLines = [customer.person];
    if (customer.business) leftLines.push(customer.business);
    customer.addressLines.forEach(function (line) { leftLines.push(line); });
    if (customer.email) leftLines.push(customer.email);
    if (customer.phone) leftLines.push(customer.phone);
    var rightLines = [
      'Date: ' + payload.dateLabel,
      'Reference: ' + payload.reference,
      'Lead time: ' + payload.leadTime,
      'VAT basis: ' + payload.price.vatShort
    ];
    var gap = 16;
    var colW = (CONTENT_W - gap) / 2;
    var innerW = colW - 16;
    var h = 8 + Math.max(partyHeight(doc, leftLines, innerW), partyHeight(doc, rightLines, innerW)) + 6;
    doc.ensure(h);
    var top = doc.y;
    doc.rect(LEFT, top, CONTENT_W, h, PALE);
    partyColumn(doc, 'Prepared for', leftLines, LEFT + 8, innerW, top + 8);
    partyColumn(doc, 'Quotation details', rightLines, LEFT + colW + gap + 8, innerW, top + 8);
    doc.page.drawRectangle({
      x: LEFT + colW + gap / 2,
      y: PAGE_H - top - h + 6,
      width: 0.6,
      height: h - 12,
      color: LINE
    });
    doc.y = top + h + 6;
  }

  function drawIntro(doc, payload) {
    payload.intro.forEach(function (paragraph, index) {
      doc.paragraph(paragraph, 10.5, index === 0 ? doc.bold : doc.font, CHARCOAL, CONTENT_W, LEFT, 'body');
      doc.y += 1;
    });
    doc.y += 2;
  }

  function tableHeight(rows, widths, font, bold, size) {
    var headH = 4 + lineStep(size) + 2;
    var body = rows.reduce(function (sum, row) {
      var lines = row.map(function (cell, i) { return wrapText(cell, font, size, widths[i] - 8); });
      var n = lines.reduce(function (max, list) { return Math.max(max, list.length); }, 1);
      return sum + 3 + n * lineStep(size) + 2;
    }, 0);
    return headH + body;
  }

  function drawTable(doc, headers, rows, widths, size) {
    var h = tableHeight(rows, widths, doc.font, doc.bold, size);
    doc.ensure(h + 2);
    var x = LEFT;
    var headH = 4 + lineStep(size) + 2;
    headers.forEach(function (header, i) {
      doc.rect(x, doc.y, widths[i], headH, GREEN);
      doc.draw(header, x + 4, doc.y + 3, size, doc.bold, WHITE, 'glance');
      x += widths[i];
    });
    var y = doc.y + headH;
    rows.forEach(function (row, rowIndex) {
      var lines = row.map(function (cell, i) { return wrapText(cell, doc.font, size, widths[i] - 8); });
      var n = lines.reduce(function (max, list) { return Math.max(max, list.length); }, 1);
      var rowH = 3 + n * lineStep(size) + 2;
      var cx = LEFT;
      if (rowIndex % 2 === 0) doc.rect(LEFT, y, CONTENT_W, rowH, PALE);
      lines.forEach(function (cellLines, i) {
        cellLines.forEach(function (line, lineIndex) {
          doc.draw(line, cx + 4, y + 2 + lineIndex * lineStep(size), size, doc.font, CHARCOAL, 'glance');
        });
        cx += widths[i];
      });
      doc.rule(LEFT, y + rowH, CONTENT_W);
      y += rowH;
    });
    doc.y = y + 4;
  }

  function drawGlance(doc, payload) {
    doc.ensure(lineStep(13) + 4);
    doc.draw('System at a Glance', LEFT, doc.y, 13, doc.bold, GREEN, 'heading');
    doc.y += lineStep(13) + 2;
    doc.paragraph('Indoor units', 10.5, doc.bold, CHARCOAL, CONTENT_W, LEFT, 'body');
    doc.y += 2;
    var indoorWidths = [230, 220, CONTENT_W - 450];
    drawTable(
      doc,
      ['Room', 'Indoor model', 'Qty'],
      payload.indoors.map(function (row) { return [row.room, row.model, row.qty]; }),
      indoorWidths,
      9
    );
    doc.paragraph('Outdoor units', 10.5, doc.bold, CHARCOAL, CONTENT_W, LEFT, 'body');
    doc.y += 2;
    var outdoorWidths = [430, CONTENT_W - 430];
    drawTable(
      doc,
      ['Outdoor model', 'Qty'],
      payload.outdoors.map(function (row) { return [row.model, row.qty]; }),
      outdoorWidths,
      9
    );
    if (payload.glanceNote) {
      doc.paragraph(payload.glanceNote, 10.5, doc.font, CHARCOAL, CONTENT_W, LEFT, 'body');
      doc.y += 4;
    }
  }

  function drawPrice(doc, payload) {
    var innerW = CONTENT_W - 16;
    var vatLines = wrapText(payload.price.vatLabel, doc.bold, 10.5, innerW);
    var elecLines = wrapText(payload.price.electricalLabel, doc.font, 10.5, innerW);
    var h = 8 + lineStep(14) + vatLines.length * lineStep(10.5) + elecLines.length * lineStep(10.5) + 4;
    doc.ensure(h + lineStep(13) + 28);
    doc.rect(LEFT, doc.y, CONTENT_W, h, GREEN);
    var cursor = doc.y + 6;
    doc.draw('Total', LEFT + 8, cursor, 14, doc.bold, WHITE, 'price');
    var amountW = textWidth(payload.price.amountLabel, doc.bold, 14);
    doc.draw(payload.price.amountLabel, LEFT + CONTENT_W - amountW - 8, cursor, 14, doc.bold, WHITE, 'price');
    cursor += lineStep(14);
    vatLines.forEach(function (line) {
      doc.draw(line, LEFT + 8, cursor, 10.5, doc.bold, WHITE, 'body');
      cursor += lineStep(10.5);
    });
    elecLines.forEach(function (line) {
      doc.draw(line, LEFT + 8, cursor, 10.5, doc.font, WHITE, 'body');
      cursor += lineStep(10.5);
    });
    doc.y += h + 6;
    doc.draw('Additional items', LEFT, doc.y, 13, doc.bold, GREEN, 'heading');
    doc.y += lineStep(13) + 1;
    var widths = [170, CONTENT_W - 170];
    drawTable(doc, ['Item', 'Detail'], payload.additional.map(function (row) {
      return [row.item, row.detail];
    }), widths, 10.5);
  }

  function drawSection(doc, title, paragraphs) {
    var first = paragraphs[0] || '';
    var firstLines = wrapText(first, doc.font, 10.5, CONTENT_W).slice(0, 2);
    var need = lineStep(13) + 4 + Math.max(1, firstLines.length) * lineStep(10.5);
    doc.ensure(need);
    doc.draw(title, LEFT, doc.y, 13, doc.bold, GREEN, 'heading');
    doc.y += lineStep(13) + 1;
    paragraphs.forEach(function (paragraph) {
      doc.paragraph(paragraph, 10.5, doc.font, CHARCOAL, CONTENT_W, LEFT, 'body');
      doc.y += 1;
    });
    doc.y += 3;
  }

  function drawFooters(doc, payload) {
    var total = doc.pages.length;
    doc.pages.forEach(function (page, index) {
      var label = payload.footer;
      var pageLabel = 'Page ' + (index + 1) + ' of ' + total;
      var size = 9;
      var y = 16;
      page.drawRectangle({ x: 0, y: 28, width: PAGE_W, height: 0.6, color: LINE });
      page.drawText(label, { x: LEFT, y: y, size: size, font: doc.font, color: MUTED });
      var w = textWidth(pageLabel, doc.font, size);
      page.drawText(pageLabel, { x: LEFT + CONTENT_W - w, y: y, size: size, font: doc.font, color: MUTED });
      doc.draws.push({ page: index + 1, text: label, x: LEFT, y: y, size: size, width: textWidth(label, doc.font, size), role: 'footer', footer: true });
      doc.draws.push({ page: index + 1, text: pageLabel, x: LEFT + CONTENT_W - w, y: y, size: size, width: w, role: 'footer', footer: true });
    });
  }

  root.TQWPdf = { createPdf: createPdf, wrapText: wrapText };
})(typeof globalThis !== 'undefined' ? globalThis : this);
