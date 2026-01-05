const fs = require('fs');
const s = fs.readFileSync('./web/package.json', 'utf8');
console.log('length', s.length);
console.log(s);
for (let i=160;i<190;i++) {
  console.log(i, s[i], s.charCodeAt(i));
}
