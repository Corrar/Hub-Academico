"""End-to-end smoke test in Chromium against the seeded demo base (QA local)."""

import os

from playwright.sync_api import expect, sync_playwright

# Configuration comes from the environment; see scripts/qa/README.md.
BASE = os.environ.get("QA_BASE", "http://127.0.0.1:8000")
PW = os.environ["QA_PASSWORD"]
CHROME = os.environ.get("QA_CHROME") or None
OUT = os.environ.get("QA_OUT", "qa-output")
os.makedirs(OUT, exist_ok=True)

PDF = os.path.join(OUT, "plano.pdf")
with open(PDF, "wb") as handle:
    handle.write(b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")


def session(browser, email, password=PW, mobile=True):
    ctx = browser.new_context(
        viewport={"width": 420, "height": 900}
        if mobile
        else {"width": 1280, "height": 860},
        locale="pt-BR",
        timezone_id="America/Sao_Paulo",
    )
    ctx.add_init_script("localStorage.setItem('fatec:onboarding-completed:v1','true')")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("dialog", lambda d: d.accept())
    page.goto(BASE + "/panel/")
    page.wait_for_selector("#login-submit:not([disabled])")
    page.fill("#email", email)
    page.fill("#password", password)
    page.click("#login-submit")
    page.wait_for_selector("#app-view:not([hidden])")
    return ctx, page, errors


def go(page, key):
    page.evaluate(f"navigate('{key}')")
    page.wait_for_timeout(500)


def card(page, title):
    return page.locator(".publication-card", has_text=title)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME)

    # 1. Student: attach a PDF to the draft, send, undo and send again.
    ctx, page, errors = session(browser, "lucas.silveira.demo@fatec.sp.gov.br")
    go(page, "activity")
    plan = card(page, "Plano de Marketing Digital")
    expect(plan.locator(".badge", has_text="Rascunho salvo")).to_be_visible()
    plan.locator(".card-actions .primary").click()
    dialog = page.locator(".academic-dialog")
    expect(dialog).to_contain_text("Minha entrega")
    dialog.locator(".submission-card input[type=file]").set_input_files(PDF)
    dialog.locator(".submission-card button", has_text="Enviar arquivo").click()
    expect(dialog.locator(".submission-card .attachment-line")).to_contain_text(
        "plano.pdf"
    )
    dialog.locator("text=Editar entrega").click()
    editor = page.locator(".academic-dialog")
    editor.locator("#learning-body").fill("Plano completo para a padaria do bairro.")
    editor.locator("#learning-draft").uncheck()
    editor.locator("button[type=submit]").click()
    page.wait_for_timeout(700)
    expect(
        card(page, "Plano de Marketing Digital").locator(".badge", has_text="Entregue")
    ).to_be_visible()
    card(page, "Plano de Marketing Digital").locator(".card-actions .primary").click()
    page.locator(".academic-dialog >> text=Desfazer entrega").click()
    expect(page.locator(".academic-dialog")).to_contain_text("Rascunho privado")
    page.locator(".academic-dialog >> text=Fechar").last.click()
    go(page, "activity")
    expect(
        card(page, "Plano de Marketing Digital").locator(
            ".badge", has_text="Rascunho salvo"
        )
    ).to_be_visible()
    card(page, "Plano de Marketing Digital").locator(".card-actions .primary").click()
    page.locator(".academic-dialog >> text=Editar entrega").click()
    page.locator("#learning-draft").uncheck()
    page.locator(".academic-dialog button[type=submit]").click()
    page.wait_for_timeout(700)
    expect(
        card(page, "Plano de Marketing Digital").locator(".badge", has_text="Entregue")
    ).to_be_visible()

    # 2. Student: enroll in the event, read reminders, change password.
    go(page, "event")
    card(page, "Semana de Tecnologia").locator(".card-actions .primary").click()
    page.locator(".academic-dialog >> text=Cancelar inscrição").click()
    page.locator(".academic-dialog >> text=Inscrever-me").click()
    expect(page.locator(".academic-dialog >> text=Cancelar inscrição")).to_be_visible()
    page.locator(".academic-dialog >> text=Fechar").last.click()
    go(page, "reminders")
    page.locator("text=Marcar todas como lidas").click()
    page.wait_for_timeout(600)
    expect(page.locator("#open-reminders .count-badge")).to_have_count(0)
    go(page, "profile")
    page.locator("text=Alterar senha").click()
    page.fill("#learning-current_password", PW)
    page.fill("#learning-new_password", "senha-nova-lucas-2026")
    page.fill("#learning-confirm_password", "senha-nova-lucas-2026")
    page.locator(".academic-dialog button[type=submit]").click()
    expect(page.locator("#status")).to_contain_text("Senha alterada")
    page.screenshot(path=f"{OUT}/e2e-student-done.png", full_page=True)
    print("student errors:", errors)
    ctx.close()
    ctx, page, errors = session(
        browser, "lucas.silveira.demo@fatec.sp.gov.br", "senha-nova-lucas-2026"
    )
    print("student relogin ok")
    ctx.close()

    # 3. Teacher: grading queue with "save and next" and roster.
    ctx, page, errors = session(browser, "renata.alves.demo@fatec.sp.gov.br")
    go(page, "activity")
    card(page, "Plano de Marketing Digital").locator(".card-actions .primary").click()
    dialog = page.locator(".academic-dialog")
    expect(dialog.locator(".delivery-stats")).to_contain_text("2 de 3")
    dialog.locator("text=Somente entregas a avaliar").click()
    page.wait_for_timeout(500)
    dialog.locator(".submission-card button", has_text="Avaliar").first.click()
    grade = page.locator(".academic-dialog")
    expect(
        grade.locator("button", has_text="Salvar e ir para o próximo")
    ).to_be_visible()
    grade.locator("#learning-grade").fill("9")
    grade.locator("#learning-feedback").fill("Ótimo plano, KPIs bem definidos.")
    grade.locator("button", has_text="Salvar e ir para o próximo").click()
    page.wait_for_timeout(800)
    nxt = page.locator(".academic-dialog")
    expect(nxt.locator("h2")).to_contain_text("Avaliação")
    nxt.locator("#learning-grade").fill("8")
    nxt.locator("#learning-feedback").fill("Bom trabalho; detalhe o cronograma.")
    nxt.locator("button[type=submit]", has_text="Salvar").last.click()
    page.wait_for_timeout(800)
    expect(page.locator(".academic-dialog .delivery-stats")).to_contain_text("0")
    page.screenshot(path=f"{OUT}/e2e-teacher-graded.png", full_page=True)
    page.locator(".academic-dialog >> text=Fechar").last.click()
    go(page, "myGroups")
    page.locator(".group-card").first.click()
    page.locator("text=Alunos e desempenho").click()
    expect(page.locator(".academic-dialog table")).to_contain_text("Lucas Silveira")
    page.screenshot(path=f"{OUT}/e2e-teacher-roster.png", full_page=True)
    page.locator(".academic-dialog >> text=Fechar").last.click()
    # Roll-call history: archive from the dialog, find it archived, restore.
    go(page, "attendance")
    first = page.locator("button.roll-row").first
    label = first.get_attribute("aria-label")
    expect(first).to_contain_text("1 falta")
    first.click()
    page.locator(".academic-dialog >> text=Arquivar chamada").click()
    expect(page.locator("#status")).to_contain_text("Chamada arquivada")
    page.locator("label.toggle-chip", has_text="Mostrar arquivadas").click()
    page.wait_for_timeout(600)
    archived_row = page.locator(".roll-row.archived").first
    expect(archived_row).to_have_attribute(
        "aria-label", label.replace(". Abrir chamada", "")
    )
    archived_row.locator("text=Restaurar").click()
    expect(page.locator("#status")).to_contain_text("Chamada restaurada")
    print("teacher errors:", errors)
    ctx.close()

    # 4. Coordination: scheduled institutional notice, enrollees, user maintenance.
    ctx, page, errors = session(
        browser, "coordenacao.dev@fatec.sp.gov.br", mobile=False
    )
    go(page, "notice")
    page.click("#heading-actions >> text=Novo aviso")
    page.fill("#learning-title", "Aviso agendado de teste")
    page.fill("#learning-body", "Conteúdo agendado.")
    page.select_option("#learning-audience", "institution")
    expect(page.locator(".reach")).to_contain_text("Alcance: 10 pessoas")
    page.click(".field-group summary")
    page.fill("#learning-publish_at", "2030-01-10T08:00")
    page.locator("#learning-draft").uncheck()
    page.locator(".academic-dialog button[type=submit]").click()
    page.wait_for_timeout(700)
    expect(
        card(page, "Aviso agendado de teste").locator(".badge", has_text="Agendado")
    ).to_be_visible()
    go(page, "event")
    card(page, "Semana de Tecnologia").locator(".card-actions .primary").click()
    page.locator(".academic-dialog summary", has_text="Ver inscritos").click()
    expect(page.locator(".academic-dialog")).to_contain_text("Lucas Silveira")
    page.locator(".academic-dialog >> text=Fechar").last.click()
    go(page, "users")
    page.fill(".table-search input", "julia")
    page.locator(".table-search button").click()
    page.wait_for_timeout(500)
    expect(page.locator("tbody tr")).to_have_count(1)
    page.locator("tbody tr >> text=Editar").click()
    page.fill("#learning-name", "Julia Vasques Prado")
    page.locator(".academic-dialog button[type=submit]").click()
    page.wait_for_timeout(500)
    expect(page.locator("tbody")).to_contain_text("Julia Vasques Prado")
    page.locator("tbody tr >> text=Redefinir senha").click()
    page.fill("#learning-new_password", "senha-temporaria-julia")
    page.locator(".academic-dialog button[type=submit]").click()
    expect(page.locator("#status")).to_contain_text("Senha redefinida")
    go(page, "audit")
    expect(page.locator("tbody")).to_contain_text("Redefinição de senha")
    page.screenshot(path=f"{OUT}/e2e-coordinator-audit.png", full_page=True)
    print("coordinator errors:", errors)
    ctx.close()
    ctx, page, errors = session(
        browser, "julia.vasques.demo@fatec.sp.gov.br", "senha-temporaria-julia"
    )
    expect(page.locator("#page-title")).to_contain_text("Julia")
    go(page, "profile")
    expect(page.locator("#view")).to_contain_text("Julia Vasques Prado")
    print("julia relogin ok")
    ctx.close()
    browser.close()
print("E2E OK")
