/** Verified 1.19.0 settings drawer DOM; no storage or context mutation. */
export function revealSettings(document) {
    const drawer = document.querySelector('#extensions_settings')?.closest('.drawer');
    if (drawer?.querySelector('.drawer-content')?.classList.contains('closedDrawer')) {
        drawer.querySelector('.drawer-toggle')?.click();
    }
    const toggle=document.querySelector('#lpc-companion-settings [data-control=settings-toggle]');
    if(toggle?.getAttribute('aria-expanded')==='false')toggle.click();
}
