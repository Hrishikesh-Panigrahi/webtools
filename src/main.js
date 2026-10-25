// Entry point: builds the shell around the tools and routes between views.
//
//   lib/    pure logic, no DOM — parsers, formatters, guards (unit tested)
//   ui/     reusable widgets — element builder, editor, panels, buttons
//   tools/  one module per category, each a list of tool definitions
//   shell/  the app around them — header, sidebar, palette, home, tool view
import './styles/base.css';
import './styles/components.css';
import { h, isEditable } from './ui/dom.js';
import { toast } from './ui/toast.js';
import { tools, categories, findTool } from './registry.js';
import { openTool } from './navigation.js';
import { initTheme, toggleTheme } from './shell/theme.js';
import { createHeader } from './shell/header.js';
import { createSidebar } from './shell/sidebar.js';
import { createPalette } from './shell/palette.js';
import { createHelpDialog } from './shell/help.js';
import { renderHome } from './shell/home.js';
import { renderToolView, copyShareLink } from './shell/toolView.js';
import { currentRoute } from './shell/router.js';
import { isPinned, togglePinned, onPrefsChange } from './shell/prefs.js';
import { serializeControls, applyState, clearSavedState } from './shell/toolState.js';
import { enablePasteAnywhere, enableFileDrop } from './shell/pasteAndDrop.js';

initTheme();

const main = h('main', { class: 'main' });
const layout = h('div', { class: 'body' });
const sidebar = createSidebar({ tools, categories, findTool, layout });
const help = createHelpDialog();
const palette = createPalette({ tools, findTool, getCommands: paletteCommands, openTool });
const header = createHeader({
  onToggleSidebar: () => sidebar.toggle(),
  onOpenPalette: () => palette.open(),
  onOpenHelp: help.open,
});
layout.append(sidebar.element, main);
document.getElementById('app').append(header, sidebar.backdrop, layout, palette.element, help.element);

// ---------- Views ----------
/** @type {{ kind: 'home' | 'tool', dispose(): void } | null} */
let currentView = null;

function render() {
  const { tool, query } = currentRoute();
  currentView?.dispose();
  main.replaceChildren();
  if (tool) {
    document.title = `${tool.title} · webTools`;
    currentView = renderToolView(main, tool, { query, onReset: resetCurrentTool });
  } else {
    document.title = 'webTools — developer utilities';
    currentView = renderHome(main, { tools, categories, findTool, openTool });
  }
  main.scrollTop = 0;
  sidebar.setActive(tool?.id ?? null);
  sidebar.close();
}

function resetCurrentTool() {
  if (currentView?.kind !== 'tool') return;
  const { tool } = currentView;
  const previous = serializeControls(currentView.body);
  // Stop saving first, or the pending save would write the old input straight back.
  currentView.dispose();
  currentView = null;
  clearSavedState(tool);
  history.replaceState(null, '', '#' + tool.id);
  render();
  toast(`${tool.title} reset`, {
    label: 'Undo',
    run: () => { if (currentView?.tool === tool) applyState(currentView.body, previous); },
  });
}

const pinCurrent = (tool) => toast(togglePinned(tool.id) ? `Pinned ${tool.title}` : `Unpinned ${tool.title}`);

function paletteCommands() {
  const tool = currentView?.kind === 'tool' ? currentView.tool : null;
  return [
    { title: 'Go to all tools', keywords: 'home start', run: () => { location.hash = ''; } },
    { title: 'Toggle dark / light theme', keywords: 'theme dark light mode', run: toggleTheme },
    { title: 'Toggle the sidebar', keywords: 'sidebar menu navigation', run: () => sidebar.toggle() },
    { title: 'Keyboard shortcuts', keywords: 'help keys', shortcut: '?', run: help.open },
    ...(tool ? [
      { title: `${isPinned(tool.id) ? 'Unpin' : 'Pin'} ${tool.title}`, keywords: 'pin favorite star', run: () => pinCurrent(tool) },
      { title: 'Copy a link to this tool with its input', keywords: 'share url permalink', run: () => copyShareLink(tool, currentView.body) },
      { title: `Reset ${tool.title}`, keywords: 'clear reset empty', run: resetCurrentTool },
    ] : []),
  ];
}

// ---------- Global input ----------
enablePasteAnywhere(() => currentView, () => palette.isOpen());
enableFileDrop(main, () => (currentView?.kind === 'tool' ? currentView.body : null));

document.addEventListener('keydown', (event) => {
  const isTyping = isEditable(document.activeElement);
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (palette.isOpen()) palette.close(); else palette.open();
  } else if (event.key === 'Escape') {
    palette.close();
    help.close();
    sidebar.close();
  } else if (event.key === '/' && !isTyping) {
    event.preventDefault();
    if (sidebar.isHidden()) palette.open(); else sidebar.focusSearch();
  } else if (event.key === '?' && !isTyping) {
    event.preventDefault();
    help.open();
  }
});

// Only pins change the sidebar; rebuilding it on every visit would steal focus
// from the link a keyboard user just followed.
onPrefsChange((kind) => { if (kind === 'pinned') sidebar.render(); });
addEventListener('hashchange', render);
render();
