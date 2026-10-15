"use strict";
const $ = (id) => document.getElementById(id);
const titles = {
  dashboard: "Visão geral",
  courses: "Cursos",
  subjects: "Disciplinas",
  groups: "Turmas",
  memberships: "Matrículas e vínculos",
  users: "Usuários",
  audit: "Auditoria",
  adminUsers: "Administração de usuários",
  adminStatus: "Sistema e segurança",
  myGroups: "Minhas turmas",
};
// Create and edit labels for the structure records.
const recordLabels = {
  courses: ["Novo curso", "Editar curso"],
  subjects: ["Nova disciplina", "Editar disciplina"],
  groups: ["Nova turma", "Editar turma"],
  users: ["Novo usuário", "Editar usuário"],
  memberships: ["Vincular pessoa", "Editar vínculo"],
};
const descriptions = {
  dashboard: "Acompanhe a base acadêmica e organize os próximos cadastros.",
  courses: "Os cursos que compõem a estrutura da unidade.",
  subjects: "Disciplinas vinculadas a cursos e períodos da matriz.",
  groups: "Ofertas de disciplinas em cada semestre letivo.",
  memberships:
    "Alunos e professores associados às turmas, com vigência definida.",
  users: "Contas provisionadas para uso no ambiente de desenvolvimento.",
  audit:
    "Histórico de alterações nos cadastros, com autor e valores registrados.",
};
const roles = {
  student: "Aluno",
  teacher: "Professor",
  coordinator: "Coordenação",
};
const resources = {
  courses: {
    fields: [
      ["code", "Código", "text"],
      ["name", "Nome do curso", "text"],
    ],
  },
  subjects: {
    fields: [
      ["course_id", "Curso", "courses"],
      ["code", "Código", "text"],
      ["name", "Nome da disciplina", "text"],
      ["term", "Período da matriz", "number"],
    ],
  },
  groups: {
    fields: [
      ["subject_id", "Disciplina", "subjects"],
      ["semester", "Semestre letivo (AAAA/1 ou AAAA/2)", "text"],
      ["name", "Nome da turma", "text"],
    ],
  },
  users: {
    fields: [
      ["name", "Nome completo", "text"],
      ["email", "E-mail institucional", "email"],
      ["role", "Perfil", "role"],
      ["password", "Senha inicial de teste", "password"],
    ],
  },
  memberships: {
    fields: [
      ["user_id", "Aluno ou professor", "users"],
      ["group_id", "Turma", "groups"],
      ["starts_on", "Início do vínculo", "date"],
      ["ends_on", "Fim do vínculo", "date"],
    ],
  },
};
let microsoftEnabled = false;
let localLoginEnabled = false;
let csrf = "",
  user = null,
  page = "dashboard",
  offset = 0,
  archived = false,
  generation = 0;
let editing = null,
  editorResource = null,
  editorVersion = 0,
  saving = false;
// Search and role filter of the administrative listings.
let adminSearch = "",
  adminRole = "";
const searchable = new Set([
  "courses",
  "subjects",
  "groups",
  "users",
  "memberships",
]);
let adminGroup = "";
const entityLabels = {
  users: "Usuário",
  courses: "Curso",
  subjects: "Disciplina",
  class_groups: "Turma",
  memberships: "Vínculo",
  publications: "Publicação",
  submissions: "Entrega",
  event_enrollments: "Inscrição em evento",
  schedules: "Horário",
  attachments: "Anexo",
  attendance_lessons: "Chamada",
};
const fieldLabels = {
  name: "Nome",
  email: "E-mail",
  role: "Perfil",
  code: "Código",
  term: "Período",
  semester: "Semestre",
  title: "Título",
  body: "Conteúdo",
  draft: "Rascunho",
  archived: "Arquivado",
  due_at: "Prazo",
  starts_at: "Início",
  ends_at: "Término",
  starts_on: "Início",
  ends_on: "Fim",
  capacity: "Vagas",
  grade: "Nota",
  feedback: "Devolutiva",
  version: "Versão",
  room: "Sala",
  weekday: "Dia da semana",
  starts_minute: "Início (min)",
  ends_minute: "Término (min)",
  topic: "Conteúdo da aula",
  absent_ids: "Ausentes",
  publish_at: "Publicar em",
  expires_at: "Sai do ar",
  audience: "Público",
  kind: "Tipo",
  reason: "Justificativa",
  sessions_revoked: "Sessões encerradas",
  submitted_at: "Enviada em",
  graded_at: "Avaliada em",
  publication_id: "Publicação",
  student_id: "Aluno",
  user_id: "Pessoa",
  group_id: "Turma",
  course_id: "Curso",
  subject_id: "Disciplina",
  creator_id: "Autor",
  recorded_by: "Registrada por",
  schedule_id: "Horário",
  lesson_date: "Data da aula",
  recorded_at: "Registrada em",
  created_at: "Criado em",
};
function auditValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value))
    return value.length ? plural(value.length, "item", "itens") : "nenhum";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text)) return when(text);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(text)) return "#" + text.slice(0, 8);
  return text.length > 160 ? text.slice(0, 157) + "…" : text;
}
// Before/after per field instead of raw JSON; unchanged fields are omitted.
function auditDiff(changes) {
  let data;
  try {
    data = JSON.parse(changes);
  } catch {
    return el("pre", changes);
  }
  const hidden = new Set(["id", "password_hash", "fanout_at"]);
  const lines = [];
  const paired = data && typeof data === "object" && "after" in data;
  if (paired) {
    const before = data.before || {},
      after = data.after || {};
    for (const key of new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ])) {
      if (hidden.has(key)) continue;
      if (
        data.before &&
        JSON.stringify(before[key]) === JSON.stringify(after[key])
      )
        continue;
      lines.push([key, data.before ? before[key] : undefined, after[key]]);
    }
  } else
    for (const [key, value] of Object.entries(data || {}))
      if (!hidden.has(key)) lines.push([key, undefined, value]);
  const table = el("table", undefined, "diff-table"),
    head = el("tr");
  const compare = paired && data.before;
  for (const label of compare
    ? ["Campo", "Antes", "Depois"]
    : ["Campo", "Valor"])
    head.append(el("th", label));
  table.append(head);
  for (const [key, before, after] of lines) {
    const line = el("tr");
    line.append(el("td", fieldLabels[key] || key));
    if (compare) line.append(el("td", auditValue(before), "before"));
    line.append(el("td", auditValue(after)));
    table.append(line);
  }
  if (!lines.length) table.append(el("caption", "Sem alteração de campos."));
  return table;
}
function personCell(name, email, role, badge = true) {
  const cell = el("td"),
    wrap = el("div", undefined, "person-cell");
  const text = el("div");
  text.append(el("strong", name), el("small", email));
  wrap.append(el("span", initials(name), "avatar " + (role || "")), text);
  if (role && badge) wrap.append(el("span", roles[role], "badge role-" + role));
  cell.append(wrap);
  return cell;
}
function stackedCell(main, detail) {
  const cell = el("td");
  cell.append(el("strong", main, "cell-main"), el("small", detail));
  return cell;
}
function validity(row) {
  const today = brDate(Date.now()),
    cell = el("td");
  const [text, tone] =
    row.ends_on < today
      ? ["Encerrado", ""]
      : row.starts_on > today
        ? ["Começa " + formatDate(row.starts_on), "gold"]
        : ["Vigente", "green"];
  cell.append(
    el("span", text, "badge " + tone),
    el("small", `${formatDate(row.starts_on)} a ${formatDate(row.ends_on)}`),
  );
  return cell;
}
const labels = new Map();
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, handler, className = "secondary") {
  const node = el("button", text, className);
  node.type = "button";
  node.addEventListener("click", handler);
  return node;
}
let statusTimer = 0;
// Feedback appears as a toast; confirmations fade, errors stay until replaced.
function status(message, error = false) {
  clearTimeout(statusTimer);
  $("status").textContent = message;
  $("status").className = message ? (error ? "toast error" : "toast") : "";
  if (message && !error)
    statusTimer = setTimeout(() => {
      if ($("status").textContent === message) status("");
    }, 6000);
}
const zone = "America/Sao_Paulo";
function instant(value) {
  return new Date(
    typeof value === "string" && !/[Zz]|[+-]\d\d:\d\d$/.test(value)
      ? value + "Z"
      : value,
  );
}
function dayKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
function clock(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
// "hoje, 19:00", "amanhã, 23:59", "sex., 18 de out., 19:00" — Brasília time.
function when(value, withTime = true) {
  if (!value) return "—";
  const date = instant(value),
    today = new Date(),
    days = Math.round(
      (Date.parse(dayKey(date)) - Date.parse(dayKey(today))) / 86400000,
    );
  const time = withTime ? ", " + clock(date) : "";
  if (days === 0) return "hoje" + time;
  if (days === 1) return "amanhã" + time;
  if (days === -1) return "ontem" + time;
  const sameYear = dayKey(date).slice(0, 4) === dayKey(today).slice(0, 4);
  return (
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: zone,
      weekday: Math.abs(days) < 7 ? "long" : "short",
      day: "numeric",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
    }).format(date) + time
  );
}
// Deadline wording and tone: closed, due within a day, within three days.
function deadline(value) {
  const remaining = instant(value) - Date.now(),
    hours = remaining / 3600000;
  if (remaining <= 0)
    return { text: "Encerrada " + when(value), tone: "closed" };
  if (hours <= 24) return { text: "Vence " + when(value), tone: "urgent" };
  if (hours <= 72) return { text: "Vence " + when(value), tone: "soon" };
  return { text: "Vence " + when(value), tone: "" };
}
function deadlineChip(value) {
  const info = deadline(value),
    chip = el("span", info.text, "deadline " + info.tone);
  chip.prepend(icon("schedule"));
  return chip;
}
// Group labels arrive as "Disciplina · Turma · Semestre".
function groupParts(label = "") {
  const [subject = label, name = "", semester = ""] = label.split(" · ");
  return {
    subject,
    name,
    semester,
    rest: [name, semester].filter(Boolean).join(" · "),
  };
}
function greeting(name) {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: zone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );
  const first = name.trim().split(/\s+/)[0];
  return (
    (hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite") +
    ", " +
    first
  );
}
function searchField(value, placeholder, submit, label = placeholder) {
  const form = el("form", undefined, "search-field"),
    input = el("input"),
    go = el("button", "Buscar", "secondary");
  input.type = "search";
  input.maxLength = 120;
  input.value = value;
  input.placeholder = placeholder;
  input.setAttribute("aria-label", label);
  go.type = "submit";
  form.append(icon("search"), input, go);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit(input.value.trim());
  });
  return form;
}
function segmented(label, options, value, change) {
  const group = el("div", undefined, "segmented");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", label);
  for (const [key, text] of options) {
    const option = button(text, () => change(key), "segment");
    option.setAttribute("aria-pressed", String(key === value));
    group.append(option);
  }
  return group;
}
function archivedToggle(label = "Mostrar arquivados") {
  const caption = el("label", label, "toggle-chip"),
    check = el("input");
  check.type = "checkbox";
  check.checked = archived;
  check.addEventListener("change", () => {
    archived = check.checked;
    offset = 0;
    render();
  });
  caption.prepend(check);
  return caption;
}
function resetSession(message = "") {
  document
    .querySelectorAll(".academic-dialog")
    .forEach((node) => node.remove());
  csrf = "";
  user = null;
  labels.clear();
  generation++;
  editorVersion++;
  academicGroup = "";
  for (const key of Object.keys(academicSearch)) delete academicSearch[key];
  globalSearch = "";
  calendarMonth = null;
  calendarSelected = null;
  $("editor").close();
  $("admin-editor").close();
  $("admin-fields").replaceChildren();
  $("fields").replaceChildren();
  $("view").replaceChildren();
  $("account-name").textContent = "";
  $("app-view").hidden = true;
  $("login-view").hidden = false;
  $("login-error").textContent = message;
  document.body.removeAttribute("data-role");
  document.body.removeAttribute("data-page");
  document.body.classList.remove("menu-open");
  $("menu-toggle").setAttribute("aria-expanded", "false");
  $("bottom-navigation").replaceChildren();
}
async function api(path, options = {}) {
  const headers = { ...options.headers };
  if (options.body && !headers["Content-Type"])
    headers["Content-Type"] = "application/json";
  if (options.method && options.method !== "GET" && csrf)
    headers["X-CSRF-Token"] = csrf;
  let response;
  try {
    response = await fetch("/api/v1" + path, {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Não foi possível conectar. Verifique a conexão e tente novamente.",
    );
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && user && path !== "/web/login")
      resetSession("Sua sessão terminou. Entre novamente.");
    let message =
      typeof data.detail === "string"
        ? data.detail
        : "Não foi possível concluir a operação.";
    if (Array.isArray(data.detail))
      message =
        "Revise os campos: " +
        [...new Set(data.detail.map((e) => e.loc.slice(1).join(".")))].join(
          ", ",
        ) +
        ".";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}
function enter(data) {
  user = data.user;
  csrf = data.csrf_token;
  $("login-view").hidden = true;
  $("app-view").hidden = false;
  $("account-name").textContent = user.name;
  setupExperience();
  void syncPush();
  document.querySelector(".sidebar-title").textContent = user.administrator
    ? "Administração"
    : roles[user.role];
  document.querySelector(".topbar .muted").textContent =
    "/ " + (user.administrator ? "Administração" : roles[user.role]);
  const route = location.hash.slice(1);
  navigate(
    allowedPages().includes(route)
      ? route
      : user.role === "coordinator"
        ? "dashboard"
        : "home",
  );
}
$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!localLoginEnabled) return;
  const submit = event.submitter;
  submit.disabled = true;
  $("login-error").textContent = "";
  const credentials = {
    email: $("email").value,
    password: $("password").value,
  };
  try {
    const data = await api("/web/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    $("password").value = "";
    enter(data);
  } catch (error) {
    $("login-error").textContent = error.message;
  } finally {
    credentials.password = "";
    $("password").value = "";
    submit.disabled = false;
  }
});
$("logout").addEventListener("click", async () => {
  $("logout").disabled = true;
  try {
    await releasePush();
    await api("/auth/logout", { method: "POST" });
    resetSession();
    $("email").focus();
  } catch (error) {
    status(error.message, true);
  } finally {
    $("logout").disabled = false;
  }
});
function navigate(key, { groupId = "" } = {}) {
  if (!user || !allowedPages().includes(key)) return;
  page = key;
  academicGroup = groupId;
  offset = 0;
  archived = false;
  adminSearch = adminRole = adminGroup = "";
  activityFilter = "";
  agendaDay = null;
  for (const item of document.querySelectorAll("nav button[data-page]")) {
    if (item.dataset.page === key) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }
  $("page-title").textContent = titles[key];
  $("page-description").textContent = descriptions[key] || "";
  $("new-record").hidden =
    !resources[key] || (key === "users" && microsoftEnabled);
  $("new-record").textContent = recordLabels[key]?.[0] || "Novo cadastro";
  document.body.dataset.page = key;
  document.body.classList.remove("menu-open");
  $("menu-toggle").setAttribute("aria-expanded", "false");
  history.replaceState(
    null,
    "",
    location.pathname + location.search + "#" + key,
  );
  updateHeading(key);
  render();
}
$("new-record").addEventListener("click", () => openEditor());
function formatDate(value) {
  if (!value) return "—";
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}
function reference(resource, id) {
  return labels.get(resource + ":" + id) || id;
}
async function resolveReferences(rows) {
  const map = {
    course_id: "courses",
    subject_id: "subjects",
    group_id: "groups",
    user_id: "users",
    actor_id: "users",
  };
  await Promise.all(
    Object.entries(map).map(async ([field, resource]) => {
      const ids = [...new Set(rows.map((row) => row[field]).filter(Boolean))];
      if (!ids.length) return;
      const query = new URLSearchParams({ limit: "100" });
      ids.forEach((id) => query.append("ids", id));
      for (const row of await api("/lookup/" + resource + "?" + query))
        labels.set(resource + ":" + row.id, row.label);
    }),
  );
}
async function render() {
  const ticket = ++generation,
    resource = page;
  status("");
  $("view").replaceChildren();
  $("view").setAttribute("aria-busy", "true");
  try {
    if (Object.hasOwn(experiencePages, resource)) {
      await renderExperience(resource, ticket);
      return;
    }
    if (Object.hasOwn(academicPages, resource)) {
      await renderLearning(resource, ticket);
      return;
    }
    if (resource === "adminUsers" || resource === "adminStatus") {
      await renderAdmin(resource, ticket);
      return;
    }
    const rows = await api(
      "/" +
        resource +
        "?" +
        new URLSearchParams({
          offset: String(offset),
          limit: "25",
          ...(resource === "audit" ? {} : { archived: String(archived) }),
          ...(searchable.has(resource) && adminSearch
            ? { q: adminSearch }
            : {}),
          ...(resource === "users" && adminRole ? { role: adminRole } : {}),
          ...(resource === "memberships" && adminGroup
            ? { group_id: adminGroup }
            : {}),
        }),
    );
    await resolveReferences(rows);
    if (ticket !== generation) return;
    const box = el("div", undefined, "table-card");
    const toolbar = el("div", undefined, "toolbar");
    if (resource !== "audit") toolbar.append(archivedToggle());
    else
      toolbar.append(
        el("span", "Mais recentes primeiro", "muted"),
        button("Atualizar", render),
      );
    if (resource === "memberships")
      toolbar.append(button("Importar lote", () => membershipBatch()));
    if (searchable.has(resource)) {
      const form = el("form", undefined, "table-search"),
        input = el("input");
      input.type = "search";
      input.maxLength = 120;
      input.value = adminSearch;
      input.placeholder = ["users", "memberships"].includes(resource)
        ? "Nome ou e-mail"
        : "Nome ou código";
      input.setAttribute(
        "aria-label",
        "Buscar em " + titles[resource].toLowerCase(),
      );
      form.append(input);
      if (resource === "users") {
        const role = el("select");
        role.setAttribute("aria-label", "Filtrar por perfil");
        for (const [value, label] of [
          ["", "Todos os perfis"],
          ...Object.entries(roles),
        ]) {
          const option = el("option", label);
          option.value = value;
          role.append(option);
        }
        role.value = adminRole;
        role.addEventListener("change", () => {
          adminRole = role.value;
          adminSearch = input.value.trim();
          offset = 0;
          render();
        });
        form.append(role);
      }
      if (resource === "memberships") {
        const group = el("select");
        group.setAttribute("aria-label", "Filtrar por turma");
        const all = el("option", "Todas as turmas");
        all.value = "";
        group.append(all);
        api("/lookup/groups?limit=100")
          .then((items) => {
            for (const item of items) {
              const option = el("option", item.label);
              option.value = item.id;
              group.append(option);
            }
            group.value = adminGroup;
          })
          .catch(() => {});
        group.addEventListener("change", () => {
          adminGroup = group.value;
          adminSearch = input.value.trim();
          offset = 0;
          render();
        });
        form.append(group);
      }
      const submit = el("button", "Buscar", "secondary");
      submit.type = "submit";
      form.append(submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        adminSearch = input.value.trim();
        offset = 0;
        render();
      });
      toolbar.append(form);
    }
    box.append(toolbar);
    if (rows.length) {
      const scroll = el("div", undefined, "table-scroll"),
        table = el("table"),
        head = el("thead"),
        tr = el("tr");
      const columns = {
        courses: ["Curso", "Código"],
        subjects: ["Disciplina", "Curso", "Período"],
        groups: ["Turma", "Disciplina", "Semestre"],
        users: ["Pessoa", "Perfil"],
        memberships: ["Pessoa", "Turma", "Vigência"],
        audit: ["Quando", "Autor", "Operação", "Registro"],
      }[resource];
      [...columns, ...(resource === "audit" ? [] : ["Ações"])].forEach(
        (name) => {
          const th = el("th", name);
          th.scope = "col";
          tr.append(th);
        },
      );
      head.append(tr);
      table.append(head);
      const body = el("tbody");
      rows.forEach((row) => {
        const line = el("tr");
        let values;
        if (resource === "courses") values = [row.name, row.code];
        if (resource === "subjects")
          values = [
            `${row.code} · ${row.name}`,
            reference("courses", row.course_id),
            `${row.term}º`,
          ];
        if (resource === "groups")
          values = [
            row.name,
            reference("subjects", row.subject_id),
            row.semester,
          ];
        if (resource === "users")
          values = [
            personCell(row.name, row.email, row.role, false),
            el("span", roles[row.role], "badge role-" + row.role),
          ];
        if (resource === "memberships") {
          const label = groupParts(
            row.group_label || reference("groups", row.group_id),
          );
          values = [
            personCell(
              row.user_name || reference("users", row.user_id),
              row.user_email || "",
              row.user_role,
            ),
            stackedCell(label.subject, label.rest),
            validity(row),
          ];
        }
        if (resource === "audit")
          values = [
            new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "America/Sao_Paulo",
            }).format(
              new Date(
                row.occurred_at.endsWith("Z") ||
                /[+-]\d\d:\d\d$/.test(row.occurred_at)
                  ? row.occurred_at
                  : row.occurred_at + "Z",
              ),
            ),
            reference("users", row.actor_id).split(" · ")[0],
            {
              create: "Criação",
              update: "Edição",
              upsert: "Vínculo",
              archive: "Arquivamento",
              restore: "Restauração",
              attendance_recorded: "Chamada",
              attendance_corrected: "Correção de chamada",
              password_changed: "Troca de senha",
              password_reset: "Redefinição de senha",
              graded: "Avaliação",
              submitted: "Entrega",
              demo_seed: "Dados fictícios",
              batch_membership: "Matrícula em lote",
              submission_saved: "Rascunho de entrega",
              event_enroll: "Inscrição",
              event_cancel: "Cancelamento",
              attachment_added: "Anexo enviado",
              attachment_archive: "Anexo arquivado",
              attachment_blocked: "Anexo bloqueado",
              schedule_saved: "Horário",
              data_export: "Exportação de dados",
              attendance_export: "Exportação de frequência",
              grades_export: "Exportação de notas",
              bootstrap: "Primeiro acesso",
              microsoft_login: "Login Microsoft",
              permissions_changed: "Permissões",
              identity_changed: "Identidade",
              sessions_revoked: "Sessões revogadas",
              session_revoked: "Sessão revogada",
              provision_identity: "Provisionamento",
            }[row.action] || row.action,
            entityLabels[row.entity] || row.entity,
          ];
        values.forEach((value) =>
          line.append(
            value instanceof Node && value.tagName === "TD" ? value : el("td"),
          ),
        );
        values.forEach((value, index) => {
          const cell = line.children[index];
          if (value instanceof Node && value.tagName !== "TD")
            cell.append(value);
          else if (!(value instanceof Node)) cell.textContent = value;
        });
        if (resource === "audit") {
          const detail = el("details"),
            summary = el("summary", "Ver alteração");
          detail.append(summary, auditDiff(row.changes));
          line.lastChild.append(
            el("small", " #" + row.entity_id.slice(0, 8)),
            detail,
          );
        } else {
          const cell = el("td"),
            actions = el("div", undefined, "row-actions");
          if (!archived && resource !== "users")
            actions.append(button("Editar", () => openEditor(row)));
          if (!archived && resource === "users" && row.role !== "coordinator") {
            actions.append(button("Editar", () => userEditor(row)));
            if (localLoginEnabled)
              actions.append(
                button("Redefinir senha", () => passwordReset(row)),
              );
          }
          if (!(resource === "users" && row.role === "coordinator"))
            actions.append(
              button(
                archived ? "Restaurar" : "Arquivar",
                () => archiveRow(resource, row),
                archived ? "secondary" : "secondary danger",
              ),
            );
          if (!actions.childNodes.length)
            actions.append(el("span", "Conta protegida", "muted"));
          cell.append(actions);
          line.append(cell);
        }
        body.append(line);
      });
      table.append(body);
      scroll.append(table);
      box.append(scroll);
    } else {
      const empty = el("div", undefined, "empty");
      empty.append(
        el("h2", offset ? "Fim da lista" : "Nenhum registro por aqui"),
        el(
          "p",
          archived
            ? "Os registros arquivados aparecerão aqui."
            : resource === "audit"
              ? "As alterações nos cadastros aparecerão aqui."
              : adminSearch || adminRole
                ? "Nenhum resultado para este filtro."
                : "Use o botão de novo cadastro para começar.",
        ),
      );
      box.append(empty);
    }
    const pager = el("div", undefined, "pagination"),
      previous = button("Anterior", () => {
        offset = Math.max(0, offset - 25);
        render();
      }),
      next = button("Próxima", () => {
        offset += 25;
        render();
      });
    previous.disabled = offset === 0;
    next.disabled = rows.length < 25;
    pager.append(
      previous,
      el(
        "span",
        rows.length
          ? `Registros ${offset + 1}–${offset + rows.length}`
          : "Nenhum registro nesta página",
      ),
      next,
    );
    if (offset || rows.length >= 25) box.append(pager);
    $("view").append(box);
    status("");
  } catch (error) {
    if (ticket === generation) {
      status(error.message, true);
      $("view").append(
        emptyState("Não foi possível carregar", error.message, "help"),
        button("Tentar novamente", render, "primary"),
      );
    }
  } finally {
    if (ticket === generation) $("view").removeAttribute("aria-busy");
  }
}
async function archiveRow(resource, row) {
  const action = row.archived ? "Restaurar" : "Arquivar";
  const name = row.name || reference("users", row.user_id);
  if (
    !window.confirm(
      `${action} ${name}? ${row.archived ? "Os vínculos e a estrutura precisam estar ativos." : "O acesso associado pode ser interrompido. O histórico será preservado."}`,
    )
  )
    return;
  try {
    await api(`/${resource}/${row.id}/archive`, {
      method: "PATCH",
      body: JSON.stringify({ archived: !row.archived }),
    });
    await render();
    status("Alteração registrada na auditoria.");
  } catch (error) {
    status(error.message, true);
  }
}
function userEditor(row) {
  const ui = learningDialog("Editar usuário");
  ui.fields.append(el("p", row.email, "muted"));
  ui.field("name", "Nome completo", "text", row.name);
  ui.field("role", "Perfil", "select", row.role, [
    ["student", roles.student],
    ["teacher", roles.teacher],
  ]);
  ui.fields.append(
    el(
      "p",
      "Mudar o perfil encerra as sessões abertas da pessoa. O e-mail institucional não pode ser alterado.",
      "help",
    ),
  );
  ui.form.save = async () => {
    await api("/users/" + row.id, {
      method: "PUT",
      body: JSON.stringify({
        name: ui.controls.name.value,
        role: ui.controls.role.value,
      }),
    });
    return "Cadastro salvo e registrado na auditoria.";
  };
}
function passwordReset(row) {
  const ui = learningDialog("Redefinir senha · " + row.name);
  const input = ui.field("new_password", "Nova senha temporária", "password");
  input.minLength = 12;
  input.maxLength = 128;
  input.autocomplete = "new-password";
  ui.fields.append(
    el(
      "p",
      "Mínimo de 12 caracteres. As sessões da pessoa serão encerradas. Entregue a senha por canal seguro e peça que ela a altere no perfil.",
      "help",
    ),
  );
  ui.save.textContent = "Redefinir senha";
  ui.form.save = async () => {
    try {
      await api("/users/" + row.id + "/password", {
        method: "POST",
        body: JSON.stringify({ new_password: input.value }),
      });
    } finally {
      input.value = "";
    }
    return "Senha redefinida e registrada na auditoria.";
  };
}
function closeEditor() {
  if (saving) return;
  editorVersion++;
  $("editor").close();
  $("fields").replaceChildren();
  editing = null;
}
$("close-editor").addEventListener("click", closeEditor);
$("cancel-editor").addEventListener("click", closeEditor);
$("editor").addEventListener("cancel", (event) => {
  if (saving) {
    event.preventDefault();
    return;
  }
  editorVersion++;
  $("fields").replaceChildren();
  editing = null;
});
function picker(field, label, resource, value, locked, version) {
  const wrapper = el("div"),
    caption = el("label", label);
  caption.htmlFor = "field-" + field;
  const searchBox = el("div", undefined, "picker-search"),
    search = el("input");
  search.type = "search";
  search.placeholder = "Buscar por nome";
  search.setAttribute("aria-label", "Buscar " + label.toLowerCase());
  const select = el("select");
  select.id = "field-" + field;
  select.name = field;
  select.required = true;
  const initial = el(
    "option",
    value ? reference(resource, value) : "Selecione…",
  );
  initial.value = value || "";
  select.append(initial);
  let skip = 0,
    query = "",
    pending = 0;
  const message = el("p", "", "picker-status");
  message.setAttribute("aria-live", "polite");
  const more = button(
    "Carregar mais opções",
    () => load(false),
    "secondary picker-more",
  );
  const load = async (reset) => {
    const ticket = ++pending;
    if (reset) {
      skip = 0;
      query = search.value;
    }
    more.disabled = true;
    message.textContent = "Buscando…";
    try {
      const rows = await api(
        "/lookup/" +
          resource +
          "?" +
          new URLSearchParams({ q: query, offset: String(skip), limit: "25" }),
      );
      if (version !== editorVersion || ticket !== pending) return;
      if (reset) {
        const selected = select.selectedOptions[0];
        select.replaceChildren(initial);
        if (selected && selected.value && selected !== initial)
          select.append(selected);
      }
      const existing = new Set(
        [...select.options].map((option) => option.value),
      );
      for (const row of rows) {
        labels.set(resource + ":" + row.id, row.label);
        if (!existing.has(row.id)) {
          const option = el("option", row.label);
          option.value = row.id;
          select.append(option);
        }
      }
      skip += rows.length;
      more.hidden = rows.length < 25;
      message.textContent = rows.length
        ? "Selecione uma opção abaixo da busca."
        : "Nenhum outro resultado para esta busca.";
    } catch (error) {
      message.textContent = error.message;
    } finally {
      if (ticket === pending) more.disabled = false;
    }
  };
  const find = button("Buscar", () => load(true));
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      load(true);
    }
  });
  searchBox.append(search, find);
  wrapper.append(caption);
  if (!locked) wrapper.append(searchBox);
  select.disabled = locked;
  wrapper.append(select);
  if (!locked) {
    wrapper.append(more, message);
    load(true);
  } else
    wrapper.append(
      el("p", "O vínculo com este cadastro não pode ser transferido.", "help"),
    );
  return wrapper;
}
function openEditor(row = null) {
  editing = row;
  editorResource = page;
  const version = ++editorVersion;
  $("editor-title").textContent =
    recordLabels[page]?.[row ? 1 : 0] || titles[page];
  $("form-error").textContent = "";
  $("fields").replaceChildren();
  $("save-record").disabled = false;
  for (const [field, label, type] of resources[page].fields) {
    const value = row?.[field];
    if (resources[type]) {
      const locked = Boolean(row);
      $("fields").append(picker(field, label, type, value, locked, version));
      continue;
    }
    const caption = el("label", label);
    caption.htmlFor = "field-" + field;
    const input = el(type === "role" ? "select" : "input");
    input.id = "field-" + field;
    input.name = field;
    input.required = true;
    if (type === "role")
      for (const [role, name] of Object.entries(roles)) {
        const option = el("option", name);
        option.value = role;
        input.append(option);
      }
    else {
      input.type = type;
      if (type === "text") input.maxLength = field === "code" ? 30 : 120;
      if (type === "number") {
        input.min = "1";
        input.max = "20";
      }
      if (type === "password") {
        input.minLength = 12;
        input.maxLength = 128;
        input.autocomplete = "new-password";
      }
      if (type === "email") {
        input.maxLength = 254;
        input.autocomplete = "off";
      }
    }
    if (field === "code") input.pattern = "[A-Z0-9_-]{1,30}";
    if (field === "semester") {
      input.pattern = "20[0-9]{2}/[12]";
      input.placeholder = "2026/2";
    }
    if (value !== undefined) input.value = value;
    $("fields").append(caption, input);
    if (field === "password")
      $("fields").append(
        el(
          "p",
          "Mínimo de 12 caracteres. Não reutilize senhas reais neste ambiente.",
          "help",
        ),
      );
  }
  $("editor").showModal();
}
$("record-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const resource = editorResource,
    row = editing;
  const payload = {};
  for (const [field, , type] of resources[resource].fields) {
    const input = $("field-" + field);
    payload[field] = type === "number" ? Number(input.value) : input.value;
  }
  if (resource === "memberships" && payload.ends_on < payload.starts_on) {
    $("form-error").textContent =
      "A data final deve ser igual ou posterior à inicial.";
    return;
  }
  saving = true;
  $("save-record").disabled = true;
  $("form-error").textContent = "";
  try {
    await api(
      "/" + resource + (row && resource !== "memberships" ? "/" + row.id : ""),
      {
        method: resource === "memberships" || row ? "PUT" : "POST",
        body: JSON.stringify(payload),
      },
    );
    saving = false;
    closeEditor();
    await render();
    status("Cadastro salvo e registrado na auditoria.");
  } catch (error) {
    $("form-error").textContent = error.message;
  } finally {
    saving = false;
    if (payload.password) payload.password = "";
    $("save-record").disabled = false;
  }
});
let checkingAccess = false,
  accessRetry = 0,
  accessAttempts = 0;
async function connectLogin() {
  if (checkingAccess) return;
  checkingAccess = true;
  clearTimeout(accessRetry);
  localLoginEnabled = microsoftEnabled = false;
  $("microsoft-login").disabled = true;
  $("login-submit").disabled = true;
  $("retry-login").hidden = true;
  $("login-form").setAttribute("aria-busy", "true");
  $("login-state").textContent = "Conectando ao serviço de acesso…";
  try {
    const data = await api("/auth/options", {
      signal: AbortSignal.timeout(15000),
    });
    if (
      typeof data.local !== "boolean" ||
      typeof data.microsoft !== "boolean" ||
      (!data.local && !data.microsoft)
    )
      throw new Error("Resposta de acesso inválida");
    accessAttempts = 0;
    localLoginEnabled = data.local;
    microsoftEnabled = data.microsoft;
    $("login-submit").disabled = !data.local;
    $("microsoft-login").disabled = !data.microsoft;
    $("login-state").textContent =
      data.local && !data.microsoft
        ? "Acesso Microsoft ainda não habilitado."
        : !data.local
          ? "Use o botão Microsoft para entrar com sua conta institucional."
          : "";
    if (!microsoftCallbackFailed) $("login-error").textContent = "";
    try {
      enter(await api("/web/session"));
    } catch (error) {
      if (error.status !== 401) {
        $("login-error").textContent = error.message;
        $("retry-login").hidden = false;
      }
    }
  } catch (error) {
    // A sleeping server takes a few seconds to wake: retry quietly a few times.
    const retrying = ++accessAttempts <= 5;
    $("login-error").textContent =
      "Não conseguimos conectar ao servidor agora" +
      (error.status ? " (código " + error.status + ")" : "") +
      (retrying
        ? ". Tentando de novo automaticamente…"
        : ". Verifique sua internet e tente novamente.");
    $("login-state").textContent =
      "Você pode preencher os campos. O botão Entrar será liberado quando o serviço confirmar o acesso por senha.";
    $("retry-login").hidden = false;
    if (retrying) accessRetry = setTimeout(connectLogin, 4000 * accessAttempts);
  } finally {
    checkingAccess = false;
    $("login-form").setAttribute("aria-busy", "false");
  }
}
$("microsoft-login").addEventListener("click", microsoftLogin);
const microsoftCallbackFailed = new URLSearchParams(location.search).has(
  "auth_error",
);
if (microsoftCallbackFailed) {
  $("login-error").textContent =
    "Não foi possível autorizar o acesso Microsoft. Confira o vínculo institucional e a política MFA com o administrador.";
  history.replaceState(null, "", location.pathname);
}
$("retry-login").addEventListener("click", () => {
  accessAttempts = 0;
  void connectLogin();
});

async function microsoftLogin() {
  if (!microsoftEnabled) return;
  try {
    const result = await api("/microsoft/start", { method: "POST" });
    location.assign(result.url);
  } catch (error) {
    $("login-error").textContent = error.message;
    status(error.message, true);
  }
}
