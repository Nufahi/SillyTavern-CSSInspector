const MODULE_NAME = 'SillyTavern-CSSInspector';
const extPath = 'scripts/extensions/third-party/' + MODULE_NAME;

jQuery(async function () {
    try {
        // --- Prevent double initialization (Bug #2) ---
        if (window.__cssInspectorInitialized) {
            console.warn('[CSS Inspector] Already initialized, cleaning up previous instance.');
            if (typeof window.__cssInspectorDispose === 'function') {
                try { window.__cssInspectorDispose(); } catch (e) { console.error('[CSS Inspector] Dispose error:', e); }
            }
        }
        window.__cssInspectorInitialized = true;

        const context = SillyTavern.getContext();
        const extensionSettings = context.extensionSettings;
        const saveSettingsDebounced = context.saveSettingsDebounced;

        const defaultSettings = {
            enabled: false,
            theme: 'dark',
            copyMode: 'full',
            showDimensions: true,
            showComputed: false,
            showVariables: true,
            showBoxModel: false,
            clickLock: true,
            showToasts: true,
            fabPosition: null, // {left, top} or null
            hotkey: { ctrl: false, shift: false, alt: true, meta: false, key: 'i' }, // Alt+I (avoids browser DevTools shortcut)
            showBreadcrumbs: true,
        };

        // --- Fixed deepMerge: preserves all keys from source AND target (Bug #1) ---
        function mergeSettings(defaults, saved) {
            const result = {};
            // Start with defaults to ensure every default key exists
            for (const key in defaults) {
                if (Object.prototype.hasOwnProperty.call(defaults, key)) {
                    result[key] = defaults[key];
                }
            }
            // Override with saved (and keep any extra saved keys for forward-compat)
            if (saved && typeof saved === 'object') {
                for (const key in saved) {
                    if (Object.prototype.hasOwnProperty.call(saved, key)) {
                        result[key] = saved[key];
                    }
                }
            }
            return result;
        }

        function getSettings() {
            extensionSettings[MODULE_NAME] = mergeSettings(defaultSettings, extensionSettings[MODULE_NAME]);
            return extensionSettings[MODULE_NAME];
        }

        // --- HTML escaping (Bug #27 - XSS) ---
        function escapeHtml(str) {
            if (str == null) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        // --- Cleanup any leftover DOM from previous instance ---
        $('#css_inspector_tooltip, #css_inspector_fab, .csi-box-margin, .csi-box-padding').remove();
        $('.css-inspector-highlight').removeClass('css-inspector-highlight');
        $('.csi-highlight-match').removeClass('csi-highlight-match');

        // --- Core DOM elements ---
        const tooltip = $('<div id="css_inspector_tooltip"></div>');
        $('body').append(tooltip);

        const fab = $('<div id="css_inspector_fab" title="CSS Inspector"><i class="fa-solid fa-crosshairs"></i></div>');
        $('body').append(fab);

        // --- Box model overlays ---
        const boxMarginEls = [];
        const boxPaddingEls = [];
        for (let bi = 0; bi < 4; bi++) {
            const bm = $('<div class="csi-box-margin"></div>');
            const bp = $('<div class="csi-box-padding"></div>');
            $('body').append(bm).append(bp);
            boxMarginEls.push(bm);
            boxPaddingEls.push(bp);
        }

        function hideBoxOverlays() {
            for (let i = 0; i < 4; i++) {
                boxMarginEls[i].hide();
                boxPaddingEls[i].hide();
            }
        }
        hideBoxOverlays();

        function showBoxModel(el) {
            const cs = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            const sx = window.scrollX, sy = window.scrollY;
            const mt = parseFloat(cs.marginTop) || 0;
            const mr = parseFloat(cs.marginRight) || 0;
            const mb = parseFloat(cs.marginBottom) || 0;
            const ml = parseFloat(cs.marginLeft) || 0;
            const pt = parseFloat(cs.paddingTop) || 0;
            const pr = parseFloat(cs.paddingRight) || 0;
            const pb = parseFloat(cs.paddingBottom) || 0;
            const pl = parseFloat(cs.paddingLeft) || 0;
            const bt = parseFloat(cs.borderTopWidth) || 0;
            const brw = parseFloat(cs.borderRightWidth) || 0;
            const bb = parseFloat(cs.borderBottomWidth) || 0;
            const blw = parseFloat(cs.borderLeftWidth) || 0;

            boxMarginEls[0].css({ left: rect.left + sx - ml, top: rect.top + sy - mt, width: rect.width + ml + mr, height: mt }).show();
            boxMarginEls[1].css({ left: rect.right + sx, top: rect.top + sy, width: mr, height: rect.height }).show();
            boxMarginEls[2].css({ left: rect.left + sx - ml, top: rect.bottom + sy, width: rect.width + ml + mr, height: mb }).show();
            boxMarginEls[3].css({ left: rect.left + sx - ml, top: rect.top + sy, width: ml, height: rect.height }).show();

            // Bug #9: clamp to non-negative dimensions
            const il = rect.left + sx + blw;
            const it = rect.top + sy + bt;
            const iw = Math.max(0, rect.width - blw - brw);
            const ih = Math.max(0, rect.height - bt - bb);
            const safePt = Math.min(pt, ih);
            const safePb = Math.min(pb, Math.max(0, ih - safePt));
            const verticalRem = Math.max(0, ih - safePt - safePb);
            const safePl = Math.min(pl, iw);
            const safePr = Math.min(pr, Math.max(0, iw - safePl));

            boxPaddingEls[0].css({ left: il, top: it, width: iw, height: safePt }).show();
            boxPaddingEls[1].css({ left: il + iw - safePr, top: it + safePt, width: safePr, height: verticalRem }).show();
            boxPaddingEls[2].css({ left: il, top: it + ih - safePb, width: iw, height: safePb }).show();
            boxPaddingEls[3].css({ left: il, top: it + safePt, width: safePl, height: verticalRem }).show();
        }

        // --- Theme ---
        function applyTheme() {
            const s = getSettings();
            tooltip.toggleClass('csi-theme-light', s.theme === 'light');
            fab.toggleClass('csi-fab-light', s.theme === 'light');
        }

        // --- CSS Variables (Bug #4: handles nested rules) ---
        function collectRulesRecursive(rulesList, el, out) {
            if (!rulesList) return;
            for (let r = 0; r < rulesList.length; r++) {
                const rule = rulesList[r];
                if (!rule) continue;
                // Style rule
                if (rule.selectorText) {
                    try {
                        if (el.matches(rule.selectorText)) out.push(rule);
                    } catch (e) { /* invalid selector */ }
                }
                // Group rules: @media, @supports, @layer, @container, @document
                if (rule.cssRules) {
                    try { collectRulesRecursive(rule.cssRules, el, out); } catch (e) { /* cross-origin */ }
                }
            }
        }

        function getMatchingRules(el) {
            const matched = [];
            try {
                for (let s = 0; s < document.styleSheets.length; s++) {
                    let rules;
                    try { rules = document.styleSheets[s].cssRules; } catch (e) { continue; }
                    collectRulesRecursive(rules, el, matched);
                }
            } catch (e) { /* noop */ }
            return matched;
        }

        function extractCssVariables(el) {
            const varMap = {};
            const rules = getMatchingRules(el);
            const re = /var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g;
            const elComputed = getComputedStyle(el);
            for (let i = 0; i < rules.length; i++) {
                const st = rules[i].style;
                if (!st) continue;
                for (let p = 0; p < st.length; p++) {
                    const propName = st[p];
                    const val = st.getPropertyValue(propName);
                    let m;
                    re.lastIndex = 0;
                    while ((m = re.exec(val)) !== null) {
                        const vn = m[1].trim();
                        if (!varMap[vn]) {
                            // Bug #17: resolve from element's computed style (respects inheritance)
                            const rv = elComputed.getPropertyValue(vn).trim();
                            varMap[vn] = { property: propName, resolved: rv || '(unset)' };
                        }
                    }
                }
            }
            return varMap;
        }

        // --- Highlight matching (Bug #20: WeakSet for auto-GC) ---
        let matchHighlighted = [];
        function clearMatchHighlights() {
            for (let i = 0; i < matchHighlighted.length; i++) {
                const el = matchHighlighted[i];
                if (el && el.classList && el.isConnected) {
                    el.classList.remove('csi-highlight-match');
                }
            }
            matchHighlighted = [];
        }
        function highlightAllWithClass(cn) {
            clearMatchHighlights();
            // Sanitize class name for selector
            let escapedCn;
            try {
                escapedCn = (window.CSS && CSS.escape) ? CSS.escape(cn) : cn.replace(/([^\w-])/g, '\\$1');
            } catch (e) { escapedCn = cn; }
            let els;
            try { els = document.querySelectorAll('.' + escapedCn); } catch (e) { return; }
            let count = 0;
            for (let i = 0; i < els.length; i++) {
                if (!isInspectorEl(els[i])) {
                    els[i].classList.add('csi-highlight-match');
                    matchHighlighted.push(els[i]);
                    count++;
                }
            }
            if (getSettings().showToasts && typeof toastr !== 'undefined') {
                toastr.info(count + ' elements with .' + cn, MODULE_NAME);
            }
        }

        // --- State ---
        let lastEl = null;
        let isPinned = false;
        let inspectorActive = false;

        // Bug #13: include box overlays. Bug #15: handle null.
        function isInspectorEl(el) {
            if (!el) return false; // null/undefined: not an inspector element (Bug #15 fix)
            if (!(el instanceof Element)) return false;
            if (el.id === 'css_inspector_tooltip' || el.id === 'css_inspector_fab') return true;
            if (el.classList && (el.classList.contains('csi-box-margin') || el.classList.contains('csi-box-padding'))) return true;
            try {
                if (el.closest && (el.closest('#css_inspector_tooltip') || el.closest('#css_inspector_fab'))) return true;
            } catch (e) { /* noop */ }
            return false;
        }

        function clearHighlight() {
            // Bug #3: only touch the element if it's still in DOM (avoid zombie refs)
            if (lastEl && lastEl.classList && lastEl.isConnected) {
                lastEl.classList.remove('css-inspector-highlight');
            }
            lastEl = null;
            tooltip.hide();
            hideBoxOverlays();
            clearMatchHighlights();
        }

        // --- Breadcrumbs: ancestor chain from <body> to element ---
        // Returns array of ancestors (excluding <html>/<body>) with the element itself last.
        function getAncestorChain(el) {
            const chain = [];
            let c = el;
            while (c && c !== document.body && c !== document.documentElement) {
                chain.unshift(c);
                c = c.parentElement;
            }
            return chain;
        }

        // Short label for breadcrumb item: tag + (id OR first non-inspector class)
        function breadcrumbLabel(el) {
            const tag = el.tagName ? el.tagName.toLowerCase() : '?';
            if (el.id) return tag + '#' + el.id;
            if (el.classList && el.classList.length) {
                const f = Array.from(el.classList).filter(function (c) {
                    return c !== 'css-inspector-highlight' && c !== 'csi-highlight-match';
                })[0];
                if (f) return tag + '.' + f;
            }
            return tag;
        }

        // Map breadcrumb items to elements (rebuilt every buildTooltip call)
        let breadcrumbMap = [];

        function buildBreadcrumbs(el) {
            breadcrumbMap = getAncestorChain(el);
            if (breadcrumbMap.length <= 1) return ''; // nothing to navigate
            const parts = breadcrumbMap.map(function (node, idx) {
                const isCurrent = (node === el);
                const label = escapeHtml(breadcrumbLabel(node));
                const cls = 'csi-crumb' + (isCurrent ? ' csi-crumb-current' : '');
                return '<span class="' + cls + '" data-crumb-idx="' + idx + '">' + label + '</span>';
            });
            return '<div class="csi-breadcrumbs"><i class="fa-solid fa-sitemap csi-icon"></i>' + parts.join('<span class="csi-crumb-sep">›</span>') + '</div>';
        }

        // --- Tooltip content (Bug #27: XSS-safe via escapeHtml) ---
        function buildTooltip(el) {
            const s = getSettings();
            const tag = el.tagName ? el.tagName.toLowerCase() : '?';
            const idStr = el.id ? '<span class="csi-id">#' + escapeHtml(el.id) + '</span>' : '';
            const fc = el.classList ? Array.from(el.classList).filter(function (c) {
                return c !== 'css-inspector-highlight' && c !== 'csi-highlight-match';
            }) : [];
            const cls = fc.map(function (c) {
                return '<span class="csi-class" data-classname="' + escapeHtml(c) + '">.' + escapeHtml(c) + '</span>';
            });

            let h = '';
            if (s.showBreadcrumbs) {
                h += buildBreadcrumbs(el);
            } else {
                breadcrumbMap = [];
            }

            h += '<div class="csi-row"><i class="fa-solid fa-code csi-icon"></i><span class="csi-tag">&lt;' + escapeHtml(tag) + '&gt;</span>' + idStr + '</div>';

            if (cls.length) {
                h += '<div class="csi-row"><i class="fa-solid fa-layer-group csi-icon"></i><div class="csi-classes">' + cls.join('<br>') + '</div></div>';
            } else {
                h += '<div class="csi-row csi-dim"><i class="fa-solid fa-layer-group csi-icon"></i> no classes</div>';
            }

            if (s.showDimensions) {
                const r = el.getBoundingClientRect();
                h += '<div class="csi-row csi-dim"><i class="fa-solid fa-ruler-combined csi-icon"></i> ' + Math.round(r.width) + ' x ' + Math.round(r.height) + 'px</div>';
            }

            if (s.showComputed) {
                const cs = getComputedStyle(el);
                h += '<div class="csi-row csi-dim"><i class="fa-solid fa-palette csi-icon"></i> color: ' + escapeHtml(cs.color) + '</div>';
                h += '<div class="csi-row csi-dim"><i class="fa-solid fa-font csi-icon"></i> ' + escapeHtml(cs.fontFamily.split(',')[0]) + ' / ' + escapeHtml(cs.fontSize) + '</div>';
                if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                    h += '<div class="csi-row csi-dim"><i class="fa-solid fa-fill-drip csi-icon"></i> bg: ' + escapeHtml(cs.backgroundColor) + '</div>';
                }
            }

            if (s.showBoxModel) {
                const bcs = getComputedStyle(el);
                h += '<div class="csi-boxmodel-title"><i class="fa-solid fa-vector-square"></i> Box Model</div>';
                h += '<div class="csi-box-row"><span class="csi-box-label-margin">margin: ' + escapeHtml(bcs.margin) + '</span></div>';
                h += '<div class="csi-box-row"><span class="csi-box-label-padding">padding: ' + escapeHtml(bcs.padding) + '</span></div>';
                h += '<div class="csi-box-row"><span class="csi-box-label-border">border: ' + escapeHtml(bcs.borderWidth) + '</span></div>';
            }

            if (s.showVariables) {
                const vars = extractCssVariables(el);
                const vk = Object.keys(vars);
                if (vk.length) {
                    h += '<div class="csi-vars-title"><i class="fa-solid fa-wand-magic-sparkles"></i> CSS Variables</div>';
                    vk.forEach(function (k) {
                        h += '<div class="csi-var-row"><span class="csi-var-prop">' + escapeHtml(vars[k].property) + '</span> <span class="csi-var-name">' + escapeHtml(k) + '</span> <span class="csi-var-value">' + escapeHtml(vars[k].resolved) + '</span></div>';
                    });
                }
            }

            const ml = { full: 'tag#id.class', classes: '.class only', id: '#id only', path: 'DOM path', css: 'CSS rule block' };
            const hint = isTouchDevice ? 'tap again to copy' : 'click to copy';
            h += '<div class="csi-hint"><i class="fa-solid fa-copy"></i> ' + hint + ' (' + escapeHtml(ml[s.copyMode] || s.copyMode) + ')</div>';
            if (s.showBreadcrumbs && breadcrumbMap.length > 1) {
                h += '<div class="csi-hint csi-hint-sub"><i class="fa-solid fa-arrow-up"></i> ' + (isPinned ? 'click breadcrumb to navigate' : 'pin first to use breadcrumbs') + '</div>';
            }
            return h;
        }

        tooltip.on('click', '.csi-class', function (e) {
            e.stopPropagation();
            const cn = $(this).attr('data-classname');
            if (cn) highlightAllWithClass(cn);
        });

        // Click on breadcrumb -> navigate inspector to that ancestor (only works in pinned mode
        // since tooltip has pointer-events:none otherwise)
        tooltip.on('click', '.csi-crumb', function (e) {
            e.stopPropagation();
            e.preventDefault();
            const idx = parseInt($(this).attr('data-crumb-idx'), 10);
            if (isNaN(idx) || !breadcrumbMap[idx]) return;
            const target = breadcrumbMap[idx];
            if (!target.isConnected) return;
            inspectElement(target);
            positionTooltipForEl(target);
        });

        // --- Copy selectors ---
        function getFullSelector(el) {
            const t = el.tagName.toLowerCase();
            const i = el.id ? '#' + el.id : '';
            const c = el.classList ? Array.from(el.classList).filter(function (x) { return x !== 'css-inspector-highlight' && x !== 'csi-highlight-match'; }).map(function (x) { return '.' + x; }).join('') : '';
            return t + i + c;
        }
        function getClassesOnly(el) {
            if (!el.classList || !el.classList.length) return el.tagName.toLowerCase();
            const c = Array.from(el.classList).filter(function (x) { return x !== 'css-inspector-highlight' && x !== 'csi-highlight-match'; }).map(function (x) { return '.' + x; }).join('');
            return c || el.tagName.toLowerCase();
        }
        function getIdOnly(el) { return el.id ? '#' + el.id : getFullSelector(el); }

        // Bug #10: nth-of-type for siblings without unique id/class
        // Bug #14: handle body/html as the inspected element itself
        function getDomPath(el) {
            if (!el || !el.tagName) return '';
            if (el === document.documentElement) return 'html';
            if (el === document.body) return 'body';

            const parts = [];
            let c = el;
            while (c && c !== document.body && c !== document.documentElement) {
                const t = c.tagName.toLowerCase();
                let segment = t;
                if (c.id) {
                    segment = t + '#' + c.id;
                    parts.unshift(segment);
                    break;
                }
                if (c.classList && c.classList.length) {
                    const f = Array.from(c.classList).filter(function (x) { return x !== 'css-inspector-highlight' && x !== 'csi-highlight-match'; })[0];
                    if (f) segment = t + '.' + f;
                }
                // Add nth-of-type if needed for disambiguation
                if (c.parentElement) {
                    const siblings = Array.from(c.parentElement.children).filter(function (s) { return s.tagName === c.tagName; });
                    if (siblings.length > 1) {
                        const idx = siblings.indexOf(c) + 1;
                        segment += ':nth-of-type(' + idx + ')';
                    }
                }
                parts.unshift(segment);
                c = c.parentElement;
            }
            return parts.length ? parts.join(' > ') : el.tagName.toLowerCase();
        }

        // Bug #11: build CSS block from matched rules + a few key inherited values
        function getCssBlock(el) {
            const sel = getFullSelector(el);
            const props = {};
            const rules = getMatchingRules(el);
            for (let i = 0; i < rules.length; i++) {
                const st = rules[i].style;
                if (!st) continue;
                for (let p = 0; p < st.length; p++) {
                    const name = st[p];
                    const val = st.getPropertyValue(name);
                    if (val) props[name] = val;
                }
            }
            const lines = [sel + ' {'];
            const keys = Object.keys(props).sort();
            if (keys.length === 0) {
                // Fallback to a minimal computed snapshot
                const cs = getComputedStyle(el);
                if (cs.color) lines.push('    color: ' + cs.color + ';');
                if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') lines.push('    background-color: ' + cs.backgroundColor + ';');
                if (cs.fontSize) lines.push('    font-size: ' + cs.fontSize + ';');
            } else {
                for (let k = 0; k < keys.length; k++) {
                    lines.push('    ' + keys[k] + ': ' + props[keys[k]] + ';');
                }
            }
            lines.push('}');
            return lines.join('\n');
        }

        function buildCopyText(el) {
            const m = getSettings().copyMode;
            if (m === 'classes') return getClassesOnly(el);
            if (m === 'id') return getIdOnly(el);
            if (m === 'path') return getDomPath(el);
            if (m === 'css') return getCssBlock(el);
            return getFullSelector(el);
        }

        // Bug #7: error handling + execCommand fallback
        function copyToClipboard(text) {
            return new Promise(function (resolve, reject) {
                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(text).then(resolve).catch(function (err) {
                        // Try fallback
                        if (legacyCopy(text)) resolve(); else reject(err);
                    });
                } else {
                    if (legacyCopy(text)) resolve(); else reject(new Error('Clipboard API unavailable'));
                }
            });
        }

        function legacyCopy(text) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.top = '-1000px';
                ta.style.left = '-1000px';
                ta.setAttribute('readonly', '');
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                return ok;
            } catch (e) {
                return false;
            }
        }

        function doCopy(el) {
            const txt = buildCopyText(el);
            copyToClipboard(txt).then(function () {
                if (getSettings().showToasts && typeof toastr !== 'undefined') {
                    toastr.success('Copied: ' + txt, MODULE_NAME);
                }
            }).catch(function (err) {
                console.warn('[CSS Inspector] Copy failed:', err);
                if (getSettings().showToasts && typeof toastr !== 'undefined') {
                    toastr.error('Copy failed: ' + (err && err.message ? err.message : 'unknown'), MODULE_NAME);
                }
            });
        }

        // --- Positioning (Bug #8: pageX/pageY already include scroll) ---
        function positionTooltip(px, py) {
            const tw = tooltip.outerWidth();
            const th = tooltip.outerHeight();
            const ww = $(window).width();
            const wh = $(window).height();
            const sx = window.scrollX, sy = window.scrollY;
            // px/py are pageX/pageY (already include scroll)
            let l = px + 15, t = py + 15;
            // Right boundary: viewport right edge in page coords = sx + ww
            if (l + tw > sx + ww) l = px - tw - 10;
            if (l < sx + 5) l = sx + 5;
            if (t + th > sy + wh) t = py - th - 10;
            if (t < sy + 5) t = sy + 5;
            tooltip.css({ left: l, top: t });
        }

        function positionTooltipForEl(el) {
            const r = el.getBoundingClientRect();
            const tw = tooltip.outerWidth();
            const th = tooltip.outerHeight();
            const ww = $(window).width();
            const wh = $(window).height();
            const sx = window.scrollX, sy = window.scrollY;
            let l = r.left + sx + (r.width / 2) - (tw / 2);
            let t = r.bottom + sy + 10;
            if (t + th > sy + wh) t = r.top + sy - th - 10;
            if (l < sx + 5) l = sx + 5;
            if (l + tw > sx + ww) l = sx + ww - tw - 5;
            if (t < sy + 5) t = sy + 5;
            tooltip.css({ left: l, top: t });
        }

        // --- Inspect element ---
        function inspectElement(el) {
            if (!el || !el.isConnected) return;
            const s = getSettings();
            if (lastEl && lastEl !== el && lastEl.classList && lastEl.isConnected) {
                lastEl.classList.remove('css-inspector-highlight');
            }
            el.classList.add('css-inspector-highlight');
            lastEl = el;
            tooltip.html(buildTooltip(el)).show();
            if (s.showBoxModel) showBoxModel(el); else hideBoxOverlays();
        }

        // --- rAF throttle wrapper (Bug #16) ---
        function rafThrottle(fn) {
            let scheduled = false;
            let lastArgs = null;
            return function () {
                lastArgs = arguments;
                if (scheduled) return;
                scheduled = true;
                requestAnimationFrame(function () {
                    scheduled = false;
                    fn.apply(null, lastArgs);
                });
            };
        }

        // --- FAB ---
        function setInspectorActive(val) {
            inspectorActive = val;
            fab.toggleClass('csi-fab-active', val);
            document.body.classList.toggle('csi-inspector-active', val);
            if (!val) {
                isPinned = false;
                tooltip.removeClass('csi-pinned');
                clearHighlight();
            }
        }

        function applyFabPosition() {
            const s = getSettings();
            // Bug #2: don't persist on load — just apply the saved value
            if (s.fabPosition && typeof s.fabPosition.left === 'number' && typeof s.fabPosition.top === 'number') {
                clampFabPosition(s.fabPosition.left, s.fabPosition.top, false);
            }
        }

        // Bug #14: clamp to viewport
        function clampFabPosition(left, top, persist) {
            const fw = fab.outerWidth() || 42;
            const fh = fab.outerHeight() || 42;
            const ww = $(window).width();
            const wh = $(window).height();
            const clampedL = Math.max(0, Math.min(left, ww - fw));
            const clampedT = Math.max(0, Math.min(top, wh - fh));
            fab.css({ left: clampedL, top: clampedT, right: 'auto', bottom: 'auto' });
            if (persist) {
                const s = getSettings();
                s.fabPosition = { left: clampedL, top: clampedT };
                saveSettingsDebounced();
            }
        }

        function showFab() { fab.removeClass('csi-fab-hidden'); applyTheme(); applyFabPosition(); }
        function hideFab() { fab.addClass('csi-fab-hidden'); setInspectorActive(false); }

        // === FAB DRAG ===
        let isDragging = false;
        let dragOff = { x: 0, y: 0 };
        let hasMoved = false;
        let touchHandled = false;

        // jQuery namespace for clean removal
        const NS = '.csi';

        fab.on('mousedown' + NS, function (e) {
            e.stopImmediatePropagation();
            e.preventDefault();
            isDragging = true;
            hasMoved = false;
            const r = fab[0].getBoundingClientRect();
            dragOff = { x: e.clientX - r.left, y: e.clientY - r.top };
            fab.addClass('csi-fab-dragging');
        });
        $(document).on('mousemove' + NS + 'fab', function (e) {
            if (!isDragging) return;
            hasMoved = true;
            // Don't persist mid-drag, just position
            const fw = fab.outerWidth() || 42;
            const fh = fab.outerHeight() || 42;
            const ww = $(window).width();
            const wh = $(window).height();
            const l = Math.max(0, Math.min(e.clientX - dragOff.x, ww - fw));
            const t = Math.max(0, Math.min(e.clientY - dragOff.y, wh - fh));
            fab.css({ left: l, top: t, right: 'auto', bottom: 'auto' });
        });
        $(document).on('mouseup' + NS + 'fab', function () {
            if (isDragging) {
                isDragging = false;
                fab.removeClass('csi-fab-dragging');
                if (hasMoved) {
                    // Persist final position
                    const r = fab[0].getBoundingClientRect();
                    clampFabPosition(r.left, r.top, true);
                }
            }
        });

        // Touch FAB drag
        let fabTouchId = null;
        function onFabTouchStart(e) {
            e.stopImmediatePropagation();
            e.preventDefault();
            const t = e.changedTouches[0];
            fabTouchId = t.identifier;
            isDragging = true;
            hasMoved = false;
            const r = fab[0].getBoundingClientRect();
            dragOff = { x: t.clientX - r.left, y: t.clientY - r.top };
            fab.addClass('csi-fab-dragging');
        }
        function onFabTouchMove(e) {
            if (!isDragging) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === fabTouchId) {
                    hasMoved = true;
                    const t = e.changedTouches[i];
                    const fw = fab.outerWidth() || 42;
                    const fh = fab.outerHeight() || 42;
                    const ww = $(window).width();
                    const wh = $(window).height();
                    const l = Math.max(0, Math.min(t.clientX - dragOff.x, ww - fw));
                    const tt = Math.max(0, Math.min(t.clientY - dragOff.y, wh - fh));
                    fab.css({ left: l, top: tt, right: 'auto', bottom: 'auto' });
                }
            }
        }
        function onFabTouchEnd(e) {
            if (!isDragging) return;
            isDragging = false;
            fab.removeClass('csi-fab-dragging');
            if (!hasMoved) {
                touchHandled = true;
                setInspectorActive(!inspectorActive);
            } else {
                const r = fab[0].getBoundingClientRect();
                clampFabPosition(r.left, r.top, true);
            }
            fabTouchId = null;
        }
        fab[0].addEventListener('touchstart', onFabTouchStart, { passive: false });
        fab[0].addEventListener('touchmove', onFabTouchMove, { passive: true });
        fab[0].addEventListener('touchend', onFabTouchEnd, { passive: true });
        fab[0].addEventListener('touchcancel', onFabTouchEnd, { passive: true });

        // FAB mouse click
        fab.on('click' + NS, function (e) {
            e.stopImmediatePropagation();
            e.preventDefault();
            if (touchHandled) { touchHandled = false; return; }
            if (hasMoved) return;
            setInspectorActive(!inspectorActive);
        });

        // Window resize: re-clamp fab into viewport
        const onResize = function () {
            const r = fab[0].getBoundingClientRect();
            clampFabPosition(r.left, r.top, false);
        };
        window.addEventListener('resize', onResize);

        // === MOUSE HANDLERS (with throttling for hot paths) ===
        const throttledHover = rafThrottle(function (target) {
            if (!getSettings().enabled || !inspectorActive || isPinned || isDragging) return;
            if (isInspectorEl(target)) return;
            inspectElement(target);
        });

        const throttledMove = rafThrottle(function (px, py) {
            if (!getSettings().enabled || !inspectorActive || isPinned || isDragging) return;
            positionTooltip(px, py);
        });

        const onMouseOver = function (e) { throttledHover(e.target); };
        const onMouseMove = function (e) { throttledMove(e.pageX, e.pageY); };
        const onMouseOut = function (e) {
            if (!getSettings().enabled || !inspectorActive || isPinned) return;
            // Bug #15: relatedTarget=null means cursor left the window — clear highlight
            if (e.relatedTarget && isInspectorEl(e.relatedTarget)) return;
            // Don't clear if leaving to enter another normal element (mouseover will re-trigger)
            if (e.relatedTarget) return;
            clearHighlight();
        };
        const onClick = function (e) {
            if (!getSettings().enabled || !inspectorActive) return;
            if (isInspectorEl(e.target)) return;
            e.preventDefault();
            e.stopPropagation();
            if (getSettings().clickLock && !isPinned) {
                isPinned = true;
                tooltip.addClass('csi-pinned');
                return;
            }
            if (isPinned) {
                isPinned = false;
                tooltip.removeClass('csi-pinned');
                doCopy(e.target);
                return;
            }
            doCopy(e.target);
        };
        const onContextMenu = function (e) {
            if (!getSettings().enabled || !inspectorActive) return;
            e.preventDefault();
            if (isPinned) {
                isPinned = false;
                tooltip.removeClass('csi-pinned');
                clearHighlight();
            }
        };
        // --- Hotkey matching ---
        function isTextEditTarget(target) {
            if (!target) return false;
            const tag = target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
            if (target.isContentEditable) return true;
            return false;
        }

        function hotkeyMatches(e, hk) {
            if (!hk || !hk.key) return false;
            if (Boolean(e.ctrlKey) !== Boolean(hk.ctrl)) return false;
            if (Boolean(e.shiftKey) !== Boolean(hk.shift)) return false;
            if (Boolean(e.altKey) !== Boolean(hk.alt)) return false;
            if (Boolean(e.metaKey) !== Boolean(hk.meta)) return false;
            // Compare key case-insensitively (handles Shift turning 'i' into 'I')
            return String(e.key).toLowerCase() === String(hk.key).toLowerCase();
        }

        // Pretty-print key names (Bug #15/#16)
        const KEY_DISPLAY_MAP = {
            ' ': 'Space',
            'arrowup': '↑',
            'arrowdown': '↓',
            'arrowleft': '←',
            'arrowright': '→',
            'escape': 'Esc',
            'enter': 'Enter',
            'tab': 'Tab',
            'backspace': 'Backspace',
            'delete': 'Del',
            'insert': 'Ins',
            'home': 'Home',
            'end': 'End',
            'pageup': 'PageUp',
            'pagedown': 'PageDown',
            'contextmenu': 'Menu',
        };

        function prettyKeyName(key) {
            if (key == null) return '';
            const lk = String(key).toLowerCase();
            if (KEY_DISPLAY_MAP[lk]) return KEY_DISPLAY_MAP[lk];
            // F1..F24
            if (/^f([1-9]|1\d|2[0-4])$/.test(lk)) return lk.toUpperCase();
            // Single character
            if (key.length === 1) return key.toUpperCase();
            // Capitalize first letter for anything else (e.g. "NumLock")
            return key.charAt(0).toUpperCase() + key.slice(1);
        }

        function formatHotkey(hk) {
            if (!hk || !hk.key) return '(none)';
            const parts = [];
            if (hk.ctrl) parts.push('Ctrl');
            if (hk.shift) parts.push('Shift');
            if (hk.alt) parts.push('Alt');
            if (hk.meta) parts.push('Meta');
            parts.push(prettyKeyName(hk.key));
            return parts.join('+');
        }

        const onKeyDown = function (e) {
            // Bug #19: ignore key repeat (holding the hotkey shouldn't spam toggles)
            if (e.repeat) return;

            const s = getSettings();

            // Toggle hotkey: only when extension is enabled and not typing
            if (s.enabled && !isTextEditTarget(e.target) && hotkeyMatches(e, s.hotkey)) {
                e.preventDefault();
                e.stopPropagation();
                setInspectorActive(!inspectorActive);
                if (s.showToasts && typeof toastr !== 'undefined') {
                    toastr.info(inspectorActive ? 'Inspector: ON' : 'Inspector: OFF', MODULE_NAME, { timeOut: 1000 });
                }
                return;
            }

            if (e.key === 'Escape' && (isPinned || inspectorActive)) {
                if (isPinned) {
                    isPinned = false;
                    tooltip.removeClass('csi-pinned');
                    clearHighlight();
                } else if (inspectorActive) {
                    setInspectorActive(false);
                }
            }
        };

        document.addEventListener('mouseover', onMouseOver, true);
        document.addEventListener('mousemove', onMouseMove, true);
        document.addEventListener('mouseout', onMouseOut, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('contextmenu', onContextMenu, true);
        document.addEventListener('keydown', onKeyDown, true);

        // === TOUCH HANDLERS (distinguish tap from scroll, Bug #22) ===
        const TAP_MOVE_THRESHOLD = 10; // px
        let touchStartInfo = null; // { x, y, el, moved }

        const onTouchStart = function (e) {
            const s = getSettings();
            if (!s.enabled || !inspectorActive || isDragging) {
                touchStartInfo = null;
                return;
            }
            if (!e.touches || !e.touches.length) return;

            const touch = e.touches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (!el || isInspectorEl(el)) {
                touchStartInfo = null;
                return;
            }

            // Remember touch point — don't preventDefault yet, allow scrolling
            touchStartInfo = { x: touch.clientX, y: touch.clientY, el: el, moved: false };
        };

        const onTouchMove = function (e) {
            if (!touchStartInfo || touchStartInfo.moved) return;
            if (!e.touches || !e.touches.length) return;
            const t = e.touches[0];
            const dx = Math.abs(t.clientX - touchStartInfo.x);
            const dy = Math.abs(t.clientY - touchStartInfo.y);
            if (dx > TAP_MOVE_THRESHOLD || dy > TAP_MOVE_THRESHOLD) {
                touchStartInfo.moved = true; // it's a scroll/swipe
            }
        };

        const onTouchEnd = function (e) {
            const info = touchStartInfo;
            touchStartInfo = null;
            if (!info || info.moved) return; // was a scroll, not a tap

            const s = getSettings();
            if (!s.enabled || !inspectorActive) return;

            const el = info.el;
            if (!el || !el.isConnected || isInspectorEl(el)) return;

            // It's a tap — now prevent any default click that would follow
            e.preventDefault();
            e.stopPropagation();

            // Pinned + tap -> copy & release
            if (isPinned && lastEl && lastEl.isConnected) {
                isPinned = false;
                tooltip.removeClass('csi-pinned');
                doCopy(lastEl);
                clearHighlight();
                return;
            }

            // Tap same element again with clickLock -> pin
            if (s.clickLock && lastEl === el && tooltip.is(':visible')) {
                isPinned = true;
                tooltip.addClass('csi-pinned');
                return;
            }

            // Tap same element again without clickLock -> copy
            if (!s.clickLock && lastEl === el && tooltip.is(':visible')) {
                doCopy(el);
                return;
            }

            inspectElement(el);
            positionTooltipForEl(el);
        };

        const onTouchCancel = function () { touchStartInfo = null; };

        document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
        document.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
        document.addEventListener('touchend', onTouchEnd, { passive: false, capture: true });
        document.addEventListener('touchcancel', onTouchCancel, { capture: true });

        // === SETTINGS UI ===
        const earlyS = getSettings();
        if (earlyS.enabled) showFab(); else hideFab();

        let settingsHtml;
        try { settingsHtml = await $.get(extPath + '/settings.html'); } catch (e) { settingsHtml = ''; }

        if (settingsHtml) {
            const rp = $('#extensions_settings2');
            const lp = $('#extensions_settings');
            if (rp.length) rp.append(settingsHtml);
            else if (lp.length) lp.append(settingsHtml);
        }

        function loadUI() {
            const s = getSettings();
            $('#css_inspector_enabled').prop('checked', s.enabled);
            $('#css_inspector_theme').val(s.theme);
            $('#css_inspector_copy_mode').val(s.copyMode);
            $('#css_inspector_show_dimensions').prop('checked', s.showDimensions);
            $('#css_inspector_show_computed').prop('checked', s.showComputed);
            $('#css_inspector_show_vars').prop('checked', s.showVariables);
            $('#css_inspector_show_boxmodel').prop('checked', s.showBoxModel);
            $('#css_inspector_click_lock').prop('checked', s.clickLock);
            $('#css_inspector_show_toasts').prop('checked', s.showToasts);
            $('#css_inspector_show_breadcrumbs').prop('checked', s.showBreadcrumbs);
            $('#css_inspector_hotkey_input').val(formatHotkey(s.hotkey));
        }

        function bindCb(sel, key) {
            $(sel).on('input' + NS, function (e) {
                const s = getSettings();
                s[key] = Boolean($(e.target).prop('checked'));
                saveSettingsDebounced();
                if (key === 'enabled') {
                    if (s.enabled) showFab(); else hideFab();
                }
            });
        }

        bindCb('#css_inspector_enabled', 'enabled');
        bindCb('#css_inspector_show_dimensions', 'showDimensions');
        bindCb('#css_inspector_show_computed', 'showComputed');
        bindCb('#css_inspector_show_vars', 'showVariables');
        bindCb('#css_inspector_show_boxmodel', 'showBoxModel');
        bindCb('#css_inspector_click_lock', 'clickLock');
        bindCb('#css_inspector_show_toasts', 'showToasts');
        bindCb('#css_inspector_show_breadcrumbs', 'showBreadcrumbs');

        // --- Hotkey capture: focus field, then press a combo ---
        let hotkeyCapturing = false;
        const $hkInput = $('#css_inspector_hotkey_input');

        function setHotkeyDisplay() {
            const s = getSettings();
            $hkInput.val(formatHotkey(s.hotkey));
        }

        $hkInput.on('focus' + NS, function () {
            hotkeyCapturing = true;
            $hkInput.val('Press keys...').addClass('csi-hotkey-capturing');
        });
        $hkInput.on('blur' + NS, function () {
            hotkeyCapturing = false;
            $hkInput.removeClass('csi-hotkey-capturing');
            setHotkeyDisplay();
        });
        $hkInput.on('keydown' + NS, function (e) {
            if (!hotkeyCapturing) return;
            if (e.repeat) { e.preventDefault(); return; }
            // Ignore lone modifier presses
            const onlyModifier = (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta');
            e.preventDefault();
            e.stopPropagation();
            if (onlyModifier) return;
            if (e.key === 'Escape') {
                // Cancel without changing
                $hkInput.blur();
                return;
            }
            const s = getSettings();
            s.hotkey = {
                ctrl: !!e.ctrlKey,
                shift: !!e.shiftKey,
                alt: !!e.altKey,
                meta: !!e.metaKey,
                key: String(e.key).toLowerCase(),
            };
            saveSettingsDebounced();
            $hkInput.blur();
        });
        $('#css_inspector_hotkey_clear').on('click' + NS, function () {
            const s = getSettings();
            s.hotkey = { ctrl: false, shift: false, alt: false, meta: false, key: '' };
            saveSettingsDebounced();
            setHotkeyDisplay();
        });
        $('#css_inspector_hotkey_reset').on('click' + NS, function () {
            const s = getSettings();
            s.hotkey = { ctrl: false, shift: false, alt: true, meta: false, key: 'i' };
            saveSettingsDebounced();
            setHotkeyDisplay();
        });

        $('#css_inspector_theme').on('change' + NS, function (e) {
            const s = getSettings();
            s.theme = $(e.target).val();
            saveSettingsDebounced();
            applyTheme();
        });
        $('#css_inspector_copy_mode').on('change' + NS, function (e) {
            const s = getSettings();
            s.copyMode = $(e.target).val();
            saveSettingsDebounced();
        });
        $('#css_inspector_reset_pos').on('click' + NS, function () {
            fab.css({ left: '', top: '', right: '15px', bottom: '' });
            const s = getSettings();
            s.fabPosition = null;
            saveSettingsDebounced();
        });

        loadUI();
        applyTheme();

        // --- Dispose / cleanup function (Bug #2) ---
        window.__cssInspectorDispose = function () {
            try {
                document.removeEventListener('mouseover', onMouseOver, true);
                document.removeEventListener('mousemove', onMouseMove, true);
                document.removeEventListener('mouseout', onMouseOut, true);
                document.removeEventListener('click', onClick, true);
                document.removeEventListener('contextmenu', onContextMenu, true);
                document.removeEventListener('keydown', onKeyDown, true);
                document.removeEventListener('touchstart', onTouchStart, { capture: true });
                document.removeEventListener('touchmove', onTouchMove, { capture: true });
                document.removeEventListener('touchend', onTouchEnd, { capture: true });
                document.removeEventListener('touchcancel', onTouchCancel, { capture: true });
                window.removeEventListener('resize', onResize);
                if (fab[0]) {
                    fab[0].removeEventListener('touchstart', onFabTouchStart);
                    fab[0].removeEventListener('touchmove', onFabTouchMove);
                    fab[0].removeEventListener('touchend', onFabTouchEnd);
                    fab[0].removeEventListener('touchcancel', onFabTouchEnd);
                }
                $(document).off(NS + 'fab');
                fab.off(NS);
                tooltip.off();
                // Settings UI handlers (in case settings panel persists across reloads)
                $('#css_inspector_enabled, #css_inspector_show_dimensions, #css_inspector_show_computed, ' +
                  '#css_inspector_show_vars, #css_inspector_show_boxmodel, #css_inspector_click_lock, ' +
                  '#css_inspector_show_toasts, #css_inspector_show_breadcrumbs, #css_inspector_theme, ' +
                  '#css_inspector_copy_mode, #css_inspector_reset_pos, #css_inspector_hotkey_input, ' +
                  '#css_inspector_hotkey_clear, #css_inspector_hotkey_reset').off(NS);
                $('#css_inspector_tooltip, #css_inspector_fab, .csi-box-margin, .csi-box-padding').remove();
                $('.css-inspector-highlight').removeClass('css-inspector-highlight');
                $('.csi-highlight-match').removeClass('csi-highlight-match');
                document.body.classList.remove('csi-inspector-active');
                window.__cssInspectorInitialized = false;
            } catch (e) {
                console.error('[CSS Inspector] Cleanup error:', e);
            }
        };

    } catch (error) {
        console.error('[CSS Inspector] CRASH:', error);
        if (typeof toastr !== 'undefined') {
            toastr.error('CRASH: ' + (error && error.message ? error.message : String(error)), 'CSS Inspector');
        }
    }
});
