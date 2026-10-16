"""Visual tour of every role for design review (QA local). Usage: tour.py OUTDIR [roles]"""

import os
import sys

from playwright.sync_api import sync_playwright

# Configuration comes from the environment; see scripts/qa/README.md.
BASE = os.environ.get("QA_BASE", "http://127.0.0.1:8000")
PW = os.environ["QA_PASSWORD"]
CHROME = os.environ.get("QA_CHROME") or None
OUT = os.environ.get("QA_OUT", "qa-output")
os.makedirs(OUT, exist_ok=True)

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT, "tour")
only = sys.argv[2:] or ["login", "student", "teacher", "coordinator"]
os.makedirs(OUT, exist_ok=True)
plan = {
    "student": (
        "lucas.silveira.demo@fatec.sp.gov.br",
        True,
        [
            "home",
            "schedule",
            "activity",
            "material",
            "attendance",
            "calendar",
            "event",
            "notice",
            "reminders",
            "profile",
            "myGroups",
            "search",
        ],
    ),
    "teacher": (
        "marcelo.dias.demo@fatec.sp.gov.br",
        True,
        ["home", "activity", "attendance", "myGroups", "schedule"],
    ),
    "coordinator": (
        "coordenacao.dev@fatec.sp.gov.br",
        False,
        [
            "dashboard",
            "users",
            "courses",
            "groups",
            "memberships",
            "schedule",
            "notice",
            "event",
            "attendance",
            "audit",
            "reminders",
            "profile",
        ],
    ),
}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME)
    if "login" in only:
        for name, size in [
            ("login-mobile", (390, 844)),
            ("login-desktop", (1280, 820)),
        ]:
            ctx = browser.new_context(
                viewport={"width": size[0], "height": size[1]}, locale="pt-BR"
            )
            ctx.add_init_script(
                "localStorage.setItem('fatec:onboarding-completed:v1','true')"
            )
            page = ctx.new_page()
            page.goto(BASE + "/panel/")
            page.wait_for_selector("#login-submit:not([disabled])")
            page.screenshot(path=f"{OUT}/{name}.png")
            ctx.close()
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844}, locale="pt-BR"
        )
        page = ctx.new_page()
        page.goto(BASE + "/panel/")
        page.wait_for_timeout(900)
        page.screenshot(path=f"{OUT}/onboarding-1.png")
        ctx.close()
    for role in [r for r in only if r in plan]:
        email, mobile, pages = plan[role]
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844}
            if mobile
            else {"width": 1366, "height": 860},
            locale="pt-BR",
            timezone_id="America/Sao_Paulo",
        )
        ctx.add_init_script(
            "localStorage.setItem('fatec:onboarding-completed:v1','true')"
        )
        page = ctx.new_page()
        page.goto(BASE + "/panel/")
        page.wait_for_selector("#login-submit:not([disabled])")
        page.fill("#email", email)
        page.fill("#password", PW)
        page.click("#login-submit")
        page.wait_for_selector("#app-view:not([hidden])")
        page.wait_for_timeout(700)
        for key in pages:
            page.evaluate(f"navigate('{key}')")
            page.wait_for_timeout(700)
            page.screenshot(path=f"{OUT}/{role}-{key}.png", full_page=True)
        if role == "student":
            page.evaluate("navigate('activity')")
            page.wait_for_timeout(500)
            page.locator(".card-actions .primary").first.click()
            page.wait_for_timeout(700)
            page.screenshot(path=f"{OUT}/{role}-activity-dialog.png")
        if role == "teacher":
            page.evaluate("navigate('home')")
            page.wait_for_timeout(500)
            page.click("text=Fazer chamada")
            page.wait_for_timeout(600)
            page.screenshot(path=f"{OUT}/{role}-rollcall.png")
        if role == "coordinator":
            page.evaluate("navigate('notice')")
            page.wait_for_timeout(500)
            page.click("#heading-actions >> text=Novo aviso")
            page.wait_for_timeout(600)
            page.screenshot(path=f"{OUT}/{role}-editor.png")
        ctx.close()
    browser.close()
print("ok")
