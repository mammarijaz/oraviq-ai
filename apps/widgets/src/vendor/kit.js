/* Oraviq component kit (v4). Plain JavaScript, no dependencies, no network.
   Builders return HTML strings; behaviour is wired once on the document, so markup can be re-rendered freely.
   Every control fires a bubbling "ov-change" event: event.detail = { id, value }. */
(function () {
  'use strict';
  var K = {};
  var doc = document;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  K.esc = esc;
  var seq = 0;
  var nextId = function (p) { seq += 1; return (p || 'ov') + '-' + seq; };
  var svg = function (w, d, extra) { return '<svg viewBox="0 0 ' + w + ' ' + w + '" width="' + w + '" height="' + w + '" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '>' + d + '</svg>'; };
  var ICONS = {
    chevron: svg(16, '<path d="M4 6l4 4 4-4"/>', ' class="ov-dd__chev"'),
    check: svg(14, '<path d="M3 7.5l2.6 2.6L11 4.5" stroke-width="2"/>'),
    tick: svg(16, '<path d="M3.5 8.5l3 3 6-7"/>', ' class="ov-dd__tick"'),
    search: svg(16, '<circle cx="7" cy="7" r="4.75"/><path d="M10.5 10.5L14 14"/>'),
    close: svg(16, '<path d="M4 4l8 8M12 4l-8 8"/>'),
    calendar: svg(18, '<rect x="2.5" y="3.5" width="13" height="12" rx="2.5"/><path d="M2.5 7.5h13M6 2v3M12 2v3"/>'),
    left: svg(16, '<path d="M10 3.5L5.5 8l4.5 4.5"/>'),
    right: svg(16, '<path d="M6 3.5L10.5 8 6 12.5"/>'),
    info: svg(16, '<circle cx="8" cy="8" r="6.25"/><path d="M8 7.25v3.75"/><circle cx="8" cy="4.9" r=".6" fill="currentColor" stroke="none"/>'),
    sort: svg(14, '<path d="M7 3v8M3.5 7.5L7 11l3.5-3.5"/>'),
    ok: svg(14, '<path d="M3 7.5l2.6 2.6L11 4.5" stroke-width="2"/>'),
    alert: svg(14, '<path d="M7 3.5v4.25"/><circle cx="7" cy="10.4" r=".7" fill="currentColor" stroke="none"/>')
  };
  K.icons = ICONS;
  var emit = function (el, id, value) {
    el.dispatchEvent(new CustomEvent('ov-change', { bubbles: true, detail: { id: id, value: value } }));
  };

  /* ================= Dropdown ================= */
  // o: { id, label, options:[{value,label,hint,count,icon,disabled}], value, multi, search, variant:'filter'|'field', allLabel, placeholder, block, invalid, labelledBy }
  K.dropdown = function (o) {
    var id = o.id || nextId('dd');
    var multi = !!o.multi;
    var field = o.variant === 'field';
    var opts = o.options || [];
    var vals = multi ? (o.value || []).map(String) : (o.value == null ? '' : String(o.value));
    var isSel = function (v) { return multi ? vals.indexOf(String(v)) !== -1 : String(v) === vals; };
    var search = o.search != null ? o.search : opts.length > 7;
    var cls = 'ov-dd' + (field ? ' ov-dd--field' : ' ov-dd--filter') + (o.block || field ? ' ov-dd--block' : '') + (o.invalid ? ' ov-dd--invalid' : '');
    var s = summary(opts, vals, multi, o.allLabel, o.placeholder);
    if (multi && s.partial) cls += ' ov-dd--active';
    var trigLabel = field ? (o.labelledBy ? ' aria-labelledby="' + esc(o.labelledBy) + ' ' + id + '-v"' : ' aria-label="' + esc(o.label) + '"') : '';
    var h = '<div class="' + cls + '" data-dd="' + esc(id) + '"' + (multi ? ' data-multi="1"' : '') +
      ' data-all-label="' + esc(o.allLabel || 'All') + '" data-placeholder="' + esc(o.placeholder || 'Choose') + '">';
    h += '<button type="button" class="ov-dd__trigger" id="' + esc(id) + '-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + esc(id) + '-panel"' + trigLabel + '>';
    if (!field) h += '<span class="ov-dd__name">' + esc(o.label) + '</span>';
    h += '<span class="ov-dd__value' + (s.empty ? ' ov-dd__value--placeholder' : '') + '" id="' + esc(id) + '-v">' + esc(s.text) + '</span>';
    if (multi) h += '<span class="ov-dd__count"' + (s.partial ? '' : ' hidden') + ' aria-label="' + s.count + ' selected">' + s.count + '</span>';
    h += ICONS.chevron + '</button>';
    h += '<div class="ov-dd__panel" id="' + esc(id) + '-panel" hidden>';
    if (search) h += '<div class="ov-dd__search">' + ICONS.search + '<input type="text" class="ov-dd__q" placeholder="Search" aria-label="Search ' + esc(String(o.label || '').toLowerCase()) + '" aria-controls="' + esc(id) + '-list" autocomplete="off" spellcheck="false"></div>';
    h += '<ul class="ov-dd__list" id="' + esc(id) + '-list" role="listbox" tabindex="-1" aria-label="' + esc(o.label) + '"' + (multi ? ' aria-multiselectable="true"' : '') + '>';
    opts.forEach(function (op, i) {
      var sel = isSel(op.value);
      h += '<li class="ov-dd__opt" role="option" id="' + esc(id) + '-o' + i + '" data-value="' + esc(op.value) + '" aria-selected="' + sel + '"' + (op.disabled ? ' aria-disabled="true"' : '') + '>';
      if (multi) h += '<span class="ov-dd__box">' + ICONS.check + '</span>';
      if (op.icon) h += '<span class="ov-dd__icon">' + op.icon + '</span>';
      h += '<span class="ov-dd__text"><span class="ov-dd__olabel">' + esc(op.label) + '</span>' + (op.hint ? '<span class="ov-dd__hint">' + esc(op.hint) + '</span>' : '') + '</span>';
      if (op.count != null) h += '<span class="ov-dd__ocount">' + esc(op.count) + '</span>';
      if (!multi) h += ICONS.tick;
      h += '</li>';
    });
    h += '</ul><p class="ov-dd__none" hidden>No matches</p>';
    if (multi) h += '<div class="ov-dd__foot"><button type="button" class="ov-dd__link" data-dd-all>Select all</button><button type="button" class="ov-dd__link" data-dd-clear' + (vals.length ? '' : ' disabled') + '>Clear</button><button type="button" class="ov-dd__done" data-dd-done>Done</button></div>';
    h += '</div></div>';
    return h;
  };
  function summary(opts, vals, multi, allLabel, placeholder) {
    if (!multi) {
      var hit = null; opts.forEach(function (op) { if (String(op.value) === vals) hit = op; });
      return hit ? { text: hit.label, empty: false } : { text: placeholder || 'Choose', empty: true };
    }
    var chosen = opts.filter(function (op) { return vals.indexOf(String(op.value)) !== -1; });
    var partial = chosen.length > 0 && chosen.length < opts.length;
    var text = !partial ? (allLabel || 'All') : chosen.length === 1 ? chosen[0].label : chosen[0].label + ' +' + (chosen.length - 1);
    return { text: text, partial: partial, count: chosen.length, empty: false };
  }
  var openDd = null; // { id, query, active }
  var focusAfter = null; // trigger id to refocus after a re-render
  function ddParts(root) {
    return { btn: root.querySelector('.ov-dd__trigger'), panel: root.querySelector('.ov-dd__panel'), list: root.querySelector('.ov-dd__list'), q: root.querySelector('.ov-dd__q'),
      none: root.querySelector('.ov-dd__none'), opts: Array.prototype.slice.call(root.querySelectorAll('.ov-dd__opt')) };
  }
  function ddValue(root) {
    var p = ddParts(root);
    var sel = p.opts.filter(function (li) { return li.getAttribute('aria-selected') === 'true'; }).map(function (li) { return li.getAttribute('data-value'); });
    return root.hasAttribute('data-multi') ? sel : (sel[0] || '');
  }
  function ddRefresh(root) {
    var p = ddParts(root); var multi = root.hasAttribute('data-multi');
    var chosen = p.opts.filter(function (li) { return li.getAttribute('aria-selected') === 'true'; });
    var label = function (li) { return li.querySelector('.ov-dd__olabel').textContent; };
    var v = root.querySelector('.ov-dd__value');
    if (multi) {
      var partial = chosen.length > 0 && chosen.length < p.opts.length;
      v.textContent = !partial ? root.getAttribute('data-all-label') : chosen.length === 1 ? label(chosen[0]) : label(chosen[0]) + ' +' + (chosen.length - 1);
      var c = root.querySelector('.ov-dd__count'); c.hidden = !partial; c.textContent = chosen.length; c.setAttribute('aria-label', chosen.length + ' selected');
      root.classList.toggle('ov-dd--active', partial);
      var clr = root.querySelector('[data-dd-clear]'); if (clr) clr.disabled = chosen.length === 0;
    } else {
      v.textContent = chosen[0] ? label(chosen[0]) : root.getAttribute('data-placeholder');
      v.classList.toggle('ov-dd__value--placeholder', !chosen[0]);
    }
  }
  function visibleOpts(root) { return ddParts(root).opts.filter(function (li) { return !li.hidden && li.getAttribute('aria-disabled') !== 'true'; }); }
  function setActive(root, li) {
    var p = ddParts(root);
    p.opts.forEach(function (x) { x.classList.toggle('is-active', x === li); });
    var host = p.q || p.list;
    if (li) { host.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); if (openDd) openDd.active = li.getAttribute('data-value'); }
    else host.removeAttribute('aria-activedescendant');
  }
  function place(trigger, panel) {
    var r = trigger.getBoundingClientRect();
    panel.style.minWidth = Math.max(r.width, 240) + 'px';
    var pw = panel.offsetWidth, ph = panel.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var left = Math.min(r.left, vw - pw - 8); left = Math.max(8, left);
    var top = r.bottom + 6;
    if (top + ph > vh - 8 && r.top - ph - 6 > 8) top = r.top - ph - 6;
    panel.style.left = left + 'px'; panel.style.top = top + 'px';
  }
  function ddOpen(root, opts) {
    opts = opts || {};
    closeAll(root);
    var p = ddParts(root);
    p.panel.hidden = false; p.btn.setAttribute('aria-expanded', 'true');
    if (p.q) { p.q.value = opts.query || ''; ddFilter(root); }
    place(p.btn, p.panel);
    openDd = { id: root.getAttribute('data-dd'), query: opts.query || '', active: null };
    var act = null;
    if (opts.active != null) act = p.opts.filter(function (li) { return li.getAttribute('data-value') === opts.active && !li.hidden; })[0];
    if (!act) act = p.opts.filter(function (li) { return li.getAttribute('aria-selected') === 'true' && !li.hidden; })[0] || visibleOpts(root)[0];
    setActive(root, act || null);
    if (opts.focus !== false) (p.q || p.list).focus({ preventScroll: true });
  }
  function ddClose(root, refocus) {
    var p = ddParts(root);
    if (p.panel.hidden) return;
    p.panel.hidden = true; p.btn.setAttribute('aria-expanded', 'false');
    p.opts.forEach(function (x) { x.classList.remove('is-active'); });
    if (openDd && openDd.id === root.getAttribute('data-dd')) openDd = null;
    if (refocus) p.btn.focus({ preventScroll: true });
  }
  function closeAll(except) {
    Array.prototype.forEach.call(doc.querySelectorAll('.ov-dd'), function (r) { if (r !== except) ddClose(r, false); });
    Array.prototype.forEach.call(doc.querySelectorAll('.ov-date'), function (r) { if (r !== except) dpClose(r, false); });
  }
  function ddFilter(root) {
    var p = ddParts(root); var q = (p.q ? p.q.value : '').trim().toLowerCase();
    var shown = 0;
    p.opts.forEach(function (li) { var hit = !q || li.textContent.toLowerCase().indexOf(q) !== -1; li.hidden = !hit; if (hit) shown += 1; });
    p.none.hidden = shown > 0;
    if (openDd) openDd.query = p.q ? p.q.value : '';
  }
  function ddChoose(root, li) {
    if (!li || li.getAttribute('aria-disabled') === 'true') return;
    var p = ddParts(root); var id = root.getAttribute('data-dd');
    if (root.hasAttribute('data-multi')) {
      li.setAttribute('aria-selected', li.getAttribute('aria-selected') === 'true' ? 'false' : 'true');
      setActive(root, li); ddRefresh(root);
      emit(root, id, ddValue(root));
    } else {
      p.opts.forEach(function (x) { x.setAttribute('aria-selected', x === li ? 'true' : 'false'); });
      ddRefresh(root); ddClose(root, true); focusAfter = id + '-btn';
      emit(root, id, ddValue(root));
    }
  }
  function ddSetAll(root, on) {
    var p = ddParts(root);
    p.opts.forEach(function (li) { if (li.getAttribute('aria-disabled') !== 'true') li.setAttribute('aria-selected', on ? 'true' : 'false'); });
    ddRefresh(root); emit(root, root.getAttribute('data-dd'), ddValue(root));
  }
  function ddMove(root, step) {
    var vis = visibleOpts(root); if (!vis.length) return;
    var cur = root.querySelector('.ov-dd__opt.is-active'); var i = vis.indexOf(cur);
    if (step === 'first') i = 0; else if (step === 'last') i = vis.length - 1; else i = i < 0 ? 0 : Math.min(vis.length - 1, Math.max(0, i + step));
    setActive(root, vis[i]);
  }
  K.dropdownValue = ddValue;
  var byId = function (sel, attr) { return typeof sel === 'string' ? doc.querySelector('[' + attr + '="' + sel + '"]') : sel; };
  // Open or close from code, e.g. in a preview: Oraviq.openDropdown('channels', { focus: false })
  K.openDropdown = function (sel, opts) { var r = byId(sel, 'data-dd'); if (r) ddOpen(r, opts); };
  K.closeDropdown = function (sel) { var r = byId(sel, 'data-dd'); if (r) ddClose(r, false); };

  /* ================= Date picker ================= */
  // o: { id, value:'YYYY-MM-DD', min:'YYYY-MM-DD', label, placeholder, labelledBy, quick:true }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DOW = [['Su', 'Sunday'], ['Mo', 'Monday'], ['Tu', 'Tuesday'], ['We', 'Wednesday'], ['Th', 'Thursday'], ['Fr', 'Friday'], ['Sa', 'Saturday']];
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parse = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  K.formatDate = function (s, long) {
    var d = typeof s === 'string' ? parse(s) : s; if (!d) return '';
    return d.toLocaleDateString('en-US', long ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' });
  };
  K.openDatePicker = function (sel, opts) { var r = byId(sel, 'data-date'); if (r) dpOpen(r, opts); };
  K.today = function () { var t = new Date(); return iso(t); };
  K.datePicker = function (o) {
    var id = o.id || nextId('date');
    var lab = o.labelledBy ? ' aria-labelledby="' + esc(o.labelledBy) + ' ' + esc(id) + '-v"' : ' aria-label="' + esc(o.label || 'Date') + ', ' + esc(o.value ? K.formatDate(o.value, true) : 'not set') + '"';
    var h = '<div class="ov-date" data-date="' + esc(id) + '" data-value="' + esc(o.value || '') + '" data-min="' + esc(o.min || '') + '" data-quick="' + (o.quick === false ? '0' : '1') + '" data-placeholder="' + esc(o.placeholder || 'Pick a date') + '">';
    h += '<button type="button" class="ov-date__trigger" id="' + esc(id) + '-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="' + esc(id) + '-panel"' + lab + '>' + ICONS.calendar +
      '<span id="' + esc(id) + '-v"' + (o.value ? '' : ' class="is-empty"') + '>' + esc(o.value ? K.formatDate(o.value) : (o.placeholder || 'Pick a date')) + '</span></button>';
    h += '<div class="ov-date__panel" id="' + esc(id) + '-panel" role="dialog" aria-modal="false" aria-label="Choose ' + esc(String(o.label || 'a date').toLowerCase()) + '" hidden></div></div>';
    return h;
  };
  function dpState(root) { return { value: root.getAttribute('data-value'), min: root.getAttribute('data-min'), view: root._view, focus: root._focus }; }
  function dpRender(root) {
    var st = dpState(root);
    var view = st.view; var focus = st.focus;
    var sel = parse(st.value); var min = parse(st.min); var today = parse(K.today());
    var first = new Date(view.getFullYear(), view.getMonth(), 1);
    var start = new Date(first); start.setDate(1 - first.getDay());
    var id = root.getAttribute('data-date');
    var h = '<div class="ov-date__head"><button type="button" class="ov-date__nav" data-dp-step="-1" aria-label="Previous month">' + ICONS.left + '</button>' +
      '<p class="ov-date__title" id="' + esc(id) + '-title" aria-live="polite" style="margin:0">' + MONTHS[view.getMonth()] + ' ' + view.getFullYear() + '</p>' +
      '<button type="button" class="ov-date__nav" data-dp-step="1" aria-label="Next month">' + ICONS.right + '</button></div>';
    h += '<table class="ov-date__grid" role="grid" aria-labelledby="' + esc(id) + '-title"><thead><tr>' + DOW.map(function (d) { return '<th scope="col" abbr="' + d[1] + '">' + d[0] + '</th>'; }).join('') + '</tr></thead><tbody>';
    var d = new Date(start);
    for (var w = 0; w < 6; w++) {
      h += '<tr>';
      for (var k = 0; k < 7; k++) {
        var di = iso(d); var out = d.getMonth() !== view.getMonth(); var dis = min && d < min;
        var isSel = sel && di === iso(sel); var isFocus = di === iso(focus);
        h += '<td><button type="button" class="ov-date__day' + (out ? ' is-out' : '') + (today && di === iso(today) ? ' is-today' : '') + '" data-dp-day="' + di + '" tabindex="' + (isFocus ? '0' : '-1') + '"' +
          ' aria-pressed="' + (isSel ? 'true' : 'false') + '"' + (dis ? ' aria-disabled="true"' : '') + ' aria-label="' + K.formatDate(di, true) + (today && di === iso(today) ? ', today' : '') + '">' + d.getDate() + '</button></td>';
        d.setDate(d.getDate() + 1);
      }
      h += '</tr>';
    }
    h += '</tbody></table>';
    if (root.getAttribute('data-quick') === '1') {
      var tm = new Date(today); tm.setDate(tm.getDate() + 1);
      var sat = new Date(today); sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7));
      var q = [['Today', today], ['Tomorrow', tm], ['Saturday', sat]].filter(function (x) { return !(min && x[1] < min); });
      if (q.length) h += '<div class="ov-date__quick">' + q.map(function (x) { return '<button type="button" data-dp-day="' + iso(x[1]) + '">' + x[0] + '</button>'; }).join('') + '</div>';
    }
    var panel = root.querySelector('.ov-date__panel');
    panel.innerHTML = h;
  }
  function dpOpen(root, opts) {
    closeAll(root);
    var sel = parse(root.getAttribute('data-value')); var min = parse(root.getAttribute('data-min'));
    var f = sel || (min && min > new Date() ? min : parse(K.today()));
    root._focus = f; root._view = new Date(f.getFullYear(), f.getMonth(), 1);
    dpRender(root);
    var p = root.querySelector('.ov-date__panel'); var btn = root.querySelector('.ov-date__trigger');
    p.hidden = false; btn.setAttribute('aria-expanded', 'true');
    place(btn, p);
    var fb = p.querySelector('[data-dp-day][tabindex="0"]'); if (fb && !(opts && opts.focus === false)) fb.focus({ preventScroll: true });
  }
  function dpClose(root, refocus) {
    var p = root.querySelector('.ov-date__panel'); if (!p || p.hidden) return;
    p.hidden = true; root.querySelector('.ov-date__trigger').setAttribute('aria-expanded', 'false');
    if (refocus) root.querySelector('.ov-date__trigger').focus({ preventScroll: true });
  }
  function dpPick(root, value) {
    var d = parse(value); var min = parse(root.getAttribute('data-min'));
    if (!d || (min && d < min)) return;
    root.setAttribute('data-value', value);
    var v = root.querySelector('.ov-date__trigger span');
    v.textContent = K.formatDate(value); v.classList.remove('is-empty');
    var btn = root.querySelector('.ov-date__trigger');
    if (!btn.hasAttribute('aria-labelledby')) btn.setAttribute('aria-label', (btn.getAttribute('aria-label') || 'Date').split(',')[0] + ', ' + K.formatDate(value, true));
    dpClose(root, true); focusAfter = btn.id;
    emit(root, root.getAttribute('data-date'), value);
  }
  function dpMoveFocus(root, days, months) {
    var f = new Date(root._focus);
    if (months) f.setMonth(f.getMonth() + months); else f.setDate(f.getDate() + days);
    root._focus = f; root._view = new Date(f.getFullYear(), f.getMonth(), 1);
    dpRender(root);
    var b = root.querySelector('[data-dp-day="' + iso(f) + '"].ov-date__day'); if (b) b.focus({ preventScroll: true });
  }

  /* ================= Tabs ================= */
  // o: { id, label, tabs:[{value,label,count,controls}], value }
  K.tabs = function (o) {
    var id = o.id || nextId('tabs');
    return '<div class="ov-tabs" role="tablist" aria-label="' + esc(o.label) + '" data-tabs="' + esc(id) + '">' + o.tabs.map(function (t) {
      var sel = String(t.value) === String(o.value);
      return '<button type="button" role="tab" id="' + esc(id) + '-' + esc(t.value) + '" data-tab="' + esc(t.value) + '" aria-selected="' + sel + '" tabindex="' + (sel ? '0' : '-1') + '"' +
        (t.controls ? ' aria-controls="' + esc(t.controls) + '"' : '') + '>' + esc(t.label) + (t.count != null ? '<span class="ov-tabs__count">' + esc(t.count) + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  };
  function tabSelect(list, tab, focus) {
    Array.prototype.forEach.call(list.querySelectorAll('[role="tab"]'), function (t) {
      var on = t === tab; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
      var pid = t.getAttribute('aria-controls'); var panel = pid && doc.getElementById(pid); if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
    focusAfter = tab.id;
    emit(list, list.getAttribute('data-tabs'), tab.getAttribute('data-tab'));
  }

  /* ================= Tooltip ================= */
  // o: { text, label (accessible name of the trigger), place:'below'|'start', icon }
  K.tip = function (o) {
    var id = nextId('tip');
    return '<span class="ov-tip' + (o.place ? ' ov-tip--' + o.place.split(' ').join(' ov-tip--') : '') + '"><button type="button" class="ov-tip__btn" aria-label="' + esc(o.label || 'More information') + '" aria-describedby="' + id + '">' +
      (o.icon || ICONS.info) + '</button><span role="tooltip" id="' + id + '" class="ov-tip__bubble">' + esc(o.text) + '</span></span>';
  };

  /* ================= Empty state ================= */
  K.empty = function (o) {
    return '<div class="ov-empty"><span class="ov-empty__icon" aria-hidden="true">' + (o.icon || ICONS.search.replace('width="16" height="16"', 'width="24" height="24"')) + '</span>' +
      '<p class="ov-empty__title">' + esc(o.title) + '</p>' + (o.text ? '<p class="ov-empty__text">' + esc(o.text) + '</p>' : '') +
      (o.action ? '<button type="button" class="ov-btn ov-btn--secondary ov-btn--small"' + (o.actionAttr ? ' ' + o.actionAttr : '') + '>' + esc(o.action) + '</button>' : '') + '</div>';
  };

  /* ================= Search field ================= */
  K.search = function (o) {
    var id = o.id || nextId('search');
    return '<div class="ov-search' + (o.className ? ' ' + o.className : '') + '">' + ICONS.search + '<input type="search" id="' + esc(id) + '" value="' + esc(o.value || '') + '" placeholder="' + esc(o.placeholder || 'Search') + '"' +
      ' aria-label="' + esc(o.label || o.placeholder || 'Search') + '" autocomplete="off"' + (o.attrs ? ' ' + o.attrs : '') + '><button type="button" class="ov-search__clear" data-search-clear aria-label="Clear search">' + ICONS.close + '</button></div>';
  };

  /* ================= Modal (native dialog) ================= */
  // o: { title, sub, body (HTML), actions:[{label,value,kind:'primary'|'secondary'|'quiet'|'signal'}], onAction(value, dialog) -> false keeps it open, onClose(dialog), initialFocus (selector) }
  K.modal = function (o) {
    var dlg = doc.createElement('dialog');
    var tid = nextId('mt');
    dlg.className = 'ov-modal'; dlg.setAttribute('aria-labelledby', tid);
    var acts = (o.actions || []).map(function (a) { return '<button type="button" class="ov-btn ov-btn--' + (a.kind || 'secondary') + '" data-modal-action="' + esc(a.value) + '">' + esc(a.label) + '</button>'; }).join('');
    dlg.innerHTML = '<div class="ov-modal__box"><div class="ov-modal__head"><div><h2 class="ov-modal__title" id="' + tid + '">' + esc(o.title) + '</h2>' + (o.sub ? '<p class="ov-modal__sub">' + esc(o.sub) + '</p>' : '') + '</div>' +
      '<button type="button" class="ov-modal__x" data-modal-action="__close" aria-label="Close">' + ICONS.close + '</button></div>' +
      '<div class="ov-modal__body">' + (o.body || '') + '</div>' + (acts ? '<div class="ov-modal__foot">' + acts + '</div>' : '') + '</div>';
    var back = doc.activeElement;
    doc.body.appendChild(dlg);
    var done = function () { if (!dlg.isConnected) return; closeAll(); dlg.close(); dlg.remove(); if (o.onClose) o.onClose(dlg); if (back && back.isConnected) back.focus({ preventScroll: true }); };
    dlg.addEventListener('cancel', function (e) { var openPop = dlg.querySelector('.ov-dd__panel:not([hidden]), .ov-date__panel:not([hidden])'); if (openPop) { e.preventDefault(); return; } e.preventDefault(); done(); });
    dlg.addEventListener('mousedown', function (e) { if (e.target === dlg) { var r = dlg.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) done(); } });
    dlg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-modal-action]'); if (!b) return;
      var v = b.getAttribute('data-modal-action');
      if (v === '__close') { done(); return; }
      if (o.onAction && o.onAction(v, dlg) === false) return;
      done();
    });
    dlg.showModal();
    var f = o.initialFocus && dlg.querySelector(o.initialFocus); if (f) f.focus();
    dlg._close = done;
    return dlg;
  };

  /* ================= Toast ================= */
  // K.toast(message, { tone:'success'|'info'|'danger', action:{label,onClick}, duration })
  K.toast = function (msg, o) {
    o = o || {};
    var box = doc.querySelector('.ov-toasts');
    if (!box) { box = doc.createElement('div'); box.className = 'ov-toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); doc.body.appendChild(box); }
    var t = doc.createElement('div');
    var tone = o.tone || 'success';
    t.className = 'ov-toast ov-toast--' + tone;
    t.innerHTML = '<span class="ov-toast__icon" aria-hidden="true">' + (tone === 'danger' ? ICONS.alert : tone === 'info' ? ICONS.info.replace(/16/g, '14') : ICONS.ok) + '</span><span class="ov-toast__msg"></span>' +
      (o.action ? '<button type="button" class="ov-toast__action"></button>' : '') + '<button type="button" class="ov-toast__x" aria-label="Dismiss">' + ICONS.close + '</button>';
    t.querySelector('.ov-toast__msg').textContent = msg;
    if (o.action) t.querySelector('.ov-toast__action').textContent = o.action.label;
    var timer; var dur = o.duration || (o.action ? 6000 : 3200);
    var kill = function () { clearTimeout(timer); if (t.isConnected) t.remove(); };
    var arm = function () { clearTimeout(timer); timer = setTimeout(kill, dur); };
    t.addEventListener('mouseenter', function () { clearTimeout(timer); });
    t.addEventListener('mouseleave', arm);
    t.addEventListener('focusin', function () { clearTimeout(timer); });
    t.addEventListener('click', function (e) {
      if (e.target.closest('.ov-toast__x')) kill();
      else if (e.target.closest('.ov-toast__action')) { kill(); if (o.action && o.action.onClick) o.action.onClick(); }
    });
    while (box.children.length > 2) box.firstChild.remove();
    box.appendChild(t); arm();
    return t;
  };

  /* ================= Restore after a re-render ================= */
  K.restore = function () {
    if (openDd) {
      var r = doc.querySelector('[data-dd="' + openDd.id + '"]');
      if (r) { var keep = openDd; ddOpen(r, { query: keep.query, active: keep.active }); }
      else openDd = null;
    }
    if (focusAfter) {
      var b = doc.getElementById(focusAfter);
      if (b && (doc.activeElement === doc.body || !doc.activeElement || !doc.activeElement.isConnected)) b.focus({ preventScroll: true });
      focusAfter = null;
    }
  };

  /* ================= Wiring (once per document) ================= */
  K.init = function () {
    if (doc.documentElement.hasAttribute('data-ov-kit')) return;
    doc.documentElement.setAttribute('data-ov-kit', '');
    doc.addEventListener('click', function (e) {
      var t = e.target;
      var dd = t.closest('.ov-dd');
      if (dd) {
        if (t.closest('.ov-dd__trigger')) { var expanded = dd.querySelector('.ov-dd__trigger').getAttribute('aria-expanded') === 'true'; if (expanded) ddClose(dd, true); else ddOpen(dd); return; }
        var li = t.closest('.ov-dd__opt'); if (li) { ddChoose(dd, li); return; }
        if (t.closest('[data-dd-all]')) { ddSetAll(dd, true); return; }
        if (t.closest('[data-dd-clear]')) { ddSetAll(dd, false); return; }
        if (t.closest('[data-dd-done]')) { ddClose(dd, true); return; }
        return;
      }
      var dp = t.closest('.ov-date');
      if (dp) {
        if (t.closest('.ov-date__trigger')) { if (dp.querySelector('.ov-date__trigger').getAttribute('aria-expanded') === 'true') dpClose(dp, true); else dpOpen(dp); return; }
        var step = t.closest('[data-dp-step]'); if (step) { dp._view = new Date(dp._view.getFullYear(), dp._view.getMonth() + (+step.getAttribute('data-dp-step')), 1); dp._focus = new Date(dp._view); dpRender(dp); var nb = dp.querySelector('[data-dp-step="' + step.getAttribute('data-dp-step') + '"]'); if (nb) nb.focus(); return; }
        var day = t.closest('[data-dp-day]'); if (day && day.getAttribute('aria-disabled') !== 'true') { dpPick(dp, day.getAttribute('data-dp-day')); return; }
        return;
      }
      var tab = t.closest('.ov-tabs [role="tab"]'); if (tab) { tabSelect(tab.closest('.ov-tabs'), tab, false); return; }
      var clr = t.closest('[data-search-clear]');
      if (clr) { var inp = clr.parentNode.querySelector('input'); inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus(); return; }
    });
    doc.addEventListener('mousedown', function (e) {
      if (!e.target.closest('.ov-dd') && !e.target.closest('.ov-date')) closeAll();
    });
    doc.addEventListener('input', function (e) { var q = e.target.closest('.ov-dd__q'); if (q) { var r = q.closest('.ov-dd'); ddFilter(r); setActive(r, visibleOpts(r)[0] || null); } });
    doc.addEventListener('keydown', function (e) {
      var t = e.target; var k = e.key;
      var dd = t.closest && t.closest('.ov-dd');
      if (dd) {
        var open = dd.querySelector('.ov-dd__trigger').getAttribute('aria-expanded') === 'true';
        if (t.classList.contains('ov-dd__trigger')) {
          if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); ddOpen(dd); if (k === 'ArrowUp') ddMove(dd, 'last'); }
          return;
        }
        if (!open) return;
        var inSearch = t.classList.contains('ov-dd__q');
        if (k === 'ArrowDown') { e.preventDefault(); ddMove(dd, 1); }
        else if (k === 'ArrowUp') { e.preventDefault(); ddMove(dd, -1); }
        else if ((k === 'Home' || k === 'End') && !inSearch) { e.preventDefault(); ddMove(dd, k === 'Home' ? 'first' : 'last'); }
        else if (k === 'Enter' && (inSearch || t.classList.contains('ov-dd__list'))) { e.preventDefault(); var a = dd.querySelector('.ov-dd__opt.is-active'); if (a) ddChoose(dd, a); }
        else if (k === ' ' && t.classList.contains('ov-dd__list')) { e.preventDefault(); var a2 = dd.querySelector('.ov-dd__opt.is-active'); if (a2) ddChoose(dd, a2); }
        else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); ddClose(dd, true); }
        else if (k === 'Tab' && (inSearch || t.classList.contains('ov-dd__list')) && !dd.hasAttribute('data-multi')) { ddClose(dd, false); }
        else if (!inSearch && t.classList.contains('ov-dd__list') && k.length === 1 && /\S/.test(k)) {
          var hit = visibleOpts(dd).filter(function (li) { return li.textContent.trim().toLowerCase().indexOf(k.toLowerCase()) === 0; })[0]; if (hit) setActive(dd, hit);
        }
        return;
      }
      var dp = t.closest && t.closest('.ov-date');
      if (dp && t.classList.contains('ov-date__day')) {
        var map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (map[k] != null) { e.preventDefault(); dpMoveFocus(dp, map[k], 0); }
        else if (k === 'PageUp' || k === 'PageDown') { e.preventDefault(); dpMoveFocus(dp, 0, k === 'PageUp' ? -1 : 1); }
        else if (k === 'Home') { e.preventDefault(); dpMoveFocus(dp, -dp._focus.getDay(), 0); }
        else if (k === 'End') { e.preventDefault(); dpMoveFocus(dp, 6 - dp._focus.getDay(), 0); }
        else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); dpClose(dp, true); }
        return;
      }
      if (dp && k === 'Escape') { e.preventDefault(); e.stopPropagation(); dpClose(dp, true); return; }
      var tab = t.closest && t.closest('.ov-tabs [role="tab"]');
      if (tab) {
        var tabs = Array.prototype.slice.call(tab.closest('.ov-tabs').querySelectorAll('[role="tab"]')); var i = tabs.indexOf(tab);
        var n = k === 'ArrowRight' ? i + 1 : k === 'ArrowLeft' ? i - 1 : k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : null;
        if (n != null) { e.preventDefault(); n = (n + tabs.length) % tabs.length; tabSelect(tab.closest('.ov-tabs'), tabs[n], true); }
        return;
      }
      if (k === 'Escape') { var tip = t.closest && t.closest('.ov-tip'); if (tip) { tip.classList.add('is-dismissed'); var un = function () { tip.classList.remove('is-dismissed'); tip.removeEventListener('mouseleave', un); tip.removeEventListener('focusout', un); }; tip.addEventListener('mouseleave', un); tip.addEventListener('focusout', un); } }
    });
    var reflow = function () {
      Array.prototype.forEach.call(doc.querySelectorAll('.ov-dd__panel:not([hidden]), .ov-date__panel:not([hidden])'), function (p) {
        var root = p.closest('.ov-dd, .ov-date'); var trig = root.querySelector('.ov-dd__trigger, .ov-date__trigger');
        var r = trig.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) { if (root.classList.contains('ov-dd')) ddClose(root, false); else dpClose(root, false); } else place(trig, p);
      });
    };
    window.addEventListener('resize', reflow);
    doc.addEventListener('scroll', function (e) { if (e.target.closest && (e.target.closest('.ov-dd__panel') || e.target.closest('.ov-date__panel'))) return; reflow(); }, true);
  };

  window.Oraviq = K;
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', K.init); else K.init();
})();
