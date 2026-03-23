const MODULE_NAME = 'SillyTavern-CSSInspector';
const extPath = 'scripts/extensions/third-party/' + MODULE_NAME;

jQuery(async function() {
    try {
        var context = SillyTavern.getContext();
        var extensionSettings = context.extensionSettings;
        var saveSettingsDebounced = context.saveSettingsDebounced;

        var defaultSettings = {
            enabled: false,
            theme: 'dark',
            copyMode: 'full',
            showDimensions: true,
            showComputed: false,
            showVariables: true,
            showBoxModel: false,
            clickLock: true,
            showToasts: true,
        };

        function deepMerge(target, source) {
            if (!source) return target;
            var result = {};
            for (var key in target) {
                if (target.hasOwnProperty(key)) {
                    result[key] = (source.hasOwnProperty(key)) ? source[key] : target[key];
                }
            }
            return result;
        }

        function getSettings() {
            extensionSettings[MODULE_NAME] = deepMerge(defaultSettings, extensionSettings[MODULE_NAME]);
            return extensionSettings[MODULE_NAME];
        }

        var isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        // --- Core DOM elements ---
        var tooltip = $('<div id="css_inspector_tooltip"></div>');
        $('body').append(tooltip);

        var fab = $('<div id="css_inspector_fab" title="CSS Inspector"><i class="fa-solid fa-crosshairs"></i></div>');
        $('body').append(fab);

        // --- Box model overlays ---
        var boxMarginEls = [], boxPaddingEls = [];
        for (var bi = 0; bi < 4; bi++) {
            var bm = $('<div class="csi-box-margin"></div>');
            var bp = $('<div class="csi-box-padding"></div>');
            $('body').append(bm).append(bp);
            boxMarginEls.push(bm);
            boxPaddingEls.push(bp);
        }

        function hideBoxOverlays() {
            for (var i = 0; i < 4; i++) { boxMarginEls[i].hide(); boxPaddingEls[i].hide(); }
        }
        hideBoxOverlays();

        function showBoxModel(el) {
            var cs = getComputedStyle(el), rect = el.getBoundingClientRect();
            var sx = window.scrollX, sy = window.scrollY;
            var mt = parseFloat(cs.marginTop)||0, mr = parseFloat(cs.marginRight)||0;
            var mb = parseFloat(cs.marginBottom)||0, ml = parseFloat(cs.marginLeft)||0;
            var pt = parseFloat(cs.paddingTop)||0, pr = parseFloat(cs.paddingRight)||0;
            var pb = parseFloat(cs.paddingBottom)||0, pl = parseFloat(cs.paddingLeft)||0;
            var bt = parseFloat(cs.borderTopWidth)||0, brw = parseFloat(cs.borderRightWidth)||0;
            var bb = parseFloat(cs.borderBottomWidth)||0, blw = parseFloat(cs.borderLeftWidth)||0;

            boxMarginEls[0].css({left:rect.left+sx-ml,top:rect.top+sy-mt,width:rect.width+ml+mr,height:mt}).show();
            boxMarginEls[1].css({left:rect.right+sx,top:rect.top+sy,width:mr,height:rect.height}).show();
            boxMarginEls[2].css({left:rect.left+sx-ml,top:rect.bottom+sy,width:rect.width+ml+mr,height:mb}).show();
            boxMarginEls[3].css({left:rect.left+sx-ml,top:rect.top+sy,width:ml,height:rect.height}).show();

            var il=rect.left+sx+blw, it=rect.top+sy+bt, iw=rect.width-blw-brw, ih=rect.height-bt-bb;
            boxPaddingEls[0].css({left:il,top:it,width:iw,height:pt}).show();
            boxPaddingEls[1].css({left:il+iw-pr,top:it+pt,width:pr,height:ih-pt-pb}).show();
            boxPaddingEls[2].css({left:il,top:it+ih-pb,width:iw,height:pb}).show();
            boxPaddingEls[3].css({left:il,top:it+pt,width:pl,height:ih-pt-pb}).show();
        }

        // --- Theme ---
        function applyTheme() {
            var s = getSettings();
            tooltip.toggleClass('csi-theme-light', s.theme === 'light');
            fab.toggleClass('csi-fab-light', s.theme === 'light');
        }

        // --- CSS Variables ---
        function getMatchingRules(el) {
            var matched = [];
            try {
                for (var s = 0; s < document.styleSheets.length; s++) {
                    var rules;
                    try { rules = document.styleSheets[s].cssRules; } catch(e) { continue; }
                    if (!rules) continue;
                    for (var r = 0; r < rules.length; r++) {
                        if (!rules[r].selectorText) continue;
                        try { if (el.matches(rules[r].selectorText)) matched.push(rules[r]); } catch(e) {}
                    }
                }
            } catch(e) {}
            return matched;
        }

        function extractCssVariables(el) {
            var varMap = {}, rules = getMatchingRules(el);
            var re = /var\(\s*(--.+?)\s*(?:,|\))/g;
            for (var i = 0; i < rules.length; i++) {
                var st = rules[i].style;
                for (var p = 0; p < st.length; p++) {
                    var val = st.getPropertyValue(st[p]), m;
                    re.lastIndex = 0;
                    while ((m = re.exec(val)) !== null) {
                        var vn = m[1].trim();
                        if (!varMap[vn]) {
                            var rv = getComputedStyle(document.documentElement).getPropertyValue(vn).trim();
                            varMap[vn] = { property: st[p], resolved: rv || '(unset)' };
                        }
                    }
                }
            }
            return varMap;
        }

        // --- Highlight matching ---
        var matchHighlighted = [];
        function clearMatchHighlights() {
            matchHighlighted.forEach(function(e) { e.classList.remove('csi-highlight-match'); });
            matchHighlighted = [];
        }
        function highlightAllWithClass(cn) {
            clearMatchHighlights();
            var els = document.querySelectorAll('.' + cn), count = 0;
            for (var i = 0; i < els.length; i++) {
                if (!isInspectorEl(els[i])) { els[i].classList.add('csi-highlight-match'); matchHighlighted.push(els[i]); count++; }
            }
            if (getSettings().showToasts) toastr.info(count + ' elements with .' + cn, MODULE_NAME);
        }

        // --- State ---
        var lastEl = null, isPinned = false, inspectorActive = false;

        function isInspectorEl(el) {
            if (!el) return true;
            return el.id === 'css_inspector_tooltip' || el.id === 'css_inspector_fab'
                || !!el.closest('#css_inspector_tooltip') || !!el.closest('#css_inspector_fab');
        }

        function clearHighlight() {
            if (lastEl) { lastEl.classList.remove('css-inspector-highlight'); lastEl = null; }
            tooltip.hide(); hideBoxOverlays(); clearMatchHighlights();
        }

        // --- Tooltip content ---
        function buildTooltip(el) {
            var s = getSettings(), tag = el.tagName.toLowerCase();
            var id = el.id ? '<span class="csi-id">#' + el.id + '</span>' : '';
            var fc = el.classList ? Array.from(el.classList).filter(function(c) {
                return c !== 'css-inspector-highlight' && c !== 'csi-highlight-match';
            }) : [];
            var cls = fc.map(function(c) {
                return '<span class="csi-class" data-classname="' + c + '">.' + c + '</span>';
            });

            var h = '<div class="csi-row"><i class="fa-solid fa-code csi-icon"></i><span class="csi-tag">&lt;' + tag + '&gt;</span>' + id + '</div>';

            if (cls.length) {
                h += '<div class="csi-row"><i class="fa-solid fa-layer-group csi-icon"></i><div class="csi-classes">' + cls.join('<br>') + '</div></div>';
            } else {
                h += '<div class="csi-row csi-dim"><i class="fa-solid fa-layer-group csi-icon"></i> no classes</div>';
            }

            if (s.showDimensions) {
                var r = el.getBoundingClientRect();
                h += '<div class="csi-row csi-dim"><i class="fa-solid fa-ruler-combined csi-icon"></i> ' + Math.round(r.width) + ' x ' + Math.round(r.height) + 'px</div>';
            }

            if (s.showComputed) {
                var cs = getComputedStyle(el);
                h += '<div class="csi-row csi-dim"><i class="fa-solid fa-palette csi-icon"></i> color: ' + cs.color + '</div>';
                h += '<div class="csi-row csi-dim"><i class="fa-solid fa-font csi-icon"></i> ' + cs.fontFamily.split(',')[0] + ' / ' + cs.fontSize + '</div>';
                if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                    h += '<div class="csi-row csi-dim"><i class="fa-solid fa-fill-drip csi-icon"></i> bg: ' + cs.backgroundColor + '</div>';
                }
            }

            if (s.showBoxModel) {
                var bcs = getComputedStyle(el);
                h += '<div class="csi-boxmodel-title"><i class="fa-solid fa-vector-square"></i> Box Model</div>';
                h += '<div class="csi-box-row"><span class="csi-box-label-margin">margin: ' + bcs.margin + '</span></div>';
                h += '<div class="csi-box-row"><span class="csi-box-label-padding">padding: ' + bcs.padding + '</span></div>';
                h += '<div class="csi-box-row"><span class="csi-box-label-border">border: ' + bcs.borderWidth + '</span></div>';
            }

            if (s.showVariables) {
                var vars = extractCssVariables(el), vk = Object.keys(vars);
                if (vk.length) {
                    h += '<div class="csi-vars-title"><i class="fa-solid fa-wand-magic-sparkles"></i> CSS Variables</div>';
                    vk.forEach(function(k) {
                        h += '<div class="csi-var-row"><span class="csi-var-prop">' + vars[k].property + '</span> <span class="csi-var-name">' + k + '</span> <span class="csi-var-value">' + vars[k].resolved + '</span></div>';
                    });
                }
            }

            var ml = {full:'tag#id.class',classes:'.class only',id:'#id only',path:'DOM path',css:'CSS rule block'};
            var hint = isTouchDevice ? 'tap again to copy' : 'click to copy';
            h += '<div class="csi-hint"><i class="fa-solid fa-copy"></i> ' + hint + ' (' + (ml[s.copyMode]||s.copyMode) + ')</div>';
            return h;
        }

        tooltip.on('click', '.csi-class', function(e) {
            e.stopPropagation();
            var cn = $(this).attr('data-classname');
            if (cn) highlightAllWithClass(cn);
        });

        // --- Copy selectors ---
        function getFullSelector(el) {
            var t = el.tagName.toLowerCase(), i = el.id ? '#'+el.id : '';
            var c = el.classList ? Array.from(el.classList).filter(function(x){return x!=='css-inspector-highlight'&&x!=='csi-highlight-match';}).map(function(x){return '.'+x;}).join('') : '';
            return t+i+c;
        }
        function getClassesOnly(el) {
            if (!el.classList||!el.classList.length) return el.tagName.toLowerCase();
            var c = Array.from(el.classList).filter(function(x){return x!=='css-inspector-highlight'&&x!=='csi-highlight-match';}).map(function(x){return '.'+x;}).join('');
            return c || el.tagName.toLowerCase();
        }
        function getIdOnly(el) { return el.id ? '#'+el.id : getFullSelector(el); }
        function getDomPath(el) {
            var p=[],c=el;
            while(c&&c!==document.body&&c!==document.documentElement) {
                var t=c.tagName.toLowerCase(),i=c.id?'#'+c.id:'',cl='';
                if(!i&&c.classList&&c.classList.length){var f=Array.from(c.classList).filter(function(x){return x!=='css-inspector-highlight'&&x!=='csi-highlight-match';})[0];if(f)cl='.'+f;}
                p.unshift(t+i+cl); if(c.id)break; c=c.parentElement;
            }
            return p.join(' > ');
        }
        function getCssBlock(el) {
            var sel=getFullSelector(el),cs=getComputedStyle(el),l=[sel+' {'];
            if(cs.color)l.push('    color: '+cs.color+';');
            if(cs.backgroundColor!=='rgba(0, 0, 0, 0)')l.push('    background-color: '+cs.backgroundColor+';');
            if(cs.fontSize)l.push('    font-size: '+cs.fontSize+';');
            if(cs.fontFamily)l.push('    font-family: '+cs.fontFamily+';');
            if(cs.padding!=='0px')l.push('    padding: '+cs.padding+';');
            if(cs.margin!=='0px')l.push('    margin: '+cs.margin+';');
            if(cs.borderRadius!=='0px')l.push('    border-radius: '+cs.borderRadius+';');
            l.push('}'); return l.join('\n');
        }
        function buildCopyText(el) {
            var m=getSettings().copyMode;
            if(m==='classes')return getClassesOnly(el);if(m==='id')return getIdOnly(el);
            if(m==='path')return getDomPath(el);if(m==='css')return getCssBlock(el);
            return getFullSelector(el);
        }

        function doCopy(el) {
            var txt = buildCopyText(el);
            navigator.clipboard.writeText(txt).then(function() {
                if (getSettings().showToasts) toastr.success('Copied: ' + txt, MODULE_NAME);
            });
        }

        // --- Positioning ---
        function positionTooltip(px, py) {
            var tw=tooltip.outerWidth(),th=tooltip.outerHeight();
            var ww=$(window).width(),wh=$(window).height();
            var sx=window.scrollX,sy=window.scrollY;
            var l=px+15,t=py+15;
            if(l+tw>ww+sx)l=px-tw-10; if(l<sx+5)l=sx+5;
            if(t+th>wh+sy)t=py-th-10; if(t<sy+5)t=sy+5;
            tooltip.css({left:l,top:t});
        }

        function positionTooltipForEl(el) {
            var r=el.getBoundingClientRect(),tw=tooltip.outerWidth(),th=tooltip.outerHeight();
            var ww=$(window).width(),wh=$(window).height();
            var sx=window.scrollX,sy=window.scrollY;
            var l=r.left+sx+(r.width/2)-(tw/2), t=r.bottom+sy+10;
            if(t+th>wh+sy)t=r.top+sy-th-10;
            if(l<sx+5)l=sx+5; if(l+tw>ww+sx)l=ww+sx-tw-5;
            if(t<sy+5)t=sy+5;
            tooltip.css({left:l,top:t});
        }

        // --- Inspect element ---
        function inspectElement(el) {
            var s = getSettings();
            if (lastEl && lastEl !== el) lastEl.classList.remove('css-inspector-highlight');
            el.classList.add('css-inspector-highlight');
            lastEl = el;
            tooltip.html(buildTooltip(el)).show();
            if (s.showBoxModel) showBoxModel(el); else hideBoxOverlays();
        }

        // --- FAB ---
        function setInspectorActive(val) {
            inspectorActive = val;
            fab.toggleClass('csi-fab-active', val);
            if (!val) { isPinned = false; tooltip.removeClass('csi-pinned'); clearHighlight(); }
        }

        function showFab() { fab.removeClass('csi-fab-hidden'); applyTheme(); }
        function hideFab() { fab.addClass('csi-fab-hidden'); setInspectorActive(false); }

        // === FAB DRAG ===
        var isDragging = false, dragOff = {x:0,y:0}, hasMoved = false, touchHandled = false;

        fab.on('mousedown', function(e) {
            e.stopImmediatePropagation(); e.preventDefault();
            isDragging = true; hasMoved = false;
            var r = fab[0].getBoundingClientRect();
            dragOff = {x:e.clientX-r.left, y:e.clientY-r.top};
            fab.addClass('csi-fab-dragging');
        });
        $(document).on('mousemove.csifab', function(e) {
            if(!isDragging)return; hasMoved=true;
            fab.css({left:e.clientX-dragOff.x,top:e.clientY-dragOff.y,right:'auto',bottom:'auto'});
        });
        $(document).on('mouseup.csifab', function() {
            if(isDragging){isDragging=false;fab.removeClass('csi-fab-dragging');}
        });

        // Touch FAB drag
        var fabTouchId = null;
        fab[0].addEventListener('touchstart', function(e) {
            e.stopImmediatePropagation(); e.preventDefault();
            var t = e.changedTouches[0];
            fabTouchId = t.identifier;
            isDragging = true; hasMoved = false;
            var r = fab[0].getBoundingClientRect();
            dragOff = {x:t.clientX-r.left, y:t.clientY-r.top};
            fab.addClass('csi-fab-dragging');
        }, {passive:false});

        fab[0].addEventListener('touchmove', function(e) {
            if(!isDragging)return;
            for(var i=0;i<e.changedTouches.length;i++){
                if(e.changedTouches[i].identifier===fabTouchId){
                    hasMoved=true;
                    var t=e.changedTouches[i];
                    fab.css({left:t.clientX-dragOff.x,top:t.clientY-dragOff.y,right:'auto',bottom:'auto'});
                }
            }
        }, {passive:true});

        fab[0].addEventListener('touchend', function(e) {
            if(!isDragging)return;
            isDragging=false; fab.removeClass('csi-fab-dragging');
            if(!hasMoved) { touchHandled=true; setInspectorActive(!inspectorActive); }
        }, {passive:true});

        // FAB mouse click
        fab.on('click', function(e) {
            e.stopImmediatePropagation(); e.preventDefault();
            if(touchHandled){touchHandled=false;return;}
            if(hasMoved)return;
            setInspectorActive(!inspectorActive);
        });

        // === MOUSE HANDLERS ===
        document.addEventListener('mouseover', function(e) {
            if(!getSettings().enabled||!inspectorActive||isPinned||isDragging)return;
            if(isInspectorEl(e.target))return;
            inspectElement(e.target);
        }, true);

        document.addEventListener('mousemove', function(e) {
            if(!getSettings().enabled||!inspectorActive||isPinned||isDragging)return;
            positionTooltip(e.pageX, e.pageY);
        }, true);

        document.addEventListener('mouseout', function(e) {
            if(!getSettings().enabled||!inspectorActive||isPinned)return;
            if(isInspectorEl(e.relatedTarget))return;
            clearHighlight();
        }, true);

        document.addEventListener('click', function(e) {
            if(!getSettings().enabled||!inspectorActive)return;
            if(isInspectorEl(e.target))return;
            e.preventDefault(); e.stopPropagation();
            if(getSettings().clickLock && !isPinned) {
                isPinned=true; tooltip.addClass('csi-pinned'); return;
            }
            if(isPinned) { isPinned=false; tooltip.removeClass('csi-pinned'); doCopy(e.target); return; }
            doCopy(e.target);
        }, true);

        document.addEventListener('contextmenu', function(e) {
            if(!getSettings().enabled||!inspectorActive)return;
            e.preventDefault();
            if(isPinned){isPinned=false;tooltip.removeClass('csi-pinned');clearHighlight();}
        }, true);

        document.addEventListener('keydown', function(e) {
            if(e.key==='Escape'&&isPinned){isPinned=false;tooltip.removeClass('csi-pinned');clearHighlight();}
        }, true);

        // === TOUCH HANDLERS ===
        document.addEventListener('touchstart', function(e) {
            var s = getSettings();
            if (!s.enabled || !inspectorActive || isDragging) return;

            var touch = e.touches[0];
            var el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (!el || isInspectorEl(el)) return;

            e.preventDefault();
            e.stopPropagation();

            if (isPinned && lastEl) {
                isPinned = false;
                tooltip.removeClass('csi-pinned');
                doCopy(lastEl);
                clearHighlight();
                return;
            }

            if (s.clickLock && lastEl === el && tooltip.is(':visible')) {
                isPinned = true;
                tooltip.addClass('csi-pinned');
                return;
            }

            inspectElement(el);
            positionTooltipForEl(el);
        }, {passive:false, capture:true});

        // === SETTINGS UI ===
        var earlyS = getSettings();
        if (earlyS.enabled) showFab(); else hideFab();

        var settingsHtml;
        try { settingsHtml = await $.get(extPath + '/settings.html'); } catch(e) { settingsHtml = ''; }

        if (settingsHtml) {
            var rp = $('#extensions_settings2'), lp = $('#extensions_settings');
            if (rp.length) rp.append(settingsHtml);
            else if (lp.length) lp.append(settingsHtml);
        }

        function loadUI() {
            var s = getSettings();
            $('#css_inspector_enabled').prop('checked', s.enabled);
            $('#css_inspector_theme').val(s.theme);
            $('#css_inspector_copy_mode').val(s.copyMode);
            $('#css_inspector_show_dimensions').prop('checked', s.showDimensions);
            $('#css_inspector_show_computed').prop('checked', s.showComputed);
            $('#css_inspector_show_vars').prop('checked', s.showVariables);
            $('#css_inspector_show_boxmodel').prop('checked', s.showBoxModel);
            $('#css_inspector_click_lock').prop('checked', s.clickLock);
            $('#css_inspector_show_toasts').prop('checked', s.showToasts);
        }

        function bindCb(sel, key) {
            $(sel).on('input', function(e) {
                var s=getSettings(); s[key]=Boolean($(e.target).prop('checked'));
                saveSettingsDebounced();
                if(key==='enabled'){if(s.enabled)showFab();else hideFab();}
            });
        }

        bindCb('#css_inspector_enabled','enabled');
        bindCb('#css_inspector_show_dimensions','showDimensions');
        bindCb('#css_inspector_show_computed','showComputed');
        bindCb('#css_inspector_show_vars','showVariables');
        bindCb('#css_inspector_show_boxmodel','showBoxModel');
        bindCb('#css_inspector_click_lock','clickLock');
        bindCb('#css_inspector_show_toasts','showToasts');

        $('#css_inspector_theme').on('change', function(e) {
            var s=getSettings(); s.theme=$(e.target).val(); saveSettingsDebounced(); applyTheme();
        });
        $('#css_inspector_copy_mode').on('change', function(e) {
            var s=getSettings(); s.copyMode=$(e.target).val(); saveSettingsDebounced();
        });
        $('#css_inspector_reset_pos').on('click', function() {
            fab.css({left:'',top:'',right:'15px',bottom:''});
        });

        loadUI();

    } catch(error) {
        console.error('[CSS Inspector] CRASH:', error);
        if(typeof toastr!=='undefined') toastr.error('CRASH: '+(error&&error.message?error.message:String(error)), 'CSS Inspector');
    }
});
