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
    ["Principal", ["dashboard", "event", "notice"]],
    [
      "Acadêmico",
      [
        "courses",
        "subjects",
        "groups",
        "schedule",
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
    $("page-title").textContent = user.name;
    $("page-description").textContent = user.email + " · " + roles[user.role];
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
      "recent-item",
    ),
    body = el("div");
  body.append(
    el("strong", row.title),
    el(
      "small",
      academicPages[row.kind] +
        " · " +
        academicTime(row.starts_at || row.due_at || row.created_at),
    ),
  );
  item.append(el("span", undefined, "recent-dot"), body, icon("arrow"));
  return item;
}
function lessonCard(row) {
  const item = el("article", undefined, "lesson"),
    time = el("div", minuteTime(row.starts_minute), "lesson-time"),
    body = el("div", undefined, "lesson-info");
  time.append(el("small", minuteTime(row.ends_minute)));
  body.append(
    el("strong", reference("groups", row.group_id)),
    el("p", row.room),
  );
  item.append(time, body);
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
  if (key === "home" || key === "dashboard" || key === "reminders") {
    const data = await api("/learning/overview");
    await groupLabels([...data.lessons_today, ...data.upcoming]);
    if (ticket !== generation) return;
    if (key === "home") {
      const groups =
        user.role === "teacher" ? await api("/learning/groups?limit=4") : [];
      if (ticket !== generation) return;
      renderHome(data, groups);
    }
    if (key === "reminders") {
      const box = el("div", undefined, "section-card");
      box.append(sectionHeading("Próximos prazos", "activity"));
      data.upcoming.forEach((row) => box.append(recentItem(row)));
      if (!data.upcoming.length)
        box.append(
          emptyState(
            "Nenhum prazo próximo",
            "As atividades publicadas aparecerão aqui.",
            "schedule",
          ),
        );
      box.append(sectionHeading("Comunicados recentes", "notice"));
      data.recent.forEach((row) => box.append(recentItem(row)));
      $("view").append(
        box,
        el(
          "p",
          "Lembretes consultados no aplicativo. Não enviamos notificações push.",
          "help",
        ),
      );
    }
    if (key === "dashboard") {
      const counts = await api("/dashboard");
      if (ticket !== generation) return;
      renderDashboard(counts, data);
    }
  } else if (key === "myGroups") {
    const rows = await api("/learning/groups?limit=25&offset=" + offset);
    if (ticket !== generation) return;
    rows.forEach((row) => {
      labels.set("groups:" + row.id, row.label);
      const card = button("", () => openGroup(row), "group-card");
      card.append(
        el("h2", row.label),
        el("p", "Acesse os conteúdos desta turma"),
        el("div", "Atividades · Materiais · Horários", "card-meta"),
      );
      $("view").append(card);
    });
    if (!rows.length)
      $("view").append(
        emptyState(
          "Nenhuma turma disponível",
          "Seus vínculos acadêmicos vigentes aparecerão aqui.",
          "groups",
        ),
      );
    $("view").append(pager(rows));
  } else if (key === "profile") renderProfile();
  else if (key === "onboarding") renderOnboarding();
  else if (key === "calendar") await renderCalendar(ticket);
  else if (key === "search") await renderSearch(ticket);
  if (ticket === generation) status("");
}
function renderHome(data, groups = []) {
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
        ? data.pending_count + " avaliações pendentes"
        : target?.title ||
            (data.pending_count
              ? "Confira suas entregas"
              : "Tudo em dia por aqui"),
    ),
    el(
      "p",
      teacher
        ? "Acompanhe as entregas e dê o próximo feedback."
        : target
          ? "Prazo: " + academicTime(target.due_at)
          : "Consulte suas atividades e acompanhe os novos conteúdos.",
    ),
  );
  const link = el(
    "span",
    teacher ? "Ver entregas" : "Ver atividades",
    "hero-link",
  );
  link.append(icon("arrow"));
  if (teacher) hero.append(link);
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
    [data.groups_count, "Turmas", "myGroups"],
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
      const card = button("", () => openGroup(row), "group-card");
      card.append(
        el("h2", row.label),
        el("p", "Conteúdos, entregas e avaliações"),
        el("span", "Acessar turma →", "card-meta"),
      );
      $("view").append(card);
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
  $("view").append(sectionHeading("Aulas de hoje", "schedule", "Ver semana"));
  data.lessons_today.forEach((row) => $("view").append(lessonCard(row)));
  if (!data.lessons_today.length)
    $("view").append(
      emptyState(
        "Hoje sem aulas cadastradas",
        "Confira a grade completa nos horários.",
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
    tile.append(
      el("span", "EVENTO", "badge"),
      el("h3", row.title),
      el("p", academicTime(row.starts_at)),
    );
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
  if (data.pending_count)
    actions.push([
      data.pending_count + " avaliações pendentes",
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
  body.append(
    el("span", row.draft ? "Rascunho" : academicPages[row.kind], "badge"),
    el("p", row.body, "academic-body"),
  );
  if (row.due_at) body.append(el("p", "Prazo: " + academicTime(row.due_at)));
  if (row.starts_at)
    body.append(
      el("p", academicTime(row.starts_at) + " a " + academicTime(row.ends_at)),
    );
  const error = el("p", undefined, "error");
  error.setAttribute("role", "alert");
  body.append(error);
  try {
    await attachmentPanel("publication", row.id, body, canManage(row));
    if (!dialog.isConnected) return;
    if (row.kind === "activity" && !row.draft) await activityDetails(row, body);
    if (row.kind === "event" && !row.draft && dialog.isConnected) {
      const info = await api("/learning/events/" + row.id + "/enrollment");
      if (!dialog.isConnected) return;
      body.append(
        el(
          "p",
          `${info.count} inscritos · ${info.capacity ?? "sem limite de"} vagas`,
        ),
      );
      const action = button(
        info.enrolled ? "Cancelar inscrição" : "Inscrever-me",
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
        "primary",
      );
      body.append(action);
    }
  } catch (e) {
    error.textContent = e.message;
  }
}
function openGroup(row) {
  const { dialog, body } = readDialog(row.label);
  body.append(el("p", "Escolha o conteúdo que deseja consultar."));
  for (const key of ["activity", "material", "schedule"])
    body.append(
      button(titles[key], () => {
        dialog.close();
        navigate(key, { groupId: row.id });
      }),
    );
}
function renderProfile() {
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
  const menu = el("div", undefined, "profile-menu");
  for (const key of [
    "myGroups",
    "activity",
    "material",
    "notice",
    "event",
    "calendar",
    "reminders",
    "onboarding",
    ...(user.administrator ? ["adminUsers", "adminStatus"] : []),
  ])
    if (allowedPages().includes(key)) {
      const item = navButton(key);
      item.append(icon("arrow"));
      menu.append(item);
    }
  menu.append(
    button("Ajuda com o acesso", () => $("help-dialog").showModal()),
    button("Sair da conta", () => $("logout").click(), "secondary danger"),
  );
  $("view").append(card, menu);
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
      first.toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
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
  $("view").append(box, sectionHeading(formatDate(calendarSelected)));
  const entries = entriesFor(calendarSelected);
  entries.lessons.forEach((row) => $("view").append(lessonCard(row)));
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
