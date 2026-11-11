const SLOT_NAMES = Object.freeze({
    body: 'Body base',
    head: 'Head',
    hair: 'Hair',
    ponytail: 'Ponytail',
    updo: 'Hair updo',
    hairextl: 'Hair extension (left)',
    hairextr: 'Hair extension (right)',
    beard: 'Beard',
    mustache: 'Mustache',
    eyes: 'Eyes',
    eyebrows: 'Eyebrows',
    nose: 'Nose',
    ears: 'Ears',
    ears_inner: 'Inner ears',
    expression: 'Facial expression',
    expression_crying: 'Tears / crying',
    wrinkles: 'Wrinkles',
    clothes: 'Tops & shirts',
    sleeves: 'Sleeves',
    vest: 'Vest / corset',
    jacket: 'Jacket / coat',
    jacket_collar: 'Jacket collar',
    jacket_pockets: 'Jacket pockets',
    jacket_trim: 'Jacket trim',
    overalls: 'Overalls',
    apron: 'Apron',
    dress: 'Dress / robe',
    dress_sleeves: 'Dress sleeves',
    dress_sleeves_trim: 'Dress sleeve trim',
    dress_trim: 'Dress trim',
    chainmail: 'Chainmail',
    armour: 'Plate armor',
    shoulders: 'Shoulder armor',
    bauldron: 'Bauldron',
    legs: 'Pants & bottoms',
    belt: 'Belt',
    buckles: 'Belt buckles',
    sash: 'Sash',
    sash_tie: 'Sash tie',
    cargo: 'Cargo pockets',
    socks: 'Socks & hosiery',
    shoes: 'Shoes & boots',
    shoes_toe: 'Shoe toe caps',
    hat: 'Hat / helmet',
    hat_trim: 'Hat trim',
    hat_buckle: 'Hat buckle',
    hat_overlay: 'Hat overlay',
    hat_accessory: 'Hat accessory',
    headcover: 'Headscarf / hood',
    headcover_rune: 'Headcover rune',
    bandana: 'Bandana',
    bandana_overlay: 'Bandana overlay',
    hairtie: 'Hair tie',
    hairtie_rune: 'Hair tie rune',
    visor: 'Visor',
    facial_eyes: 'Glasses & eyewear',
    facial_mask: 'Mask',
    facial_left: 'Left face accessory',
    facial_left_trim: 'Left face trim',
    facial_right: 'Right face accessory',
    facial_right_trim: 'Right face trim',
    earrings: 'Earrings (pair)',
    earring_left: 'Left earring',
    earring_right: 'Right earring',
    neck: 'Neckwear & scarves',
    necklace: 'Necklace',
    charm: 'Charm',
    ring: 'Ring',
    cape: 'Cape / cloak',
    cape_trim: 'Cape trim',
    backpack: 'Backpack',
    backpack_straps: 'Backpack straps',
    quiver: 'Quiver',
    ammo: 'Ammo',
    gloves: 'Gloves',
    wrists: 'Wristbands / cuffs',
    bracers: 'Bracers',
    arms: 'Arm guards',
    bandages: 'Bandages',
    accessory: 'Accessory',
    shadow: 'Ground shadow',
    weapon: 'Weapon / tool',
    weapon_magic_crystal: 'Weapon crystal',
    shield: 'Shield',
    shield_paint: 'Shield paint',
    shield_pattern: 'Shield pattern',
    shield_trim: 'Shield trim',
});
export const SLOT_GROUPS = Object.freeze([
    [
        'Identity · Body & Face',
        [
            'body',
            'head',
            'eyes',
            'eyebrows',
            'nose',
            'ears',
            'ears_inner',
            'expression',
            'expression_crying',
            'wrinkles'
        ]
    ],
    [
        'Identity · Hair & Facial Hair',
        ['hair', 'ponytail', 'updo', 'hairextl', 'hairextr', 'beard', 'mustache']
    ],
    [
        'Identity · Fantasy, Mobility & Marks',
        [
            'furry_ears',
            'furry_ears_skin',
            'horns',
            'tail',
            'fins',
            'wings',
            'wings_dots',
            'wings_edge',
            'prosthesis_hand',
            'prosthesis_leg',
            'wheelchair',
            'wound_arm',
            'wound_brain',
            'wound_eye_left',
            'wound_eye_right',
            'wound_mouth',
            'wound_ribs'
        ]
    ],
    [
        'Wardrobe · Tops, Jackets & Armor',
        [
            'clothes',
            'sleeves',
            'vest',
            'jacket',
            'jacket_collar',
            'jacket_pockets',
            'jacket_trim',
            'overalls',
            'apron',
            'dress',
            'dress_sleeves',
            'dress_sleeves_trim',
            'dress_trim',
            'chainmail',
            'armour',
            'shoulders',
            'bauldron'
        ]
    ],
    [
        'Wardrobe · Bottoms & Footwear',
        [
            'legs',
            'belt',
            'buckles',
            'sash',
            'sash_tie',
            'cargo',
            'socks',
            'shoes',
            'shoes_toe'
        ]
    ],
    [
        'Wardrobe · Headwear, Eyewear & Jewelry',
        [
            'hat',
            'hat_trim',
            'hat_buckle',
            'hat_overlay',
            'hat_accessory',
            'headcover',
            'headcover_rune',
            'bandana',
            'bandana_overlay',
            'hairtie',
            'hairtie_rune',
            'visor',
            'facial_eyes',
            'facial_mask',
            'facial_left',
            'facial_left_trim',
            'facial_right',
            'facial_right_trim',
            'earrings',
            'earring_left',
            'earring_right',
            'neck',
            'necklace',
            'charm',
            'ring'
        ]
    ],
    [
        'Wardrobe · Capes, Gloves & Props',
        [
            'cape',
            'cape_trim',
            'backpack',
            'backpack_straps',
            'quiver',
            'ammo',
            'gloves',
            'wrists',
            'bracers',
            'arms',
            'bandages',
            'accessory',
            'shadow',
            'weapon',
            'weapon_magic_crystal',
            'shield',
            'shield_paint',
            'shield_pattern',
            'shield_trim'
        ]
    ],
]);
export const SLOT_CATEGORIES = Object.freeze([
    { id: 'all', label: 'All slots', slots: null },
    { id: 'body_face', label: 'Body & Face', slots: SLOT_GROUPS[0][1] },
    { id: 'hair_beard', label: 'Hair & Beard', slots: SLOT_GROUPS[1][1] },
    { id: 'tops_armor', label: 'Tops & Coats', slots: SLOT_GROUPS[3][1] },
    { id: 'bottoms_shoes', label: 'Bottoms & Shoes', slots: SLOT_GROUPS[4][1] },
    { id: 'hats_jewelry', label: 'Hats & Jewelry', slots: SLOT_GROUPS[5][1] },
    { id: 'capes_props', label: 'Capes & Props', slots: SLOT_GROUPS[6][1] },
    { id: 'fantasy_marks', label: 'Fantasy & Marks', slots: SLOT_GROUPS[2][1] },
]);
export const slotShortName = slot => SLOT_NAMES[slot] ?? slot.replaceAll('_', ' ');
export const slotLabel = (slot, isIdentity) => `${SLOT_NAMES[slot] ?? slot.replaceAll('_', ' ')} (${slot}) · ${isIdentity ? 'identity' : 'outfit'}`;
export function formatShortColorName(colorId) {
    if (!colorId) return 'Authored';
    const tail = String(colorId).split('.').at(-1).replaceAll('_', ' ').trim();
    if (!tail) return 'Authored';
    return tail.replace(/\b[a-z]/g, ch => ch.toUpperCase());
}
export function formatSourceColorLabel(colorId) {
    if (!colorId) return 'Authored colors';
    const pretty = formatShortColorName(colorId);
    return String(colorId).includes('.') ? `${pretty} (${colorId})` : pretty;
}
const SOURCE_ACTION_NAMES = Object.freeze({
    idle: 'Standing idle',
    walk: 'Walking',
    run: 'Running',
    sit: 'Seated pose (sit)',
    emote: 'Expressive / hands on hips (emote)',
    jump: 'Jump',
    spellcast: 'Cast gesture (spellcast)',
    watering: 'Tending / watering',
    thrust: 'Thrust (spear / staff)',
    slash: 'Slash (blade / wand)',
    shoot: 'Shoot (bow)',
    hurt: 'Sleeping / collapsed (hurt)',
    climb: 'Climbing (back view)',
    combat: 'Alert / guard stance (combat)',
    '1h_slash': 'One-handed slash',
    '1h_backslash': 'One-handed backslash',
    '1h_halfslash': 'One-handed halfslash',
    slash_oversize: 'Oversize slash',
    slash_reverse_oversize: 'Oversize reverse slash',
    thrust_oversize: 'Oversize thrust',
    tool_rod: 'Fishing rod',
    tool_whip: 'Whip',
    tool_axe: 'Axe chop',
    tool_hammer: 'Hammer swing',
    tool_pickaxe: 'Pickaxe swing',
    tool_shovel: 'Shovel dig',
});
export const formatSourceActionLabel = actionId => SOURCE_ACTION_NAMES[actionId] ?? actionId.replaceAll('_', ' ');
export const SOURCE_POSE_PRESETS = Object.freeze([
    {
        id: 'idle_stand',
        label: 'Standing',
        actionId: 'idle',
        frame: 0,
        loop: 'none'
    },
    {
        id: 'walk_loop',
        label: 'Walking (loop)',
        actionId: 'walk',
        frame: 0,
        loop: 'walk'
    },
    {
        id: 'run_loop',
        label: 'Running (loop)',
        actionId: 'run',
        frame: 0,
        loop: 'run'
    },
    {
        id: 'sit_low',
        label: 'Sitting (low)',
        actionId: 'sit',
        frame: 0,
        loop: 'none'
    },
    {
        id: 'sit_upright',
        label: 'Sitting (upright)',
        actionId: 'sit',
        frame: 1,
        loop: 'none'
    },
    {
        id: 'sit_relaxed',
        label: 'Sitting (relaxed)',
        actionId: 'sit',
        frame: 2,
        loop: 'none'
    },
    {
        id: 'sleeping',
        label: 'Sleeping (Zzz)',
        actionId: 'hurt',
        frame: 5,
        loop: 'none'
    },
    {
        id: 'hands_on_hips',
        label: 'Hands on hips',
        actionId: 'emote',
        frame: 1,
        loop: 'none'
    },
    {
        id: 'guard_stance',
        label: 'Alert / guard',
        actionId: 'combat',
        frame: 0,
        loop: 'none'
    },
]);
export function populateSlotSelect(document, selectInput, slots, identitySlots) {
    const available = new Set(slots), seen = new Set();
    selectInput.replaceChildren();
    const allOpt = document.createElement('option');
    allOpt.value = '__all__';
    allOpt.textContent = 'All slots (search entire catalog)';
    selectInput.append(allOpt);
    for (const [groupLabel, groupSlots]of SLOT_GROUPS) {
        const members = groupSlots.filter(s => available.has(s));
        if (!members.length) continue;
        const group = document.createElement('optgroup');
        group.label = groupLabel;
        for (const s of members) {
            seen.add(s);
            const option = document.createElement('option');
            option.value = s;
            option.textContent = slotLabel(s, identitySlots.includes(s));
            group.append(option);
        }
        selectInput.append(group);
    }
    const rest = slots.filter(s => !seen.has(s)).sort();
    if (rest.length) {
        const group = document.createElement('optgroup');
        group.label = 'Other slots';
        for (const s of rest) {
            const option = document.createElement('option');
            option.value = s;
            option.textContent = slotLabel(s, identitySlots.includes(s));
            group.append(option);
        }
        selectInput.append(group);
    }
    selectInput.value = 'body';
}
export function updateSlotSelectEquipped(selectInput, equippedMap, catalog, identitySlots) {
    if (!selectInput?.querySelectorAll) return;
    for (const opt of selectInput.querySelectorAll('option')) {
        const s = opt.value;
        if (!s || s === '__all__') continue;
        const eq = equippedMap?.[s];
        if (eq && catalog) {
            const itemName = catalog.item(eq.itemId)?.name ?? eq.itemId;
            opt.textContent = `• ${slotShortName(s)} — ${itemName}`;
        } else {
            opt.textContent = slotLabel(s, identitySlots.includes(s));
        }
    }
}
export function sourceUI(document) {
    const el = (tag, text, className) => {
        const n = document.createElement(tag);
        if (text !== undefined) n.textContent = text;
        if (className) n.className = className;
        return n;
    };
    const button = (text, action, id) => {
        const n = el('button', text);
        n.type = 'button';
        n.onclick = action;
        if (id) n.dataset.control = id;
        return n;
    };
    const select = (label, choices, id) => {
        const wrap = el('label', undefined, 'lpc-field'), input = el('select');
        if (id) input.dataset.control = id;
        for (const [id, name]of choices) {
            const option = el('option', name);
            option.value = id;
            input.append(option);
        }
        wrap.append(el('span', label), input);
        return { wrap, input };
    };
    return { el, button, select };
}
export function sourceProblem(error, catalog) {
    const d = error.details ?? {}, parts = [error.message];
    if (d.itemId) {
        try {
            parts.push('Item: ' +catalog.item(d.itemId).name +'.');
        } catch {}
    }
    if (d.required?.length) parts.push('Required tags: ' +d.required.join(', ') +'.');
    if (d.excluded?.length) parts.push('Excluded tags: ' +d.excluded.join(', ') +'.');
    return parts.join(' ');
}
export function sourcePlacementControls({ document, initial, changed, prefix = '' }) {
    const { el } = sourceUI(document), element = el('fieldset');
    element.append(el('legend', 'Character placement'));
    let value = structuredClone(initial);
    const inputs = Object.fromEntries([
        ['x', 'Horizontal position', 0, 1],
        ['y', 'Ground position', 0, 1],
        ['scale', 'Character scale', 0.5, 1.25]
    ].map(([key, label, min, max]) => {
        const field = el('label', undefined, 'lpc-field'),
            input = el('input'),
            output = el('output');
        input.type = 'range';
        input.min = min;
        input.max = max;
        input.step = 0.05;
        input.dataset.control = prefix +'scene-' +key;
        field.append(el('span', label), input, output);
        element.append(field);
        input.oninput = () => {
            output.textContent = Number(input.value).toFixed(2);
        };
        input.onchange = () => {
            value = { ...value, [key]: Number(input.value) };
            changed(structuredClone(value));
        };
        return [key, { input, output }];
    }));
    const set = scene => {
        value = structuredClone(scene);
        for (const [key, { input, output }]of Object.entries(inputs)) {
            input.value = scene[key];
            output.textContent = Number(scene[key]).toFixed(2);
        }
    };
    set(initial);
    return { element, set };
}
export function observeSourceCanvas(window, canvas, stage, player) {
    const resize = () => {
        const box = stage.getBoundingClientRect();
        canvas.width = Math.max(1, Math.round(box.width || 320));
        canvas.height = Math.max(1, Math.round(box.height || 264));
        player.redraw();
    };
    const observer = new window.ResizeObserver(resize);
    observer.observe(stage);
    resize();
    return () => observer.disconnect();
}

export function sourcePresentationNotice(prepared, preview = false) {
    const notes = [
        ...(prepared.sheet.layout.authoredDirectionOnly ? [preview ? 'Preview uses one authored view; preferred facing is retained for other poses.'
            : 'This pose uses one authored view. Preferred facing is retained for other poses.'] : []),
        ...prepared.warnings.map(w => w.message ?? w.reason ?? 'Unused source-sheet padding is excluded from this pose.')
    ];
    if (preview) notes.push('Nothing is saved until Apply.');
    return [...new Set(notes)].join(' ') || 'Saved appearance is ready.';
}
