const SVG_NS = 'http://www.w3.org/2000/svg';

/** Crisp 1.85px stroke Lucide vector path definitions. Zero emoji dependencies. */
const ICON_PATHS = {
    sparkles: [
        ['path', { d: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z' }],
        ['path', { d: 'M20 3v4' }],
        ['path', { d: 'M22 5h-4' }],
    ],
    sliders: [
        ['line', { x1: '4', x2: '10', y1: '21', y2: '21' }],
        ['line', { x1: '14', x2: '20', y1: '21', y2: '21' }],
        ['line', { x1: '4', x2: '12', y1: '14', y2: '14' }],
        ['line', { x1: '16', x2: '20', y1: '14', y2: '14' }],
        ['line', { x1: '4', x2: '8', y1: '7', y2: '7' }],
        ['line', { x1: '12', x2: '20', y1: '7', y2: '7' }],
        ['circle', { cx: '12', cy: '21', r: '2' }],
        ['circle', { cx: '14', cy: '14', r: '2' }],
        ['circle', { cx: '10', cy: '7', r: '2' }],
    ],
    layers: [
        ['path', { d: 'm12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z' }],
        ['path', { d: 'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65' }],
        ['path', { d: 'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65' }],
    ],
    shirt: [
        ['path', { d: 'M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z' }],
    ],
    shield: [
        ['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }],
    ],
    bot: [
        ['path', { d: 'M12 8V4H8' }],
        ['rect', { width: '16', height: '12', x: '4', y: '8', rx: '2' }],
        ['path', { d: 'M2 14h2' }],
        ['path', { d: 'M20 14h2' }],
        ['path', { d: 'M15 13v2' }],
        ['path', { d: 'M9 13v2' }],
    ],
    refresh: [
        ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
        ['path', { d: 'M21 3v5h-5' }],
        ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
        ['path', { d: 'M8 16H3v5' }],
    ],
    check: [
        ['path', { d: 'M20 6 9 17l-5-5' }],
    ],
    alert: [
        ['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }],
        ['path', { d: 'M12 9v4' }],
        ['path', { d: 'M12 17h.01' }],
    ],
    lock: [
        ['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }],
        ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
    ],
    play: [
        ['polygon', { points: '6 3 20 12 6 21 6 3' }],
    ],
    pause: [
        ['rect', { x: '14', y: '4', width: '4', height: '16', rx: '1' }],
        ['rect', { x: '6', y: '4', width: '4', height: '16', rx: '1' }],
    ],
    stop: [
        ['rect', { width: '14', height: '14', x: '5', y: '5', rx: '2' }],
    ],
    rotate: [
        ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
        ['path', { d: 'M3 3v5h5' }],
    ],
    wand: [
        ['path', { d: 'm21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72' }],
        ['path', { d: 'm14 7 3 3' }],
    ],
    'arrow-up': [
        ['path', { d: 'm5 12 7-7 7 7' }],
        ['path', { d: 'M12 19V5' }],
    ],
    hand: [
        ['path', { d: 'M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2' }],
        ['path', { d: 'M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2' }],
        ['path', { d: 'M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8' }],
        ['path', { d: 'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15' }],
    ],
    trees: [
        ['path', { d: 'M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z' }],
        ['path', { d: 'M7 16v6' }],
        ['path', { d: 'M13 19v3' }],
        ['path', { d: 'M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5' }],
    ],
    users: [
        ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
        ['circle', { cx: '9', cy: '7', r: '4' }],
        ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
        ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }],
    ],
    message: [
        ['path', { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }],
    ],
    upload: [
        ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
        ['polyline', { points: '17 8 12 3 7 8' }],
        ['line', { x1: '12', x2: '12', y1: '3', y2: '15' }],
    ],
    download: [
        ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
        ['polyline', { points: '7 10 12 15 17 10' }],
        ['line', { x1: '12', x2: '12', y1: '15', y2: '3' }],
    ],
    edit: [
        ['path', { d: 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }],
        ['path', { d: 'M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z' }],
    ],
    compass: [
        ['circle', { cx: '12', cy: '12', r: '10' }],
        ['polygon', { points: '16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76' }],
    ],
    star: [
        ['polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }],
    ],
    copy: [
        ['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }],
        ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
    ],
    trash: [
        ['path', { d: 'M3 6h18' }],
        ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
        ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
    ],
    x: [
        ['path', { d: 'M18 6 6 18' }],
        ['path', { d: 'm6 6 12 12' }],
    ],
    droplets: [
        ['path', { d: 'M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z' }],
        ['path', { d: 'M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97' }],
    ],
    sword: [
        ['polyline', { points: '14.5 17.5 3 6 3 3 6 3 17.5 14.5' }],
        ['line', { x1: '13', x2: '19', y1: '19', y2: '13' }],
        ['line', { x1: '16', x2: '20', y1: '16', y2: '20' }],
        ['line', { x1: '19', x2: '21', y1: '21', y2: '19' }],
    ],
    crosshair: [
        ['circle', { cx: '12', cy: '12', r: '10' }],
        ['line', { x1: '22', x2: '18', y1: '12', y2: '12' }],
        ['line', { x1: '6', x2: '2', y1: '12', y2: '12' }],
        ['line', { x1: '12', x2: '12', y1: '6', y2: '2' }],
        ['line', { x1: '12', x2: '12', y1: '22', y2: '18' }],
    ],
    plus: [
        ['path', { d: 'M5 12h14' }],
        ['path', { d: 'M12 5v14' }],
    ],
    minus: [
        ['path', { d: 'M5 12h14' }],
    ],
    maximize: [
        ['polyline', { points: '15 3 21 3 21 9' }],
        ['polyline', { points: '9 21 3 21 3 15' }],
        ['line', { x1: '21', x2: '14', y1: '3', y2: '10' }],
        ['line', { x1: '3', x2: '10', y1: '21', y2: '14' }],
    ],
    smile: [
        ['circle', { cx: '12', cy: '12', r: '10' }],
        ['path', { d: 'M8 14s1.5 2 4 2 4-2 4-2' }],
        ['line', { x1: '9', x2: '9.01', y1: '9', y2: '9' }],
        ['line', { x1: '15', x2: '15.01', y1: '9', y2: '9' }],
    ],
};

export const ACTION_ICONS = {
    spellcast: 'wand',
    arms_raise: 'hand',
    emote: 'hand',
    jump: 'arrow-up',
    watering: 'droplets',
    thrust: 'sword',
    slash: 'sword',
    shoot: 'crosshair',
    hurt: 'alert',
    run: 'play',
    rest: 'rotate',
    nod: 'check',
    laugh: 'smile',
    sigh: 'droplets',
    bounce: 'arrow-up',
    startle: 'alert',
    shiver: 'sparkles',
    shrug: 'hand',
    polite_bow: 'sparkles',
};

function createSvgNode(document, tag, attrs = {}) {
    const node = document.createElementNS ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
}

export function createIcon(document, name, className = 'lpc-svg-icon') {
    const svg = createSvgNode(document, 'svg', {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.85',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
        class: className,
    });
    for (const [tag, attrs] of ICON_PATHS[name] ?? ICON_PATHS.sparkles) {
        svg.append(createSvgNode(document, tag, attrs));
    }
    return svg;
}

export function createLuciteIcon(document, name, extraClass = '') {
    const well = document.createElement('span');
    well.className = `lpc-lucite-icon${extraClass ? ` ${extraClass}` : ''}`;
    well.setAttribute('aria-hidden', 'true');
    well.append(createIcon(document, name));
    return well;
}

export function createSectionHeader(document, { icon, title, subtitle, badge, headingTag = 'h3', actions } = {}) {
    const head = document.createElement('div');
    head.className = 'lpc-molecule-head';
    const lead = document.createElement('div');
    lead.className = 'lpc-molecule-lead';
    if (icon) lead.append(createLuciteIcon(document, icon));
    const copy = document.createElement('div');
    copy.className = 'lpc-molecule-copy';
    const heading = document.createElement(headingTag);
    heading.textContent = title;
    copy.append(heading);
    let subtitleNode = null;
    if (subtitle) {
        subtitleNode = document.createElement('span');
        subtitleNode.className = 'lpc-hint';
        subtitleNode.textContent = subtitle;
        copy.append(subtitleNode);
    }
    lead.append(copy);
    head.append(lead);
    let badgeNode = null;
    if (badge) {
        badgeNode = document.createElement('span');
        badgeNode.className = 'lpc-badge';
        badgeNode.textContent = badge;
        head.append(badgeNode);
    }
    if (actions) head.append(actions);
    return { element: head, heading, subtitle: subtitleNode, badge: badgeNode };
}

export function createToggleRow(document, { control, title, hint, icon, checked = false, disabled = false, className = '' } = {}) {
    const label = document.createElement('label');
    label.className = `lpc-setting-toggle lpc-toggle-card${className ? ` ${className}` : ''}`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'lpc-switch-input';
    input.checked = Boolean(checked);
    input.disabled = Boolean(disabled);
    if (control) input.dataset.control = control;
    const lead = document.createElement('span');
    lead.className = 'lpc-toggle-lead';
    if (icon) lead.append(createLuciteIcon(document, icon, 'lpc-lucite-icon-sm'));
    const copy = document.createElement('span');
    copy.className = 'lpc-toggle-copy';
    const titleNode = document.createElement('span');
    titleNode.className = 'lpc-toggle-title';
    titleNode.textContent = title;
    copy.append(titleNode);
    if (hint) {
        const hintNode = document.createElement('small');
        hintNode.className = 'lpc-toggle-hint';
        hintNode.textContent = hint;
        copy.append(hintNode);
    }
    lead.append(copy);
    label.append(lead, input);
    return { wrap: label, input };
}

export function decorateButton(document, buttonNode, iconName, text) {
    for (const old of [...buttonNode.querySelectorAll('.lpc-svg-icon')]) old.remove();
    const labelText = text ?? buttonNode.textContent;
    const span = document.createElement('span');
    span.className = 'lpc-btn-label';
    span.textContent = labelText;
    buttonNode.replaceChildren(createIcon(document, iconName), span);
    return buttonNode;
}

export function decorateIconButton(document, buttonNode, iconName, ariaLabel) {
    buttonNode.classList.add('lpc-icon-btn');
    if (ariaLabel) {
        buttonNode.setAttribute('aria-label', ariaLabel);
        buttonNode.title = ariaLabel;
    }
    buttonNode.replaceChildren(createIcon(document, iconName));
    return buttonNode;
}

export function createControlGroup(document, { icon, title, rightNode } = {}) {
    const group = document.createElement('div');
    group.className = 'lpc-control-group';
    const head = document.createElement('div');
    head.className = 'lpc-control-group-head';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'lpc-card-eyebrow';
    if (icon) eyebrow.append(createIcon(document, icon));
    const titleSpan = document.createElement('span');
    titleSpan.textContent = title;
    eyebrow.append(titleSpan);
    head.append(eyebrow);
    if (rightNode) head.append(rightNode);
    group.append(head);
    return { element: group, head };
}

export function createBlockerBanner(document) {
    const banner = document.createElement('div');
    banner.className = 'lpc-blocker-banner';
    banner.hidden = true;
    const copy = document.createElement('span');
    copy.className = 'lpc-blocker-copy';
    banner.append(createIcon(document, 'lock'), copy);
    return {
        element: banner,
        copy,
        set(message) {
            copy.textContent = message ?? '';
            banner.hidden = !message;
        },
    };
}
