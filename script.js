/* Horaires Rémi 45 — Lignes 20A et 20B */

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
let autoTabSelected = false; // Empêche de réécrire le choix manuel de l'utilisateur

/* ------------------------------------------------------------------ dates */

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

/* ----------------------------------------------------------------- rendus */

function nomArret(a) {
  return a.commune ? `${a.commune.toUpperCase()} — ${a.nom}` : a.nom;
}

function badge(ligne) {
  const couleur = (REF.lignes[ligne] && REF.lignes[ligne].couleur) || '#3182ce';
  return `<span class="badge" style="background:${couleur}">${ligne}</span>`;
}

function renderTabs() {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  tabs.innerHTML = REF.arrets.map(a =>
    `<button class="tab-btn ${a.id === currentArretId ? 'active' : ''}" data-arret="${a.id}">`
    + `${nomArret(a)}</button>`
  ).join('');
}

function selectArret(arretId, fromUser = false) {
  if (fromUser) {
    autoTabSelected = true;
  }
  currentArretId = arretId;
  renderTabs();
  filterHoraires();
}

function filterHoraires() {
  const conteneur = document.getElementById('table-container');
  if (!REF) return;
  const arret = REF.arrets.find(a => a.id === currentArretId);
  if (!arret) return;

  const recherche = (document.getElementById('search-destination').value || '').toLowerCase().trim();
  
  const departs = getProchaines24Heures(arret)
    .filter(d => d.dest.toLowerCase().includes(recherche));

  if (departs.length === 0) {
    conteneur.innerHTML = '<div class="no-result">Aucun départ prévu dans les prochaines 24h'
      + (recherche ? ' vers cette destination.' : '.') + '</div>';
    return;
  }

  const maintenant = hhmm(new Date());

  conteneur.innerHTML = `
    <div class="schedule-list">
      ${departs.map(d => {
        let itemClass = '';
        let statusLabel = '';

        if (d.isDemain) {
          itemClass = ' tomorrow-bus';
          statusLabel = '<div class="tomorrow-label">📅 Demain</div>';
        } else {
          if (maintenant >= d.arr) {
            itemClass = ' past-bus';
            statusLabel = '<div class="past-label">Déjà passé</div>';
          } else if (maintenant >= d.h && maintenant < d.arr) {
            itemClass = ' in-transit-bus';
            statusLabel = '<div class="in-transit-label">🚌 En route</div>';
          } else {
            statusLabel = '<div class="today-label">Aujourd\'hui</div>';
          }
        }

        return `
        <div class="schedule-item${itemClass}">
          <div class="schedule-time">
            <strong>${d.h}</strong>
            <span>➔ ${d.arr}</span>
          </div>
          <div>${badge(d.l)}</div>
          <div class="schedule-dest">
            ${d.dest}${statusLabel}
          </div>
        </div>
      `}).join('')}
    </div>`;
}

/* --------------------------------------------------------------- carte GPS */

function initCarte() {
  const el = document.getElementById('map');
  if (!el || typeof L === 'undefined') return;
  map = L.map('map').setView([48.0, 2.0], 10);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    maxZoom: 19
  }).addTo(map);
  REF.arrets.forEach(a => {
    L.marker([a.lat, a.lng]).addTo(map).bindPopup(`<b>${nomArret(a)}</b>`);
  });

  map.on('dragstart', () => {
    const btn = document.getElementById('recenter-btn');
    if (btn) btn.style.display = 'block';
  });

  window.addEventListener('resize', () => {
    if (map) map.invalidateSize();
  });
}

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNextBus(userLat, userLng) {
  const resultat = document.getElementById('bus-result');
  const now = new Date();

  if (!REF || !REF.arrets || REF.arrets.length === 0) return;

  let arretProche = REF.arrets[0];
  let distMin = Infinity;
  REF.arrets.forEach(a => {
    const d = calcDistance(userLat, userLng, a.lat, a.lng);
    if (d < distMin) { distMin = d; arretProche = a; }
  });

  lastClosestStop = arretProche;

  // Sélectionne l'onglet de l'arrêt le plus proche au premier repérage GPS
  if (!autoTabSelected) {
    selectArret(arretProche.id);
    autoTabSelected = true;
  }

  if (map && !mapCenteredOnce) {
    map.setView([arretProche.lat, arretProche.lng], 14);
    mapCenteredOnce = true;
  }

  const maintenant = hhmm(now);
  const depsAujourdhui = departsDuJour(arretProche, now);
  let prochain = depsAujourdhui.find(d => d.h >= maintenant);
  let jourTexte = "aujourd'hui";

  if (!prochain) {
    const demain = new Date(now.getTime() + 86400000);
    const depsDemain = departsDuJour(arretProche, demain);
    prochain = depsDemain.length > 0 ? depsDemain[0] : null;
    jourTexte = "demain";
  }

  if (prochain) {
    resultat.innerHTML = `Prochain départ ${badge(prochain.l)} de `
      + `<b>${nomArret(arretProche)}</b> à <b>${prochain.h}</b> <i>(${jourTexte})</i>, `
      + `arrivée à <b>${prochain.dest}</b> à <b>${prochain.arr}</b>.`
      + `<br><small style="color:var(--text-muted); margin-top:8px; display:block;">📍 Arrêt à ${distMin.toFixed(1)} km de vous.</small>`;
  } else {
    resultat.innerHTML = `Aucun départ prévu d'ici demain pour <b>${nomArret(arretProche)}</b>.`;
  }
}

/* ------------------------------------------------------- bandeau vacances */

async function afficherPeriode() {
  const box = document.getElementById('status-box');
  const jour = new Date().toISOString().split('T')[0];
  const url = CONFIG.vacances + '?limit=1&where='
    + encodeURIComponent(`location="Orléans-Tours" and start_date<="${jour}" and end_date>="${jour}"`);
  try {
    const res = await fetch(url);
    const data = await res.json();
    const enVacances = data.total_count > 0;
    box.className = enVacances ? 'vacances' : 'scolaire';
    box.innerText = enVacances ? '🏖️ Vacances' : '🏫 Scolaire';
  } catch (e) {
    box.className = 'scolaire';
    box.innerText = 'Info non dispo';
  }
}

async function rafraichirLignes() {
  try {
    const res = await fetch(CONFIG.lignes);
    const data = await res.json();
    data.results.forEach(r => {
      REF.lignes[r.route_short_name] = {
        route_id: r.route_id,
        nom: r.route_long_name,
        couleur: '#' + (r.route_color || '3182ce').replace('#', '')
      };
    });
  } catch (e) {}
}

/* --------------------------------------------------------------- démarrage */

function brancherEvenements() {
  document.getElementById('tabs').addEventListener('click', e => {
    const btn = e.target.closest('[data-arret]');
    if (btn) selectArret(btn.dataset.arret, true);
  });
  
  document.getElementById('search-destination').addEventListener('input', filterHoraires);
    
  const btnRecenter = document.getElementById('recenter-btn');
  if (btnRecenter) {
    btnRecenter.addEventListener('click', () => {
      if (map && lastClosestStop) {
        map.setView([lastClosestStop.lat, lastClosestStop.lng], 14);
        btnRecenter.style.display = 'none'; 
      }
    });
  }
}

function normaliserChaine(str) {
  return (str || '')
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/-/g, ' ')
    .trim();
}

async function init() {
  if (new URLSearchParams(window.location.search).get('mode') === 'widget') {
    document.body.classList.add('widget-mode');
  }

  const resultat = document.getElementById('bus-result');

  try {
    const res = await fetch(CONFIG.horaires, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    REF = await res.json();
  } catch (e) {
    const box = document.getElementById('status-box');
    box.className = 'error';
    box.innerText = 'Erreur';
    resultat.innerHTML = `Données indisponibles. Relancez le script Python.`;
    return;
  }

  const communesAutorisees = ['orleans', 'loury', 'neuville aux bois'];
  const motsExclus = ['charmettes', 'cimetiere', 'college', 'pichardiere'];

  if (REF && REF.arrets) {
    REF.arrets = REF.arrets.filter(a => {
      const cNorm = normaliserChaine(a.commune);
      const nomNorm = normaliserChaine(a.nom);
      const dansCommune = communesAutorisees.some(target => cNorm.includes(target) || nomNorm.includes(target));
      const estExclu = motsExclus.some(exclu => nomNorm.includes(exclu));
      return dansCommune && !estExclu;
    });

    REF.arrets = REF.arrets.slice(5);
  }

  await rafraichirLignes();

  const defaut = (REF.arrets && REF.arrets.find(a => normaliserChaine(a.commune).includes('neuville aux bois'))) 
                || (REF.arrets && REF.arrets[0]);
  
  if (!defaut) {
    resultat.innerHTML = 'Aucun arrêt disponible dans ces communes.';
    return;
  }

  currentArretId = defaut.id;

  brancherEvenements();
  initCarte();
  selectArret(defaut.id);
  afficherPeriode();

  const depsAujourdhui = departsDuJour(defaut, new Date());
  let prochain = depsAujourdhui.find(d => d.h >= hhmm(new Date()));
  let jourStr = "aujourd'hui";
  
  if (!prochain) {
      const demain = new Date(new Date().getTime() + 86400000);
      const depsDemain = departsDuJour(defaut, demain);
      prochain = depsDemain.length > 0 ? depsDemain[0] : null;
      jourStr = "demain";
  }

  resultat.innerHTML = prochain
    ? `Prochain départ ${badge(prochain.l)} de <b>${nomArret(defaut)}</b> à <b>${prochain.h}</b> <i>(${jourStr})</i>.`
      + '<br><small style="color:var(--text-muted); margin-top:8px; display:block;">📍 Activez la géolocalisation pour l\'arrêt proche.</small>'
    : `Aucun départ prévu d'ici demain depuis <b>${nomArret(defaut)}</b>.`;

  if ('geolocation' in navigator && REF.arrets && REF.arrets.length > 0) {
    navigator.geolocation.watchPosition(
      pos => {
        const la = pos.coords.latitude, lo = pos.coords.longitude;
        if (map) {
          if (userMarker) userMarker.setLatLng([la, lo]);
          else userMarker = L.circleMarker([la, lo], { color: '#3b82f6', radius: 8, fillOpacity: 0.8 })
                             .addTo(map).bindPopup('Votre position');
        }
        findNextBus(la, lo);
      },
      () => {
        resultat.innerHTML += '<br><small style="color:var(--text-muted); margin-top:8px; display:block;">Géolocalisation refusée.</small>';
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );

    setInterval(() => {
      navigator.geolocation.getCurrentPosition(p =>
        findNextBus(p.coords.latitude, p.coords.longitude));
    }, 60000);
  }
}

init();