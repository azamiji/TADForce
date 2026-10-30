/* TADForce — in-place editing, targeted comments, saving and PDF / DOCX export. */
(function () {
  'use strict';
  var I18N = (window.TAD_I18N && window.TAD_I18N.editor) || {};
  var BRAND = window.TAD_BRAND || {};
  function T(k, vars) {
    var s = I18N[k] !== undefined ? I18N[k] : k;
    return String(s).replace(/\{(\w+)\}/g, function (m, v) { return vars && vars[v] !== undefined ? vars[v] : m; });
  }
  function statusLabel(s) { return T('status_' + (s === 'resolved' ? 'resolved' : 'open')); }

  var main = document.getElementById('main');
  var zones = [document.querySelector('.cover'), document.querySelector('article.doc')];
  var registryEl = document.getElementById('tad-comments');
  var comments = [];
  try { comments = JSON.parse(registryEl.textContent || '[]'); } catch (e) { comments = []; }
  var editing = false, dirty = false, fileHandle = null, activeCid = null;

  var $ = function (id) { return document.getElementById(id); };
  var btnEdit = $('btnEdit'), btnComment = $('btnComment'), btnPanel = $('btnPanel'), btnSave = $('btnSave'), btnPrint = $('btnPrint');
  var panel = $('cmtPanel'), list = $('cmtList'), countEl = $('cmtCount'), pop = $('cmtPop'), popText = $('cmtPopText'), menu = $('printMenu');

  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, ms || 2600);
  }
  function setDirty(v) { dirty = v; btnSave.classList.toggle('dirty', v); }
  function inZone(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(el && zones.some(function (z) { return z && z.contains(el); }) && !el.closest('svg'));
  }
  function sectionOf(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    var heads = Array.prototype.slice.call(document.querySelectorAll('.doc h1, .doc h2, .doc h3'));
    var found = null;
    heads.forEach(function (h) { if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING || h.contains(el)) found = h; });
    return found ? found.textContent.replace(/#$/, '').trim() : (el.closest('.cover') ? T('cover') : T('docStart'));
  }

  /* ---------- Edit mode ---------- */
  function setEditing(on) {
    editing = on;
    if (on && commentMode) setCommentMode(false);
    zones.forEach(function (z) { if (z) z.contentEditable = on ? 'true' : 'false'; });
    document.querySelectorAll('figure.diagram, .fig-body, .anchor').forEach(function (f) { f.contentEditable = 'false'; });
    document.body.classList.toggle('editing', on);
    btnEdit.innerHTML = on ? T('done') : T('edit');
    if (on) toast(T('editToast'), 4000);
  }
  btnEdit.addEventListener('click', function () { setEditing(!editing); });
  zones.forEach(function (z) {
    if (!z) return;
    z.addEventListener('input', function () {
      var s = window.getSelection();
      var el = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
      var blk = el && el.closest('p, li, td, th, h1, h2, h3, h4, figcaption, .kpi, .card, .layer, .meta div');
      if (blk) blk.setAttribute('data-edited', '1');
      setDirty(true);
    });
  });

  /* ---------- Comments ---------- */
  /* Flow: click « Comment » → select text (the input opens on mouse release)
     or « Capture an area » → draw a rectangle captured as an image. */
  var pending = null, commentMode = false, cap = null;
  function setCommentMode(on) {
    commentMode = on;
    document.body.classList.toggle('commenting', on);
    btnComment.classList.toggle('on', on);
    if (on) { window.getSelection().removeAllRanges(); if (editing) setEditing(false); }
  }
  btnComment.addEventListener('click', function () { if (pop.classList.contains('on')) return; setCommentMode(!commentMode); });
  $('cbarCancel').addEventListener('click', function () { setCommentMode(false); });
  $('cbarCapture').addEventListener('click', function () { setCommentMode(false); startCapture(null); });
  document.addEventListener('mouseup', function (e) {
    if (!commentMode || e.target.closest('#cmtBar, #side, #cmtPanel, #cmtPop')) return;
    setTimeout(function () {
      var s = window.getSelection();
      if (!s.rangeCount || s.isCollapsed || !inZone(s.anchorNode) || !inZone(s.focusNode) || !s.toString().trim()) return;
      var range = s.getRangeAt(0).cloneRange();
      pending = { range: range, quote: range.toString(), section: sectionOf(range.startContainer), image: null, anchor: null };
      setCommentMode(false);
      openPop(range.getBoundingClientRect());
    }, 10);
  });
  function openPop(r) {
    pop.style.top = Math.min(window.innerHeight - 360, Math.max(12, r.bottom + 8)) + 'px';
    pop.style.left = Math.min(window.innerWidth - 380, Math.max(312, r.left)) + 'px';
    $('cmtPopQuote').textContent = pending.range ? '« ' + excerpt(pending.quote, 140) + ' »' : T('zoneCaptured', { section: pending.section });
    refreshPopImg();
    if (!pop.classList.contains('on') && !pending.keepText) popText.value = '';
    pending.keepText = false;
    pop.classList.add('on'); popText.focus();
  }
  function closePop() { pop.classList.remove('on'); pending = null; window.getSelection().removeAllRanges(); }
  $('cmtCancel').addEventListener('click', closePop);
  $('cmtOk').addEventListener('click', addComment);
  $('cmtAddCap').addEventListener('click', function () { pending.keepText = true; pop.classList.remove('on'); startCapture(pending); });
  popText.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addComment();
    if (e.key === 'Escape') closePop();
  });

  var ov = $('capOverlay'), box = $('capBox');
  function startCapture(p) {
    cap = { pending: p, drag: false };
    ov.classList.add('on'); box.style.display = 'none';
  }
  function cancelCapture() {
    ov.classList.remove('on'); box.style.display = 'none';
    var p = cap && cap.pending; cap = null;
    if (p) openPop({ bottom: window.innerHeight / 3, left: 340 });
  }
  ov.addEventListener('mousedown', function (e) {
    e.preventDefault(); cap.drag = true; cap.x0 = e.clientX; cap.y0 = e.clientY;
    box.style.display = 'block'; box.style.left = e.clientX + 'px'; box.style.top = e.clientY + 'px'; box.style.width = '0px'; box.style.height = '0px';
  });
  ov.addEventListener('mousemove', function (e) {
    if (!cap || !cap.drag) return;
    box.style.left = Math.min(e.clientX, cap.x0) + 'px'; box.style.top = Math.min(e.clientY, cap.y0) + 'px';
    box.style.width = Math.abs(e.clientX - cap.x0) + 'px'; box.style.height = Math.abs(e.clientY - cap.y0) + 'px';
  });
  ov.addEventListener('mouseup', function (e) {
    if (!cap || !cap.drag) return;
    var r = { left: Math.min(e.clientX, cap.x0), top: Math.min(e.clientY, cap.y0), width: Math.abs(e.clientX - cap.x0), height: Math.abs(e.clientY - cap.y0) };
    var p = cap.pending; cap = null;
    ov.classList.remove('on'); box.style.display = 'none';
    if (r.width < 12 || r.height < 12) { toast(T('zoneTooSmall')); startCapture(p); return; }
    doCapture(r, p);
  });
  function blockAt(x, y) {
    var el = document.elementFromPoint(x, y);
    if (el && el.closest('svg')) el = el.closest('svg').parentElement;
    if (!el || !inZone(el)) return null;
    var b = el.closest('figure.diagram, .fig-body, .tw, .layers, .kpis, .cards, aside.callout, p, li, h1, h2, h3, h4, .meta div');
    if (!b) return null;
    if (b.matches('figure.diagram')) return b.querySelector('figcaption');
    if (b.matches('.fig-body, .layers')) { var n = b.nextElementSibling; return n && n.matches('.figcap') ? n : b.parentElement; }
    if (b.matches('.tw')) return b.querySelector('th, td');
    if (b.matches('.kpis, .cards')) return b.firstElementChild;
    return b;
  }
  /* The comment box opens immediately on mouse release; the image is rendered in the background
     and attached as soon as it is ready (to the pending box or to the already-saved comment). */
  function doCapture(r, p) {
    if (!p) {
      var target = blockAt(r.left + r.width / 2, r.top + Math.min(r.height / 2, 30));
      p = { range: null, quote: '', section: target ? sectionOf(target) : 'Document', image: null, anchor: target };
    }
    p.capturing = true;
    pending = p;
    openPop({ bottom: Math.min(r.top + r.height, window.innerHeight - 380), left: r.left });
    // Let the browser paint the comment box before the (CPU-heavy) rendering starts.
    var plan = capturePlan(r);
    new Promise(function (res) { requestAnimationFrame(function () { setTimeout(res, 30); }); })
      .then(function () { return grab(r, plan); }).then(function (img) {
      p.image = img; p.capturing = false;
      if (pending === p) refreshPopImg();
      if (p.cid) { comments.forEach(function (c) { if (c.id === p.cid) c.image = img; }); persist(); render(); setDirty(true); }
    }, function (err) {
      p.capturing = false; if (pending === p) refreshPopImg();
      toast(T('captureFailed', { error: err && err.message }), 5000);
    });
  }
  function refreshPopImg() {
    $('cmtPopImg').innerHTML = pending.image ? '<img alt="' + T('captureAlt') + '" src="' + pending.image + '">' : (pending.capturing ? '<div class="cap-wait">' + T('captureWait') + '</div>' : '');
    $('cmtAddCap').textContent = pending.image ? T('redoCapture') : T('attachCapture');
  }
  // Blocks of the document far from the zone: their content is neither cloned nor rendered
  // (html2canvas otherwise copies the whole page, thousands of SVG nodes, synchronously).
  function capturePlan(r) {
    var near = function (el) { var b = el.getBoundingClientRect(); return b.bottom >= r.top - 60 && b.top <= r.top + r.height + 60; };
    var far = new Set();
    var plan = zones.map(function (z) {
      if (!z) return null;
      return Array.prototype.map.call(z.children, function (c) { if (near(c)) return null; far.add(c); return c.offsetHeight; });
    });
    plan.far = far;
    // Page position of every kept block, used to re-align the clone exactly (see onclone).
    plan.tops = zones.map(function (z, zi) {
      if (!z || !plan[zi]) return null;
      var px = z.getBoundingClientRect().left;
      return Array.prototype.map.call(z.children, function (c, i) {
        if (plan[zi][i] != null) return null;
        var b = c.getBoundingClientRect(); return { top: b.top + window.scrollY, left: b.left - px, width: b.width };
      });
    });
    return plan;
  }
  function grab(r, plan) {
    if (typeof html2canvas === 'undefined') return Promise.reject(new Error(T('noCaptureLib')));
    var far = plan.far;
    return html2canvas(document.body, {
      x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height,
      // innerWidth includes the scrollbar: the clone then lays text out on exactly the same width as the page.
      windowWidth: window.innerWidth, windowHeight: window.innerHeight,
      scale: Math.min(2, window.devicePixelRatio || 1), backgroundColor: '#ffffff', logging: false,
      ignoreElements: function (el) {
        return far.has(el.parentElement) || el.tagName === 'SCRIPT' ||
          /^(side|cmtPanel|cmtPop|toast|capOverlay|cmtBar|burger|lightbox)$/.test(el.id || '') || (el.classList && el.classList.contains('edit-banner'));
      },
      onclone: function (d) {
        d.documentElement.style.scrollBehavior = 'auto';
        [d.querySelector('.cover'), d.querySelector('article.doc')].forEach(function (z, zi) {
          if (!z || !plan[zi]) return;
          Array.prototype.forEach.call(z.children, function (c, i) {
            var h = plan[zi][i];
            if (h == null) return;
            c.innerHTML = ''; c.style.boxSizing = 'border-box'; c.style.height = h + 'px'; c.style.minHeight = h + 'px';
          });
          // Any residual difference (margins dropped with emptied blocks, rounding) is cancelled by
          // shifting each kept block back to its exact on-screen position.
          Array.prototype.forEach.call(z.children, function (c, i) {
            var o = plan.tops[zi][i];
            if (!o) return;
            c.style.width = o.width + 'px';
            var dy = o.top - (c.getBoundingClientRect().top + d.defaultView.pageYOffset);
            if (Math.abs(dy) > 0.5) { c.style.position = 'relative'; c.style.top = dy + 'px'; }
          });
        });
        // The clone was scrolled while the emptied blocks had no height yet (scroll clamped):
        // scroll it again now that the page has its real height, or deep zones are offset.
        // The page uses smooth scrolling, which the clone inherits: force an instant jump, otherwise
        // the clone is still mid-animation (or at the top) when html2canvas reads positions.
        d.documentElement.style.scrollBehavior = 'auto';
        d.defaultView.scrollTo({ left: window.scrollX, top: window.scrollY, behavior: 'instant' });
      }
    }).then(function (cv) {
      var k = Math.min(1, 1100 / cv.width), o = document.createElement('canvas');
      o.width = Math.round(cv.width * k); o.height = Math.round(cv.height * k);
      var g = o.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, o.width, o.height); g.drawImage(cv, 0, 0, o.width, o.height);
      return o.toDataURL('image/jpeg', 0.82);
    });
  }
  function insertPin(el, cid) {
    var s = document.createElement('span');
    s.className = 'tad-pin'; s.setAttribute('data-cid', cid); s.setAttribute('contenteditable', 'false');
    s.title = T('pinTitle'); s.textContent = '📷';
    el.insertBefore(s, el.firstChild);
  }
  $('lightbox').addEventListener('click', function () { this.classList.remove('on'); });

  function excerpt(t, n) { t = t.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
  function wrapRange(range, cid) {
    var root = range.commonAncestorContainer;
    var nodes = [];
    if (root.nodeType === 3) nodes = [root];
    else {
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          return range.intersectsNode(n) && n.nodeValue.trim() && !n.parentElement.closest('svg') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      while (w.nextNode()) nodes.push(w.currentNode);
    }
    nodes.forEach(function (n) {
      var start = n === range.startContainer ? range.startOffset : 0;
      var end = n === range.endContainer ? range.endOffset : n.nodeValue.length;
      if (start >= end) return;
      var t = n;
      if (start > 0) t = t.splitText(start);
      if (end - start < t.nodeValue.length) t.splitText(end - start);
      var m = document.createElement('mark');
      m.className = 'tad-cmt'; m.setAttribute('data-cid', cid);
      t.parentNode.insertBefore(m, t); m.appendChild(t);
    });
  }
  function addComment() {
    var txt = popText.value.trim();
    if (!txt) { popText.focus(); return; }
    var p = pending, cid = 'c' + Date.now().toString(36);
    p.cid = cid;
    if (p.range) wrapRange(p.range, cid); else if (p.anchor) insertPin(p.anchor, cid);
    comments.push({ id: cid, kind: p.range ? 'text' : 'zone', comment: txt, quote: p.range ? excerpt(p.quote, 400) : '', section: p.section,
      image: p.image || null, date: new Date().toISOString(), status: 'open' });
    closePop();
    persist(); render(); openPanel(true); setDirty(true);
    toast(T('added'));
  }
  function persist() { registryEl.textContent = JSON.stringify(comments, null, 1).replace(/</g, '\\u003c'); }
  function marksOf(cid) { return document.querySelectorAll('mark.tad-cmt[data-cid="' + cid + '"], .tad-pin[data-cid="' + cid + '"]'); }
  function unwrap(m) {
    if (m.classList.contains('tad-pin')) { m.remove(); return; }
    var p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize();
  }
  function render() {
    var open = comments.filter(function (c) { return c.status !== 'resolved'; }).length;
    countEl.textContent = comments.length ? (open + '/' + comments.length) : '0';
    var edited = document.querySelectorAll('[data-edited]').length;
    $('cmtEdited').textContent = edited ? T('edited', { n: edited }) : '';
    if (!comments.length) { list.innerHTML = '<p class="cmt-empty">' + T('empty') + '</p>'; return; }
    list.innerHTML = '';
    comments.forEach(function (c, i) {
      var li = document.createElement('div');
      li.className = 'cmt-item' + (c.status === 'resolved' ? ' done' : '') + (c.id === activeCid ? ' active' : '');
      li.innerHTML = '<div class="cmt-h"><b>#' + (i + 1) + '</b> <span></span><em></em></div><blockquote></blockquote><div class="cmt-t" contenteditable="true"></div>' +
        '<div class="cmt-a"><button data-a="go"></button><button data-a="st"></button><button data-a="del"></button></div>';
      li.querySelector('.cmt-h span').textContent = c.section;
      li.querySelector('.cmt-h em').textContent = statusLabel(c.status);
      li.querySelector('[data-a="go"]').textContent = T('view');
      li.querySelector('[data-a="del"]').textContent = T('delete');
      var bq = li.querySelector('blockquote');
      if (c.quote) bq.textContent = c.quote; else bq.remove();
      if (c.image) {
        var im = document.createElement('img'); im.className = 'cmt-img'; im.src = c.image; im.alt = T('captureAlt'); im.title = T('enlarge');
        im.addEventListener('click', function (ev) { ev.stopPropagation(); $('lightboxImg').src = c.image; $('lightbox').classList.add('on'); });
        li.insertBefore(im, li.querySelector('.cmt-t'));
      }
      li.querySelector('.cmt-t').textContent = c.comment;
      if (c.response) { var rp = document.createElement('div'); rp.className = 'cmt-r'; rp.textContent = T('handled', { response: c.response }); li.insertBefore(rp, li.querySelector('.cmt-a')); }
      li.querySelector('[data-a="st"]').textContent = c.status === 'resolved' ? T('reopen') : T('resolve');
      li.querySelector('.cmt-t').addEventListener('input', function (e) { c.comment = e.target.textContent; persist(); setDirty(true); });
      li.addEventListener('click', function (e) {
        var a = e.target.getAttribute('data-a'); if (!a) return;
        if (a === 'go') focusComment(c.id);
        if (a === 'st') { c.status = c.status === 'resolved' ? 'open' : 'resolved'; marksOf(c.id).forEach(function (m) { m.classList.toggle('resolved', c.status === 'resolved'); }); }
        if (a === 'del') { if (!confirm(T('confirmDelete'))) return; marksOf(c.id).forEach(unwrap); comments = comments.filter(function (x) { return x.id !== c.id; }); }
        if (a !== 'go') { persist(); render(); setDirty(true); }
      });
      list.appendChild(li);
    });
  }
  function focusComment(cid) {
    activeCid = cid;
    document.querySelectorAll('mark.tad-cmt.flash').forEach(function (m) { m.classList.remove('flash'); });
    var ms = marksOf(cid);
    if (ms.length) { ms[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); ms.forEach(function (m) { m.classList.add('flash'); }); }
    render();
  }
  function openPanel(on) { document.body.classList.toggle('panel-open', on === undefined ? !document.body.classList.contains('panel-open') : on); }
  btnPanel.addEventListener('click', function () { openPanel(); render(); });
  $('cmtClose').addEventListener('click', function () { openPanel(false); });
  main.addEventListener('click', function (e) {
    var m = e.target.closest && e.target.closest('mark.tad-cmt, .tad-pin');
    if (m && !editing && !commentMode) { openPanel(true); focusComment(m.getAttribute('data-cid')); }
  });
  $('cmtCopy').addEventListener('click', function () {
    var open = comments.filter(function (c) { return c.status !== 'resolved'; });
    var lines = [T('listTitle', { title: document.title, n: open.length }), ''];
    open.forEach(function (c, i) {
      lines.push((i + 1) + '. [' + c.section + '] ' + (c.quote ? '« ' + excerpt(c.quote, 200) + ' »' : T('capturedZone')) + (c.image ? T('captureInFile') : ''), '   → ' + c.comment, '');
    });
    var txt = lines.join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast(T('copied')); }, function () { prompt(T('copyPrompt'), txt); });
  });

  /* ---------- Saving ---------- */
  function fileName() { var n = decodeURIComponent(location.pathname.split('/').pop() || ''); return /\.html?$/i.test(n) ? n : T('defaultFile'); }
  function serialize() {
    persist();
    var clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('[contenteditable]').forEach(function (e) { e.removeAttribute('contenteditable'); });
    clone.querySelectorAll('.flash, .on').forEach(function (e) { e.classList.remove('flash', 'on'); });
    var b = clone.querySelector('body'); b.classList.remove('editing', 'nav-open', 'panel-open', 'commenting');
    clone.querySelector('#cmtPopImg').innerHTML = ''; clone.querySelector('#lightboxImg').removeAttribute('src');
    clone.querySelector('#toast').textContent = '';
    clone.querySelector('#cmtList').innerHTML = '';
    return '<!doctype html>\n' + clone.outerHTML;
  }
  function download(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  // Opened through `tadforce review` / `build --open`: the local server writes back to the same file.
  var served = location.protocol === 'http:' && location.hostname === '127.0.0.1';
  async function save() {
    var html = serialize();
    if (served) {
      try {
        var r = await fetch(location.pathname, { method: 'PUT', headers: { 'content-type': 'text/html; charset=utf-8' }, body: html });
        if (r.ok) { setDirty(false); toast(T('savedServer', { name: fileName() }), 3500); return; }
      } catch (e) { /* server stopped: fall back to the file picker */ }
    }
    if (window.showSaveFilePicker) {
      try {
        if (!fileHandle) {
          toast(T('pickFile'), 4000);
          fileHandle = await window.showSaveFilePicker({ suggestedName: fileName(), types: [{ description: T('htmlPage'), accept: { 'text/html': ['.html'] } }] });
        }
        var w = await fileHandle.createWritable(); await w.write(html); await w.close();
        setDirty(false); toast(T('saved', { name: fileHandle.name })); return;
      } catch (e) { if (e && e.name === 'AbortError') return; fileHandle = null; }
    }
    download(new Blob([html], { type: 'text/html;charset=utf-8' }), fileName());
    setDirty(false); toast(T('downloaded', { name: fileName() }), 5000);
  }
  btnSave.addEventListener('click', save);
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    if (e.key === 'Escape') {
      if (ov.classList.contains('on')) cancelCapture();
      else if (commentMode) setCommentMode(false);
      else if (editing && !pop.classList.contains('on')) setEditing(false);
    }
  });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- Print / export ---------- */
  btnPrint.addEventListener('click', function (e) { e.stopPropagation(); menu.classList.toggle('on'); });
  document.addEventListener('click', function (e) { if (!menu.contains(e.target)) menu.classList.remove('on'); });
  $('doPdf').addEventListener('click', function () { menu.classList.remove('on'); if (editing) setEditing(false); setTimeout(function () { window.print(); }, 50); });
  $('doDocx').addEventListener('click', function () { menu.classList.remove('on'); exportDocx(); });

  function svgToPng(svg, maxW) {
    return new Promise(function (resolve) {
      var vb = svg.viewBox && svg.viewBox.baseVal, bb = svg.getBoundingClientRect();
      var w = (vb && vb.width) || bb.width || 800, h = (vb && vb.height) || bb.height || 400;
      var c = svg.cloneNode(true);
      c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); c.setAttribute('width', w); c.setAttribute('height', h);
      c.style.maxWidth = ''; c.removeAttribute('style');
      if (svg.getAttribute('style') && /font-family/.test(svg.getAttribute('style'))) c.setAttribute('style', 'font-family:Segoe UI,Arial,sans-serif');
      var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c));
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1.6, 1500 / w), cv = document.createElement('canvas'); cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
        var ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
        var dw = Math.min(maxW, w); resolve({ src: cv.toDataURL('image/png'), w: Math.round(dw), h: Math.round(dw * h / w) });
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }
  function imgToPng(src, maxW) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || 300, h = img.naturalHeight || 300, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
        var dw = Math.min(maxW, w); resolve({ src: cv.toDataURL('image/png'), w: dw, h: Math.round(dw * h / w) });
      };
      img.onerror = function () { resolve(null); }; img.src = src;
    });
  }
  function el(tag, html) { var e = document.createElement(tag); if (html !== undefined) e.innerHTML = html; return e; }
  function tableOf(rows, cls) {
    var t = el('table'); t.className = cls || '';
    rows.forEach(function (r) { var tr = t.insertRow(); r.forEach(function (c) { var td = tr.insertCell(); td.innerHTML = c; }); });
    return t;
  }

  async function exportDocx() {
    if (typeof htmlDocx === 'undefined') { toast(T('docxMissing')); return; }
    if (editing) setEditing(false);
    toast(T('docxRunning'), 8000);
    var live = main.querySelectorAll('svg'), src = main.cloneNode(true), cl = src.querySelectorAll('svg');
    for (var i = 0; i < live.length; i++) {
      var png = await svgToPng(live[i], 620);
      if (png && cl[i]) { var im = el('img'); im.src = png.src; im.width = png.w; im.height = png.h; cl[i].parentNode.replaceChild(im, cl[i]); }
    }
    var imgs = src.querySelectorAll('.cover-logos img');
    for (var k = 0; k < imgs.length; k++) { var p = await imgToPng(imgs[k].src, 110); if (p) { imgs[k].src = p.src; imgs[k].width = p.w; imgs[k].height = p.h; } }
    src.querySelectorAll('.anchor, script, .doc-foot, .pending').forEach(function (e) { e.remove(); });
    src.querySelectorAll('mark.tad-cmt, .tad-pin').forEach(unwrap);
    src.querySelectorAll('[data-edited]').forEach(function (e) { e.removeAttribute('data-edited'); });
    src.querySelectorAll('.tw').forEach(function (w) { w.replaceWith(w.firstElementChild); });
    src.querySelectorAll('.kpis').forEach(function (k) {
      var cells = Array.prototype.map.call(k.querySelectorAll('.kpi'), function (x) { return '<p class="kb">' + x.querySelector('b').innerHTML + '</p><p class="ks">' + x.querySelector('span').innerHTML + '</p>'; });
      var rows = []; for (var j = 0; j < cells.length; j += 4) rows.push(cells.slice(j, j + 4));
      k.replaceWith(tableOf(rows, 'kpit'));
    });
    src.querySelectorAll('.cards').forEach(function (k) {
      var cells = Array.prototype.map.call(k.querySelectorAll('.card'), function (x) { return x.innerHTML; });
      var rows = []; for (var j = 0; j < cells.length; j += 2) rows.push(cells.slice(j, j + 2));
      k.replaceWith(tableOf(rows, 'cardt'));
    });
    src.querySelectorAll('.layers').forEach(function (k) {
      k.replaceWith(tableOf(Array.prototype.map.call(k.querySelectorAll('.layer'), function (l) {
        return ['<b>' + l.querySelector('.ln').textContent + '</b>', Array.prototype.map.call(l.querySelectorAll('.li span'), function (s) { return s.textContent; }).join(' · ')];
      }), 'layert'));
    });
    src.querySelectorAll('.legend').forEach(function (k) { k.replaceWith(el('p', Array.prototype.map.call(k.querySelectorAll('.lg'), function (s) { return '■ ' + s.textContent; }).join(' &nbsp; '))); });
    src.querySelectorAll('aside.callout').forEach(function (k) { var t = tableOf([[k.innerHTML]], 'calloutt'); k.replaceWith(t); });
    src.querySelectorAll('.cover .meta').forEach(function (k) {
      k.replaceWith(tableOf(Array.prototype.map.call(k.querySelectorAll('div'), function (d) { return ['<b>' + d.querySelector('b').textContent + '</b>', d.querySelector('span').innerHTML]; }), 'metat'));
    });
    src.querySelectorAll('.cover-logos').forEach(function (k) { k.replaceWith(tableOf([[k.children[0] ? k.children[0].outerHTML : '', k.children[1] ? '<p style="text-align:right">' + k.children[1].outerHTML + '</p>' : '']], 'logot')); });
    src.querySelectorAll('figure.diagram').forEach(function (f) {
      var d = el('div'); d.innerHTML = '<p class="fig">' + (f.querySelector('img') ? f.querySelector('img').outerHTML : '') + '</p><p class="figcap">' + f.querySelector('figcaption').innerHTML + '</p>'; f.replaceWith(d);
    });
    src.querySelectorAll('.fig-body').forEach(function (f) { var d = el('p'); d.className = 'fig'; d.innerHTML = f.innerHTML; f.replaceWith(d); });
    var ink = BRAND.primary || '#0B2545', th = BRAND.tableHeader || '#0f2a4d', acc = BRAND.accent2 || '#7B3FE4';
    var css = 'body{font-family:Calibri,"Segoe UI",Arial,sans-serif;font-size:10pt;color:#18212d}' +
      'h1{font-size:18pt;color:' + ink + ';page-break-before:always;margin:0 0 8pt}h2{font-size:13.5pt;color:' + ink + ';margin:14pt 0 6pt}h3{font-size:11.5pt;margin:10pt 0 4pt}h4{font-size:10.5pt;color:' + ink + ';margin:0 0 3pt}' +
      '.num{color:' + acc + '}p,li{margin:0 0 5pt;line-height:1.35}table{border-collapse:collapse;width:100%;margin:4pt 0 9pt}' +
      'th{background:' + th + ';color:#ffffff;font-weight:bold;border:1px solid ' + th + ';padding:2pt 4pt;font-size:8.5pt;text-align:left;line-height:1.15}td{border:1px solid #cfd8e5;padding:2pt 4pt;font-size:8.5pt;vertical-align:top;line-height:1.15}td p{margin:0 0 2pt}' +
      'code{font-family:Consolas,monospace;font-size:8pt;color:#3b2a8f}th code{color:#ffffff}.fig{text-align:center;margin:6pt 0 2pt}.figcap{text-align:center;font-style:italic;color:#5a6878;font-size:8.5pt;margin-bottom:10pt}' +
      'table.kpit td,table.cardt td{border:1px solid #d6dde8;background:#f7f9fc;padding:6pt}.kb{font-size:16pt;font-weight:bold;color:' + ink + ';margin:0}.ks{font-size:8.5pt;color:#5a6878;margin:0}' +
      'table.layert td{background:#E8F1FF;border:1px solid #c9d8f2}table.calloutt td{background:#f3efff;border:0;border-left:4px solid #8b5cf6;padding:6pt 8pt}.ct{font-weight:bold;color:#6d3fe0;font-size:8.5pt;text-transform:uppercase}' +
      'table.metat td{border:1px solid #d6dde8}table.logot td{border:0}.kicker{color:' + acc + ';font-weight:bold;font-size:10pt;text-transform:uppercase;letter-spacing:1pt}.ctitle{font-size:26pt;color:' + ink + ';page-break-before:auto}.csub{font-size:13pt;color:#5a6878}.conf{font-size:8.5pt;color:#5a6878}.b{font-weight:bold}';
    var cover = src.querySelector('.cover'), doc = src.querySelector('article.doc');
    var body = (cover ? cover.innerHTML : '') + (doc ? doc.innerHTML : '');
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + document.title + '</title><style>' + css + '</style></head><body>' + body + '</body></html>';
    try {
      var blob = htmlDocx.asBlob(html, { orientation: 'portrait', margins: { top: 1000, right: 900, bottom: 1000, left: 900 } });
      download(blob, fileName().replace(/\.html?$/i, '') + '.docx');
      toast(T('docxDone'), 4000);
    } catch (e) { toast(T('docxFailed', { error: e.message }), 5000); }
  }

  // A rebuilt document carries the comments, not their highlights: find each quoted passage again.
  function reanchor(c) {
    if (c.kind === 'zone' || !c.quote || marksOf(c.id).length) return;
    var q = c.quote.replace(/…$/, '').trim(), probe = q.slice(0, 40);
    if (probe.length < 6) return;
    for (var zi = 0; zi < zones.length; zi++) {
      if (!zones[zi]) continue;
      var w = document.createTreeWalker(zones[zi], NodeFilter.SHOW_TEXT, null), n;
      while ((n = w.nextNode())) {
        if (n.parentElement.closest('svg, mark.tad-cmt')) continue;
        var i = n.nodeValue.indexOf(probe);
        if (i < 0) continue;
        var r = document.createRange();
        r.setStart(n, i); r.setEnd(n, Math.min(n.nodeValue.length, i + q.length));
        wrapRange(r, c.id);
        return;
      }
    }
    // the quoted words were corrected: pin the comment on its section heading instead
    var heads = document.querySelectorAll('article.doc h1, article.doc h2, article.doc h3');
    for (var hi = 0; hi < heads.length; hi++) {
      if (c.section && heads[hi].textContent.indexOf(c.section) >= 0) { insertPin(heads[hi], c.id); return; }
    }
  }
  comments.forEach(reanchor);
  comments.forEach(function (c) { if (c.status === 'resolved') marksOf(c.id).forEach(function (m) { m.classList.add('resolved'); }); });
  render();
})();
