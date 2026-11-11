import { createIcon, createLuciteIcon } from './molecules.mjs';
const POSITION_KEY = 'lpc-companion:launcher-position:v1',
    SIZE_KEY = 'lpc-companion:tama-size:v1',
    SIZE = 52,
    MARGIN = 12;
const DEFAULT_TAMA_WIDTH = 238,
    MIN_TAMA_WIDTH = 196,
    MAX_TAMA_WIDTH = 520;
const DEFAULT_TAMA_STAGE_HEIGHT = 176,
    MIN_TAMA_STAGE_HEIGHT = 132,
    MAX_TAMA_STAGE_HEIGHT = 440;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function readSavedPosition(window) {
    try {
        const raw = window.localStorage.getItem(POSITION_KEY);
        if (raw && raw.length <= 256) {
            const p = JSON.parse(raw);
            if (p.version === 1 && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0
                && p.y <= 1) return { x: p.x, y: p.y, saved: true };
        }
    } catch { /* Storage can be unavailable in private/restricted browsers. */
    }
    return { x: 1, y: .83, saved: false };
}

function writeSavedPosition(window, position) {
    try {
        window.localStorage.setItem(POSITION_KEY, JSON.stringify({
            version: 1,
            x: clamp(position.x, 0, 1),
            y: clamp(position.y, 0, 1)
        }));
    } catch { /* Keep current page position without durable storage. */
    }
}

function readSavedSize(window) {
    try {
        const raw = window.localStorage.getItem(SIZE_KEY);
        if (raw && raw.length <= 256) {
            const s = JSON.parse(raw);
            if (s.version === 1 && Number.isFinite(s.width) && Number.isFinite(s.stageHeight)) {
                return {
                    width: clamp(Math.round(s.width), MIN_TAMA_WIDTH, MAX_TAMA_WIDTH),
                    stageHeight: clamp(Math.round(s.stageHeight), MIN_TAMA_STAGE_HEIGHT, MAX_TAMA_STAGE_HEIGHT),
                };
            }
        }
    } catch { /* Storage can be unavailable in private/restricted browsers. */
    }
    return { width: DEFAULT_TAMA_WIDTH, stageHeight: DEFAULT_TAMA_STAGE_HEIGHT };
}

function writeSavedSize(window, size) {
    try {
        window.localStorage.setItem(SIZE_KEY, JSON.stringify({
            version: 1,
            width: clamp(Math.round(size.width), MIN_TAMA_WIDTH, MAX_TAMA_WIDTH),
            stageHeight: clamp(Math.round(size.stageHeight), MIN_TAMA_STAGE_HEIGHT, MAX_TAMA_STAGE_HEIGHT),
        }));
    } catch { /* Keep current page size without durable storage. */
    }
}

/** Page-local floating control. Position and size are device/browser UI preferences, never chat state. */
export function createFloatingLauncher({ document, window, onToggle, tamagotchi = true }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lpc-floating-launcher';
    button.dataset.control = 'floating-launcher';
    button.setAttribute('aria-expanded', 'false');
    const isTamagotchiEnabled = Boolean(tamagotchi);
    if (isTamagotchiEnabled) button.dataset.tamagotchi = 'true';
    const circleIcon = createIcon(document, 'shirt', 'lpc-svg-icon lpc-launcher-circle-icon');
    button.append(circleIcon);
    let tamaTitle = null,
        tamaBadge = null,
        tamaCta = null,
        tamaSub = null,
        resizeHandle = null;
    if (isTamagotchiEnabled) {
        const card = document.createElement('div');
        card.className = 'lpc-launcher-tama';
        const header = document.createElement('div');
        header.className = 'lpc-launcher-tama-header';
        const titleWrap = document.createElement('div');
        titleWrap.className = 'lpc-launcher-tama-title-wrap';
        tamaTitle = document.createElement('span');
        tamaTitle.className = 'lpc-launcher-tama-title';
        tamaTitle.textContent = 'Character avatar';
        titleWrap.append(createLuciteIcon(document, 'shirt', 'lpc-lucite-icon-sm'), tamaTitle);
        tamaBadge = document.createElement('span');
        tamaBadge.className = 'lpc-badge lpc-launcher-tama-badge';
        tamaBadge.dataset.state = 'setup';
        tamaBadge.textContent = 'Setup';
        header.append(titleWrap, tamaBadge);
        const stage = document.createElement('div');
        stage.className = 'lpc-launcher-tama-stage';
        const sparkle = createLuciteIcon(document, 'sparkles', 'lpc-lucite-icon-sm lpc-launcher-tama-sparkle');
        tamaCta = document.createElement('span');
        tamaCta.className = 'lpc-launcher-tama-cta';
        tamaCta.textContent = "Click here to setup character's avatar";
        stage.append(sparkle, tamaCta);
        const footer = document.createElement('div');
        footer.className = 'lpc-launcher-tama-footer';
        tamaSub = document.createElement('span');
        tamaSub.className = 'lpc-launcher-tama-sub';
        tamaSub.textContent = 'Full Catalog Studio · Closet & 657 items';
        footer.append(tamaSub);
        resizeHandle = document.createElement('span');
        resizeHandle.className = 'lpc-tama-resize-handle';
        resizeHandle.dataset.control = 'tama-resize';
        resizeHandle.title = 'Drag corner to resize · double-click to reset size';
        card.append(header, stage, footer, resizeHandle);
        button.append(card);
    }
    let position = { x: 1, y: .83 },
        size = { width: DEFAULT_TAMA_WIDTH, stageHeight: DEFAULT_TAMA_STAGE_HEIGHT },
        drag = null,
        suppressClick = false,
        clickTimer = null,
        disposed = false;
    {
        const loadedPos = readSavedPosition(window);
        position = { x: loadedPos.x, y: loadedPos.y };
        if (isTamagotchiEnabled) size = readSavedSize(window);
    }
    function applySizeVars() {
        if (!isTamagotchiEnabled) return;
        const w = window.visualViewport?.width ?? window.innerWidth;
        if (w > 700) {
            button.style.setProperty('--lpc-tama-width', `${size.width}px`);
            button.style.setProperty('--lpc-tama-stage-height', `${Math.max(112,size.stageHeight-34)}px`);
        } else {
            button.style.removeProperty('--lpc-tama-width');
            button.style.removeProperty('--lpc-tama-stage-height');
        }
    }
    function bounds() {
        const v = window.visualViewport,
            w = v?.width ?? window.innerWidth,
            h = v?.height ?? window.innerHeight;
        const useTama = isTamagotchiEnabled && w > 700;
        const bw = useTama ? (button.offsetWidth || size.width || DEFAULT_TAMA_WIDTH) : SIZE,
            bh = useTama ? (button.offsetHeight || (size.stageHeight +48) || 224) : SIZE;
        return {
            left: (v?.offsetLeft ?? 0) +MARGIN,
            top: (v?.offsetTop ?? 0) +MARGIN,
            width: Math.max(0, w -bw -2 * MARGIN),
            height: Math.max(0, h -bh -2 * MARGIN)
        };
    }
    function place() {
        if (disposed) return;
        applySizeVars();
        const b = bounds();
        button.style.left = (b.left +position.x * b.width) +'px';
        button.style.top = (b.top +position.y * b.height) +'px';
    }
    function save() {
        writeSavedPosition(window, position);
    }
    function release(event) {
        if (!drag || event.pointerId !== drag.id) return;
        const moved = drag.moved, mode = drag.mode;
        drag = null;
        delete button.dataset.dragging;
        delete button.dataset.resizing;
        if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
        if (moved || mode === 'resize' || event.pointerType === 'touch') {
            if (moved) {
                if (mode === 'resize') writeSavedSize(window, size);
                save();
            }
            suppressClick = true;
            if (clickTimer !== null) window.clearTimeout(clickTimer);
            clickTimer = window.setTimeout(() => {
                suppressClick = false;
                clickTimer = null;
            }, 750);
        }
        if (!moved && mode === 'move' && event.type === 'pointerup' && event.pointerType === 'touch') void onToggle();
    }
    if (resizeHandle) {
        resizeHandle.ondblclick = event => {
            event.stopPropagation();
            event.preventDefault();
            size = { width: DEFAULT_TAMA_WIDTH, stageHeight: DEFAULT_TAMA_STAGE_HEIGHT };
            writeSavedSize(window, size);
            place();
        };
    }
    button.onpointerdown = event => {
        if (!event.isPrimary || event.button !== 0) return;
        if (clickTimer !== null) window.clearTimeout(clickTimer);
        clickTimer = null;
        suppressClick = false;
        const onResizeGrip = Boolean(isTamagotchiEnabled && event.target?.closest?.('[data-control=tama-resize]'));
        const rect = button.getBoundingClientRect();
        drag = {
            id: event.pointerId,
            mode: onResizeGrip ? 'resize' : 'move',
            x: event.clientX,
            y: event.clientY,
            start: { ...position },
            startSize: { ...size },
            anchorLeft: rect.left,
            anchorTop: rect.top,
            moved: false,
        };
        button.setPointerCapture?.(event.pointerId);
    };
    button.onpointermove = event => {
        if (!drag || event.pointerId !== drag.id) return;
        const dx = event.clientX -drag.x, dy = event.clientY -drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 6) return;
        drag.moved = true;
        event.preventDefault();
        if (drag.mode === 'resize') {
            button.dataset.resizing = 'true';
            const v = window.visualViewport,
                vw = v?.width ?? window.innerWidth,
                vh = v?.height ?? window.innerHeight;
            size = {
                width: clamp(
                    Math.round(drag.startSize.width +dx),
                    MIN_TAMA_WIDTH,
                    Math.min(MAX_TAMA_WIDTH, vw -2 * MARGIN)
                ),
                stageHeight: clamp(
                    Math.round(drag.startSize.stageHeight +dy),
                    MIN_TAMA_STAGE_HEIGHT,
                    Math.min(MAX_TAMA_STAGE_HEIGHT, vh -120)
                ),
            };
            applySizeVars();
            const b = bounds();
            position = {
                x: b.width ? clamp((drag.anchorLeft -b.left) / b.width, 0, 1) : 0,
                y: b.height ? clamp((drag.anchorTop -b.top) / b.height, 0, 1) : 0,
            };
            place();
            return;
        }
        button.dataset.dragging = 'true';
        const b = bounds();
        position = {
            x: b.width ? clamp(drag.start.x +dx / b.width, 0, 1) : 0,
            y: b.height ? clamp(drag.start.y +dy / b.height, 0, 1) : 0
        };
        place();
    };
    button.onpointerup = release;
    button.onpointercancel = release;
    button.onlostpointercapture = event => {
        if (drag?.id === event.pointerId) release(event);
    };
    button.onclick = event => {
        if (event.pointerType === 'touch') return;
        if (event.target?.closest?.('[data-control=tama-resize]')) return;
        if (event.detail !== 0 && suppressClick) {
            suppressClick = false;
            return;
        }
        void onToggle();
    };
    button.onkeydown = event => {
        const direction = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1]
        }[event.key];
        if (!direction) return;
        event.preventDefault();
        const b = bounds(), step = event.shiftKey ? 25 : 10;
        position = {
            x: b.width ? clamp(position.x +direction[0] * step / b.width, 0, 1) : 0,
            y: b.height ? clamp(position.y +direction[1] * step / b.height, 0, 1) : 0
        };
        place();
        save();
    };
    button.setAttribute('aria-description', 'Drag to move, drag bottom-right corner to resize, or use arrow keys while focused.');
    const resize = () => {
        if (drag) release({ pointerId: drag.id });
        place();
    };
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', place);
    function syncFromStorage() {
        if (!isTamagotchiEnabled) return;
        const loadedPos = readSavedPosition(window);
        if (loadedPos.saved) position = { x: loadedPos.x, y: loadedPos.y };
        size = readSavedSize(window);
    }
    function setExpanded(value) {
        const open = Boolean(value);
        button.hidden = open;
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-label', open ? 'Minimize companions' : 'Open companions');
        button.title = open ? 'Minimize companions' : 'Open companions · drag to move · corner to resize';
        if (!open) {
            syncFromStorage();
            place();
        }
    }
    function syncState({ charName = '', configured = false, isGroup = false } = {}) {
        if (!isTamagotchiEnabled) return;
        syncFromStorage();
        const cleanName = charName.trim();
        const displayChar = cleanName || 'character';
        tamaTitle.textContent = isGroup ? 'Group companions' : cleanName ? `${cleanName}'s avatar` : 'Character avatar';
        tamaBadge.textContent = configured ? 'Ready' : 'Setup';
        tamaBadge.dataset.state = configured ? 'ready' : 'setup';
        tamaCta.textContent = isGroup ? (configured ? 'Click here to open group companions' : 'Click here to setup group companions')
            : (configured ? `Click here to open ${displayChar}'s avatar` : `Click here to setup ${displayChar}'s avatar`);
        tamaSub.textContent = configured ? 'Saved companion · drag or resize' : 'Full Catalog Studio · Closet & 657 items';
        place();
    }
    setExpanded(false);
    document.body.append(button);
    place();
    return {
        element: button,
        setExpanded,
        syncState,
        focus() {
            button.focus();
        },
        remove() {
            disposed = true;
            if (clickTimer !== null) window.clearTimeout(clickTimer);
            window.removeEventListener('resize', resize);
            window.visualViewport?.removeEventListener('resize', resize);
            window.visualViewport?.removeEventListener('scroll', place);
            button.remove();
        }
    };
}

/** Makes the live minimized Tamagotchi companion panel draggable and resizable, sharing position/size with the launcher. */
export function attachTamagotchiBehaviors({
    document,
    window,
    panel,
    stageEl,
    isMinimized,
    isManaged,
    onRedraw,
    interactive = true
}) {
    if (!interactive) {
        return { sync() {}, shouldSuppressStageClick: () => false, dispose() {}
        };
    }
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'lpc-tama-resize-handle';
    resizeHandle.dataset.control = 'tama-resize';
    resizeHandle.title = 'Drag corner to resize Tamagotchi window · double-click to reset size';
    panel.append(resizeHandle);

    let position = readSavedPosition(window),
        size = readSavedSize(window),
        drag = null,
        suppressStageClick = false,
        suppressTimer = null,
        disposed = false;
    const isFloatingTama = () => Boolean(!disposed && isMinimized() && !isManaged() && panel.dataset.dock !== 'inline');

    function bounds() {
        const v = window.visualViewport,
            w = v?.width ?? window.innerWidth,
            h = v?.height ?? window.innerHeight;
        const pw = panel.offsetWidth || size.width || DEFAULT_TAMA_WIDTH;
        const ph = panel.offsetHeight || (size.stageHeight +96) || 272;
        return {
            left: (v?.offsetLeft ?? 0) +MARGIN,
            top: (v?.offsetTop ?? 0) +MARGIN,
            width: Math.max(0, w -pw -2 * MARGIN),
            height: Math.max(0, h -ph -2 * MARGIN),
        };
    }

    function applyPlacement() {
        if (!isFloatingTama()) return;
        panel.style.setProperty('--lpc-tama-width', `${size.width}px`);
        panel.style.setProperty('--lpc-tama-stage-height', `${size.stageHeight}px`);
        if (position.saved || panel.dataset.tamaPlaced === 'true') {
            panel.dataset.tamaPlaced = 'true';
            const b = bounds();
            panel.style.left = `${Math.round(b.left+position.x*b.width)}px`;
            panel.style.top = `${Math.round(b.top+position.y*b.height)}px`;
        }
    }

    function sync() {
        if (disposed) return;
        if (!isFloatingTama()) {
            delete panel.dataset.tamaPlaced;
            delete panel.dataset.dragging;
            delete panel.dataset.resizing;
            panel.style.removeProperty('left');
            panel.style.removeProperty('top');
            panel.style.removeProperty('--lpc-tama-width');
            panel.style.removeProperty('--lpc-tama-stage-height');
            onRedraw?.();
            return;
        }
        position = readSavedPosition(window);
        size = readSavedSize(window);
        applyPlacement();
        onRedraw?.();
    }

    function markSuppressed() {
        suppressStageClick = true;
        if (suppressTimer !== null) window.clearTimeout(suppressTimer);
        suppressTimer = window.setTimeout(() => {
            suppressStageClick = false;
            suppressTimer = null;
        }, 450);
    }

    function release(event) {
        if (!drag || event.pointerId !== drag.id) return;
        const moved = drag.moved, mode = drag.mode;
        drag = null;
        delete panel.dataset.dragging;
        delete panel.dataset.resizing;
        if (panel.hasPointerCapture?.(event.pointerId)) panel.releasePointerCapture(event.pointerId);
        if (moved) {
            if (mode === 'resize') writeSavedSize(window, size);
            writeSavedPosition(window, position);
            markSuppressed();
            onRedraw?.();
        }
    }

    resizeHandle.ondblclick = event => {
        if (!isFloatingTama()) return;
        event.stopPropagation();
        event.preventDefault();
        size = { width: DEFAULT_TAMA_WIDTH, stageHeight: DEFAULT_TAMA_STAGE_HEIGHT };
        writeSavedSize(window, size);
        applyPlacement();
        onRedraw?.();
    };

    panel.addEventListener('pointerdown', event => {
        if (!isFloatingTama() || !event.isPrimary || event.button !== 0) return;
        const onResizeGrip = Boolean(event.target?.closest?.('[data-control=tama-resize]'));
        if (!onResizeGrip && event.target?.closest?.('button,select,input,textarea,a,summary')) return;
        const rect = panel.getBoundingClientRect();
        const b = bounds();
        position = {
            x: b.width ? clamp((rect.left -b.left) / b.width, 0, 1) : 0,
            y: b.height ? clamp((rect.top -b.top) / b.height, 0, 1) : 0,
            saved: true,
        };
        drag = {
            id: event.pointerId,
            mode: onResizeGrip ? 'resize' : 'move',
            x: event.clientX,
            y: event.clientY,
            start: { ...position },
            startSize: {
                width: panel.offsetWidth || size.width,
                stageHeight: stageEl?.offsetHeight || size.stageHeight,
            },
            anchorLeft: rect.left,
            anchorTop: rect.top,
            moved: false,
        };
        panel.setPointerCapture?.(event.pointerId);
    });

    panel.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.id || !isFloatingTama()) return;
        const dx = event.clientX -drag.x, dy = event.clientY -drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 6) return;
        drag.moved = true;
        panel.dataset.tamaPlaced = 'true';
        event.preventDefault();
        if (drag.mode === 'resize') {
            panel.dataset.resizing = 'true';
            const v = window.visualViewport,
                vw = v?.width ?? window.innerWidth,
                vh = v?.height ?? window.innerHeight;
            size = {
                width: clamp(
                    Math.round(drag.startSize.width +dx),
                    MIN_TAMA_WIDTH,
                    Math.min(MAX_TAMA_WIDTH, vw -2 * MARGIN)
                ),
                stageHeight: clamp(
                    Math.round(drag.startSize.stageHeight +dy),
                    MIN_TAMA_STAGE_HEIGHT,
                    Math.min(MAX_TAMA_STAGE_HEIGHT, vh -120)
                ),
            };
            panel.style.setProperty('--lpc-tama-width', `${size.width}px`);
            panel.style.setProperty('--lpc-tama-stage-height', `${size.stageHeight}px`);
            const b = bounds();
            position = {
                x: b.width ? clamp((drag.anchorLeft -b.left) / b.width, 0, 1) : 0,
                y: b.height ? clamp((drag.anchorTop -b.top) / b.height, 0, 1) : 0,
                saved: true,
            };
            applyPlacement();
            onRedraw?.();
            return;
        }
        panel.dataset.dragging = 'true';
        const b = bounds();
        position = {
            x: b.width ? clamp(drag.start.x +dx / b.width, 0, 1) : 0,
            y: b.height ? clamp(drag.start.y +dy / b.height, 0, 1) : 0,
            saved: true,
        };
        applyPlacement();
    });

    panel.addEventListener('pointerup', release);
    panel.addEventListener('pointercancel', release);
    panel.addEventListener('lostpointercapture', event => {
        if (drag?.id === event.pointerId) release(event);
    });

    const onWindowResize = () => {
        if (drag) release({ pointerId: drag.id });
        if (isFloatingTama()) applyPlacement();
    };
    window.addEventListener('resize', onWindowResize);
    window.visualViewport?.addEventListener('resize', onWindowResize);

    sync();
    return {
        sync,
        shouldSuppressStageClick: () => Boolean(suppressStageClick || drag?.moved),
        dispose() {
            disposed = true;
            if (suppressTimer !== null) window.clearTimeout(suppressTimer);
            window.removeEventListener('resize', onWindowResize);
            window.visualViewport?.removeEventListener('resize', onWindowResize);
        },
    };
}
