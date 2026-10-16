"""axe-core WCAG 2.1 AA audit across roles, pages and dialogs (QA local)."""

import os

from playwright.sync_api import sync_playwright

# Configuration comes from the environment; see scripts/qa/README.md.
BASE = os.environ.get("QA_BASE", "http://127.0.0.1:8000")
PW = os.environ["QA_PASSWORD"]
CHROME = os.environ.get("QA_CHROME") or None
OUT = os.environ.get("QA_OUT", "qa-output")
os.makedirs(OUT, exist_ok=True)

AXE = os.environ["QA_AXE"]
TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
plan = {
    "student": (
        "lucas.silveira.demo@fatec.sp.gov.br",
        True,
        [
            "home",
            "attendance",
            "activity",
            "material",
            "notice",
            "event",
            "schedule",
            "calendar",
            "reminders",
            "profile",
            "myGroups",
            "search",
        ],
    ),
    "teacher": (
        "marcelo.dias.demo@fatec.sp.gov.br",
        True,
        ["home", "attendance", "activity"],
    ),
    "coordinator": (
        "coordenacao.dev@fatec.sp.gov.br",
        False,
        [
            "dashboard",
            "users",
            "courses",
            "memberships",
            "schedule",
            "notice",
            "audit",
            "attendance",
        ],
    ),
}
found = {}


def audit(page, name):
    page.add_script_tag(path=AXE)
    result = page.evaluate(
        "tags => axe.run(document, {runOnly: {type: 'tag', values: tags}})", TAGS
    )
    for item in result["violations"]:
        key = (item["id"], item["impact"])
        targets = [node["target"][0] for node in item["nodes"]][:4]
        found.setdefault(key, {"help": item["help"], "where": []})["where"].append(
            f"{name}: {targets}"
        )


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME)
    ctx = browser.new_context(bypass_csp=True, viewport={"width": 1280, "height": 860})
    ctx.add_init_script("localStorage.setItem('fatec:onboarding-completed:v1','true')")
    page = ctx.new_page()
    page.goto(BASE + "/panel/")
    page.wait_for_selector("#login-submit:not([disabled])")
    audit(page, "login")
    ctx.close()
    ctx = browser.new_context(bypass_csp=True, viewport={"width": 412, "height": 892})
    page = ctx.new_page()
    page.goto(BASE + "/panel/")
    page.wait_for_selector("#startup-view .onboarding")
    for step in (1, 2, 3):
        page.wait_for_timeout(400)
        audit(page, f"onboarding/{step}")
        if step < 3:
            page.click("#startup-view .onboarding-next")
    ctx.close()
    for role, (email, mobile, pages) in plan.items():
        ctx = browser.new_context(
            bypass_csp=True,
            viewport={"width": 420, "height": 900}
            if mobile
            else {"width": 1280, "height": 860},
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
        for key in pages:
            page.evaluate(f"navigate('{key}')")
            page.wait_for_timeout(600)
            audit(page, f"{role}/{key}")
        if role == "teacher":
            page.evaluate("navigate('home')")
            page.wait_for_timeout(500)
            page.click("text=Fazer chamada")
            page.wait_for_timeout(500)
            audit(page, "teacher/rollcall-dialog")
            page.keyboard.press("Escape")
            page.evaluate("navigate('activity')")
            page.wait_for_timeout(500)
            page.locator(".card-actions .primary").first.click()
            page.wait_for_timeout(700)
            audit(page, "teacher/activity-dialog")
            page.keyboard.press("Escape")
            page.evaluate("navigate('attendance')")
            page.wait_for_timeout(600)
            page.locator("button.roll-row").first.click()
            page.wait_for_timeout(600)
            audit(page, "teacher/rollcall-existing")
            page.keyboard.press("Escape")
            page.locator("label.toggle-chip").click()
            page.wait_for_timeout(600)
            audit(page, "teacher/attendance-archived")
        if role == "coordinator":
            page.evaluate("navigate('notice')")
            page.wait_for_timeout(500)
            page.click("#heading-actions >> text=Novo aviso")
            page.wait_for_timeout(600)
            page.click(".field-group summary")
            audit(page, "coordinator/notice-editor")
            page.keyboard.press("Escape")
            page.evaluate("navigate('groups')")
            page.wait_for_timeout(500)
            page.click("#new-record")
            page.wait_for_timeout(500)
            audit(page, "coordinator/group-editor")
        ctx.close()
    browser.close()
for (rule, impact), info in sorted(found.items(), key=lambda x: str(x[0])):
    print(f"[{impact}] {rule}: {info['help']}")
    for where in info["where"][:6]:
        print("    ", where)
print("TOTAL rules violated:", len(found))
