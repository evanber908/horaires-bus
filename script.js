const CONFIG = {
  horaires: 'data/horaires.json',
  lignes: 'https://data.centrevaldeloire.fr/api/explore/v2.1/catalog/datasets/jvmalin_lignes/records'
        + '?limit=10&where=' + encodeURIComponent('route_short_name in ("20A","20B")'),
  vacances: 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records',
  arretParDefaut: 'Neuville-aux-Bois'
};

let REF = null;            
let currentArretId = null;
let map = null;
let userMarker = null;
let mapCenteredOnce = false; 
let lastClosestStop = null;

function ymd(d) {
  return String(d.getFullYear())
       + String(d.getMonth() + 1).padStart(2, '0')
       + String(d.getDate()).padStart(2, '0');
}

function hhmm(d) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function serviceActif(serviceId, jour, jourSemaine) {
  const s = REF.services[serviceId];
  if (!s) return false;
  if (s.rem.includes(jour)) return false;
  if (s.add.includes(jour)) return true;
  if (jour < s.d1 || jour > s.d2) return false;
  return s.j[(jourSemaine + 6) % 7] === '1';
}

function departsDuJour(arret, date) {
  const jour = ymd(date), dow = date.getDay();
  const vus = new Set();
  return arret.departs
    .filter(d => serviceActif(d.s, jour, dow))
    .filter(d => {
      const cle = d.h + d.arr + dC'est tout à fait possible ! Pour que le site arrête de mettre à jour votre position en continu et ne le fasse qu'une seule fois au chargement de la page, il faut remplacer l'écouteur `watchPosition` et la boucle `setInterval` par une simple requête `getCurrentPosition`[cite: 4, 6]. 

Voici le fichier **`script.js`** complet et corrigé, prêt à être copié-collé pour remplacer l'ancien[cite: 1].

### Code complet de `script.js`

```javascript
const CONFIG = {
  horaires: 'data/horaires.json',
  lignes: '[https://data.centrevaldeloire.fr/api/explore/v2.1/catalog/datasets/jvmalin_lignes/records](https://data.centrevaldeloire.fr/api/explore/v2.1/catalog/datasets/jvmalin_lignes/records)'
        + '?limit=10&where=' + encodeURIComponent('route_short_name in ("20A","20B")'),
  vacances: '[https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records](https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records)',
  arretParDefaut: 'Neuville-aux-Bois'
};

let REF = null;            
let currentArretId = null;
let map = null;
let userMarker = null;
let mapCenteredOnce = false; 
let lastClosestStop = null;

function ymd(d) {
  return String(d.getFullYear())
       + String(d.getMonth() + 1).padStart(2, '0')
       + String(d.getDate()).padStart(2, '0');
}

function hhmm(d) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function serviceActif(serviceId, jour, jourSemaine) {
  const s = REF.services[serviceId];
  if (!s) return false;
  if (s.rem.includes(jour)) return false;
  if (s.add.includes(jour)) return true;
  if (jour < s.d1 || jour > s.d2) return false;
  return s.j[(jourSemaine + 6) % 7] === '1';
}

function departsDuJour(arret, date) {
  const jour = ymd(date), dow = date.getDay();
  const vus = new Set();
  return arret.departs
    .filter(d => serviceActif(d.s, jour, dow))
    .filter(d => {
      const cle = d.h + d.arr + d.l + d.dest;
      if (vus.has(cle)) return false;
      vus.add(cle);
      return true;
    })
    .sort((a, b) => a.h.localeCompare(b.h) || a.arr.localeCompare(b.arr));
}

function getProchaines24Heures(arret) {
  const now = new Date();
  const hhmmnow = hhmm(now);
  const demainDate = new Date(now.getTime() + 86400000);

  let listeAujourdhui = departsDuJour(arret, now).map(d => ({ 
    ...d, 
    isDemain: false 
  }));

  let listeDemain = departsDuJour(arret, demainDate)
    .filter(d => d.h <= hhmmnow)
    .map(d => ({ 
      ...d, 
      isDemain: true 
    }));

  return [...listeAujourdhui, ...listeDemain];
}

function nomArret(a) {
  return a.commune ? `${a.commune.toUpperCase()} — ${a.nom}` : a.nom;
}

function badge(ligne) {
  const couleur = (REF.lignes[ligne] && REF.lignes[ligne].couleur) || '#3182ce';
  return `<span class="badge" style="background:${couleur}">${ligne}</span>`;
}

function renderSelect() {
  const select = document.getElementById('arret-select');
  if (!select || !REF || !REF.arrets) return;
  select.innerHTML = REF.arrets.map(a =>
    `<option value="${a.id}" ${a.id === currentArretId ? 'selected' : ''}>`
    + `${nomArret(a)}</option>`
  ).join('');
}

function renderDestSelect() {
  const destSelect = document.getElementById('dest-select');
  if (!destSelect || !REF) return;

  const currentDest = destSelect.value;
  const arret = REF.arrets.find(a => a.id === currentArretId);
  if (!arret) return;

  const dests = new Set();
  arret.departs.forEach(d => dests.add(d.dest));
  
  const sortedDests = Array.from(dests).sort();

  destSelect.innerHTML = '<option value="">Tous les arrêts</option>' +
    sortedDests.map(dest => `<option value="${dest}">${dest}</option>`).join('');

  if (sortedDests.includes(currentDest)) {
    destSelect.value = currentDest;
  } else {
    destSelect.value = "";
  }
}

function renderJourSelect() {
  const jourSelect = document.getElementById('jour-select');
  if (!jourSelect) return;

  const joursSemaine = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  let html = '';
  const now = new Date();
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const nomJour = joursSemaine[d.getDay()];
    let label = nomJour;
    
    if (i === 0) label = `Aujourd'hui (${nomJour})`;
    else if (i === 1) label = `Demain (${nomJour})`;
    
    html += `<option value="${ymd(d)}">${label}</option>`;
  }
  
  jourSelect.innerHTML = html;
}

function selectArret(arretId) {
  currentArretId = arretId;
  const select = document.getElementById('arret-select');
  if (select && select.value !== arretId) {
    select.value = arretId;
  }
  renderDestSelect();
  filterHoraires();
}

function filterHoraires() {
  const conteneur = document.getElementById('table-container');
  if (!REF) return;
  const arret = REF.arrets.find(a => a.id === currentArretId);
  if (!arret) return;

  const destSelect = document.getElementById('dest-select');
  const destinationChoisie = destSelect ? destSelect.value : "";

  const jourSelect = document.getElementById('jour-select');
  const todayYMD = ymd(new Date());
  const jourChoisi = jourSelect ? jourSelect.value : todayYMD;

  let departs = [];
  let isToday = (jourChoisi === todayYMD);

  if (isToday) {
    departs = getProchaines24Heures(arret)
      .filter(d => destinationChoisie === "" || d.dest === destinationChoisie);
  } else {
    const year = parseInt(jourChoisi.substring(0, 4), 10);
    const month = parseInt(jourChoisi.substring(4, 6), 10) - 1;
    const day = parseInt(jourChoisi.substring(6, 8), 10);
    const dateChoisie = new Date(year, month, day);

    departs