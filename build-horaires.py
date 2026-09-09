#!/usr/bin/env python3
"""
Génère data/horaires.json pour les lignes Rémi 20A et 20B à partir du GTFS ouvert.
Calcule les arrivées uniquement vers les arrêts conservés situés en aval.
"""

import argparse
import csv
import io
import json
import os
import sys
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date

GTFS_URL = "https://fr.ftp.opendatasoft.com/centrevaldeloire/OKINAGTFS/GTFS_AO/REMI.zip"
ODS = "https://data.centrevaldeloire.fr/api/explore/v2.1/catalog/datasets"

LIGNES = {
    "REMI45:Line:17": "20A",
    "REMI45:Line:560": "20B",
}

JOURS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def lire(zf, nom):
    with zf.open(nom) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))


def communes(stop_ids):
    out = {}
    ids = list(stop_ids)
    for i in range(0, len(ids), 20):
        where = " or ".join(f'stop_id="{s}"' for s in ids[i:i + 20])
        url = (f"{ODS}/jvmalin_points_arrets/records?limit=100"
               f"&select=stop_id,commune&where={urllib.parse.quote(where)}")
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                for rec in json.load(r)["results"]:
                    out[rec["stop_id"]] = rec["commune"]
        except Exception as e:
            print(f"  commune indisponible pour un lot ({e})", file=sys.stderr)
    return out


def couleurs():
    where = urllib.parse.quote('route_short_name in ("20A","20B")')
    url = f"{ODS}/jvmalin_lignes/records?limit=10&where={where}"
    out = {}
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            for rec in json.load(r)["results"]:
                out[rec["route_short_name"]] = {
                    "route_id": rec["route_id"],
                    "nom": rec["route_long_name"],
                    "couleur": "#" + (rec.get("route_color") or "3182ce").lstrip("#"),
                }
    except Exception as e:
        print(f"  couleurs indisponibles ({e})", file=sys.stderr)
    return out


def normaliser(s):
    if not s:
        return ""
    s = s.lower().replace("-", " ")
    s = unicodedata.normalize('NFD', s)
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", help="GTFS local au lieu du téléchargement")
    ap.add_argument("--out", default="data/horaires.json")
    args = ap.parse_args()

    if args.zip:
        blob = open(args.zip, "rb").read()
    else:
        print(f"Téléchargement du GTFS ({GTFS_URL})…")
        with urllib.request.urlopen(GTFS_URL, timeout=300) as r:
            blob = r.read()
    print(f"  {len(blob) / 1e6:.1f} Mo")

    zf = zipfile.ZipFile(io.BytesIO(blob))

    trips = {}
    for r in lire(zf, "trips.txt"):
        rid = r["route_id"].strip('"')
        if rid in LIGNES:
            trips[r["trip_id"]] = r
    print(f"  {len(trips)} courses sur les lignes {', '.join(LIGNES.values())}")

    stops = {r["stop_id"]: r for r in lire(zf, "stops.txt")}

    passages = defaultdict(list)
    for r in lire(zf, "stop_times.txt"):
        if r["trip_id"] in trips:
            passages[r["trip_id"]].append(r)
    for v in passages.values():
        v.sort(key=lambda x: int(x["stop_sequence"]))
    print(f"  {sum(len(v) for v in passages.values())} passages")

    utilises = {t["service_id"] for t in trips.values()}
    services = {}
    for r in lire(zf, "calendar.txt"):
        if r["service_id"] in utilises:
            services[r["service_id"]] = {
                "j": "".join(r[j] for j in JOURS), 
                "d1": r["start_date"],
                "d2": r["end_date"],
                "add": [],
                "rem": [],
            }
    for r in lire(zf, "calendar_dates.txt"):
        sid = r["service_id"]
        if sid not in utilises:
            continue
        s = services.setdefault(sid, {"j": "0000000", "d1": "19700101", "d2": "20991231",
                                      "add": [], "rem": []})
        s["add" if r["exception_type"] == "1" else "rem"].append(r["date"])
    print(f"  {len(services)} services (calendriers)")

    print("Récupération des communes…")
    quais = {sid for tid in passages for sid in (p["stop_id"] for p in passages[tid])}
    com = communes(quais)

    arrets_bruts = {}
    for sid, st in stops.items():
        aid = st["parent_station"] or sid
        if aid not in arrets_bruts:
            arrets_bruts[aid] = {
                "id": aid,
                "nom": stops.get(aid, st)["stop_name"],
                "lat": float(stops.get(aid, st)["stop_lat"]),
                "lng": float(stops.get(aid, st)["stop_lon"]),
                "commune": "",
                "departs": [],
            }

    for aid, a in arrets_bruts.items():
        for sid, st in stops.items():
            if (st.get("parent_station") == aid or sid == aid) and sid in com:
                a["commune"] = com[sid]
                break

    COMMUNES_AUTORISEES = {"orleans", "loury", "neuville aux bois"}
    MOTS_EXCLUS = {"charmettes", "cimetiere", "college", "pichardiere"}

    arrets_filtres = {}
    for aid, a in arrets_bruts.items():
        c_norm = normaliser(a.get("commune", ""))
        nom_norm = normaliser(a.get("nom", ""))
        dans_commune = any(target in c_norm or target in nom_norm for target in COMMUNES_AUTORISEES)
        est_exclu = any(exclu in nom_norm for exclu in MOTS_EXCLUS)
        if dans_commune and not est_exclu:
            arrets_filtres[aid] = a

    def nom_affichage(a):
        return f"{a['commune'].upper()} — {a['nom']}" if a.get("commune") else a["nom"]

    for tid, seq in passages.items():
        t = trips[tid]
        ligne = LIGNES[t["route_id"].strip('"')]

        for i in range(len(seq) - 1):
            p_dep = seq[i]
            aid_dep = stops[p_dep["stop_id"]].get("parent_station") or p_dep["stop_id"]

            if aid_dep not in arrets_filtres:
                continue

            for j in range(i + 1, len(seq)):
                p_arr = seq[j]
                aid_arr = stops[p_arr["stop_id"]].get("parent_station") or p_arr["stop_id"]

                if aid_arr in arrets_filtres and aid_arr != aid_dep:
                    arrets_filtres[aid_dep]["departs"].append({
                        "h": p_dep["departure_time"][:5],
                        "arr": p_arr["arrival_time"][:5],
                        "l": ligne,
                        "dest": nom_affichage(arrets_filtres[aid_arr]),
                        "s": t["service_id"],
                    })

    for a in arrets_filtres.values():
        vus, uniques = set(), []
        for d in sorted(a["departs"], key=lambda d: (d["h"], d["arr"], d["dest"], d["l"])):
            cle = (d["h"], d["arr"], d["l"], d["dest"], d["s"])
            if cle not in vus:
                vus.add(cle)
                uniques.append(d)
        a["departs"] = uniques

    doc = {
        "genere_le": date.today().isoformat(),
        "source": "GTFS Rémi — transport.data.gouv.fr (ODbL)",
        "lignes": couleurs() or {n: {"nom": n, "couleur": "#3182ce"} for n in LIGNES.values()},
        "services": services,
        "arrets": sorted(arrets_filtres.values(), key=lambda a: (a.get("commune", ""), a["nom"])),
    }

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))

    total = sum(len(a["departs"]) for a in doc["arrets"])
    print(f"\n{args.out} : {len(doc['arrets'])} arrêts conservés sur {len(arrets_bruts)}, {total} départs, "
          f"{os.path.getsize(args.out) / 1024:.0f} Ko")

if __name__ == "__main__":
    main()