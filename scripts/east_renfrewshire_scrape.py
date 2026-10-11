#!/usr/bin/env python3
"""Fetch East Renfrewshire collection dates without publishing address identifiers.

Required environment variables:
  EAST_REN_POSTCODE
  EAST_REN_UPRN
Optional:
  OUTPUT_PATH (defaults to data/east-renfrewshire-schedule.json)
"""
import json
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from bs4 import BeautifulSoup
from curl_cffi import requests
from dateutil import parser

BASE_URL = "https://eastrenfrewshire.gov.uk"
FORM_PAGE = f"{BASE_URL}/bin-days"
OUTPUT_PATH = Path(os.environ.get("OUTPUT_PATH", "data/east-renfrewshire-schedule.json"))

COLORS = {
    "Grey": ("grey", "General waste", "⬛"),
    "Brown": ("brown", "Food and garden waste", "🟫"),
    "Green": ("green", "Recycling", "🟩"),
    "Blue": ("blue", "Paper and cardboard recycling", "🟦"),
}


def form_tokens(form):
    def value(name):
        node = form.find("input", attrs={"name": name})
        return node.get("value", "") if node else ""

    page_session_id = value("BINDAYSV2_PAGESESSIONID")
    session_id = value("BINDAYSV2_SESSIONID")
    nonce = value("BINDAYSV2_NONCE")
    if not (page_session_id and session_id and nonce):
        qs = parse_qs(urlparse(form["action"]).query)
        page_session_id = page_session_id or qs.get("pageSessionId", [""])[0]
        session_id = session_id or qs.get("fsid", [""])[0]
        nonce = nonce or qs.get("fsn", [""])[0]
    if not (page_session_id and session_id and nonce):
        raise RuntimeError("Council form session tokens were not present; the council page may have changed.")
    return page_session_id, session_id, nonce


def post_form(session, html, page_name, fields):
    soup = BeautifulSoup(html, "html.parser")
    form = soup.find(id="BINDAYSV2_FORM")
    if not form or not form.get("action"):
        raise RuntimeError("Could not find the council's bin-day form.")
    page_session_id, session_id, nonce = form_tokens(form)
    payload = {
        "BINDAYSV2_PAGESESSIONID": page_session_id,
        "BINDAYSV2_SESSIONID": session_id,
        "BINDAYSV2_NONCE": nonce,
        "BINDAYSV2_VARIABLES": "e30=",
        "BINDAYSV2_PAGENAME": page_name,
        "BINDAYSV2_PAGEINSTANCE": "0",
        **fields,
    }
    response = session.post(
        form["action"],
        headers={"Origin": BASE_URL, "Referer": FORM_PAGE},
        data=payload,
        timeout=30,
    )
    response.raise_for_status()
    return response.text


def main():
    postcode = os.environ.get("EAST_REN_POSTCODE", "").strip()
    uprn = os.environ.get("EAST_REN_UPRN", "").strip()
    if not postcode or not uprn or not uprn.isdigit() or len(uprn) > 12:
        raise RuntimeError("Set EAST_REN_POSTCODE and EAST_REN_UPRN as GitHub Actions secrets.")

    session = requests.Session(impersonate="chrome124")
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
    })
    first = session.get(FORM_PAGE, timeout=30)
    first.raise_for_status()
    page2 = post_form(session, first.text, "PAGE1", {
        "BINDAYSV2_PAGE1_POSTCODE": postcode,
        "BINDAYSV2_FORMACTION_NEXT": "BINDAYSV2_PAGE1_FIELD290",
    })
    results = post_form(session, page2, "PAGE2", {
        "BINDAYSV2_PAGE2_FIELD293": "true",
        "BINDAYSV2_PAGE2_UPRN": uprn.zfill(12),
        "BINDAYSV2_FORMACTION_NEXT": "BINDAYSV2_PAGE2_FIELD294",
        "BINDAYSV2_PAGE2_FIELD295": "false",
        "BINDAYSV2_PAGE2_FIELD297": "false",
    })

    soup = BeautifulSoup(results, "html.parser")
    table = soup.find("div", id="BINDAYSV2_RESULTS_NEXTCOLLECTIONLISTV4")
    if not table:
        raise RuntimeError("The council returned no collection table; refusing to publish unverified data.")

    bins = []
    for row in table.find_all("tr")[1:]:
        cols = row.find_all("td")
        if len(cols) < 3:
            continue
        try:
            day = parser.parse(cols[0].get_text(strip=True), dayfirst=True).date().isoformat()
        except (ValueError, OverflowError):
            continue
        for img in cols[2].find_all("img"):
            raw_color = (img.get("alt", "").split() or [""])[0].title()
            color, waste, emoji = COLORS.get(raw_color, ("blue", raw_color or "Collection", "♻"))
            bins.append({"name": f"{raw_color} — {waste}" if raw_color else waste, "date": day,
                         "color": color, "waste": waste, "emoji": emoji})

    if not bins:
        raise RuntimeError("The council results table contained no dated bin collections; refusing to publish.")

    bins.sort(key=lambda item: (item["date"], item["name"]))
    payload = {
        "kind": "council-calendar",
        "confirmed": True,
        "source": "East Renfrewshire Council bin-day checker",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "bins": bins,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Verified {len(bins)} collection entries. Output written without postcode or UPRN: {OUTPUT_PATH}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Collection refresh failed: {exc}", file=sys.stderr)
        sys.exit(1)
