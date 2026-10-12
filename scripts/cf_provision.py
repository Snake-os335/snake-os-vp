#!/usr/bin/env python3
"""Create a Cloudflare tunnel for this Snake OS install. Host and zone come from the environment."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.cloudflare.com/client/v4"
ACCOUNT = os.environ["CLOUDFLARE_ACCOUNT_ID"]
TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
TUNNEL_NAME = "snake-os"
HOSTNAME = os.environ.get("SNAKEOS_PUBLIC_HOST") or ""
ZONE_NAME = os.environ.get("SNAKEOS_ZONE_NAME") or ""
DNS_NAME = "snake-os"
ORIGIN = "http://web:8000"


def cf(method: str, path: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw = json.loads(resp.read().decode())
            raw["_http"] = resp.status
            return raw
    except urllib.error.HTTPError as e:
        raw_txt = e.read().decode() if e.fp else ""
        try:
            parsed = json.loads(raw_txt) if raw_txt else {}
        except json.JSONDecodeError:
            parsed = {"raw": raw_txt[:800]}
        parsed["_http"] = e.code
        parsed["_ok"] = False
        return parsed


def must(raw: dict, what: str) -> dict:
    if raw.get("success"):
        return raw
    print(f"FAIL {what} http={raw.get('_http')} errors={raw.get('errors') or raw}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    zones = must(cf("GET", f"/zones?name={urllib.parse.quote(ZONE_NAME)}"), "zones")
    zlist = zones.get("result") or []
    if not zlist:
        sys.exit("zone not found")
    zone_id = zlist[0]["id"]

    tunnels = must(cf("GET", f"/accounts/{ACCOUNT}/cfd_tunnel?is_deleted=false"), "list tunnels")
    tunnel = next((t for t in tunnels.get("result") or [] if t.get("name") == TUNNEL_NAME), None)
    created = False
    if tunnel:
        print(f"tunnel exists id={tunnel['id']}")
    else:
        created_raw = must(
            cf(
                "POST",
                f"/accounts/{ACCOUNT}/cfd_tunnel",
                {"name": TUNNEL_NAME, "config_src": "cloudflare"},
            ),
            "create tunnel",
        )
        tunnel = created_raw["result"]
        created = True
        print(f"tunnel created id={tunnel['id']}")

    tunnel_id = tunnel["id"]
    tok = must(cf("GET", f"/accounts/{ACCOUNT}/cfd_tunnel/{tunnel_id}/token"), "tunnel token")
    token_value = tok.get("result")
    if isinstance(token_value, dict):
        token_value = token_value.get("token") or token_value.get("value")

    must(
        cf(
            "PUT",
            f"/accounts/{ACCOUNT}/cfd_tunnel/{tunnel_id}/configurations",
            {
                "config": {
                    "ingress": [
                        {"hostname": HOSTNAME, "service": ORIGIN},
                        {"service": "http_status:404"},
                    ]
                }
            },
        ),
        "ingress",
    )
    print("ingress ok")

    recs = must(
        cf("GET", f"/zones/{zone_id}/dns_records?name={urllib.parse.quote(HOSTNAME)}"),
        "dns list",
    )
    cname_target = f"{tunnel_id}.cfargotunnel.com"
    existing = recs.get("result") or []
    if existing:
        rec = existing[0]
        if rec.get("type") != "CNAME" or rec.get("content") != cname_target or not rec.get("proxied"):
            must(
                cf(
                    "PATCH",
                    f"/zones/{zone_id}/dns_records/{rec['id']}",
                    {
                        "type": "CNAME",
                        "name": DNS_NAME,
                        "content": cname_target,
                        "proxied": True,
                    },
                ),
                "dns patch",
            )
            print("dns updated")
        else:
            print("dns already ok")
    else:
        must(
            cf(
                "POST",
                f"/zones/{zone_id}/dns_records",
                {
                    "type": "CNAME",
                    "name": DNS_NAME,
                    "content": cname_target,
                    "proxied": True,
                    "comment": TUNNEL_NAME,
                },
            ),
            "dns create",
        )
        print("dns created")

    out_path = os.environ.get("CF_OUT_FILE", "")
    payload = {
        "tunnel_id": tunnel_id,
        "tunnel_token": token_value,
        "created": created,
        "hostname": HOSTNAME,
        "zone_id": zone_id,
    }
    if out_path:
        with open(out_path, "w") as f:
            json.dump(payload, f)
        os.chmod(out_path, 0o600)
    print("RESULT_JSON=" + json.dumps({k: v for k, v in payload.items() if k != "tunnel_token"}))
    print("TUNNEL_ID=" + tunnel_id)
    print("TOKEN_LEN=" + str(len(str(token_value or ""))))


if __name__ == "__main__":
    main()
