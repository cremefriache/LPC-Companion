import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import {
    createIcon,
    createLuciteIcon,
    createSectionHeader,
    createField,
    createToggleRow,
    createButton,
    decorateButton,
    decorateIconButton,
    createSegmentedTabs,
    createChip,
    createAccordion,
    createItemRow,
    createPopover,
    createControlGroup,
    createBlockerBanner,
} from '../src/presentation/molecules.mjs';

const ROOT = new URL('../', import.meta.url);

function createMockDocument() {
    const listeners = new Map();
    const makeNode = tag => {
        const attrs = new Map();
        const classes = new Set();
        const syncClassSet = raw => {
            classes.clear();
            for (const token of String(raw ?? '').split(/\s+/).filter(Boolean)) classes.add(token);
        };
        const node = {
            tagName: String(tag).toUpperCase(),
            dataset: {},
            style: {},
            children: [],
            hidden: false,
            disabled: false,
            checked: false,
            open: false,
            tabIndex: 0,
            title: '',
            textContent: '',
            get className() {
                return [...classes].join(' ');
            },
            set className(value) {
                syncClassSet(value);
                attrs.set('class', [...classes].join(' '));
            },
            classList: {
                add(...tokens) {
                    for (const t of tokens) if (t) classes.add(t);
                    attrs.set('class', [...classes].join(' '));
                },
                remove(...tokens) {
                    for (const t of tokens) classes.delete(t);
                    attrs.set('class', [...classes].join(' '));
                },
                toggle(token, force) {
                    const next = force === undefined ? !classes.has(token) : Boolean(force);
                    if (next) classes.add(token);
                    else classes.delete(token);
                    attrs.set('class', [...classes].join(' '));
                    return next;
                },
                contains(token) {
                    return classes.has(token);
                },
            },
            setAttribute(key, value) {
                attrs.set(key, String(value));
                if (key === 'class') syncClassSet(value);
            },
            getAttribute(key) {
                return attrs.get(key) ?? null;
            },
            append(...items) {
                for (const item of items) {
                    if (typeof item === 'string') {
                        const text = makeNode('#text');
                        text.textContent = item;
                        node.children.push(text);
                    } else if (item) {
                        item.parentElement = node;
                        node.children.push(item);
                    }
                }
            },
            prepend(...items) {
                const converted = items.filter(Boolean).map(item => {
                    if (typeof item === 'string') {
                        const text = makeNode('#text');
                        text.textContent = item;
                        return text;
                    }
                    item.parentElement = node;
                    return item;
                });
                node.children.unshift(...converted);
            },
            replaceChildren(...items) {
                node.children = [];
                node.append(...items);
            },
            querySelectorAll(selector) {
                const out = [];
                const visit = current => {
                    for (const child of current.children ?? []) {
                        if (selector === '.lpc-svg-icon' && child.classList?.contains('lpc-svg-icon')) out.push(child);
                        visit(child);
                    }
                };
                visit(node);
                return out;
            },
            contains(target) {
                if (target === node) return true;
                return (node.children ?? []).some(child => child.contains?.(target));
            },
            getBoundingClientRect() {
                return { left: 40, top: 40, right: 120, bottom: 72, width: 80, height: 32 };
            },
            focus() {
                doc.activeElement = node;
            },
            remove() {
                if (node.parentElement) {
                    node.parentElement.children = node.parentElement.children.filter(c => c !== node);
                }
            },
        };
        return node;
    };
    const doc = {
        activeElement: null,
        defaultView: { innerWidth: 1180, innerHeight: 900 },
        createElement: tag => makeNode(tag),
        createElementNS: (_ns, tag) => makeNode(tag),
        addEventListener(type, fn) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
        },
        removeEventListener(type, fn) {
            listeners.get(type)?.delete(fn);
        },
        listenerCount(type) {
            return listeners.get(type)?.size ?? 0;
        },
        emit(type, event) {
            for (const fn of [...(listeners.get(type) ?? [])]) fn(event);
        },
    };
    return doc;
}

test('extension/style.css obeys UI_CONTRACT.md tokens, zero raw component colors, and zero !important drift', async () => {
    const rawCss = await readFile(new URL('extension/style.css', ROOT), 'utf8');
    const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

    const requiredTokens = [
        '--lpc-space-1', '--lpc-space-2', '--lpc-space-3', '--lpc-space-4', '--lpc-space-5', '--lpc-space-6',
        '--lpc-text-xs', '--lpc-text-sm', '--lpc-text-md', '--lpc-text-base', '--lpc-text-lg',
        '--lpc-radius-xs', '--lpc-radius-sm', '--lpc-radius-md', '--lpc-radius-lg', '--lpc-radius-pill',
        '--lpc-control-xs', '--lpc-control-sm', '--lpc-control-md', '--lpc-control-touch',
        '--lpc-z-launcher', '--lpc-z-panel', '--lpc-z-studio', '--lpc-z-popover',
        '--lpc-bg-primary', '--lpc-bg-secondary', '--lpc-bg-tertiary', '--lpc-control-bg',
        '--lpc-disabled-bg', '--lpc-disabled-ink', '--lpc-disabled-border',
        '--lpc-tone-ready', '--lpc-tone-warn', '--lpc-tone-danger', '--lpc-stage-fallback',
    ];
    const rootBlockMatch = css.match(/\.lpc-companion\s*,\s*\.lpc-floating-launcher\s*\{([^}]*)\}/);
    assert.ok(rootBlockMatch, 'Expected shared root token block at top of extension/style.css');
    const rootTokens = rootBlockMatch[1];
    for (const token of requiredTokens) {
        assert.ok(rootTokens.includes(`${token}:`), `Missing canonical UI token ${token}`);
    }

    const componentCss = css.replace(rootBlockMatch[0], '');
    const rawColorHits = componentCss.match(/#[0-9a-fA-F]{3,8}\b|%23[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/g) ?? [];
    assert.deepEqual(rawColorHits, [], `Forbidden raw color literals outside root token block: ${rawColorHits.join(', ')}`);

    const importantRules = [...css.matchAll(/([^{}]+)\{([^{}]*!important[^{}]*)\}/g)].map(([full, selector]) => ({
        selector: selector.trim(),
        full: full.trim(),
    }));
    assert.ok(importantRules.length > 0 && importantRules.length <= 2, `Unexpected !important rule count: ${importantRules.length}`);
    for (const rule of importantRules) {
        const permitted = /\[hidden\]/.test(rule.selector) || /::(?:before|after)/.test(rule.selector);
        assert.ok(permitted, `Disallowed component !important in selector: ${rule.selector}`);
    }

    assert.equal(/transition\s*:[^;]*background(?:-color)?/i.test(css), false, 'Controls must not transition background-color across SmartTheme changes');
    assert.equal(/[▾▴★✓]/.test(css), false, 'CSS must use vector masks/gradients rather than Unicode dingbats');
    for (const variant of ['primary', 'secondary', 'outline', 'ghost', 'destructive']) {
        assert.ok(css.includes(`[data-variant=${variant}]`), `Missing button variant rule: ${variant}`);
    }
    for (const size of ['xs', 'sm', 'md']) {
        assert.ok(css.includes(`[data-size=${size}]`), `Missing control size rule: ${size}`);
    }
    assert.ok(css.includes('.lpc-field:has(:disabled)') && css.includes('.lpc-field.is-disabled'));
    assert.ok(css.includes('image-rendering: pixelated'));
});

test('src/presentation modules contain zero test-global branches, remote URLs, or dingbat glyphs', async () => {
    const presentationDir = new URL('src/presentation/', ROOT);
    const files = (await readdir(presentationDir)).filter(name => name.endsWith('.mjs')).sort();
    assert.ok(files.length >= 15);
    for (const name of files) {
        const source = await readFile(new URL(name, presentationDir), 'utf8');
        assert.equal(/\b(?:window|globalThis)\.(?:testHost|review)\b/.test(source), false, `${name} must not branch on window.testHost or window.review`);
        const urls = (source.match(/https?:\/\/[^\s'")`]+/g) ?? []).filter(url => url !== 'http://www.w3.org/2000/svg');
        assert.deepEqual(urls, [], `${name} must not reference remote URLs: ${urls.join(', ')}`);
        assert.equal(/[▾▴★✓]/.test(source), false, `${name} must use molecules.mjs vector icons instead of Unicode dingbats`);
    }
    const entrySource = await readFile(new URL('src/index.mjs', ROOT), 'utf8');
    assert.equal(/\b(?:window|globalThis)\.(?:testHost|review)\b/.test(entrySource), false);
});

test('molecules.mjs primitives expose accessible roles, variants, keyboard tabs, disabled reasons, and disposable popovers', () => {
    const doc = createMockDocument();

    const icon = createIcon(doc, 'sparkles');
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.equal(icon.getAttribute('stroke-width'), '1.85');
    const well = createLuciteIcon(doc, 'shirt', 'lpc-lucite-icon-sm');
    assert.equal(well.getAttribute('aria-hidden'), 'true');

    const header = createSectionHeader(doc, { icon: 'sparkles', title: 'Wardrobe', subtitle: 'Curated & source layers', badge: 'Ready', badgeTone: 'ready' });
    assert.equal(header.heading.textContent, 'Wardrobe');
    assert.equal(header.badge.dataset.tone, 'ready');

    const selectNode = doc.createElement('select');
    const field = createField(doc, { label: 'Resting posture', controlNode: selectNode, control: 'posture', hint: 'Saved per chat' });
    assert.equal(field.input.dataset.control, 'posture');
    assert.equal(field.reason.hidden, true);
    field.setDisabled(true, 'Blocked by equipped cape');
    assert.equal(field.input.disabled, true);
    assert.equal(field.wrap.classList.contains('is-disabled'), true);
    assert.equal(field.reason.hidden, false);
    assert.equal(field.reason.textContent, 'Blocked by equipped cape');
    field.setDisabled(false);
    assert.equal(field.input.disabled, false);
    assert.equal(field.wrap.classList.contains('is-disabled'), false);
    assert.equal(field.reason.hidden, true);

    const toggle = createToggleRow(doc, { control: 'share-context', title: 'Share appearance', hint: 'Read-only prompt summary', icon: 'bot', checked: true, disabled: true });
    assert.equal(toggle.input.checked, true);
    assert.equal(toggle.wrap.classList.contains('is-disabled'), true);

    for (const variant of ['primary', 'secondary', 'outline', 'ghost', 'destructive']) {
        const btn = createButton(doc, { label: variant, icon: 'sparkles', variant, size: 'sm', control: `btn-${variant}` });
        assert.equal(btn.dataset.variant, variant);
        assert.equal(btn.dataset.size, 'sm');
        assert.equal(btn.dataset.control, `btn-${variant}`);
    }
    const rawBtn = doc.createElement('button');
    decorateButton(doc, rawBtn, 'check', 'Apply', { variant: 'primary', size: 'md' });
    assert.equal(rawBtn.dataset.variant, 'primary');
    decorateIconButton(doc, rawBtn, 'x', 'Close');
    assert.equal(rawBtn.getAttribute('aria-label'), 'Close');

    const selectedTabs = [];
    const tabs = createSegmentedTabs(doc, {
        tabs: [
            { id: 'equipped', label: 'Wearing (4)' },
            { id: 'closet', label: 'Closet (2)' },
            { id: 'presets', label: 'Presets' },
        ],
        activeId: 'equipped',
        onSelect: id => selectedTabs.push(id),
    });
    assert.equal(tabs.element.getAttribute('role'), 'tablist');
    assert.equal(tabs.buttons.get('equipped').getAttribute('aria-selected'), 'true');
    assert.equal(tabs.buttons.get('closet').tabIndex, -1);
    tabs.buttons.get('equipped').onkeydown({ key: 'ArrowRight', preventDefault() {} });
    assert.equal(tabs.getActive(), 'closet');
    assert.deepEqual(selectedTabs, ['closet']);
    assert.equal(doc.activeElement, tabs.buttons.get('closet'));

    const chip = createChip(doc, { label: 'Navy tunic', icon: 'shirt', pressed: true, removable: true, control: 'chip-tunic' });
    assert.equal(chip.element.getAttribute('aria-pressed'), 'true');
    chip.setPressed(false);
    assert.equal(chip.element.getAttribute('aria-pressed'), 'false');

    const acc = createAccordion(doc, { title: 'Stage placement', icon: 'trees', badge: '3', open: true, control: 'stage-acc' });
    assert.equal(acc.element.open, true);
    assert.equal(acc.badge.textContent, '3');

    const row = createItemRow(doc, { title: 'Long coat', meta: 'Jacket · Navy', worn: true, control: 'row-coat' });
    assert.equal(row.element.dataset.worn, 'true');
    assert.equal(row.main.getAttribute('aria-pressed'), 'true');
    assert.match(row.main.title, /Long coat/);

    const trigger = createButton(doc, { label: 'Pick swatch', control: 'swatch-open' });
    const popover = createPopover(doc, { trigger, ariaLabel: 'Color swatches', control: 'swatch-pop' });
    popover.open();
    assert.equal(popover.element.hidden, false);
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(doc.listenerCount('keydown'), 1);
    doc.emit('keydown', { key: 'Escape', stopPropagation() {} });
    assert.equal(popover.element.hidden, true);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(doc.listenerCount('keydown'), 0);
    popover.open();
    popover.dispose();
    assert.equal(doc.listenerCount('keydown'), 0);
    assert.equal(doc.listenerCount('pointerdown'), 0);

    const group = createControlGroup(doc, { icon: 'wand', title: 'Actions' });
    assert.equal(group.element.className, 'lpc-control-group');
    const blocker = createBlockerBanner(doc);
    assert.equal(blocker.element.hidden, true);
    blocker.set('Cape disables Jump');
    assert.equal(blocker.element.hidden, false);
});

test('sanitizeUiConfig allowlists explicit uiConfig booleans and setup modes while stripping unknown keys', async () => {
    const { sanitizeUiConfig } = await import('../src/index.mjs');
    assert.deepEqual(sanitizeUiConfig(null), {});
    assert.deepEqual(sanitizeUiConfig(['bad']), {});
    assert.deepEqual(
        sanitizeUiConfig({
            tamagotchiLauncher: false,
            tamagotchiInteractive: true,
            autoOpenDesktop: false,
            autoMinimizeDesktop: false,
            defaultSetupMode: 'curated',
            studioOwnsPanelState: false,
            injectedGlobal: 'ignored',
        }),
        {
            tamagotchiLauncher: false,
            tamagotchiInteractive: true,
            autoOpenDesktop: false,
            autoMinimizeDesktop: false,
            defaultSetupMode: 'curated',
            studioOwnsPanelState: false,
        },
    );
    assert.deepEqual(sanitizeUiConfig({ defaultSetupMode: 'unknown', tamagotchiLauncher: 'yes' }), {});

    const { viewportScale } = await import('../src/presentation/floating-launcher.mjs');
    assert.equal(viewportScale({ visualViewport: { scale: 1 } }), 1);
    assert.equal(viewportScale({ visualViewport: { scale: 1.03 } }), 1);
    assert.equal(viewportScale({ visualViewport: { scale: 1.04 } }), 1);
    assert.equal(viewportScale({ visualViewport: { scale: 1.5 } }), 1.5);
});
