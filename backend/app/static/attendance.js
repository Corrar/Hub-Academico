"use strict";
// Roll call (teacher/coordination) and attendance summary (student).
Object.assign(descriptions, {
  attendance: "Sua presença registrada pelos professores, por disciplina.",
});
function plural(count, one, many) {
  return count + " " + (count === 1 ? one : many);
}
function frequencyBalance(item) {
  if (item.state === "no_data") return "Sem chamadas registradas";
  if (item.state === "exceeded")
    return (
      "Acima do limite em " +
      plural(-item.remaining_absences, "falta", "faltas")
    );
  if (item.state === "critical") return "Limite de faltas atingido";
  return "Pode faltar mais " + plural(item.remaining_absences, "aula", "aulas");
}
function frequencyBadge(item) {
  const [text, tone] = {
    no_data: ["Aguardando chamada", ""],
    ok: ["Em dia", "green"],
    warning: ["Atenção", "gold"],
    critical: ["Sem faltas restantes", "red"],
    exceeded: ["Acima do limite", "red"],
  }[item.state];
  return el("span", text, "badge " + tone);
}
function percent(value) {
  return value === null || value === undefined
    ? "—"
    : String(value).replace(".", ",") + "%";
}
function frequencyView(data, target) {
  const alert = data.groups.find((item) =>
    ["exceeded", "critical"].includes(item.state),
  );
  if (alert) {
    const hero = el("section", undefined, "hero-card frequency-alert");
    hero.append(
      el(
        "p",
        "ATENÇÃO · " + alert.group_label.split(" · ")[0].toUpperCase(),
        "eyebrow",
      ),
      el(
        "h2",
        alert.state === "exceeded"
          ? "Você ultrapassou o limite de faltas"
          : "Você não pode faltar mais nenhuma aula",
      ),
      el(
        "p",
        `Usou ${alert.absences} de ${alert.allowed_absences} faltas permitidas nesta disciplina. Procure a coordenação se houver erro na chamada.`,
      ),
    );
    target.append(hero);
  }
  const overall = el("section", undefined, "section-card frequency-overall"),
    ring = el("div", undefined, "frequency-ring"),
    value = data.attendance_percent,
    healthy = value === null || value >= 100 - data.limit_percent;
  ring.classList.toggle("low", !healthy);
  ring.style.setProperty("--value", String(value ?? 0));
  ring.setAttribute("aria-hidden", "true");
  ring.append(el("strong", percent(value)));
  const text = el("div");
  text.append(
    el("h2", "Presença geral"),
    el(
      "p",
      data.recorded_lessons
        ? `${percent(value)} em ${plural(data.recorded_lessons, "aula registrada", "aulas registradas")}.`
        : "Nenhuma chamada registrada até agora.",
    ),
    el(
      "p",
      `O limite de ${data.limit_percent}% de faltas vale para cada disciplina.`,
      "help",
    ),
  );
  overall.append(ring, text);
  target.append(overall, sectionHeading("Por disciplina"));
  const list = el("div", undefined, "frequency-list");
  for (const item of data.groups) {
    const parts = groupParts(item.group_label),
      card = el("article", undefined, "frequency-card " + item.state),
      top = el("div", undefined, "frequency-top"),
      title = el("div"),
      stats = el("div", undefined, "frequency-stats"),
      bar = el("div", undefined, "frequency-bar"),
      fill = el("span");
    title.append(el("h3", parts.subject), el("small", parts.rest));
    top.append(title, frequencyBadge(item));
    const presence = el("span"),
      absences = el("span");
    presence.append(
      el("strong", percent(item.attendance_percent)),
      " presença",
    );
    absences.append(
      el("strong", String(item.absences)),
      ` de ${plural(item.allowed_absences, "falta permitida", "faltas permitidas")}`,
    );
    stats.append(presence, absences);
    const used = item.allowed_absences
      ? Math.min(100, (item.absences / item.allowed_absences) * 100)
      : item.absences
        ? 100
        : 0;
    fill.style.width = used + "%";
    bar.setAttribute("aria-hidden", "true");
    bar.append(fill);
    card.append(
      top,
      stats,
      bar,
      el("p", frequencyBalance(item), "frequency-balance"),
    );
    list.append(card);
  }
  if (!data.groups.length)
    list.append(
      emptyState(
        "Nenhuma disciplina vigente",
        "As turmas com vínculo ativo aparecerão aqui.",
        "groups",
      ),
    );
  target.append(list, sectionHeading("Aulas que você perdeu"));
  const missed = data.groups
    .flatMap((item) =>
      item.missed.map((lesson) => ({ ...lesson, group: item.group_label })),
    )
    .sort((a, b) => b.lesson_date.localeCompare(a.lesson_date));
  const box = el("div", undefined, "roll-history");
  for (const lesson of missed) {
    const line = el("div", undefined, "roll-row missed"),
      body = el("div", undefined, "roll-body");
    body.append(
      el("strong", groupParts(lesson.group).subject),
      el("small", lesson.topic || "Conteúdo não informado"),
    );
    line.append(dayBlock(lesson.lesson_date), body);
    line.setAttribute("role", "group");
    line.setAttribute(
      "aria-label",
      longDay(lesson.lesson_date) + " · " + groupParts(lesson.group).subject,
    );
    box.append(line);
  }
  if (!missed.length)
    box.append(
      emptyState(
        "Nenhuma falta até aqui",
        "As aulas em que você faltou aparecem nesta lista.",
        "attendance",
      ),
    );
  target.append(
    box,
    el(
      "p",
      `O limite é ${data.limit_percent}% das aulas previstas na grade de cada disciplina. A contagem vem da chamada feita pelo professor em aula. ${data.notice}`,
      "help",
    ),
  );
}
// Day number over the short weekday, for lesson dates (YYYY-MM-DD).
function dayBlock(key) {
  const date = new Date(key + "T12:00:00Z"),
    block = el("div", undefined, "date-block");
  block.setAttribute("aria-hidden", "true");
  block.append(
    el("strong", String(date.getUTCDate()).padStart(2, "0")),
    el(
      "span",
      new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" })
        .format(date)
        .replace(".", ""),
    ),
  );
  return block;
}
async function studentFrequency(student) {
  const { dialog, body } = readDialog("Frequência · " + student.name);
  dialog.classList.add("wide-dialog");
  const data = await api(
    "/learning/attendance/summary?student_id=" + encodeURIComponent(student.id),
  );
  if (dialog.isConnected) frequencyView(data, body);
}
async function rollCall(scheduleId, date) {
  const sheet = await api(
    "/learning/attendance/sheet?" +
      new URLSearchParams({ schedule_id: scheduleId, lesson_date: date }),
  );
  const ui = learningDialog("Chamada");
  ui.dialog.classList.add("wide-dialog");
  const schedule = sheet.schedule,
    absent = new Set(
      sheet.students.filter((item) => item.present === false).map((i) => i.id),
    );
  const parts = groupParts(sheet.group_label),
    context = el("div", undefined, "roll-context");
  context.append(
    el("strong", [parts.subject, parts.name].filter(Boolean).join(" · ")),
    el(
      "span",
      `${longDay(date)} · ${minuteTime(schedule.starts_minute)} · ${schedule.room}`,
    ),
  );
  ui.fields.append(context);
  const counters = el("div", undefined, "roll-counters"),
    present = el("strong"),
    missing = el("strong"),
    presentBox = el("div"),
    missingBox = el("div");
  presentBox.append(present, el("span", "presentes"));
  missingBox.append(missing, el("span", "ausentes"));
  counters.append(presentBox, missingBox);
  counters.setAttribute("aria-live", "polite");
  const list = el("ul", undefined, "roll-list"),
    toggles = [];
  const sync = () => {
    present.textContent = String(sheet.students.length - absent.size);
    missing.textContent = String(absent.size);
    for (const [student, toggle, mark] of toggles) {
      const away = absent.has(student.id);
      toggle.setAttribute("aria-pressed", String(away));
      toggle.classList.toggle("absent", away);
      mark.textContent = away ? "Ausente" : "Presente";
    }
  };
  for (const student of sheet.students) {
    const item = el("li"),
      mark = el("span", "", "roll-mark"),
      toggle = button(
        "",
        () => {
          if (absent.has(student.id)) absent.delete(student.id);
          else absent.add(student.id);
          sync();
        },
        "roll-student",
      );
    toggle.setAttribute("aria-label", student.name + ": marcar falta");
    toggle.append(
      el("span", initials(student.name), "avatar"),
      el("span", student.name, "roll-name"),
      mark,
    );
    toggles.push([student, toggle, mark]);
    item.append(toggle);
    list.append(item);
  }
  const everyone = button("Todos presentes", () => {
    absent.clear();
    sync();
  });
  ui.fields.append(
    counters,
    everyone,
    el("p", "Todos entram como presentes. Toque só em quem faltou.", "help"),
    list,
  );
  if (!sheet.students.length) {
    list.append(
      emptyState(
        "Nenhum aluno vinculado",
        "Não há alunos com vínculo vigente nesta data.",
        "groups",
      ),
    );
    ui.save.disabled = true;
  }
  const topic = ui.field(
    "topic",
    "Conteúdo da aula (opcional)",
    "text",
    sheet.lesson?.topic || "",
  );
  topic.required = false;
  topic.maxLength = 200;
  if (sheet.lesson)
    ui.fields.append(
      el(
        "p",
        `Chamada registrada em ${academicTime(sheet.lesson.recorded_at)}. Toda correção fica registrada na auditoria.`,
        "help",
      ),
    );
  ui.save.textContent = sheet.lesson ? "Salvar correção" : "Salvar chamada";
  if (sheet.lesson)
    ui.fields.append(
      button(
        "Arquivar chamada",
        learningAction(async () => {
          if (
            !confirm(
              "Arquivar esta chamada? Ela deixa de contar na frequência, mas o histórico é preservado.",
            )
          )
            return;
          await api(
            "/learning/attendance/lessons/" + sheet.lesson.id + "/archive",
            { method: "PATCH", body: JSON.stringify({ archived: true }) },
          );
          ui.dialog.close();
          await render();
          status("Chamada arquivada. Veja em “Mostrar arquivadas”.");
        }),
        "text-button danger-link",
      ),
    );
  ui.form.save = async () => {
    await api("/learning/attendance/sheet", {
      method: "PUT",
      body: JSON.stringify({
        schedule_id: scheduleId,
        lesson_date: date,
        topic: topic.value,
        absent_ids: [...absent],
        version: sheet.lesson?.version || 0,
      }),
    });
    return "Chamada salva e registrada na auditoria.";
  };
  sync();
}
async function pickLesson() {
  const ui = learningDialog("Registrar chamada de outra data");
  ui.save.disabled = true;
  try {
    const rows = await api(
      "/learning/schedule?" +
        new URLSearchParams({
          limit: "100",
          ...(academicGroup ? { group_id: academicGroup } : {}),
        }),
    );
    await groupLabels(rows);
    if (!ui.dialog.isConnected) return;
    const slot = ui.field(
      "schedule_id",
      "Horário da grade",
      "select",
      "",
      rows.map((row) => [
        row.id,
        `${reference("groups", row.group_id)} · ${weekdays[row.weekday]} ${minuteTime(row.starts_minute)}`,
      ]),
    );
    const day = ui.field(
      "lesson_date",
      "Data da aula",
      "date",
      brDate(Date.now()),
    );
    day.max = brDate(Date.now());
    ui.fields.append(
      el(
        "p",
        "A data precisa cair no dia da semana do horário escolhido.",
        "help",
      ),
    );
    let chosen = null;
    ui.save.textContent = "Abrir chamada";
    ui.form.save = async () => {
      const row = rows.find((item) => item.id === slot.value);
      const weekday = (new Date(day.value + "T12:00:00Z").getUTCDay() + 6) % 7;
      if (!row || weekday !== row.weekday)
        throw new Error(
          "Escolha uma data de " + (row ? weekdays[row.weekday] : "aula") + ".",
        );
      chosen = [row.id, day.value];
    };
    ui.dialog.addEventListener("close", () => {
      if (chosen)
        rollCall(...chosen).catch((error) => status(error.message, true));
    });
    ui.save.disabled = !rows.length;
    if (!rows.length)
      ui.fields.append(
        el("p", "Nenhum horário cadastrado para suas turmas.", "error"),
      );
  } catch (error) {
    ui.dialog.close();
    throw error;
  }
}
async function renderAttendance(ticket) {
  if (user.role === "student") {
    const data = await api("/learning/attendance/summary");
    if (ticket !== generation) return;
    frequencyView(data, $("view"));
    return;
  }
  const query = new URLSearchParams({
    offset: String(offset),
    limit: "25",
    archived: String(archived),
    ...(academicGroup ? { group_id: academicGroup } : {}),
  });
  const [overview, lessons] = await Promise.all([
    api("/learning/overview"),
    api("/learning/attendance/lessons?" + query),
  ]);
  await groupLabels([...overview.lessons_today, ...lessons]);
  if (ticket !== generation) return;
  pageAction("Registrar outra data", pickLesson);
  const toolbar = el("div", undefined, "toolbar");
  groupFilterChip(toolbar);
  toolbar.append(archivedToggle("Mostrar arquivadas"));
  $("view").append(toolbar);
  const today = overview.lessons_today.filter(
    (row) => !academicGroup || row.group_id === academicGroup,
  );
  if (!archived) {
    $("view").append(sectionHeading("Aulas de hoje"));
    today.forEach((row) =>
      $("view").append(
        lessonCard(
          row,
          overview.recorded_today.includes(row.id),
          overview.date,
        ),
      ),
    );
    if (!today.length)
      $("view").append(
        emptyState(
          "Nenhuma aula hoje",
          "Use “Registrar outra data” para lançar uma aula anterior.",
          "schedule",
        ),
      );
  }
  $("view").append(
    sectionHeading(archived ? "Chamadas arquivadas" : "Chamadas registradas"),
  );
  let month = "",
    box = null;
  for (const lesson of lessons) {
    const label = monthLabel(lesson.lesson_date);
    if (label !== month || !box) {
      month = label;
      box = el("div", undefined, "roll-history");
      $("view").append(el("h3", label, "feed-group"), box);
    }
    box.append(rollRow(lesson));
  }
  if (!lessons.length)
    $("view").append(
      emptyState(
        archived ? "Nenhuma chamada arquivada" : "Nenhuma chamada por aqui",
        archived
          ? "Chamadas arquivadas deixam de contar na frequência e podem ser restauradas."
          : "As chamadas salvas aparecem nesta lista.",
        "attendance",
      ),
    );
  $("view").append(pager(lessons));
}
function monthLabel(key) {
  const text = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(key + "T12:00:00Z"));
  return text.charAt(0).toUpperCase() + text.slice(1);
}
// One history line: date, class, presence meter and the way back in.
function rollRow(lesson) {
  const parts = groupParts(lesson.group_label),
    total = lesson.present_count + lesson.absent_count,
    summary = `${plural(lesson.present_count, "presente", "presentes")} · ${plural(lesson.absent_count, "ausente", "ausentes")}`,
    day = dayBlock(lesson.lesson_date);
  const body = el("div", undefined, "roll-body"),
    meter = el("div", undefined, "roll-meter"),
    fill = el("span");
  fill.style.width = (total ? (lesson.present_count / total) * 100 : 0) + "%";
  meter.setAttribute("aria-hidden", "true");
  meter.append(fill);
  body.append(
    el("strong", parts.subject),
    el(
      "small",
      [parts.name, lesson.topic].filter(Boolean).join(" · ") ||
        "Conteúdo não informado",
    ),
    meter,
  );
  const counts = el("div", undefined, "roll-counts");
  counts.append(
    el("strong", total ? `${lesson.present_count}/${total}` : "—"),
    el(
      "span",
      lesson.absent_count
        ? plural(lesson.absent_count, "falta", "faltas")
        : "sem faltas",
      lesson.absent_count ? "badge red" : "badge green",
    ),
  );
  const name = `${longDay(lesson.lesson_date)} · ${parts.subject} · ${summary}`;
  if (!lesson.archived) {
    const open = button(
      "",
      learningAction(() => rollCall(lesson.schedule_id, lesson.lesson_date)),
      "roll-row",
    );
    open.setAttribute("aria-label", name + ". Abrir chamada");
    open.append(day, body, counts, icon("chevron"));
    return open;
  }
  const row = el("div", undefined, "roll-row archived");
  row.setAttribute("aria-label", name);
  row.setAttribute("role", "group");
  row.append(
    day,
    body,
    button(
      "Restaurar",
      learningAction(async () => {
        if (
          !confirm("Restaurar esta chamada? Ela volta a contar na frequência.")
        )
          return;
        await api("/learning/attendance/lessons/" + lesson.id + "/archive", {
          method: "PATCH",
          body: JSON.stringify({ archived: false }),
        });
        await render();
        status("Chamada restaurada.");
      }),
    ),
  );
  return row;
}
async function groupStudents(group) {
  const { dialog, body } = readDialog("Alunos · " + group.label);
  dialog.classList.add("wide-dialog");
  const data = await api(
    "/learning/groups/" + encodeURIComponent(group.id) + "/students?limit=100",
  );
  if (!dialog.isConnected) return;
  body.append(
    el(
      "p",
      `${plural(data.students.length, "aluno", "alunos")} com vínculo vigente · ${plural(data.activities, "atividade publicada", "atividades publicadas")}`,
      "muted",
    ),
  );
  if (!data.students.length) {
    body.append(
      emptyState(
        "Nenhum aluno vinculado",
        "Os vínculos vigentes aparecem aqui.",
        "groups",
      ),
    );
    return;
  }
  const scroll = el("div", undefined, "table-scroll"),
    table = el("table"),
    head = el("tr");
  for (const label of [
    "Aluno",
    "Entregas",
    "Média no hub",
    "Faltas",
    "Presença",
    "",
  ]) {
    const th = el("th", label);
    th.scope = "col";
    head.append(th);
  }
  const thead = el("thead"),
    tbody = el("tbody");
  thead.append(head);
  for (const student of data.students) {
    const line = el("tr"),
      name = el("td", student.name);
    name.append(el("small", student.email));
    line.append(
      name,
      el("td", `${student.submitted} de ${data.activities}`),
      el(
        "td",
        student.average === null
          ? "—"
          : Number(student.average).toFixed(1).replace(".", ","),
      ),
      el("td", String(student.absences)),
      el("td", percent(student.attendance_percent)),
    );
    const cell = el("td");
    cell.append(
      button(
        "Frequência",
        learningAction(() => studentFrequency(student)),
      ),
    );
    line.append(cell);
    tbody.append(line);
  }
  table.append(thead, tbody);
  scroll.append(table);
  const exports = el("div", undefined, "row-actions");
  for (const [kind, text] of [
    ["attendance", "Exportar frequência (CSV)"],
    ["grades", "Exportar notas (CSV)"],
  ]) {
    const link = el("a", text, "secondary button-link");
    link.href =
      "/api/v1/learning/groups/" +
      encodeURIComponent(group.id) +
      "/export/" +
      kind;
    link.download = "";
    exports.append(link);
  }
  body.append(
    scroll,
    el(
      "p",
      "A média considera apenas atividades avaliadas no hub; não é a nota oficial.",
      "help",
    ),
    exports,
  );
}
