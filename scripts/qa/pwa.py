"""PWA checks in Chromium: worker, manifest, push display and offline shell (QA local)."""

import json
import os

from playwright.sync_api import sync_playwright

# Configuration comes from the environment; see scripts/qa/README.md.
BASE = os.environ.get("QA_BASE", "http://127.0.0.1:8000")
PW = os.environ["QA_PASSWORD"]
CHROME = os.environ.get("QA_CHROME") or None
OUT = os.environ.get("QA_OUT", "qa-output")
os.makedirs(OUT, exist_ok=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME)
    ctx = browser.new_context(viewport={"width": 420, "height": 900}, locale="pt-BR")
    ctx.add_init_script("localStorage.setItem('fatec:onboarding-completed:v1','true')")
    ctx.grant_permissions(["notifications"], origin=BASE)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "/panel/")
    scope = page.evaluate("navigator.serviceWorker.ready.then(r => r.scope)")
    print("worker scope:", scope)
    manifest = page.evaluate(
        "fetch(document.querySelector('link[rel=manifest]').href).then(r => r.json())"
    )
    print(
        "manifest:", manifest["short_name"], manifest["start_url"], manifest["display"]
    )
    for icon in manifest["icons"]:
        status = page.evaluate(
            f"fetch(new URL('{icon['src']}', document.querySelector('link[rel=manifest]').href)).then(r => r.status)"
        )
        assert status == 200, icon
    page.fill("#email", "lucas.silveira.demo@fatec.sp.gov.br")
    page.fill("#password", PW)
    page.click("#login-submit")
    page.wait_for_selector("#app-view:not([hidden])")
    page.evaluate("navigate('profile')")
    page.wait_for_selector(".device-card")
    page.wait_for_timeout(600)
    print(
        "panel:", page.locator(".device-card").inner_text().replace("\n", " | ")[:300]
    )
    page.screenshot(path=OUT + "/pwa-profile.png", full_page=True)

    # Deliver a push message straight to the worker through DevTools.
    cdp = ctx.new_cdp_session(page)
    registrations = []
    cdp.on(
        "ServiceWorker.workerRegistrationUpdated",
        lambda event: registrations.extend(event["registrations"]),
    )
    cdp.send("ServiceWorker.enable")
    page.wait_for_timeout(500)
    registration = next(r for r in registrations if r["scopeURL"] == scope)
    cdp.send(
        "ServiceWorker.deliverPushMessage",
        {
            "origin": BASE,
            "registrationId": registration["registrationId"],
            "data": json.dumps(
                {
                    "title": "Novo aviso",
                    "body": "Rematrícula aberta",
                    "page": "notice",
                    "tag": "t1",
                }
            ),
        },
    )
    page.wait_for_timeout(1000)
    shown = page.evaluate(
        "navigator.serviceWorker.ready.then(r => r.getNotifications()).then(list => list.map(n => [n.title, n.body, n.data.page]))"
    )
    print("notifications shown:", shown)
    assert shown == [["Novo aviso", "Rematrícula aberta", "notice"]]

    # Offline: the cached shell still opens.
    ctx.set_offline(True)
    page.reload()
    page.wait_for_selector("#login-view, #app-view", state="attached")
    print("offline title:", page.title())
    page.screenshot(path=OUT + "/pwa-offline.png")
    print("errors:", errors)
    browser.close()
print("PWA OK")
