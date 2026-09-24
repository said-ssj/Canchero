const fs = require('fs');
let content = fs.readFileSync('C:\\Users\\alvar\\Downloads\\Canchero-Proyecto\\canchero-frontend\\src\\app\\pages\\detalle\\detalle.html', 'utf8');
const start = content.indexOf('Fundado en 2018 por amantes');
let end = content.indexOf('+12,000 Partidos Jugados</div>');

if (start >= 0 && end >= 0) {
  end += '+12,000 Partidos Jugados</div>'.length;
  const replacement = '{{ v.descripcion || "Fundado por amantes del fútbol aficionado, " + v.nombre + " nació para ofrecer una experiencia de juego profesional a los grupos de amigos de barrio, academias y empresas que buscan desconectar. Renovamos anualmente la fibra sintética y cuidamos cada detalle para que cada pichanga se viva como una final de copa." }}';
  const newContent = content.substring(0, start) + replacement + content.substring(end);
  fs.writeFileSync('C:\\Users\\alvar\\Downloads\\Canchero-Proyecto\\canchero-frontend\\src\\app\\pages\\detalle\\detalle.html', newContent);
  console.log('Done historia');
} else {
  console.log('Not found');
}