"use strict";
let adminTarget = null,
  adminAction = "",
  adminSaving = false;
function adminField(key, label, type, value = "") {
  const caption = el("label", label);
  caption.htmlFor = "admin-" + key;
  const input = el(type === "role" ? "select" : "input");
  input.id = "admin-" + key;
  input.name = key;
  if (type === "role") {
    for (const [id, name] of Object.entries(roles)) {
      const opt = el("option", name);
      opt.value = id;
      input.append(opt);
    }
  } else input.type = type;
  if (type === "checkbox") {
    input.checked = Boolean(value);
    input.className = "admin-checkbox";
  } else {
    input.value = value;
    input.required = true;
    input.maxLength = key === "reason" ? 500 : 254;
  }
  $("admin-fields").append(caption, input);
  return input;
}
function openAdmin(action, row = null) {
  adminAction = action;
  adminTarget = row;
  $("admin-error").textContent = "";
  $("admin-fields").replaceChildren();
  $("admin-title").textContent =
    action === "create"
      ? "Provisionar conta Microsoft"
      : action === "edit"
        ? "Permissões e situação"
        : action === "identity"
          ? "Vincular identidade Microsoft"
          : "Revogar todas as sessões";
  if (action === "create") {
    adminField("name", "Nome", "text");
    adminField("email", "E-mail institucional", "email");
    adminField("role", "Perfil", "role", "student");
    adminField("object_id", "Object ID do usuário no Entra", "text");
  }
  if (action === "edit") {
    adminField("role", "Perfil acadêmico", "role", row.role);
    adminField(
      "administrator",
      "Administrador (exige identidade Microsoft e perfil Coordenação)",
      "checkbox",
      row.administrator,
    );
    adminField("archived", "Conta bloqueada", "checkbox", row.archived);
  }
  if (action === "identity")
    adminField(
      "object_id",
      "Object ID do usuário no Entra",
      "text",
      row.object_id || "",
    );
  if (action !== "create") {
    const reason = adminField("reason", "Justificativa da alteração", "text");
    reason.minLength = 10;
  }
  $("admin-editor").showModal();
}
$("admin-cancel").addEventListener("click", () => {
  if (!adminSaving) $("admin-editor").close();
});
$("admin-editor").addEventListener("cancel", (event) => {
  if (adminSaving) event.preventDefault();
});
$("admin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (adminSaving) return;
  adminSaving = true;
  $("admin-save").disabled = true;
  const body = {};
  for (const input of $("admin-fields").querySelectorAll("input,select"))
    body[input.name] = input.type === "checkbox" ? input.checked : input.value;
  const path =
    "/admin/users" +
    (adminTarget ? "/" + adminTarget.id : "") +
    (adminAction === "identity"
      ? "/identity"
      : adminAction === "revoke"
        ? "/revoke"
        : "");
  try {
    await api(path, {
      method: ["create", "revoke"].includes(adminAction) ? "POST" : "PUT",
      body: JSON.stringify(body),
    });
    $("admin-editor").close();
    await render();
    status("Operação concluída e auditada.");
  } catch (error) {
    $("admin-error").textContent = error.message;
  } finally {
    adminSaving = false;
    $("admin-save").disabled = false;
  }
});
async function renderAdmin(resource, ticket) {
  if (resource === "adminStatus") {
    const info = await api("/admin/status");
    if (ticket !== generation) return;
    const box = el("div", undefined, "guide");
    box.append(el("h2", "Estado do ambiente de homologação"));
    for (const [label, value] of [
      ["Banco", info.database],
      ["Migração", info.revision],
      ["Microsoft configurado", info.microsoft_configured ? "Sim" : "Não"],
      ["Contexto de autenticação", info.admin_context || "Pendente"],
      ["Sessão", info.session_minutes + " minutos"],
      [
        "Confirmação de ações críticas",
        info.privileged_write_minutes + " minutos após autenticação",
      ],
    ])
      box.append(el("p", label + ": " + value));
    box.append(button("Confirmar identidade pela Microsoft", microsoftLogin));
    $("view").append(box);
    status("");
    return;
  }
  const rows = await api("/admin/users?offset=" + offset + "&limit=25");
  if (ticket !== generation) return;
  const box = el("div", undefined, "table-card"),
    toolbar = el("div", undefined, "toolbar");
  toolbar.append(
    button("Provisionar conta", () => openAdmin("create"), "primary"),
    button("Confirmar identidade", microsoftLogin),
  );
  box.append(toolbar);
  const scroll = el("div", undefined, "table-scroll"),
    table = el("table"),
    head = el("tr");
  ["Pessoa", "Acesso", "Situação", "Ações"].forEach((label) =>
    head.append(el("th", label)),
  );
  table.append(head);
  for (const row of rows) {
    const tr = el("tr"),
      person = el("td", row.name);
    person.append(
      el("small", row.email),
      el(
        "small",
        row.object_id ? "Microsoft vinculada" : "Sem identidade Microsoft",
      ),
    );
    tr.append(
      person,
      el("td", row.administrator ? "Administrador" : roles[row.role]),
      el("td", row.archived ? "Bloqueada" : "Ativa"),
    );
    const actions = el("td");
    if (row.id !== user.id) {
      actions.append(
        button("Permissões", () => openAdmin("edit", row)),
        button("Identidade", () => openAdmin("identity", row)),
      );
    }
    actions.append(
      button("Revogar sessões", () => openAdmin("revoke", row)),
      button("Ver sessões", async () => {
        try {
          const requestGeneration = generation;
          const sessions = await api("/admin/users/" + row.id + "/sessions");
          if (requestGeneration !== generation || !user) return;
          const detail = el("div", undefined, "guide");
          detail.append(el("h2", "Sessões de " + row.name));
          sessions.forEach((session) =>
            detail.append(
              el(
                "p",
                session.method +
                  " · expira em " +
                  new Date(session.expires_at).toLocaleString("pt-BR"),
              ),
            ),
          );
          if (!sessions.length) detail.append(el("p", "Nenhuma sessão ativa."));
          $("view").append(detail);
        } catch (error) {
          status(error.message, true);
        }
      }),
    );
    tr.append(actions);
    table.append(tr);
  }
  scroll.append(table);
  box.append(scroll);
  const pager = el("div", undefined, "pagination"),
    prev = button("Anterior", () => {
      offset = Math.max(0, offset - 25);
      render();
    }),
    next = button("Próxima", () => {
      offset += 25;
      render();
    });
  prev.disabled = offset === 0;
  next.disabled = rows.length < 25;
  pager.append(prev, el("span", "Página " + (offset / 25 + 1)), next);
  box.append(pager);
  $("view").append(box);
  status("");
}
