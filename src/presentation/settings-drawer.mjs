/** Native 1.19.0 inline-drawer vocabulary, with keyboard/ARIA and no jQuery dependency. */
export function createSettingsDrawer({ document, container }) {
    const element = document.createElement('div');
    element.id = 'lpc-companion-settings';
    element.className = 'inline-drawer lpc-settings-drawer';
    const toggle = document.createElement('div');
    toggle.className = 'inline-drawer-toggle inline-drawer-header';
    toggle.dataset.control = 'settings-toggle';
    toggle.tabIndex = 0;
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'lpc-companion-settings-content');
    const title = document.createElement('b');
    title.textContent = 'LPC Companion';
    const icon = document.createElement('div');
    icon.className = 'inline-drawer-icon fa-solid fa-circle-chevron-down down';
    icon.setAttribute('aria-hidden', 'true');
    toggle.append(title, icon);
    const content = document.createElement('div');
    content.id = 'lpc-companion-settings-content';
    content.className = 'inline-drawer-content';
    content.hidden = true;
    content.style.display = 'none';
    function setOpen(open) {
        toggle.setAttribute('aria-expanded', String(open));
        content.hidden = !open;
        content.style.display = open ? 'block' : 'none';
        icon.classList.toggle('down', !open);
        icon.classList.toggle('up', open);
        icon.classList.toggle('fa-circle-chevron-down', !open);
        icon.classList.toggle('fa-circle-chevron-up', open);
    }
    // Handle this drawer once; stop the host's delegated mouse handler from toggling it again.
    toggle.onclick = event => {
        event.stopPropagation();
        setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    };
    toggle.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle.click();
        }
    };
    element.append(toggle, content);
    container.append(element);
    return {
        element,
        content,
        reveal: () => setOpen(true),
        remove: () => element.remove()
    };
}
