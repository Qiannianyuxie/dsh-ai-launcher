/**
 * dsh-ai-launcher — Host half.
 *
 * The plugin is entirely a Web-surface concern: it contributes one right-Sidebar
 * tab type whose body is a grid of AI web-chat links. Nothing runs in the host
 * process, so the Host entry is a no-op and every resource the browser half
 * registers is released with it.
 *
 * @module dsh-ai-launcher/index.js
 */
export function apply() {}
