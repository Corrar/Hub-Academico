"use strict";
// Roll call (teacher/coordination) and attendance summary (student).
Object.assign(descriptions, {
  attendance: "Sua presença registrada pelos professores, por disciplina.",
});
function lessonDay(date) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}
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
  const overall = el("section", undefined, "section-card frequency-overall");
  overall.append(
    el("strong", percent(data.attendance_percent)),
    el(
      "p",
      data.recorded_lessons
        ? `de presença em ${plural(data.recorded_lessons, "aula registrada", "aulas registradas")}. O que reprova é a falta por disciplina — por isso a lista abaixo importa mais que este número.`
        : "Nenhuma chamada registrada até agora.",
    ),
  );
  target.append(overall, sectionHeading("Por disciplina"));
  const list = el("div", undefined, "frequency-list");
  for (const item of data.groups) {
    const card = el("article", undefined, "frequency-card " + item.state),
      top = el("div", undefined, "frequency-top"),
      bar = el("div", undefined, "frequency-bar"),
      fill = el("span");
    top.append(el("h3", item.group_label), frequencyBadge(item));
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
      el(
        "p",
        `${percent(item.attendance_percent)} de presença · ${plural(item.absences, "falta", "faltas")} de ${item.allowed_absences} permitidas`,
      ),
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
  const box = el("div", undefined, "section-card");
  for (const lesson of missed) {
    const line = el("div", undefined, "missed-item");
    line.append(
      el("strong", lessonDay(lesson.lesson_date)),
      el("span", lesson.group.split(" · ")[0]),
      el("small", lesson.topic || "Conteúdo não informado"),
    );
    box.append(line);
  }
  if (!missed.length) box.append(el("p", "Nenhuma falta até aqui.", "muted"));
  target.append(
    box,
    el(
      "p",
      `O limite é ${data.limit_percent}% das aulas previstas na grade de cada disciplina. A contagem vem da chamada feita pelo professor em aula. ${data.notice}`,
      "help",
    ),
  );
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
  ui.fields.append(
    el(
      "p",
      `${sheet.group_label} · ${lessonDay(date)} · ${minuteTime(schedule.starts_minute)} · ${schedule.room}`,
      "muted",
    ),
  );
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
  const toolbar = el("div", undefined, "toolbar");
  if (academicGroup)
    toolbar.append(
      el("span", reference("groups", academicGroup), "badge"),
      button("Ver todas as turmas", () => {
        academicGroup = "";
        offset = 0;
        render();
      }),
    );
  const caption = el("label", "Mostrar arquivadas"),
    check = el("input");
  check.type = "checkbox";
  check.checked = archived;
  check.addEventListener("change", () => {
    archived = check.checked;
    offset = 0;
    render();
  });
  caption.prepend(check);
  toolbar.append(
    button("Registrar outra data", learningAction(pickLesson), "primary"),
    caption,
  );
  $("view").append(toolbar, sectionHeading("Aulas de hoje"));
  const today = overview.lessons_today.filter(
    (row) => !academicGroup || row.group_id === academicGroup,
  );
  today.forEach((row) =>
    $("view").append(
      lessonCard(row, overview.recorded_today.includes(row.id), overview.date),
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
  $("view").append(
    sectionHeading(archived ? "Chamadas arquivadas" : "Chamadas registradas"),
  );
  const box = el("div", undefined, "section-card");
  for (const lesson of lessons) {
    const line = el("div", undefined, "roll-item"),
      body = el("div");
    body.append(
      el(
        "h3",
        lessonDay(lesson.lesson_date) +
          " · " +
          lesson.group_label.split(" · ")[0],
      ),
      el(
        "p",
        `${lesson.present_count} presentes · ${lesson.absent_count} ausentes` +
          (lesson.topic ? " · " + lesson.topic : ""),
      ),
    );
    const actions = el("div", undefined, "row-actions");
    if (!lesson.archived)
      actions.append(
        button(
          "Abrir",
          learningAction(() =>
            rollCall(lesson.schedule_id, lesson.lesson_date),
          ),
        ),
      );
    actions.append(
      button(
        lesson.archived ? "Restaurar" : "Arquivar",
        learningAction(async () => {
          if (
            !confirm(
              lesson.archived
                ? "Restaurar esta chamada? Ela volta a contar na frequência."
                : "Arquivar esta chamada? Ela deixa de contar na frequência, mas o histórico é preservado.",
            )
          )
            return;
          await api("/learning/attendance/lessons/" + lesson.id + "/archive", {
            method: "PATCH",
            body: JSON.stringify({ archived: !lesson.archived }),
          });
          await render();
        }),
        lesson.archived ? "secondary" : "secondary danger",
      ),
    );
    line.append(icon("attendance"), body, actions);
    box.append(line);
  }
  if (!lessons.length)
    box.append(
      emptyState(
        "Nenhuma chamada por aqui",
        "As chamadas salvas aparecem nesta lista.",
        "attendance",
      ),
    );
  $("view").append(box, pager(lessons));
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
  body.append(
    scroll,
    el(
      "p",
      "A média considera apenas atividades avaliadas no hub; não é a nota oficial.",
      "help",
    ),
  );
}
