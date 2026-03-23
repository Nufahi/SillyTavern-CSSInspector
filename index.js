const MODULE_NAME = 'css-class-inspector';
const extPath = 'scripts/extensions/third-party/' + MODULE_NAME;

jQuery(async function() {
    try {
        var context = SillyTavern.getContext();
        var extensionSettings = context.extensionSettings;
        var saveSettingsDebounced = context.saveSettingsDebounced;

        var defaultSettings = Object.freeze({
            enabled: false,
            theme: 'dark',
            copyMode: 'full',
            showDimensions: true,
            showComputed: false,
            showVariables: true,
            showBoxModel: false,
            clickLock: true,
            showToasts: true,
        });

        function getSettings() {
            var _lodash = (SillyTavern.libs && SillyTavern.libs.lodash) ? SillyTavern.libs.lodash : null;
            var _merge = _lodash ? _lodash.merge : function(a, b) { return Object.assign({}, a, b || {}); };
            extensionSettings[MODULE_NAME] = _merge(
                JSON.parse(JSON.stringify(defaultSettings)),
                extensionSettings[MODULE_NAME]
            );
            return extensionSettings[MODULE_NAME];
        }

        var isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        // --- Tooltip ---
        var tooltip = $('<div id="css_inspector_tooltip"></div>');
        $('body').append(tooltip);

        // --- FAB bubble ---
        var fab = $('<div id="css_inspector_fab" title="CSS Inspector"><i class="fa-solid fa-crosshairs"></i></div>');
        $('body').append(fab);

        // --- Box model overlays ---
        var boxMarginEls = [];
        var boxPaddingEls = [];

        function createBoxOverlays() {
            for (var i = 0; i < 4; i++) {
                var m = $('<div class="csi-box-margin"></div>');
                var p = $('<div class="csi-box-padding"></div>');
                $('body').append(m).append(p);
                boxMarginEls.push(m);
                boxPaddingEls.push(p);
            }
        }
        createBoxOverlays();

        function hideBoxOverlays() {
            for (var i = 0; i < 4; i++) {
                boxMarginEls[i].hide();
                boxPaddingEls[i].hide();
            }
        }
        hideBoxOverlays();

        function showBoxModel(el) {
            var cs = getComputedStyle(el);
            var rect = el.getBoundingClientRect();
            var sx = window.scrollX;
            var sy = window.scrollY;

            var mt = parseFloat(cs.marginTop) || 0;
            var mr = parseFloat(cs.marginRight) || 0;
            var mb = parseFloat(cs.marginBottom) || 0;
            var ml = parseFloat(cs.marginLeft) || 0;

            var pt = parseFloat(cs.paddingTop) || 0;
            var pr = parseFloat(cs.paddingRight) || 0;
            var pb = parseFloat(cs.paddingBottom) || 0;
            var pl = parseFloat(cs.paddingLeft) || 0;

            boxMarginEls[0].css({ left: rect.left + sx - ml, top: rect.top + sy - mt, width: rect.width + ml + mr, height: mt }).show();
            boxMarginEls[1].css({ left: rect.right + sx, top: rect.top + sy, width: mr, height: rect.height }).show();
            boxMarginEls[2].css({ left: rect.left + sx - ml, top: rect.bottom + sy, width: rect.width + ml + mr, height: mb }).show();
            boxMarginEls[3].css({ left: rect.left + sx - ml, top: rect.top + sy, width: ml, height: rect.height }).show();

            var bt = parseFloat(cs.borderTopWidth) || 0;
            var brw = parseFloat(cs.borderRightWidth) || 0;
            var bb = parseFloat(cs.borderBottomWidth) || 0;
            var blw = parseFloat(cs.borderLeftWidth) || 0;

            var innerLeft = rect.left + sx + blw;
            var innerTop = rect.top + sy + bt;
            var innerW = rect.width - blw - brw;
            var innerH = rect.height - bt - bb;

            boxPaddingEls[0].css({ left: innerLeft, top: innerTop, width: innerW, height: pt }).show();
            boxPaddingEls[1].css({ left: innerLeft + innerW - pr, top: innerTop + pt, width: pr, height: innerH - pt - pb }).show();
            boxPaddingEls[2].css({ left: innerLeft, top: innerTop + innerH - pb, width: innerW, height: pb }).show();
            boxPaddingEls[3].css({ left: innerLeft, top: innerTop + pt, width: pl, height: innerH - pt - pb }).show();
        }

        function applyTheme() {
            var settings = getSettings();
            if (settings.theme === 'light') {
                tooltip.addClass('csi-theme-light');
                fab.addClass('csi-fab-light');
            } else {
                tooltip.removeClass('csi-theme-light');
                fab.removeClass('csi-fab-light');
            }
        }

        // --- CSS Variables detection ---
        function getMatchingRules(el) {
            var matched = [];
            try {
                var sheets = document.styleSheets;
                for (var s = 0; s < sheets.length; s++) {
                    var rules;
                    try { rules = sheets[s].cssRules || sheets[s].rules; }
                    catch(e) { continue; }
                    if (!rules) continue;
                    for (var r = 0; r < rules.length; r++) {
                        var rule = rules[r];
                        if (!rule.selectorText) continue;
                        try {
                            if (el.matches(rule.selectorText)) {
                                matched.push(rule);
                            }
                        } catch(e) {}
                    }
                }
            } catch(e) {}
            return matched;
        }

        function extractCssVariables(el) {
            var varMap = {};
            var rules = getMatchingRules(el);
            var varRegex = /var\(\s*(--.+?)\s*(?:,|\))/g;

            for (var i = 0; i < rules.length; i++) {
                var rule = rules[i];
                var style = rule.style;
                for (var p = 0; p < style.length; p++) {
                    var prop = style[p];
                    var val = style.getPropertyValue(prop);
                    var match;
                    varRegex.lastIndex = 0;
                    while ((match = varRegex.exec(val)) !== null) {
                        var varName = match[1].trim();
                        if (!varMap[varName]) {
                            var resolved = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
                            varMap[varName] = { property: prop, resolved: resolved || '(unset)' };
                        }
                    }
                }
            }

            if (el.style && el.style.cssText) {
                var inlineText = el.style.cssText;
                var match2;
                varRegex.lastIndex = 0;
                while ((match2 = varRegex.exec(inlineText)) !== null) {
                    var vn = match2[1].trim();
                    if (!varMap[vn]) {
                        var res = getComputedStyle(document.documentElement).getPropertyValue(vn).trim();
                        varMap[vn] = { property: 'inline', resolved: res || '(unset)' };
                    }
                }
            }

            return varMap;
        }

        // --- Highlight All Matching ---
        var matchHighlighted = [];

        function clearMatchHighlights() {
            for (var i = 0; i < matchHighlighted.length; i++) {
                matchHighlighted[i].classList.remove('csi-highlight-match');
            }
            matchHighlighted = [];
        }

        function highlightAllWithClass(className) {
            clearMatchHighlights();
            var els = document.querySelectorAll('.' + className);
            var count = 0;
            for (var i = 0; i < els.length; i++) {
                if (!isInspectorElement(els[i])) {
                    els[i].classList.add('csi-highlight-match');
                    matchHighlighted.push(els[i]);
                    count++;
                }
            }
            if (getSettings().showToasts) toastr.info(count + ' elements with .' + className, MODULE_NAME);
        }

        // ========================================
        // --- FAB Drag (mouse + touch) ---
        // ========================================
        var isDragging = false;
        var dragOffset = { x: 0, y: 0 };
        var hasMoved = false;

        function fabDragStart(clientX, clientY) {
            isDragging = true;
            hasMoved = false;
            var rect = fab[0].getBoundingClientRect();
            dragOffset.x = clientX - rect.left;
            dragOffset.y = clientY - rect.top;
            fab.addClass('csi-fab-dragging');
        }

        function fabDragMove(clientX, clientY) {
            if (!isDragging) return;
            hasMoved = true;
            fab.css({
                left: clientX - dragOffset.x,
                top: clientY - dragOffset.y,
                right: 'auto',
                bottom: 'auto',
            });
        }

        function fabDragEnd() {
            if (isDragging) {
                isDragging = false;
                fab.removeClass('csi-fab-dragging');
            }
        }

        // Mouse drag
        fab.on('mousedown', function(e) {
            e.stopImmediatePropagation();
            e.preventDefault();
            fabDragStart(e.clientX, e.clientY);
        });

        $(document).on('mousemove.csifab', function(e) {
            fabDragMove(e.clientX, e.clientY);
        });

        $(document).on('mouseup.csifab', function() {
            fabDragEnd();
        });

        // Touch drag
        fab[0].addEventListener('touchstart', function(e) {
            e.stopImmediatePropagation();
            e.preventDefault();
            var t = e.touches[0];
            fabDragStart(t.clientX, t.clientY);
        }, { passive: false });

        document.addEventListener('touchmove', function(e) {
            if (!isDragging) return;
            var t = e.touches[0];
            fabDragMove(t.clientX, t.clientY);
        }, { passive: true });

        document.addEventListener('touchend', function(e) {
            if (isDragging) {
                fabDragEnd();
                // If it was just a tap (no drag), toggle inspector
                if (!hasMoved) {
                    toggleFab();
                }
            }
        }, { passive: true });

        // --- Inspector state ---
        var lastHighlighted = null;
        var isPinned = false;

        function isInspectorElement(el) {
            if (!el) return true;
            return el.id === 'css_inspector_tooltip'
                || el.id === 'css_inspector_fab'
                || !!el.closest('#css_inspector_tooltip')
                || !!el.closest('#css_inspector_fab');
        }

        function buildTooltipContent(el) {
            var settings = getSettings();
            var tag = el.tagName.toLowerCase();
            var id = el.id ? '<span class="csi-id">#' + el.id + '</span>' : '';
            var filteredClasses = el.classList
                ? Array.from(el.classList).filter(function(c) {
                    return c !== 'css-inspector-highlight' && c !== 'csi-highlight-match';
                })
                : [];
            var classes = filteredClasses.map(function(c) {
                return '<span class="csi-class" data-classname="' + c + '">.' + c + '</span>';
            });

            var html = '<div class="csi-row">'
                + '<i class="fa-solid fa-code csi-icon"></i>'
                + '<span class="csi-tag">&lt;' + tag + '&gt;</span>' + id
                + '</div>';

            if (classes.length) {
                html += '<div class="csi-row">'
                    + '<i class="fa-solid fa-layer-group csi-icon"></i>'
                    + '<div class="csi-classes">' + classes.join('<br>') + '</div>'
                    + '</div>';
            } else {
                html += '<div class="csi-row csi-dim">'
                    + '<i class="fa-solid fa-layer-group csi-icon"></i> no classes'
                    + '</div>';
            }

            if (settings.showDimensions) {
                var rect = el.getBoundingClientRect();
                html += '<div class="csi-row csi-dim">'
                    + '<i class="fa-solid fa-ruler-combined csi-icon"></i> '
                    + Math.round(rect.width) + ' x ' + Math.round(rect.height) + 'px'
                    + '</div>';
            }

            if (settings.showComputed) {
                var cs = getComputedStyle(el);
                html += '<div class="csi-row csi-dim">'
                    + '<i class="fa-solid fa-palette csi-icon"></i> color: ' + cs.color
                    + '</div>';
                html += '<div class="csi-row csi-dim">'
                    + '<i class="fa-solid fa-font csi-icon"></i> '
                    + cs.fontFamily.split(',')[0] + ' / ' + cs.fontSize
                    + '</div>';
                if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                    html += '<div class="csi-row csi-dim">'
                        + '<i class="fa-solid fa-fill-drip csi-icon"></i> bg: ' + cs.backgroundColor
                        + '</div>';
                }
            }

            if (settings.showBoxModel) {
                var bcs = getComputedStyle(el);
                html += '<div class="csi-boxmodel-title">'
                    + '<i class="fa-solid fa-vector-square"></i> Box Model'
                    + '</div>';
                html += '<div class="csi-box-row">'
                    + '<span class="csi-box-label-margin">margin: ' + bcs.margin + '</span>'
                    + '</div>';
                html += '<div class="csi-box-row">'
                    + '<span class="csi-box-label-padding">padding: ' + bcs.padding + '</span>'
                    + '</div>';
                html += '<div class="csi-box-row">'
                    + '<span class="csi-box-label-border">border: ' + bcs.borderWidth + '</span>'
                    + '</div>';
            }

            if (settings.showVariables) {
                var vars = extractCssVariables(el);
                var varKeys = Object.keys(vars);
                if (varKeys.length > 0) {
                    html += '<div class="csi-vars-title">'
                        + '<i class="fa-solid fa-wand-magic-sparkles"></i> CSS Variables'
                        + '</div>';
                    for (var v = 0; v < varKeys.length; v++) {
                        var varName = varKeys[v];
                        var info = vars[varName];
                        html += '<div class="csi-var-row">'
                            + '<span class="csi-var-prop">' + info.property + '</span> '
                            + '<span class="csi-var-name">' + varName + '</span> '
                            + '<span class="csi-var-value">' + info.resolved + '</span>'
                            + '</div>';
                    }
                }
            }

            var modeLabels = {
                full: 'tag#id.class',
                classes: '.class only',
                id: '#id only',
                path: 'DOM path',
                css: 'CSS rule block'
            };
            var modeLabel = modeLabels[settings.copyMode] || settings.copyMode;

            var touchHint = isTouchDevice
                ? '<i class="fa-solid fa-hand-pointer"></i> tap again to copy (' + modeLabel + ')'
                : '<i class="fa-solid fa-copy"></i> click to copy (' + modeLabel + ')';

            html += '<div class="csi-hint">' + touchHint + '</div>';

            return html;
        }

        // Click on class in tooltip => highlight all matching
        tooltip.on('click', '.csi-class', function(e) {
            e.stopPropagation();
            var className = $(this).attr('data-classname');
            if (className) {
                highlightAllWithClass(className);
            }
        });

        // --- Copy mode selectors ---
        function getFullSelector(el) {
            var tag = el.tagName.toLowerCase();
            var id = el.id ? '#' + el.id : '';
            var classes = el.classList
                ? Array.from(el.classList)
                    .filter(function(c) { return c !== 'css-inspector-highlight' && c !== 'csi-highlight-match'; })
                    .map(function(c) { return '.' + c; })
                    .join('')
                : '';
            return tag + id + classes;
        }

        function getClassesOnly(el) {
            if (!el.classList || el.classList.length === 0) return el.tagName.toLowerCase();
            var classes = Array.from(el.classList)
                .filter(function(c) { return c !== 'css-inspector-highlight' && c !== 'csi-highlight-match'; })
                .map(function(c) { return '.' + c; })
                .join('');
            return classes || el.tagName.toLowerCase();
        }

        function getIdOnly(el) {
            if (el.id) return '#' + el.id;
            return getFullSelector(el);
        }

        function getDomPath(el) {
            var path = [];
            var current = el;
            while (current && current !== document.body && current !== document.documentElement) {
                var tag = current.tagName.toLowerCase();
                var id = current.id ? '#' + current.id : '';
                var cls = '';
                if (!id && current.classList && current.classList.length) {
                    var first = Array.from(current.classList)
                        .filter(function(c) { return c !== 'css-inspector-highlight' && c !== 'csi-highlight-match'; })[0];
                    if (first) cls = '.' + first;
                }
                path.unshift(tag + id + cls);
                if (current.id) break;
                current = current.parentElement;
            }
            return path.join(' > ');
        }

        function getCssBlock(el) {
            var selector = getFullSelector(el);
            var cs = getComputedStyle(el);
            var lines = [selector + ' {'];
            if (cs.color) lines.push('    color: ' + cs.color + ';');
            if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                lines.push('    background-color: ' + cs.backgroundColor + ';');
            }
            if (cs.fontSize) lines.push('    font-size: ' + cs.fontSize + ';');
            if (cs.fontFamily) lines.push('    font-family: ' + cs.fontFamily + ';');
            if (cs.padding !== '0px') lines.push('    padding: ' + cs.padding + ';');
            if (cs.margin !== '0px') lines.push('    margin: ' + cs.margin + ';');
            if (cs.borderRadius !== '0px') lines.push('    border-radius: ' + cs.borderRadius + ';');
            lines.push('}');
            return lines.join('\n');
        }

        function buildCopyText(el) {
            var settings = getSettings();
            switch (settings.copyMode) {
                case 'classes': return getClassesOnly(el);
                case 'id': return getIdOnly(el);
                case 'path': return getDomPath(el);
                case 'css': return getCssBlock(el);
                case 'full':
                default: return getFullSelector(el);
            }
        }

        function clearHighlight() {
            if (lastHighlighted) {
                lastHighlighted.classList.remove('css-inspector-highlight');
                lastHighlighted = null;
            }
            tooltip.hide();
            hideBoxOverlays();
            clearMatchHighlights();
        }

        function disableInspector() {
            isPinned = false;
            tooltip.removeClass('csi-pinned');
            clearHighlight();
            fab.addClass('csi-fab-hidden');
            fab.removeClass('csi-fab-active');
        }

        function enableInspector() {
            fab.removeClass('csi-fab-hidden');
            applyTheme();
        }

        function positionTooltip(x, y) {
            var tw = tooltip.outerWidth();
            var th = tooltip.outerHeight();
            var ww = $(window).width();
            var wh = $(window).height();
            var scrollX = window.scrollX;
            var scrollY = window.scrollY;

            var left = x + 15;
            var top = y + 15;

            if (left + tw > ww + scrollX) left = x - tw - 10;
            if (left < scrollX + 5) left = scrollX + 5;
            if (top + th > wh + scrollY) top = y - th - 10;
            if (top < scrollY + 5) top = scrollY + 5;

            tooltip.css({ left: left, top: top });
        }

        // For touch: position tooltip centered below/above tap
        function positionTooltipTouch(el) {
            var rect = el.getBoundingClientRect();
            var tw = tooltip.outerWidth();
            var th = tooltip.outerHeight();
            var ww = $(window).width();
            var wh = $(window).height();
            var scrollX = window.scrollX;
            var scrollY = window.scrollY;

            // Center horizontally relative to element
            var left = rect.left + scrollX + (rect.width / 2) - (tw / 2);
            // Below element by default
            var top = rect.bottom + scrollY + 10;

            // If overflows bottom, put above
            if (top + th > wh + scrollY) {
                top = rect.top + scrollY - th - 10;
            }
            // Clamp
            if (left < scrollX + 5) left = scrollX + 5;
            if (left + tw > ww + scrollX) left = ww + scrollX - tw - 5;
            if (top < scrollY + 5) top = scrollY + 5;

            tooltip.css({ left: left, top: top });
        }

        function toggleFab() {
            var isActive = fab.hasClass('csi-fab-active');
            fab.toggleClass('csi-fab-active', !isActive);
            if (isActive) {
                isPinned = false;
                tooltip.removeClass('csi-pinned');
                clearHighlight();
            }
        }

        // ========================================
        // --- MOUSE handlers (desktop) ---
        // ========================================
        function onMouseOver(e) {
            var settings = getSettings();
            if (!settings.enabled || isPinned || isDragging) return;
            if (!fab.hasClass('csi-fab-active')) return;
            var el = e.target;
            if (isInspectorElement(el)) return;
            if (lastHighlighted && lastHighlighted !== el) {
                lastHighlighted.classList.remove('css-inspector-highlight');
            }
            el.classList.add('css-inspector-highlight');
            lastHighlighted = el;
            tooltip.html(buildTooltipContent(el));
            tooltip.show();
            if (settings.showBoxModel) showBoxModel(el);
            else hideBoxOverlays();
        }

        function onMouseMove(e) {
            var settings = getSettings();
            if (!settings.enabled || isPinned || isDragging) return;
            if (!fab.hasClass('csi-fab-active')) return;
            positionTooltip(e.pageX, e.pageY);
        }

        function onMouseOut(e) {
            var settings = getSettings();
            if (!settings.enabled || isPinned) return;
            if (!fab.hasClass('csi-fab-active')) return;
            if (isInspectorElement(e.relatedTarget)) return;
            clearHighlight();
        }

        function onClick(e) {
            var settings = getSettings();
            if (!settings.enabled) return;
            if (!fab.hasClass('csi-fab-active')) return;
            if (isInspectorElement(e.target)) return;

            if (settings.clickLock && !isPinned) {
                e.preventDefault();
                e.stopPropagation();
                isPinned = true;
                tooltip.addClass('csi-pinned');
                return;
            }

            if (isPinned) {
                e.preventDefault();
                e.stopPropagation();
                isPinned = false;
                tooltip.removeClass('csi-pinned');

                var copyText = buildCopyText(e.target);
                navigator.clipboard.writeText(copyText).then(function() {
                    if (getSettings().showToasts) toastr.success('Copied: ' + copyText, MODULE_NAME);
                });
                return;
            }

            var copyText = buildCopyText(e.target);
            navigator.clipboard.writeText(copyText);
        }

        function onContextMenu(e) {
            var settings = getSettings();
            if (!settings.enabled) return;
            if (!fab.hasClass('csi-fab-active')) return;
            e.preventDefault();
            if (isPinned) {
                isPinned = false;
                tooltip.removeClass('csi-pinned');
                clearHighlight();
            }
        }

        function onKeyDown(e) {
            if (e.key === 'Escape' && isPinned) {
                isPinned = false;
                tooltip.removeClass('csi-pinned');
                clearHighlight();
            }
        }

        document.addEventListener('mouseover', onMouseOver, true);
        document.addEventListener('mousemove', onMouseMove, true);
        document.addEventListener('mouseout', onMouseOut, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('contextmenu', onContextMenu, true);
        document.addEventListener('keydown', onKeyDown, true);

        // ========================================
        // --- TOUCH handlers (mobile) ---
        // ========================================
        var touchInspectEl = null;

        document.addEventListener('touchstart', function(e) {
            var settings = getSettings();
            if (!settings.enabled) return;
            if (!fab.hasClass('csi-fab-active')) return;
            if (isDragging) return;

            var touch = e.touches[0];
            var el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (!el || isInspectorElement(el)) return;

            e.preventDefault();

            // If pinned and tapping outside tooltip => copy and unpin
            if (isPinned && lastHighlighted) {
                isPinned = false;
                tooltip.removeClass('csi-pinned');

                var copyText = buildCopyText(lastHighlighted);
                navigator.clipboard.writeText(copyText).then(function() {
                    if (getSettings().showToasts) toastr.success('Copied: ' + copyText, MODULE_NAME);
                });
                clearHighlight();
                return;
            }

            // If same element tapped again => pin it
            if (settings.clickLock && lastHighlighted === el && tooltip.is(':visible')) {
                isPinned = true;
                tooltip.addClass('csi-pinned');
                return;
            }

            // New element: highlight and show tooltip
            if (lastHighlighted && lastHighlighted !== el) {
                lastHighlighted.classList.remove('css-inspector-highlight');
            }
            el.classList.add('css-inspector-highlight');
            lastHighlighted = el;
            touchInspectEl = el;
            tooltip.html(buildTooltipContent(el));
            tooltip.show();
            positionTooltipTouch(el);

            if (settings.showBoxModel) showBoxModel(el);
            else hideBoxOverlays();

        }, { passive: false, capture: true });

        // --- FAB click (mouse) ---
        fab.on('click', function(e) {
            e.stopImmediatePropagation();
            e.preventDefault();
            if (hasMoved) return;
            toggleFab();
        });

        // --- Settings UI ---
        function loadSettingsUI() {
            var settings = getSettings();
            $('#css_inspector_enabled').prop('checked', settings.enabled);
            $('#css_inspector_theme').val(settings.theme);
            $('#css_inspector_copy_mode').val(settings.copyMode);
            $('#css_inspector_show_dimensions').prop('checked', settings.showDimensions);
            $('#css_inspector_show_computed').prop('checked', settings.showComputed);
            $('#css_inspector_show_vars').prop('checked', settings.showVariables);
            $('#css_inspector_show_boxmodel').prop('checked', settings.showBoxModel);
            $('#css_inspector_click_lock').prop('checked', settings.clickLock);
            $('#css_inspector_show_toasts').prop('checked', settings.showToasts);

            if (settings.enabled) {
                enableInspector();
            } else {
                disableInspector();
            }
            applyTheme();
        }

        function bindCheckbox(selector, key) {
            $(selector).on('input', function(e) {
                var settings = getSettings();
                settings[key] = Boolean($(e.target).prop('checked'));
                saveSettingsDebounced();
                if (key === 'enabled') {
                    if (settings.enabled) {
                        enableInspector();
                    } else {
                        disableInspector();
                    }
                }
            });
        }

        // Early FAB init — don't wait for settings HTML
        var earlySettings = getSettings();
        if (earlySettings.enabled) {
            enableInspector();
        } else {
            disableInspector();
        }

        var settingsHtml = await $.get(extPath + '/settings.html');

        var rightPanel = $('#extensions_settings2');
        var leftPanel = $('#extensions_settings');

        if (rightPanel.length) {
            rightPanel.append(settingsHtml);
        } else if (leftPanel.length) {
            leftPanel.append(settingsHtml);
        }

        bindCheckbox('#css_inspector_enabled', 'enabled');
        bindCheckbox('#css_inspector_show_dimensions', 'showDimensions');
        bindCheckbox('#css_inspector_show_computed', 'showComputed');
        bindCheckbox('#css_inspector_show_vars', 'showVariables');
        bindCheckbox('#css_inspector_show_boxmodel', 'showBoxModel');
        bindCheckbox('#css_inspector_click_lock', 'clickLock');
        bindCheckbox('#css_inspector_show_toasts', 'showToasts');

        $('#css_inspector_theme').on('change', function(e) {
            var settings = getSettings();
            settings.theme = $(e.target).val();
            saveSettingsDebounced();
            applyTheme();
        });

        $('#css_inspector_copy_mode').on('change', function(e) {
            var settings = getSettings();
            settings.copyMode = $(e.target).val();
            saveSettingsDebounced();
        });

        $('#css_inspector_reset_pos').on('click', function() {
            fab.css({
                left: '',
                top: '',
                right: '20px',
                bottom: '80px',
            });
        });

        loadSettingsUI();

    } catch (error) {
        if (typeof toastr !== 'undefined') toastr.error('CRASH: ' + (error && error.message ? error.message : String(error)), MODULE_NAME); console.error('[CSS Inspector] CRASH:', error);
    }
});
