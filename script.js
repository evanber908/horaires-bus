const CONFIG = {
  horaires: 'data/horaires.json',
  lignes: 'https://data.centrevaldeloire.fr/api/explore/v2.1/catalog/datasets/jvmalin_lignes/records?limit=10&where=' + encodeURIComponent('route_short_name in ("20A","20B")'),
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
  return String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
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

  let listeAujourdhui = departsDuJour(arret, now).map(d => ({ ...d, isDemain: false }));
  let listeDemain = departsDuJour(arret, demainDate).filter(d => d.h <= hhmmnow).map(d => ({ ...d, isDemain: true }));

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
    `<option value="${a.id}" ${a.id === currentArretId ? 'selected' : ''}>${nomArret(a)}</option>`
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

  destSelect.value = sortedDests.includes(currentDest) ? currentDest : "";
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
  if (select && select.value !== arretId) select.value = arretId;
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
    departs = getProchaines24Heures(arret).filter(d => destinationChoisie === "" || d.dest === destinationChoisie);
  } else {
    const year = parseInt(jourChoisi.substring(0, 4), 10);
    const month = parseInt(jourChoisi.substring(4, 6), 10) - 1;
    const day = parseInt(jourChoisi.substring(6, 8), 10);
    const dateChoisie = new Date(year, month, day);

    const departsFiltres = departsDuJour(arret, dateChoisie)
      .filter(d => destinationChoisie === "" || d.dest === destinationChoisie);

    departs = departsFiltres.map(d => ({ ...d, isDemain: false, isOtherDay: true, dateObj: dateChoisie }));
  }

  if (departs.length === 0) {
    conteneur.innerHTML = '<div class="no-result">Aucun départ prévu pour ce jour'
      + (destinationChoisie ? ' vers cette destination.' : '.') + '</div>';
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
        } else if (d.isOtherDay) {
          const joursSemaine = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
          statusLabel = `<div class="today-label">📅 ${joursSemaine[d.dateObj.getDay()]}</div>`;
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
        `
      }).join('')}
    </div>`;
}

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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

  if (map && !mapCenteredOnce) {
    map.setView([arretProche.lat, arretProche.lng], 14);
    mapCenteredOnce = true;
  }

  const hhmmnow = hhmm(now);
  let prochains = getProchaines24Heures(arretProche).filter(d => d.h > hhmmnow || d.isDemain);
  
  if (prochains.length === 0) {
    resultat.innerHTML = `<strong>${nomArret(arretProche)}</strong> : Aucun bus dans les prochaines 24h.`;
  } else {
    const p = prochains[0];
    const status = p.isDemain ? 'Demain' : 'Aujourd\'hui';
    resultat.innerHTML = `📍 L'arrêt le plus proche : <strong>${nomArret(arretProche)}</strong><br>🚌 Prochain départ vers ${p.dest} à <strong>${p.h}</strong> (${status})`;
  }
}

function updateLocationMarker(lat, lng) {
  if (!map) return;
  if (!userMarker) {
    userMarker = L.circleMarker([lat, lng], {
      color: '#e53e3e', radius: 8, fillOpacity: 0.8, weight: 2
    }).addTo(map).bindPopup('Votre position');
  } else {
    userMarker.setLatLng([lat, lng]);
  }
}

function initCarte() {
  map = L.map('map-container').setView([47.9029, 1.9092], 10);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    maxZoom: 19
  }).addTo(map);

  if (REF && REF.arrets) {
    REF.arrets.forEach(a => {
      L.marker([a.lat, a.lng]).addTo(map).bindPopup(`<b>${nomArret(a)}</b>`);
    });
  }

  map.on('dragstart', () => {
    const btn = document.getElementById('recenter-btn');
    if (btn) btn.style.display = 'block';
  });
}

async function afficherPeriode() {
  const box = document.getElementById('status-box');
  const now = new Date();
  const day = now.getDay(); 

  // Vérification du Week-end (0 = Dimanche, 6 = Samedi)
  if (day === 0 || day === 6) {
    box.className = 'weekend';
    box.innerText = '🥳 Week-end';
    return;
  }

  const jour = now.toISOString().split('T')[0];
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

function brancherEvenements() {
  document.getElementById('arret-select').addEventListener('change', e => {
    selectArret(e.target.value);
  });

  document.getElementById('dest-select').addEventListener('change', () => {
    filterHoraires();
  });

  document.getElementById('jour-select').addEventListener('change', () => {
    filterHoraires();
  });

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

async function init() {
  try {
    const [repLignes, repHoraires] = await Promise.all([
      fetch(CONFIG.lignes).then(r => r.json()).catch(() => ({ results: [] })),
      fetch(CONFIG.horaires, { cache: 'no-cache' }).then(r => r.json())
    ]);

    REF = repHoraires;
    
    // Filtre des 5 premiers arrêts conservé (selon votre logique)
    if (REF.arrets && REF.arrets.length > 5) {
      REF.arrets = REF.arrets.slice(5);
    }

    REF.lignes = {};
    if (repLignes.results) {
      repLignes.results.forEach(l => {
        REF.lignes[l.route_short_name] = {
          nom: l.route_long_name,
          couleur: '#' + (l.route_color || '3182ce')
        };
      });
    }

    if (!REF.arrets || REF.arrets.length === 0) {
      document.getElementById('bus-result').textContent = "Erreur : Aucun arrêt disponible.";
      return;
    }

    currentArretId = REF.arrets[0].id;
    initCarte();
    renderSelect();
    renderDestSelect();
    renderJourSelect();
    filterHoraires();
    afficherPeriode();
    brancherEvenements();

    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition(
        pos => {
          updateLocationMarker(pos.coords.latitude, pos.coords.longitude);
          findNextBus(pos.coords.latitude, pos.coords.longitude);
        },
        err => console.warn('Erreur GPS :', err),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
    }

  } catch (err) {
    console.error(err);
    document.getElementById('bus-result').textContent = "Erreur de chargement des horaires.";
  }
}

init();