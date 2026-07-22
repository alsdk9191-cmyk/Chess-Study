(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ShinigamiPieces = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const SHAPES = {
    p: `
      <path class="body" d="M36 72c3-12 8-20 14-24-8-3-13-10-13-19 0-12 9-21 21-21s21 9 21 21c0 9-5 16-13 19 7 4 12 12 15 24z"/>
      <path class="accent" d="M58 9c4-7 9-8 14-8-1 6-5 10-12 12"/>
      <path class="accent" d="M42 30c5-6 11-8 16-2 5-6 11-4 16 2-3 11-9 16-16 16S45 41 42 30z"/>
      <path class="ink" d="M52 34c4 3 8 3 12 0"/>
    `,
    n: `
      <path class="body" d="M28 72c4-10 11-18 21-24l-8-9 3-19 10 6c8-12 21-15 31-8-4 5-7 10-7 16 0 9 7 15 11 23 3 5 4 10 3 15z"/>
      <path class="body" d="M42 41c10 3 20 2 30-5-2 10-8 17-19 22"/>
      <circle class="eye" cx="64" cy="27" r="3.5"/>
      <path class="accent" d="M45 21l-3-12 11 9M36 52c7 0 13 3 18 8"/>
    `,
    b: `
      <path class="wing" d="M47 67C27 57 23 42 29 24c8 6 15 13 20 22M67 67c20-10 24-25 18-43-8 6-15 13-20 22"/>
      <path class="body" d="M39 72c3-15 8-25 14-31-7-4-11-11-11-19 0-9 7-17 16-17s16 8 16 17c0 8-4 15-11 19 7 6 12 16 15 31z"/>
      <path class="accent" d="M65 10L49 35"/>
      <path class="ink" d="M51 23l10 8"/>
    `,
    r: `
      <path class="body" d="M29 72l5-43h8V17h11v12h10V17h11v12h9l5 43z"/>
      <path class="body" d="M34 30h49l-5 13H39z"/>
      <path class="accent" d="M45 50v15M58 47v18M71 50v15"/>
      <path class="ink" d="M39 43h39"/>
      <circle class="eye" cx="58" cy="38" r="3"/>
    `,
    q: `
      <path class="body" d="M31 72l7-37 11 10 9-25 9 25 11-10 7 37z"/>
      <circle class="jewel" cx="37" cy="31" r="4"/>
      <circle class="jewel" cx="58" cy="15" r="4"/>
      <circle class="jewel" cx="79" cy="31" r="4"/>
      <path class="paper" d="M42 51c6-3 11-2 16 2 5-4 10-5 16-2v14c-6-2-11-1-16 3-5-4-10-5-16-3z"/>
      <path class="accent" d="M58 53v15M47 56l8 2M69 56l-8 2"/>
    `,
    k: `
      <path class="body" d="M33 72c3-16 9-27 18-34-7-5-11-12-10-21l12 8 5-18 5 18 12-8c1 9-3 16-10 21 9 7 15 18 18 34z"/>
      <path class="accent" d="M58 4v24M49 13h18"/>
      <path class="paper" d="M44 47c8-7 20-7 28 0-8 10-20 10-28 0z"/>
      <circle class="eye" cx="58" cy="47" r="4"/>
    `
  };

  function makePieceSvg(type, color){
    const isWhite = color === 'w';
    const top = isWhite ? '#fffdf5' : '#35363d';
    const bottom = isWhite ? '#aeb4bd' : '#08090c';
    const outline = isWhite ? '#15161a' : '#d8d2c7';
    const paper = isWhite ? '#eee8da' : '#c8c0b1';
    const accent = '#a20f1b';
    const title = `${isWhite ? 'White' : 'Black'} ${type.toUpperCase()} - Shinigami Notes`;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 116 116" role="img">
        <title>${title}</title>
        <defs>
          <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${top}"/>
            <stop offset="1" stop-color="${bottom}"/>
          </linearGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.2" flood-color="#000" flood-opacity=".38"/>
          </filter>
        </defs>
        <g transform="translate(0 4)" stroke-linecap="round" stroke-linejoin="round" filter="url(#shadow)">
          <g stroke="${outline}" stroke-width="3.3">
            ${SHAPES[type]}
            <path class="body" d="M25 74h66l7 11-7 8H25l-7-8z"/>
            <path class="body" d="M20 94h76l7 9H13z"/>
          </g>
        </g>
        <style>
          .body{fill:url(#body)}
          .wing{fill:${isWhite ? '#d7dbe0' : '#17181d'};stroke:${outline};stroke-width:3}
          .accent{fill:none;stroke:${accent};stroke-width:3.4}
          .ink{fill:none;stroke:${outline};stroke-width:2.2}
          .eye,.jewel{fill:${accent};stroke:${outline};stroke-width:2}
          .paper{fill:${paper};stroke:${outline};stroke-width:2.6}
        </style>
      </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function createTheme(){
    const theme = {label:'Shinigami Notes'};
    ['w','b'].forEach((color) => {
      ['p','n','b','r','q','k'].forEach((type) => {
        theme[color + type] = makePieceSvg(type, color);
      });
    });
    return theme;
  }

  return {createTheme, makePieceSvg};
});
