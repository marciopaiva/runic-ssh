import fs from 'fs';
const map = {
  '#0b131e':'#eef1f7','#0d1725':'#e6ebf3','#0f1a29':'#f7f9fc','#0a1119':'#ffffff',
  '#0c1522':'#f2f5fa','#101d2e':'#ffffff','#17273c':'#e2eaf6','#1d2f47':'#d8e0ec',
  '#16263c':'#dfe6f0','#294060':'#c2ccdb','#3d5271':'#9aa8bc','#5d7189':'#6b7c93',
  '#8ea1ba':'#55677f','#b4c4d8':'#33465e','#c8d6e8':'#253549','#93a7bf':'#4a5c74',
  '#e4ecf7':'#101b28','#1ea7e2':'#0d7fb5','#56b6ea':'#0f6f9e','#986fdd':'#7245c0',
  '#2fb894':'#14855f','#e0a83c':'#8f6209','#ff5f6b':'#cf2230','#ffb0b6':'#a3121f',
  '#dbe7f5':'#1a2735','#c9d8ea':'#2b3c52','#5bc4f0':'#0a6a97',
};
const src = process.argv[2], out = process.argv[3];
let s = fs.readFileSync(src, 'utf8');
s = s.replace(/#[0-9a-fA-F]{6}\b/g, (h) => map[h.toLowerCase()] ?? h);
s = s.replace(/rgba\(30,167,226,0\.18\)/g, 'rgba(13,127,181,0.20)');
fs.writeFileSync(out, s);
console.log('wrote', out);
