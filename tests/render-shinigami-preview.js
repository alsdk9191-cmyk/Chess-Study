'use strict';

const fs = require('fs');
const theme = require('../shinigami-pieces.js').createTheme();

const order = ['q','k','r','b','n','p'];
const squareSize = 140;
const cells = [];

for (let row = 0; row < 2; row += 1){
  for (let col = 0; col < order.length; col += 1){
    const squareColor = (row + col) % 2 ? '#3b4148' : '#d8d0bd';
    const key = (row ? 'w' : 'b') + order[col];
    const x = col * squareSize;
    const y = row * squareSize;
    cells.push(`<rect x="${x}" y="${y}" width="${squareSize}" height="${squareSize}" fill="${squareColor}"/>`);
    cells.push(`<image href="${theme[key]}" x="${x + 8}" y="${y + 8}" width="124" height="124"/>`);
  }
}

const preview = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 280">${cells.join('')}</svg>`;
fs.writeFileSync('shinigami-preview.svg', preview, 'utf8');
console.log('shinigami preview rendered');
