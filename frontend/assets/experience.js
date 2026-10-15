"use strict";
// Shared navigation and compositions adapted from the supplied design source.
const experiencePages = {
  home: "Início",
  dashboard: "Visão geral",
  myGroups: "Minhas turmas",
  calendar: "Calendário",
  reminders: "Lembretes",
  profile: "Meu perfil",
  search: "Buscar",
  onboarding: "Conheça o aplicativo",
  attendance: "Frequência",
};
Object.assign(titles, experiencePages);
Object.assign(descriptions, {
  dashboard: "Tudo o que acontece na unidade, em um só lugar.",
  myGroups: "Disciplinas e turmas do seu vínculo acadêmico.",
  calendar: "Aulas, eventos e prazos — horário de Brasília.",
  reminders: "Próximos prazos e comunicados da instituição.",
  schedule: "Sua semana acadêmica, organizada.",
  activity: "Atividades, entregas e avaliações.",
  material: "Conteúdos para acompanhar suas disciplinas.",
  notice: "Comunicados que fazem parte do seu dia.",
  event: "Participe da vida acadêmica.",
});
const iconPaths = {
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
  groups:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  calendar: "M8 2v4M16 2v4M3 10h18M3 4h18v18H3ZM8 14h2M14 14h2M8 18h2",
  activity: "M9 11l3 3 8-8M20 12v9H4V3h12",
  material:
    "M12 5v16M12 5C8 2 4 3 2 4v16c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-2-10 1",
  profile: "M20 21v-2a7 7 0 0 0-14 0v2M13 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  schedule: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l4 2",
  menu: "M3 6h18M3 12h18M3 18h18",
  mail: "M3 5h18v14H3ZM3 5l9 7 9-7",
  lock: "M5 10h14v12H5ZM8 10V6a4 4 0 0 1 8 0v4",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  arrow: "M5 12h14M13 6l6 6-6 6",
  search: "M21 21l-6-6M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01",
  logout: "M9 4H3v16h6M9 12h12M17 8l4 4-4 4",
  attendance:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M16 11l2 2 4-4",
  alert: "M12 3 2 21h20ZM12 10v5M12 18h.01",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6ZM9 12l2 2 4-4",
};
const pageIcons = {
  dashboard: "home",
  myGroups: "groups",
  courses: "material",
  subjects: "material",
  memberships: "groups",
  users: "profile",
  adminUsers: "settings",
  adminStatus: "settings",
  audit: "activity",
  notice: "bell",
  event: "calendar",
  reminders: "bell",
  onboarding: "help",
  attendance: "attendance",
};
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.7",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    class: "icon",
    "aria-hidden": "true",
  }))
    svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute(
    "d",
    iconPaths[name] || iconPaths[pageIcons[name]] || iconPaths.material,
  );
  svg.append(path);
  return svg;
}
function allowedPages() {
  if (!user) return [];
  const common = [
    "home",
    "myGroups",
    "activity",
    "material",
    "notice",
    "event",
    "schedule",
    "attendance",
    "calendar",
    "reminders",
    "profile",
    "search",
    "onboarding",
  ];
  return user.role === "coordinator"
    ? [
        ...common,
        "dashboard",
        ...Object.keys(resources),
        "audit",
        ...(user.administrator ? ["adminUsers", "adminStatus"] : []),
      ]
    : common;
}
function navButton(key, label = titles[key]) {
  const node = button("", () => navigate(key));
  node.dataset.page = key;
  node.append(icon(key), el("span", label));
  return node;
}
function setupExperience() {
  document.body.dataset.role = user.role;
  $("account-avatar").textContent = initials(user.name);
  const nav = $("navigation");
  nav.replaceChildren();
  const sections = [
    ["Principal", ["dashboard", "reminders", "event", "notice"]],
    [
      "Acadêmico",
      [
        "courses",
        "subjects",
        "groups",
        "schedule",
        "attendance",
        "memberships",
        "users",
        "activity",
        "material",
      ],
    ],
    ["Gestão", ["audit", "adminUsers", "adminStatus", "profile"]],
  ];
  for (const [label, keys] of sections) {
    const visible = keys.filter((key) => allowedPages().includes(key));
    if (visible.length) {
      nav.append(el("span", label, "nav-label"));
      visible.forEach((key) => nav.append(navButton(key)));
    }
  }
  $("bottom-navigation").replaceChildren(
    ...[
      ["home", "Início"],
      ["schedule", "Agenda"],
      ["activity", user.role === "teacher" ? "Avaliar" : "Atividades"],
      ["material", "Materiais"],
      ["profile", "Perfil"],
    ].map(([key, label]) => navButton(key, label)),
  );
}
let unreadReminders = 0;
async function refreshReminders() {
  const session = user;
  try {
    const data = await api("/learning/notifications?limit=1");
    if (session !== user) return;
    unreadReminders = data.unread;
  } catch {
    return;
  }
  const label = unreadReminders
    ? `Abrir lembretes, ${unreadReminders} não ${unreadReminders === 1 ? "lido" : "lidos"}`
    : "Abrir lembretes";
  $("open-reminders").setAttribute("aria-label", label);
  for (const target of [
    $("open-reminders"),
    ...document.querySelectorAll('#navigation [data-page="reminders"]'),
  ]) {
    target.querySelector(".count-badge")?.remove();
    if (unreadReminders)
      target.append(
        el(
          "span",
          unreadReminders > 9 ? "9+" : String(unreadReminders),
          "count-badge",
        ),
      );
  }
}
function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
function updateHeading(key) {
  for (const node of [...$("heading-actions").children])
    if (node.id !== "new-record") node.remove();
  if (key === "home") {
    $("page-title").textContent = greeting(user.name);
    $("page-description").textContent =
      longDay(brDate(Date.now())) + " · " + roles[user.role];
  }
  if (key === "schedule") {
    $("page-title").textContent =
      user.role === "coordinator" ? "Grade de horários" : "Agenda";
    $("page-description").textContent =
      user.role === "coordinator"
        ? "Horários das turmas em cada dia da semana."
        : "Suas aulas, dia a dia.";
  }
  if (key === "attendance" && user.role !== "student") {
    $("page-title").textContent = "Chamadas e frequência";
    $("page-description").textContent =
      "Registre a chamada das aulas e corrija lançamentos com histórico auditado.";
  }
  if (key === "dashboard")
    for (const [kind, label] of [
      ["event", "+ Novo evento"],
      ["notice", "+ Novo aviso"],
    ])
      $("heading-actions").append(
        button(
          label,
          learningAction(() => publicationEditor(kind)),
          kind === "event" ? "secondary" : "primary",
        ),
      );
}
function emptyState(title, message, name = "material") {
  const box = el("div", undefined, "empty");
  box.append(icon(name), el("h2", title), el("p", message));
  return box;
}
function sectionHeading(title, key, label = "Ver todos") {
  const heading = el("div", undefined, "section-heading");
  heading.append(el("h2", title));
  if (key) heading.append(button(label, () => navigate(key), "text-button"));
  return heading;
}
function pager(rows) {
  // A single short page needs no pagination controls.
  if (!offset && rows.length < 25) return document.createDocumentFragment();
  const box = el("div", undefined, "pagination"),
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
  box.append(prev, el("span", "Página " + (offset / 25 + 1)), next);
  return box;
}
function recentItem(row) {
  const item = button(
      "",
      learningAction(() => openPublication(row)),
      "recent-item " + row.kind,
    ),
    body = el("div");
  const moment =
    row.kind === "activity"
      ? deadline(row.due_at).text
      : row.kind === "event"
        ? when(row.starts_at)
        : when(row.publish_at || row.created_at);
  body.append(
    el("strong", row.title),
    el("small", kindLabel[row.kind] + " · " + moment),
  );
  item.append(el("span", undefined, "recent-dot"), body, icon("arrow"));
  return item;
}
// Minutes since midnight in Brasília, to place today's lessons in time.
function nowMinute() {
  const [hour, minute] = clock(new Date()).split(":").map(Number);
  return hour * 60 + minute;
}
function lessonCard(row, recorded = false, date = "", day = date) {
  const parts = groupParts(reference("groups", row.group_id)),
    today = brDate(Date.now()),
    minute = nowMinute();
  let phase = "";
  if ((day || today) === today) {
    if (minute >= row.ends_minute) phase = "past";
    else if (minute >= row.starts_minute) phase = "now";
  }
  const item = el("article", undefined, "lesson" + (phase ? " " + phase : "")),
    time = el("div", minuteTime(row.starts_minute), "lesson-time"),
    body = el("div", undefined, "lesson-info");
  time.append(el("small", minuteTime(row.ends_minute)));
  const title = el("strong", parts.subject);
  body.append(
    title,
    el("p", [parts.name, row.room].filter(Boolean).join(" · ")),
  );
  if (phase === "now") title.append(el("span", "Agora", "badge green live"));
  item.append(time, body);
  if (date && user && user.role !== "student") {
    const call = button(
      recorded === true
        ? "Corrigir chamada"
        : recorded === false
          ? "Fazer chamada"
          : "Chamada",
      learningAction(() => rollCall(row.id, date)),
      recorded === false ? "primary lesson-action" : "secondary lesson-action",
    );
    if (recorded === true)
      body.append(el("span", "Chamada registrada", "badge green"));
    item.append(call);
  }
  return item;
}
async function groupLabels(rows) {
  const ids = [...new Set(rows.map((row) => row.group_id).filter(Boolean))];
  for (let i = 0; i < ids.length; i += 100) {
    const query = new URLSearchParams({ limit: "100" });
    ids.slice(i, i + 100).forEach((id) => query.append("ids", id));
    for (const group of await api("/learning/groups?" + query))
      labels.set("groups:" + group.id, group.label);
  }
}
function searchBar(value, submit) {
  const form = el("form", undefined, "search-bar"),
    input = el("input");
  input.type = "search";
  input.maxLength = 120;
  input.placeholder = "Buscar atividades, materiais, avisos…";
  input.setAttribute("aria-label", "Buscar no aplicativo");
  input.value = value;
  const go = el("button", undefined, "text-button");
  go.type = "submit";
  go.setAttribute("aria-label", "Buscar");
  go.append(icon("arrow"));
  form.append(icon("search"), input, go);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit(input.value.trim());
  });
  return form;
}
let globalSearch = "";
async function renderExperience(key, ticket) {
  if (["home", "dashboard", "reminders"].includes(key)) void refreshReminders();
  if (key === "home" || key === "dashboard" || key === "reminders") {
    const data = await api("/learning/overview");
    await groupLabels([...data.lessons_today, ...data.upcoming]);
    if (ticket !== generation) return;
    if (key === "home") {
      const [groups, frequency] = await Promise.all([
        user.role === "teacher" ? api("/learning/groups?limit=4") : [],
        user.role === "student"
          ? api("/learning/attendance/summary").catch(() => null)
          : null,
      ]);
      if (ticket !== generation) return;
      renderHome(data, groups, frequency);
    }
    if (key === "reminders") await renderReminders(data, ticket);
    if (key === "dashboard") {
      const counts = await api("/dashboard");
      if (ticket !== generation) return;
      renderDashboard(counts, data);
    }
  } else if (key === "myGroups") {
    const [rows, timetable] = await Promise.all([
      api("/learning/groups?limit=25&offset=" + offset),
      api("/learning/schedule?limit=100"),
    ]);
    if (ticket !== generation) return;
    const box = el("div", undefined, "group-grid");
    rows.forEach((row) => {
      labels.set("groups:" + row.id, row.label);
      const lesson = nextLesson(
        timetable.filter((item) => item.group_id === row.id),
      );
      box.append(
        groupCard(
          row,
          user.role === "student"
            ? "Atividades, materiais e frequência"
            : "Conteúdos, entregas, chamada e alunos",
          infoLine(
            lesson
              ? `Próxima aula: ${lesson.label} · ${lesson.row.room}`
              : "Sem aulas nas próximas duas semanas",
            "schedule",
          ),
        ),
      );
    });
    $("view").append(box);
    if (!rows.length)
      $("view").append(
        emptyState(
          "Nenhuma turma disponível",
          "Seus vínculos acadêmicos vigentes aparecerão aqui.",
          "groups",
        ),
      );
    $("view").append(pager(rows));
  } else if (key === "profile") await renderProfile(ticket);
  else if (key === "onboarding") renderOnboarding();
  else if (key === "calendar") await renderCalendar(ticket);
  else if (key === "attendance") await renderAttendance(ticket);
  else if (key === "search") await renderSearch(ticket);
  if (ticket === generation) status("");
}
function feedGroup(value) {
  const days = Math.round(
    (Date.parse(dayKey(new Date())) - Date.parse(dayKey(instant(value)))) /
      86400000,
  );
  return days <= 0
    ? "Hoje"
    : days === 1
      ? "Ontem"
      : days < 7
        ? "Nesta semana"
        : "Anteriores";
}
async function renderReminders(data, ticket) {
  const feed = await api("/learning/notifications");
  await groupLabels(feed.items);
  if (ticket !== generation) return;
  const toolbar = el("div", undefined, "toolbar");
  toolbar.append(
    el(
      "span",
      feed.unread
        ? plural(feed.unread, "novidade não lida", "novidades não lidas")
        : "Você está em dia",
      "feed-count",
    ),
  );
  if (feed.unread)
    toolbar.append(
      button(
        "Marcar todas como lidas",
        learningAction(async () => {
          await api("/learning/notifications/read", { method: "POST" });
          await refreshReminders();
          await render();
        }),
      ),
    );
  $("view").append(toolbar);
  if (data.upcoming.length) {
    $("view").append(sectionHeading("Próximos prazos", "activity"));
    const due = el("div", undefined, "section-card");
    data.upcoming.forEach((row) => due.append(recentItem(row)));
    $("view").append(due);
  }
  const box = el("div", undefined, "section-card reminder-feed");
  let current = "";
  for (const item of feed.items) {
    const group = feedGroup(item.at);
    if (group !== current) {
      current = group;
      box.append(el("h3", group, "feed-group"));
    }
    const row = button(
        "",
        learningAction(() => openPublication(item.publication)),
        "recent-item " + item.kind + (item.unread ? " unread" : ""),
      ),
      body = el("div");
    const kind =
      item.type === "grade"
        ? "Nota " + String(item.grade).replace(".", ",") + " recebida"
        : kindLabel[item.kind];
    body.append(
      el("strong", item.title),
      el(
        "small",
        kind +
          (item.group_id
            ? " · " + groupParts(reference("groups", item.group_id)).subject
            : "") +
          " · " +
          when(item.at),
      ),
    );
    row.append(el("span", undefined, "recent-dot"), body, icon("arrow"));
    if (item.unread) row.setAttribute("aria-label", "Não lido: " + item.title);
    box.append(row);
  }
  if (!feed.items.length)
    box.append(
      emptyState(
        "Nenhuma novidade",
        "Avisos, materiais, atividades e notas aparecerão aqui.",
        "bell",
      ),
    );
  $("view").append(sectionHeading("Novidades"), box);
  const hint = el("p", "Receba estas novidades no celular: ", "help");
  hint.append(
    button(
      "ativar notificações no perfil",
      () => navigate("profile"),
      "text-button inline",
    ),
  );
  $("view").append(hint);
}
function renderHome(data, groups = [], frequency = null) {
  const target = data.upcoming[0],
    teacher = user.role === "teacher";
  const hero = button(
    "",
    () =>
      target && !teacher
        ? openPublication(target).catch((error) => status(error.message, true))
        : navigate("activity"),
    "hero-card" + (teacher ? " teacher" : ""),
  );
  hero.append(
    el(
      "p",
      teacher
        ? "SEU PAINEL DOCENTE"
        : target
          ? "PRÓXIMO PRAZO"
          : "SUAS ATIVIDADES",
      "eyebrow",
    ),
    el(
      "h2",
      teacher
        ? data.pending_count
          ? plural(
              data.pending_count,
              "avaliação pendente",
              "avaliações pendentes",
            )
          : "Nenhuma avaliação pendente"
        : target?.title ||
            (data.pending_count
              ? "Confira suas entregas"
              : "Tudo em dia por aqui"),
    ),
    el(
      "p",
      teacher
        ? data.pending_count
          ? "Acompanhe as entregas e dê o próximo feedback."
          : "Todas as entregas recebidas já foram avaliadas."
        : target
          ? (target.group_id
              ? groupParts(reference("groups", target.group_id)).subject + " · "
              : "") + deadline(target.due_at).text
          : "Consulte suas atividades e acompanhe os novos conteúdos.",
    ),
  );
  const link = el(
    "span",
    teacher ? "Ver entregas" : target ? "Abrir atividade" : "Ver atividades",
    "hero-link",
  );
  link.append(icon("arrow"));
  hero.append(link);
  $("view").append(
    hero,
    searchBar("", (value) => {
      globalSearch = value;
      navigate("search");
    }),
  );
  const chips = el("div", undefined, "chips");
  for (const key of ["activity", "material", "notice", "event"]) {
    const chip = navButton(key);
    chip.className = "chip";
    chips.append(chip);
  }
  $("view").append(chips);
  const stats = el("div", undefined, "stats-grid");
  for (const [count, label, key] of [
    [data.pending_count, teacher ? "Para avaliar" : "Sem entrega", "activity"],
    frequency
      ? [percent(frequency.attendance_percent), "Frequência", "attendance"]
      : [data.groups_count, "Turmas", "myGroups"],
    [data.material_count, "Materiais", "material"],
  ]) {
    const item = button("", () => navigate(key), "stat");
    item.append(el("strong", String(count)), el("span", label));
    stats.append(item);
  }
  $("view").append(stats);
  if (teacher) {
    $("view").append(sectionHeading("Minhas turmas", "myGroups"));
    groups.forEach((row) => {
      labels.set("groups:" + row.id, row.label);
      $("view").append(
        groupCard(row, "Conteúdos, entregas, chamada e avaliações"),
      );
    });
    if (!groups.length)
      $("view").append(
        emptyState(
          "Nenhuma turma vinculada",
          "Suas turmas vigentes aparecerão aqui.",
          "groups",
        ),
      );
  }
  const warning = frequency?.groups.find((item) =>
    ["exceeded", "critical"].includes(item.state),
  );
  if (warning) {
    const alert = button("", () => navigate("attendance"), "alert-banner");
    alert.append(
      icon("alert"),
      el(
        "span",
        `Atenção à frequência em ${warning.group_label.split(" · ")[0]}: ${frequencyBalance(warning).toLowerCase()}.`,
      ),
    );
    $("view").append(alert);
  }
  $("view").append(sectionHeading("Aulas de hoje", "schedule", "Ver semana"));
  const upcoming = data.lessons_today.find(
    (row) => row.starts_minute > nowMinute(),
  );
  data.lessons_today.forEach((row) => {
    const card = lessonCard(
      row,
      data.recorded_today?.includes(row.id),
      data.date,
    );
    if (row === upcoming && !card.classList.contains("now"))
      card
        .querySelector(".lesson-info strong")
        .append(el("span", "Em seguida", "badge"));
    $("view").append(card);
  });
  if (!data.lessons_today.length)
    $("view").append(
      emptyState(
        "Sem aulas hoje",
        "Aproveite para revisar os materiais. A semana completa está na Agenda.",
        "schedule",
      ),
    );
  $("view").append(sectionHeading("Acontece na Fatec", "event"));
  const events = data.recent.filter((row) => row.kind === "event"),
    carousel = el("div", undefined, "event-carousel");
  events.forEach((row) => {
    const tile = button(
      "",
      learningAction(() => openPublication(row)),
      "event-tile",
    );
    const text = el("div");
    text.append(el("h3", row.title), el("p", eventWhen(row)));
    tile.append(dateBlock(row.starts_at), text);
    carousel.append(tile);
  });
  if (events.length) $("view").append(carousel);
  else
    $("view").append(
      emptyState(
        "Novidades em breve",
        "Os eventos publicados pela instituição aparecerão aqui.",
        "calendar",
      ),
    );
  const notices = data.recent.filter((row) => row.kind === "notice");
  if (notices.length) {
    $("view").append(sectionHeading("Últimos avisos", "notice"));
    const box = el("div", undefined, "section-card");
    notices.forEach((row) => box.append(recentItem(row)));
    $("view").append(box);
  }
}
function renderDashboard(counts, data) {
  const cards = el("div", undefined, "cards");
  for (const key of ["courses", "subjects", "groups", "users", "memberships"]) {
    const card = button("", () => navigate(key), "card");
    card.append(
      icon(key),
      el("strong", String(counts[key])),
      el("span", titles[key]),
    );
    cards.append(card);
  }
  const grid = el("div", undefined, "dashboard-grid"),
    todo = el("section", undefined, "section-card"),
    recent = el("section", undefined, "section-card");
  todo.append(sectionHeading("Precisa de você"));
  const actions = [];
  if (!counts.courses)
    actions.push([
      "Cadastre o primeiro curso",
      "Comece pela estrutura da unidade.",
      "courses",
    ]);
  else if (!counts.groups)
    actions.push([
      "Organize as turmas",
      "Vincule disciplinas ao semestre letivo.",
      "groups",
    ]);
  if (!counts.memberships)
    actions.push([
      "Vincule alunos e professores",
      "Os vínculos definem o acesso às turmas.",
      "memberships",
    ]);
  const alerts = counts.alerts || {};
  const describe = (info) =>
    info.items.map((item) => item.label.split(" · ")[0]).join(", ") +
    (info.count > info.items.length ? " e outras" : "");
  if (alerts.groups_without_teacher?.count)
    actions.push([
      plural(
        alerts.groups_without_teacher.count,
        "turma sem professor",
        "turmas sem professor",
      ),
      describe(alerts.groups_without_teacher) +
        ". Vincule um professor vigente.",
      "memberships",
    ]);
  if (alerts.groups_without_schedule?.count)
    actions.push([
      plural(
        alerts.groups_without_schedule.count,
        "turma sem grade",
        "turmas sem grade",
      ),
      describe(alerts.groups_without_schedule) + ". Cadastre os horários.",
      "schedule",
    ]);
  if (alerts.teacher_memberships_ending)
    actions.push([
      plural(
        alerts.teacher_memberships_ending,
        "vínculo de professor vence",
        "vínculos de professor vencem",
      ) + " em 30 dias",
      "Renove a vigência para não interromper o acesso.",
      "memberships",
    ]);
  if (data.pending_count)
    actions.push([
      plural(data.pending_count, "avaliação pendente", "avaliações pendentes"),
      "Acompanhe as entregas recebidas.",
      "activity",
    ]);
  actions.forEach(([title, description, key]) => {
    const item = el("div", undefined, "action-item"),
      body = el("div");
    body.append(el("h3", title), el("p", description));
    item.append(
      icon("bell"),
      body,
      button("Acessar", () => navigate(key)),
    );
    todo.append(item);
  });
  if (!actions.length)
    todo.append(
      emptyState(
        "Nenhuma pendência identificada",
        "Continue acompanhando a rotina acadêmica.",
        "activity",
      ),
    );
  recent.append(sectionHeading("Publicado recentemente", "notice"));
  data.recent.forEach((row) => recent.append(recentItem(row)));
  if (!data.recent.length)
    recent.append(
      emptyState(
        "Ainda não há publicações",
        "Crie um aviso ou evento para a comunidade.",
        "bell",
      ),
    );
  grid.append(todo, recent);
  $("view").append(grid, sectionHeading("Estrutura acadêmica"), cards);
}
function readDialog(title) {
  document
    .querySelectorAll(".academic-dialog")
    .forEach((node) => node.remove());
  const dialog = el("dialog", undefined, "academic-dialog"),
    heading = el("h2", title),
    close = button("Fechar", () => dialog.close(), "secondary");
  heading.id = "detail-title";
  dialog.setAttribute("aria-labelledby", heading.id);
  dialog.append(heading);
  const body = el("div");
  dialog.append(body, close);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  return { dialog, body };
}
async function openPublication(row) {
  const { dialog, body } = readDialog(row.title);
  dialog.classList.add("wide-dialog", "detail-dialog");
  dialog
    .querySelector("h2")
    .before(
      el(
        "p",
        kindLabel[row.kind] +
          " · " +
          (row.group_id
            ? groupParts(reference("groups", row.group_id)).subject
            : "Toda a instituição"),
        "detail-eyebrow",
      ),
    );
  const meta = el("div", undefined, "detail-meta"),
    badge = stateBadge(row);
  if (badge) meta.append(badge);
  if (row.due_at) meta.append(deadlineChip(row.due_at));
  if (row.starts_at) meta.append(infoLine(eventWhen(row), "calendar"));
  if (row.kind === "notice" || row.kind === "material")
    meta.append(
      el(
        "span",
        "Publicado " + when(row.publish_at || row.created_at),
        "card-meta",
      ),
    );
  body.append(
    meta,
    el(
      "h3",
      row.kind === "activity" ? "Instruções" : "Conteúdo",
      "detail-section",
    ),
    el("p", row.body, "academic-body"),
  );
  const error = el("p", undefined, "error");
  error.setAttribute("role", "alert");
  body.append(error);
  try {
    await attachmentPanel(
      "publication",
      row.id,
      body,
      canManage(row),
      row.kind === "activity" ? "Material de apoio" : "Arquivos",
    );
    if (!dialog.isConnected) return;
    if (row.kind === "activity" && !row.draft) await activityDetails(row, body);
    if (row.kind === "event" && !row.draft && dialog.isConnected) {
      const info = await api("/learning/events/" + row.id + "/enrollment");
      if (!dialog.isConnected) return;
      const seats = el("div", undefined, "seats");
      seats.append(
        el(
          "strong",
          info.capacity
            ? `${info.count} de ${info.capacity} vagas preenchidas`
            : plural(info.count, "pessoa inscrita", "pessoas inscritas"),
        ),
      );
      if (info.capacity) {
        const bar = el("div", undefined, "progress"),
          fill = el("span");
        fill.style.width =
          Math.min(100, (info.count / info.capacity) * 100) + "%";
        bar.append(fill);
        bar.setAttribute("aria-hidden", "true");
        seats.append(bar);
      }
      if (info.enrolled)
        seats.append(el("span", "Você está inscrito", "badge green"));
      body.append(seats);
      if (canManage(row)) {
        const people = await api(
          "/learning/events/" + row.id + "/enrollments?limit=100",
        );
        if (!dialog.isConnected) return;
        const list = el("details", undefined, "enrollment-list");
        list.append(el("summary", "Ver inscritos (" + people.length + ")"));
        for (const person of people)
          list.append(
            el(
              "p",
              `${person.name} · ${person.email} · ${academicTime(person.created_at)}`,
            ),
          );
        if (!people.length) list.append(el("p", "Nenhuma inscrição ainda."));
        body.append(list);
      }
      const full =
        info.capacity && info.count >= info.capacity && !info.enrolled;
      const action = button(
        info.enrolled
          ? "Cancelar inscrição"
          : full
            ? "Vagas esgotadas"
            : "Inscrever-me",
        async () => {
          action.disabled = true;
          error.textContent = "";
          try {
            await api("/learning/events/" + row.id + "/enrollment", {
              method: "PUT",
              body: JSON.stringify({ archived: info.enrolled }),
            });
            await openPublication(row);
          } catch (e) {
            error.textContent = e.message;
          } finally {
            action.disabled = false;
          }
        },
        info.enrolled ? "secondary danger wide-action" : "primary wide-action",
      );
      action.disabled = Boolean(full);
      body.append(action);
    }
  } catch (e) {
    error.textContent = e.message;
  }
}
// First class meeting from now on, within two weeks, for one group's timetable.
function nextLesson(rows) {
  const start = new Date(brDate(Date.now()) + "T12:00:00Z");
  for (let offsetDays = 0; offsetDays < 14; offsetDays++) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offsetDays);
    const key = date.toISOString().slice(0, 10);
    const found = lessonsOn(rows, key).find(
      (row) => offsetDays > 0 || row.starts_minute > nowMinute(),
    );
    if (found) {
      const day =
        offsetDays === 0
          ? "hoje"
          : offsetDays === 1
            ? "amanhã"
            : new Intl.DateTimeFormat("pt-BR", {
                timeZone: "UTC",
                weekday: "short",
                day: "numeric",
                month: "short",
              }).format(date);
      return {
        row: found,
        label: `${day}, ${minuteTime(found.starts_minute)}`,
      };
    }
  }
  return null;
}
function groupCard(row, detail, extra = null) {
  const parts = groupParts(row.label),
    card = button("", () => openGroup(row), "group-card");
  card.append(el("h2", parts.subject), el("p", parts.rest, "group-meta"));
  if (extra) card.append(extra);
  const footer = el("span", detail, "card-meta");
  footer.append(icon("arrow"));
  card.append(footer);
  return card;
}
function openGroup(row) {
  const { dialog, body } = readDialog(row.label);
  body.append(el("p", "Escolha o conteúdo que deseja consultar."));
  const options = el("div", undefined, "group-options");
  for (const key of ["activity", "material", "schedule", "attendance"])
    options.append(
      button(
        key === "attendance" && user.role !== "student"
          ? "Chamadas"
          : titles[key],
        () => {
          dialog.close();
          navigate(key, { groupId: row.id });
        },
      ),
    );
  if (user.role !== "student")
    options.append(
      button(
        "Alunos e desempenho",
        learningAction(async () => {
          dialog.close();
          await groupStudents(row);
        }),
      ),
    );
  body.append(options);
}
function passwordDialog() {
  const ui = learningDialog("Alterar senha");
  const current = ui.field("current_password", "Senha atual", "password");
  current.autocomplete = "current-password";
  const fresh = ui.field("new_password", "Nova senha", "password");
  const again = ui.field("confirm_password", "Repita a nova senha", "password");
  for (const input of [fresh, again]) {
    input.autocomplete = "new-password";
    input.minLength = 12;
    input.maxLength = 128;
  }
  ui.fields.append(
    el(
      "p",
      "Mínimo de 12 caracteres. As outras sessões abertas desta conta serão encerradas.",
      "help",
    ),
  );
  ui.save.textContent = "Alterar senha";
  ui.form.save = async () => {
    if (fresh.value !== again.value)
      throw new Error("A confirmação não corresponde à nova senha.");
    try {
      await api("/me/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: current.value,
          new_password: fresh.value,
        }),
      });
    } finally {
      current.value = fresh.value = again.value = "";
    }
    return "Senha alterada. As outras sessões foram encerradas.";
  };
}
async function privacyDialog() {
  const { dialog, body } = readDialog("Privacidade e seus dados");
  dialog.classList.add("wide-dialog");
  let info = {};
  try {
    info = await api("/privacy");
  } catch {
    /* The notice is still shown without the configured contact. */
  }
  if (!dialog.isConnected) return;
  const sections = [
    [
      "Quem trata os dados",
      "A Fatec Adamantina, unidade do Centro Paula Souza, por meio do Hub Acadêmico.",
    ],
    [
      "Quais dados",
      "Nome, e-mail institucional, perfil, vínculos com turmas, entregas e anexos, avaliações e devolutivas, frequência registrada em aula, inscrições em eventos, preferências e dispositivos de notificação, registros de acesso e de auditoria.",
    ],
    [
      "Para quê",
      "Organizar a rotina acadêmica (aulas, prazos, materiais, avisos e eventos), registrar entregas, avaliações e frequência, enviar as notificações que você ativar e manter a segurança e a rastreabilidade das alterações.",
    ],
    [
      "Quem acessa",
      "Você; os professores das suas turmas, para entregas, notas e frequência; a coordenação; e o responsável técnico, para suporte e segurança. Os dados não são vendidos nem usados para publicidade.",
    ],
    [
      "Por quanto tempo",
      `Registros acadêmicos e a auditoria seguem as regras de guarda da instituição. Sessões terminam após ${info.session_idle_minutes || 30} minutos sem uso e em até ${info.session_max_hours || 8} horas; o histórico de notificações enviadas é apagado após ${info.notification_retention_days || 90} dias.`,
    ],
    [
      "Seus direitos",
      "Você pode baixar uma cópia dos seus dados, pedir correções à coordenação, desativar notificações a qualquer momento e solicitar informações sobre o tratamento.",
    ],
    [
      "Contato",
      info.contact ||
        "O canal do encarregado de dados será informado pela instituição.",
    ],
  ];
  for (const [title, text] of sections)
    body.append(el("h3", title), el("p", text, "privacy-text"));
  if (user) {
    const download = el("a", "Baixar meus dados (JSON)", "primary button-link");
    download.href = "/api/v1/me/export";
    download.download = "meus-dados-hub.json";
    body.append(download);
  }
}
async function renderProfile(ticket) {
  const card = el("div", undefined, "section-card profile-card");
  card.append(
    el("span", initials(user.name), "avatar"),
    el("h2", user.name),
    el("p", user.email, "muted"),
    el(
      "span",
      user.administrator
        ? "Administrador · " + roles[user.role]
        : roles[user.role],
      "badge",
    ),
  );
  if (user.role === "student") {
    const [frequency, averages] = await Promise.all([
      api("/learning/attendance/summary").catch(() => null),
      api("/learning/averages").catch(() => []),
    ]);
    if (ticket !== generation) return;
    const graded = averages.reduce((total, item) => total + item.count, 0),
      mean = graded
        ? averages.reduce(
            (total, item) => total + item.average * item.count,
            0,
          ) / graded
        : null;
    const stats = el("div", undefined, "profile-stats");
    for (const [value, label, key] of [
      [
        mean === null ? "—" : mean.toFixed(1).replace(".", ","),
        "Média do hub",
        "activity",
      ],
      [percent(frequency?.attendance_percent), "Frequência", "attendance"],
      [String(graded), "Avaliações", "activity"],
    ]) {
      const item = button("", () => navigate(key), "profile-stat");
      item.append(el("strong", value), el("span", label));
      stats.append(item);
    }
    card.append(stats);
  }
  const menu = el("div", undefined, "profile-menu quick-grid");
  for (const key of [
    "myGroups",
    "attendance",
    "calendar",
    "reminders",
    "notice",
    "event",
    "onboarding",
    ...(user.administrator ? ["adminUsers", "adminStatus"] : []),
  ])
    if (allowedPages().includes(key)) menu.append(navButton(key));
  const account = el("div", undefined, "profile-menu account-list");
  const entry = (label, name, handler, tone = "") => {
    const item = button("", handler, "account-item " + tone);
    item.append(icon(name), el("span", label), icon("arrow"));
    return item;
  };
  if (localLoginEnabled && !user.administrator)
    account.append(
      entry("Alterar senha", "lock", learningAction(passwordDialog)),
    );
  account.append(
    entry("Privacidade e meus dados", "shield", learningAction(privacyDialog)),
    entry("Ajuda com o acesso", "help", () => $("help-dialog").showModal()),
    entry("Sair da conta", "logout", () => $("logout").click(), "danger"),
  );
  $("view").append(
    card,
    sectionHeading("Acessos"),
    menu,
    sectionHeading("Conta"),
    account,
  );
  notificationPanel($("view")).catch((error) => status(error.message, true));
}
const onboardingStorageKey = "fatec:onboarding-completed:v1";
document.addEventListener("DOMContentLoaded", startApp);
function startApp() {
  const startup = $("startup-view");
  $("login-view").inert = $("app-view").inert = true;
  // Authentication loads independently; an unavailable API must not trap the splash.
  void connectLogin();
  const finish = () => {
    startup.hidden = true;
    startup.replaceChildren();
    document.body.classList.remove("starting-app");
    $("login-view").inert = $("app-view").inert = false;
    const heading = document.querySelector(
      user ? "#app-view h1" : "#login-view h1",
    );
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  };
  setTimeout(() => {
    let completed = false;
    try {
      completed = localStorage.getItem(onboardingStorageKey) === "true";
    } catch {
      /* Storage is optional, never an authentication mechanism. */
    }
    if (completed || user || microsoftCallbackFailed) {
      finish();
      return;
    }
    renderOnboarding(0, startup, () => {
      try {
        localStorage.setItem(onboardingStorageKey, "true");
      } catch {
        /* Private browsing can disallow persistence. */
      }
      finish();
    });
  }, 700);
}
function renderOnboarding(
  step = 0,
  target = $("view"),
  onComplete = () => navigate("home"),
) {
  const slides = [
    "Centralize suas atividades",
    "Tenha controle total sobre seu ambiente",
    "Fique por dentro das novidades dentro da comunidade",
  ];
  const box = el("div", undefined, "onboarding"),
    img = el("img");
  img.src = document
    .querySelector("link[rel=stylesheet]")
    .href.replace("panel.css", "onb" + (step + 1) + ".png");
  img.alt = "";
  box.dataset.step = String(step + 1);
  const sheet = el("div", undefined, "onboarding-sheet"),
    header = el("div", undefined, "onboarding-header"),
    brand = el("div", undefined, "onboarding-brand");
  brand.append(
    el("div", "Fatec", "wordmark-name"),
    el("div", "Adamantina", "wordmark-city"),
  );
  const skip = button("Pular", onComplete, "onboarding-skip");
  header.append(brand, skip);
  const title = el("div", undefined, "onboarding-title");
  title.append(el("h2", slides[step]));
  title.firstChild.tabIndex = -1;
  sheet.append(header, title, img);
  const actions = el("div", undefined, "onboarding-actions");
  box.setAttribute("aria-label", `Apresentação: passo ${step + 1} de 3`);
  const next = button(
    "Avançar",
    () =>
      step === 2
        ? onComplete()
        : renderOnboarding(step + 1, target, onComplete),
    "onboarding-next",
  );
  next.append(icon("arrow"));
  actions.append(next);
  box.append(sheet, actions);
  target.replaceChildren(box);
  title.firstChild.focus();
}
async function renderSearch(ticket) {
  $("view").append(
    searchBar(globalSearch, (value) => {
      globalSearch = value;
      offset = 0;
      render();
    }),
  );
  if (!globalSearch) {
    $("view").append(
      emptyState(
        "O que você procura?",
        "Busque pelo título ou conteúdo das publicações.",
        "search",
      ),
    );
    return;
  }
  const lists = await Promise.all(
    ["activity", "material", "notice", "event"].map((kind) =>
      api(
        "/learning/publications?" +
          new URLSearchParams({
            kind,
            q: globalSearch,
            offset: String(offset),
            limit: "25",
          }),
      ),
    ),
  );
  if (ticket !== generation) return;
  let total = 0;
  for (const [index, rows] of lists.entries()) {
    total += rows.length;
    if (rows.length) {
      $("view").append(
        sectionHeading(
          academicPages[["activity", "material", "notice", "event"][index]],
        ),
      );
      rows.forEach((row) => $("view").append(recentItem(row)));
    }
  }
  if (!total)
    $("view").append(
      emptyState(
        "Nenhum resultado",
        "Tente outro termo ou consulte suas turmas.",
        "search",
      ),
    );
  $("view").append(pager(lists.find((rows) => rows.length === 25) || []));
}
function academicInstant(value) {
  return new Date(
    typeof value === "string" && !/[Zz]|[+-]\d\d:\d\d$/.test(value)
      ? value + "Z"
      : value,
  );
}
function brDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(academicInstant(value));
}
let calendarMonth = null,
  calendarSelected = null;
async function renderCalendar(ticket) {
  const today = brDate(Date.now());
  if (!calendarSelected) calendarSelected = today;
  if (!calendarMonth) calendarMonth = calendarSelected.slice(0, 7);
  const data = await api("/learning/calendar?month=" + calendarMonth);
  await groupLabels(data.lessons);
  if (ticket !== generation) return;
  const box = el("div", undefined, "calendar"),
    header = el("div", undefined, "calendar-header"),
    [year, month] = calendarMonth.split("-").map(Number),
    first = new Date(Date.UTC(year, month - 1, 1));
  const shift = (delta) => {
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    calendarMonth = date.toISOString().slice(0, 7);
    calendarSelected = calendarMonth + "-01";
    render();
  };
  const prev = button("‹", () => shift(-1), "icon-button"),
    next = button("›", () => shift(1), "icon-button");
  prev.setAttribute("aria-label", "Mês anterior");
  next.setAttribute("aria-label", "Próximo mês");
  header.append(
    prev,
    el(
      "h2",
      (() => {
        const text = first.toLocaleDateString("pt-BR", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        });
        return text.charAt(0).toUpperCase() + text.slice(1);
      })(),
    ),
    next,
  );
  box.append(header);
  const grid = el("div", undefined, "calendar-grid");
  ["S", "T", "Q", "Q", "S", "S", "D"].forEach((text) =>
    grid.append(el("span", text)),
  );
  const start = (first.getUTCDay() + 6) % 7,
    days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let i = 0; i < start; i++) grid.append(el("span"));
  const entriesFor = (date) => {
    const end = date + "T23:59:59.999-03:00",
      begin = date + "T00:00:00-03:00",
      weekday = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
    return {
      publications: data.publications.filter((row) =>
        row.kind === "activity"
          ? brDate(row.due_at) === date
          : academicInstant(row.starts_at) <= new Date(end) &&
            academicInstant(row.ends_at) >= new Date(begin),
      ),
      lessons: data.lessons.filter(
        (row) =>
          row.weekday === weekday &&
          row.starts_on <= date &&
          row.ends_on >= date,
      ),
    };
  };
  for (let day = 1; day <= days; day++) {
    const date = calendarMonth + "-" + String(day).padStart(2, "0"),
      entries = entriesFor(date),
      item = button(
        String(day),
        () => {
          calendarSelected = date;
          render();
        },
        "calendar-day" +
          (date === today ? " today" : "") +
          (entries.publications.length || entries.lessons.length
            ? " has-event"
            : ""),
      );
    item.setAttribute("aria-pressed", String(date === calendarSelected));
    item.setAttribute(
      "aria-label",
      formatDate(date) +
        (entries.publications.length || entries.lessons.length
          ? " · com compromissos"
          : ""),
    );
    grid.append(item);
  }
  box.append(grid);
  $("view").append(box, sectionHeading(longDay(calendarSelected)));
  const entries = entriesFor(calendarSelected);
  entries.lessons.forEach((row) =>
    $("view").append(lessonCard(row, false, "", calendarSelected)),
  );
  entries.publications.forEach((row) => $("view").append(recentItem(row)));
  if (!entries.lessons.length && !entries.publications.length)
    $("view").append(
      emptyState(
        "Dia livre na agenda",
        "Não há aulas, eventos ou prazos cadastrados para esta data.",
        "calendar",
      ),
    );
  if (data.truncated)
    $("view").append(
      el(
        "p",
        "Este mês possui mais registros do que o calendário pode exibir. Consulte também Atividades, Eventos e Horários.",
        "help",
      ),
    );
}
document
  .querySelectorAll("[data-icon]")
  .forEach((node) => node.append(icon(node.dataset.icon)));
$("toggle-password").addEventListener("click", () => {
  const visible = $("password").type === "password";
  $("password").type = visible ? "text" : "password";
  $("toggle-password").setAttribute("aria-pressed", String(visible));
  $("toggle-password").setAttribute(
    "aria-label",
    visible ? "Ocultar senha" : "Mostrar senha",
  );
});
$("login-help").addEventListener("click", () => $("help-dialog").showModal());
$("privacy-link").addEventListener("click", () =>
  privacyDialog().catch((error) => {
    $("login-error").textContent = error.message;
  }),
);
$("menu-toggle").addEventListener("click", () => {
  $("menu-toggle").setAttribute(
    "aria-expanded",
    String(document.body.classList.toggle("menu-open")),
  );
});
$("open-reminders").addEventListener("click", () => navigate("reminders"));
window.addEventListener("hashchange", () => {
  const key = location.hash.slice(1);
  if (user && allowedPages().includes(key) && key !== page) navigate(key);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.body.classList.remove("menu-open");
    $("menu-toggle").setAttribute("aria-expanded", "false");
  }
});
