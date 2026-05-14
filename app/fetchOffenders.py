"""
Iowa Sex Offender Registry - Full State Fetch
Fetches all registrants across all 99 Iowa counties and saves to data/offenders.json

Usage:
    pip install requests
    python fetch_offenders.py
"""

import json
import time
import os
import requests
from datetime import datetime

# ── Config ─────────────────────────────────────────────────────────────────

BASE_URL    = "https://www.iowasexoffender.gov/api/search/results.json"
PER_PAGE    = 100
DELAY       = 0.4       # seconds between requests — be polite to their server
OUTPUT_FILE = os.path.join("data", "offenders.json")

ALL_IOWA_COUNTIES = [
    "Adair", "Adams", "Allamakee", "Appanoose", "Audubon",
    "Benton", "Black Hawk", "Boone", "Bremer", "Buchanan",
    "Buena Vista", "Butler", "Calhoun", "Carroll", "Cass",
    "Cedar", "Cerro Gordo", "Cherokee", "Chickasaw", "Clarke",
    "Clay", "Clayton", "Clinton", "Crawford", "Dallas",
    "Davis", "Decatur", "Delaware", "Des Moines", "Dickinson",
    "Dubuque", "Emmet", "Fayette", "Floyd", "Franklin",
    "Fremont", "Greene", "Grundy", "Guthrie", "Hamilton",
    "Hancock", "Hardin", "Harrison", "Henry", "Howard",
    "Humboldt", "Ida", "Iowa", "Jackson", "Jasper",
    "Jefferson", "Johnson", "Jones", "Keokuk", "Kossuth",
    "Lee", "Linn", "Louisa", "Lucas", "Lyon",
    "Madison", "Mahaska", "Marion", "Marshall", "Mills",
    "Mitchell", "Monona", "Monroe", "Montgomery", "Muscatine",
    "O'Brien", "Osceola", "Page", "Palo Alto", "Plymouth",
    "Pocahontas", "Polk", "Pottawattamie", "Poweshiek", "Ringgold",
    "Sac", "Scott", "Shelby", "Sioux", "Story",
    "Tama", "Taylor", "Union", "Van Buren", "Wapello",
    "Warren", "Washington", "Wayne", "Webster", "Winnebago",
    "Winneshiek", "Woodbury", "Worth", "Wright",
]

# ── Helpers ─────────────────────────────────────────────────────────────────

def fetch_page(county: str, page: int) -> dict:
    params = {
        "countyname": county,
        "per_page":   PER_PAGE,
        "page":       page,
    }
    resp = requests.get(BASE_URL, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def calculate_age(birthdate_str: str) -> int | None:
    try:
        dob = datetime.strptime(birthdate_str, "%m/%d/%Y")
        today = datetime.today()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    except (ValueError, TypeError):
        return None


def normalise(record: dict) -> dict:
    return {
        "id":           record.get("registrant"),
        "oci":          record.get("oci"),
        "first_name":   record.get("first_name", "").strip(),
        "middle_name":  record.get("middle_name", "").strip(),
        "last_name":    record.get("last_name", "").strip(),
        "suffix":       record.get("suffix", "").strip(),
        "display_name": record.get("display_name", "").strip(),
        "gender":       record.get("gender"),
        "birthdate":    record.get("birthdate"),
        "age":          calculate_age(record.get("birthdate")),
        "race":          record.get("race"),
        "hair_color":    record.get("hair_color"),
        "eye_color":     record.get("eye_color"),
        "skin_tone":     record.get("skin_tone"),
        "height_inches": record.get("height_inches"),
        "weight_pounds": record.get("weight_pounds"),
        "tier":                   record.get("tier"),
        "residency_restriction":  record.get("residency_restriction") == "1",
        "employment_restriction": record.get("employment_restriction") == "1",
        "exclusion_zones":        record.get("exclusion_zones") == "1",
        "wanted":                 record.get("wanted") == "1",
        "victim_minors":  record.get("victim_minors"),
        "victim_adults":  record.get("victim_adults"),
        "victim_unknown": record.get("victim_unknown"),
        "address":     record.get("address"),
        "line_1":      record.get("line_1"),
        "line_2":      record.get("line_2"),
        "city":        record.get("city"),
        "postal_code": record.get("postal_code"),
        "state":       record.get("state"),
        "county":      record.get("county"),
        "lat":         float(record["lat"]) if record.get("lat") else None,
        "lng":         float(record["lon"]) if record.get("lon") else None,
        "convictions": record.get("convictions", []),
        "aliases":     record.get("aliases", []),
        "photo":       record.get("photo"),
        "photos":      record.get("photos", []),
        "last_changed": record.get("last_changed"),
    }


def fetch_county(county: str, all_records: dict, county_num: int, total_counties: int):
    """Fetch all pages for a county, adding new records into all_records dict."""
    page = 1
    total_pages = None
    county_count = 0

    while True:
        try:
            data = fetch_page(county, page)
        except requests.HTTPError as e:
            print(f"    HTTP error: {e} — skipping remaining pages")
            break
        except requests.RequestException as e:
            print(f"    Request failed: {e} — skipping remaining pages")
            break

        if total_pages is None:
            total_pages = data.get("pages", 1)
            total_results = data.get("results", 0)
            print(f"  [{county_num}/{total_counties}] {county} County — {total_results} records, {total_pages} pages")

        records = data.get("records", [])
        if not records:
            break

        new = 0
        for raw in records:
            uid = raw.get("registrant")
            if uid and uid not in all_records:
                all_records[uid] = normalise(raw)
                new += 1
                county_count += 1

        print(f"    Page {page}/{total_pages} — {len(records)} fetched, {new} new (dupes skipped: {len(records) - new})")

        if page >= total_pages:
            break

        page += 1
        time.sleep(DELAY)

    return county_count


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    os.makedirs("data", exist_ok=True)

    all_records: dict[str, dict] = {}
    total_counties = len(ALL_IOWA_COUNTIES)

    print(f"Fetching all {total_counties} Iowa counties from the Sex Offender Registry...\n")
    start = time.time()

    for i, county in enumerate(ALL_IOWA_COUNTIES, start=1):
        fetch_county(county, all_records, i, total_counties)
        time.sleep(DELAY)

    elapsed = time.time() - start
    output = list(all_records.values())

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n{'─' * 50}")
    print(f"Done in {elapsed:.1f}s")
    print(f"{len(output)} unique registrants saved to → {OUTPUT_FILE}")


if __name__ == "__main__":
    main()