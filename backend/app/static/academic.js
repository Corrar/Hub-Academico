"use strict";
const academicPages = {
  activity: "Atividades",
  material: "Materiais",
  notice: "Avisos",
  event: "Eventos",
  schedule: "Grade de horários",
};
Object.assign(titles, academicPages);
const academicSearch = {};
let academicGroup = "";
const weekdays = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
];
function academicTime(value) {
  if (!value) return "—";
  return new Date(
    /[Zz]|[+-]\d\d:\d\d$/.test(value) ? value : value + "Z",
  ).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}
function minuteTime(value) {
  return (
    String(Math.floor(value / 60)).padStart(2, "0") +
    ":" +
    String(value % 60).padStart(2, "0")
  );
}
function dateInput(value) {
  if (!value) return "";
  const d = new Date(/[Zz]|[+-]\d\d:\d\d$/.test(value) ? value : value + "Z");
  return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 16);
}
function stateBadge(row) {
  const states = {
    archived: ["Arquivado", ""],
    draft: ["Rascunho", "gold"],
    scheduled: [
      "Agendado · " + (row.publish_at ? academicTime(row.publish_at) : ""),
      "gold",
    ],
    expired: ["Fora do ar", ""],
  };
  const current = row.archived
    ? "archived"
    : row.state || (row.draft ? "draft" : "");
  return states[current]
    ? el("span", states[current][0], "badge " + states[current][1])
    : null;
}
function submissionBadge(row) {
  const mine = row.my_submission;
  const closed = row.due_at && academicInstant(row.due_at) < new Date();
  if (!mine)
    return closed
      ? el("span", "Prazo encerrado · sem entrega", "badge red")
      : el("span", "Pendente", "badge gold");
  if (mine.state === "graded")
    return el(
      "span",
      "Avaliada · nota " + String(mine.grade).replace(".", ","),
      "badge green",
    );
  if (mine.state === "submitted") return el("span", "Entregue", "badge green");
  return el(
    "span",
    closed ? "Rascunho não enviado" : "Rascunho salvo",
    closed ? "badge red" : "badge gold",
  );
}
function fileSize(bytes) {
  return bytes >= 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(1).replace(".", ",") + " MB"
    : Math.max(1, Math.round(bytes / 1024)) + " KB";
}
let attachmentRules = null;
async function attachmentTypes() {
  attachmentRules ??= await api("/learning/attachment-types");
  return attachmentRules;
}
function canManage(row) {
  return (
    user?.role === "coordinator" ||
    (user?.role === "teacher" && row.audience === "group")
  );
}
function learningAction(handler) {
  return async () => {
    try {
      await handler();
    } catch (error) {
      status(error.message, true);
    }
  };
}
function learningDialog(title) {
  document
    .querySelectorAll(".academic-dialog")
    .forEach((node) => node.remove());
  const dialog = el("dialog", undefined, "academic-dialog"),
    form = el("form"),
    heading = el("h2", title),
    error = el("p");
  heading.id = "academic-title";
  dialog.setAttribute("aria-labelledby", heading.id);
  error.setAttribute("role", "alert");
  const fields = el("div"),
    actions = el("div", undefined, "dialog-actions"),
    cancel = button("Fechar", () => dialog.close()),
    save = el("button", "Salvar", "primary");
  save.type = "submit";
  actions.append(cancel, save);
  form.append(heading, fields, error, actions);
  dialog.append(form);
  document.body.append(dialog);
  let busy = false;
  dialog.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
  dialog.addEventListener("close", () => dialog.remove());
  const controls = {};
  function field(key, label, type, value = "", choices = null) {
    const caption = el("label", label),
      input = el(
        choices ? "select" : type === "textarea" ? "textarea" : "input",
      );
    input.id = "learning-" + key;
    caption.htmlFor = input.id;
    input.name = key;
    if (choices)
      for (const [id, name] of choices) {
        const option = el("option", name);
        option.value = id;
        input.append(option);
      }
    else if (type !== "textarea") input.type = type;
    input.required = type !== "checkbox";
    if (type === "checkbox") input.checked = Boolean(value);
    else input.value = value ?? "";
    if (type === "text") input.maxLength = 120;
    if (type === "textarea") {
      input.maxLength = 20000;
      input.rows = 6;
    }
    fields.append(caption, input);
    controls[key] = input;
    return input;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    save.disabled = true;
    cancel.disabled = true;
    error.textContent = "";
    try {
      const message = await form.save();
      dialog.close();
      await render();
      // A save may return a confirmation shown after the page refreshes.
      if (typeof message === "string") status(message);
    } catch (e) {
      error.textContent = e.message;
    } finally {
      busy = false;
      save.disabled = false;
      cancel.disabled = false;
    }
  });
  dialog.showModal();
  return { dialog, form, fields, field, controls, save };
}
async function learningGroups(ui, value = "", locked = false) {
  const select = ui.field("group_id", "Turma", "select", value, [
    [value, value ? "Carregando turma…" : "Selecione…"],
  ]);
  let skip = 0;
  const more = button("Carregar turmas", learningAction(load));
  ui.fields.append(more);
  async function load() {
    more.disabled = true;
    try {
      const rows = await api("/learning/groups?offset=" + skip + "&limit=100");
      if (!ui.dialog.isConnected) return;
      rows.forEach((row) => {
        labels.set("groups:" + row.id, row.label);
        const existing = [...select.options].find((o) => o.value === row.id);
        if (existing) existing.textContent = row.label;
        else {
          const option = el("option", row.label);
          option.value = row.id;
          select.append(option);
        }
      });
      skip += rows.length;
      more.hidden = rows.length < 100;
    } finally {
      more.disabled = false;
    }
  }
  await load();
  select.disabled = locked;
  return select;
}
async function publicationEditor(kind, row = null) {
  const ui = learningDialog(
    (row ? "Editar · " : "Criar · ") + academicPages[kind],
  );
  ui.save.disabled = true;
  try {
    ui.field("title", "Título", "text", row?.title);
    ui.field("body", "Conteúdo", "textarea", row?.body);
    const audiences = [["group", "Turma"]];
    if (user.role === "coordinator" && ["notice", "event"].includes(kind))
      audiences.push(["institution", "Toda a instituição"]);
    const audience = ui.field(
      "audience",
      "Público",
      "select",
      row?.audience || "group",
      audiences,
    );
    audience.disabled = Boolean(row);
    const group = await learningGroups(ui, row?.group_id || "", Boolean(row));
    const reach = el("p", "", "help reach");
    reach.setAttribute("aria-live", "polite");
    ui.fields.append(reach);
    let reachTotal = null,
      reachTicket = 0;
    const updateReach = async () => {
      const ticket = ++reachTicket;
      reachTotal = null;
      if (audience.value === "group" && !group.value) {
        reach.textContent = "Selecione a turma para ver o alcance.";
        return;
      }
      reach.textContent = "Calculando alcance…";
      try {
        const data = await api(
          "/learning/reach?" +
            new URLSearchParams({
              audience: audience.value,
              ...(audience.value === "group" ? { group_id: group.value } : {}),
            }),
        );
        if (ticket !== reachTicket) return;
        reachTotal = data.total;
        reach.textContent = `Alcance: ${plural(data.total, "pessoa", "pessoas")} (${plural(data.students, "aluno", "alunos")}, ${plural(data.teachers, "professor", "professores")}).`;
      } catch (error) {
        if (ticket === reachTicket) reach.textContent = error.message;
      }
    };
    const sync = () => {
      const scoped = audience.value === "group";
      group.required = scoped;
      group.disabled = Boolean(row) || !scoped;
      group.hidden = group.labels[0].hidden = !scoped;
      void updateReach();
    };
    audience.addEventListener("change", sync);
    group.addEventListener("change", updateReach);
    sync();
    if (kind === "activity")
      ui.field(
        "due_at",
        "Prazo — horário de Brasília",
        "datetime-local",
        dateInput(row?.due_at),
      );
    if (kind === "event") {
      ui.field(
        "starts_at",
        "Início — horário de Brasília",
        "datetime-local",
        dateInput(row?.starts_at),
      );
      ui.field(
        "ends_at",
        "Término — horário de Brasília",
        "datetime-local",
        dateInput(row?.ends_at),
      );
      const capacity = ui.field(
        "capacity",
        "Vagas (vazio = sem limite)",
        "number",
        row?.capacity,
      );
      capacity.required = false;
      capacity.min = 1;
      capacity.max = 100000;
    }
    const visible = row && row.state === "published";
    const publishAt = ui.field(
      "publish_at",
      "Publicar em (opcional) — horário de Brasília",
      "datetime-local",
      dateInput(row?.publish_at),
    );
    publishAt.required = false;
    publishAt.disabled = Boolean(visible);
    if (kind === "notice") {
      const expiresAt = ui.field(
        "expires_at",
        "Sai do ar em (opcional) — horário de Brasília",
        "datetime-local",
        dateInput(row?.expires_at),
      );
      expiresAt.required = false;
    }
    ui.fields.append(
      el(
        "p",
        "Sem data de publicação, o conteúdo aparece assim que deixar de ser rascunho.",
        "help",
      ),
    );
    const draft = ui.field(
      "draft",
      "Manter como rascunho",
      "checkbox",
      row ? row.draft : true,
    );
    draft.disabled = Boolean(row && !row.draft);
    ui.form.save = async () => {
      const body = {
        kind,
        title: ui.controls.title.value,
        body: ui.controls.body.value,
        audience: audience.value,
        group_id: audience.value === "group" ? group.value : null,
        draft: draft.checked,
        version: row?.version || 0,
      };
      for (const key of ["due_at", "starts_at", "ends_at"])
        if (ui.controls[key])
          body[key] = new Date(
            ui.controls[key].value + ":00-03:00",
          ).toISOString();
      for (const key of ["publish_at", "expires_at"])
        if (ui.controls[key])
          body[key] = ui.controls[key].value
            ? new Date(ui.controls[key].value + ":00-03:00").toISOString()
            : null;
      if (ui.controls.capacity)
        body.capacity = ui.controls.capacity.value
          ? Number(ui.controls.capacity.value)
          : null;
      if (
        body.audience === "institution" &&
        !body.draft &&
        !confirm(
          "Publicar para TODA a instituição" +
            (reachTotal === null
              ? ""
              : ` (${plural(reachTotal, "pessoa", "pessoas")})`) +
            "?\n\n" +
            body.title +
            "\n\n" +
            body.body,
        )
      )
        throw new Error("Publicação não confirmada.");
      await api("/learning/publications" + (row ? "/" + row.id : ""), {
        method: row ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
    };
    ui.save.disabled = false;
  } catch (error) {
    ui.dialog.close();
    throw error;
  }
}
async function scheduleEditor(row = null) {
  const ui = learningDialog("Grade de horários");
  ui.save.disabled = true;
  try {
    await learningGroups(ui, row?.group_id || "");
    ui.field(
      "weekday",
      "Dia da semana",
      "select",
      row?.weekday ?? 0,
      weekdays.map((name, index) => [String(index), name]),
    );
    ui.field(
      "starts_minute",
      "Início — horário de Brasília",
      "time",
      row ? minuteTime(row.starts_minute) : "19:00",
    );
    ui.field(
      "ends_minute",
      "Término — horário de Brasília",
      "time",
      row ? minuteTime(row.ends_minute) : "20:40",
    );
    ui.field("starts_on", "Início da vigência", "date", row?.starts_on);
    ui.field("ends_on", "Fim da vigência", "date", row?.ends_on);
    ui.field("room", "Sala", "text", row?.room);
    ui.form.save = async () => {
      const body = {};
      for (const [key, input] of Object.entries(ui.controls))
        body[key] = key.endsWith("_minute")
          ? input.value.split(":").reduce((h, m) => Number(h) * 60 + Number(m))
          : key === "weekday"
            ? Number(input.value)
            : input.value;
      await api("/learning/schedule" + (row ? "/" + row.id : ""), {
        method: row ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
    };
    ui.save.disabled = false;
  } catch (error) {
    ui.dialog.close();
    throw error;
  }
}
async function attachmentPanel(kind, key, box, writable) {
  const section = el("section"),
    heading = el("h3", "Anexos");
  section.append(heading);
  box.append(section);
  async function load() {
    const rows = await api(`/learning/${kind}/${key}/attachments`);
    if (!box.isConnected) return;
    section.replaceChildren(heading);
    for (const row of rows) {
      const line = el("p", undefined, "attachment-line"),
        link = el("a", row.name);
      link.href = "/api/v1/learning/attachments/" + encodeURIComponent(row.id);
      link.download = row.name;
      line.append(
        link,
        el(
          "small",
          " · " +
            (row.name.split(".").pop() || "").toUpperCase() +
            " · " +
            fileSize(row.size || 0),
        ),
      );
      if (writable)
        line.append(
          button(
            "Arquivar",
            learningAction(async () => {
              await api("/learning/attachments/" + row.id + "/archive", {
                method: "PATCH",
                body: JSON.stringify({ archived: true }),
              });
              await load();
            }),
          ),
        );
      section.append(line);
    }
    if (!rows.length) section.append(el("p", "Nenhum anexo."));
    if (writable) {
      const rules = await attachmentTypes();
      if (!box.isConnected) return;
      const caption = el(
          "label",
          `Formatos: ${rules.extensions.join(", ").toUpperCase()}. Até ${fileSize(rules.max_bytes)} por arquivo (textos até ${fileSize(rules.text_max_bytes)}). Máximo de 10 arquivos por registro, incluindo arquivados.`,
        ),
        file = el("input"),
        problem = el("p", "", "error");
      problem.setAttribute("role", "alert");
      file.type = "file";
      file.accept = rules.extensions.map((item) => "." + item).join(",");
      caption.append(file);
      section.append(caption);
      const upload = button("Enviar arquivo", async () => {
        problem.textContent = "";
        const selected = file.files[0];
        try {
          if (!selected) throw new Error("Selecione um arquivo.");
          const extension = selected.name.split(".").pop().toLowerCase();
          if (!rules.extensions.includes(extension))
            throw new Error("Formato não aceito.");
          const textual = ["txt", "csv", "ipynb"].includes(extension);
          const limit = textual ? rules.text_max_bytes : rules.max_bytes;
          if (selected.size > limit)
            throw new Error("Arquivo maior que " + fileSize(limit) + ".");
          upload.disabled = true;
          await api(`/learning/${kind}/${key}/attachments`, {
            method: "POST",
            headers: {
              "Content-Type": selected.type || "application/octet-stream",
              "X-File-Name": encodeURIComponent(selected.name),
            },
            body: selected,
          });
          await load();
        } catch (error) {
          problem.textContent = error.message;
        } finally {
          upload.disabled = false;
        }
      });
      section.append(upload, problem);
    }
  }
  await load();
}
async function activityDetails(row, box) {
  const section = el("section"),
    list = el("div");
  const staff = user.role !== "student",
    closed = academicInstant(row.due_at) < new Date();
  section.append(el("h3", staff ? "Entregas recebidas" : "Minha entrega"));
  let pendingOnly = false;
  if (staff) {
    const summary = await api(`/learning/activities/${row.id}/summary`);
    if (!box.isConnected) return;
    const stats = el("div", undefined, "delivery-stats");
    for (const [value, label] of [
      [`${summary.submitted_count} de ${summary.students_count}`, "entregaram"],
      [String(summary.pending_count), "a avaliar"],
      [String(summary.missing.length), "sem entrega"],
    ]) {
      const item = el("div");
      item.append(el("strong", value), el("span", label));
      stats.append(item);
    }
    section.append(stats);
    if (summary.missing.length) {
      const missing = el("details", undefined, "enrollment-list");
      missing.append(
        el(
          "summary",
          "Quem ainda não entregou (" + summary.missing.length + ")",
        ),
        el("p", summary.missing.map((item) => item.name).join(", ")),
      );
      section.append(missing);
    }
    const filter = el("label", "Somente entregas a avaliar"),
      check = el("input");
    check.type = "checkbox";
    check.addEventListener("change", () => {
      pendingOnly = check.checked;
      skip = 0;
      list.replaceChildren();
      learningAction(load)();
    });
    filter.prepend(check);
    section.append(filter);
  }
  section.append(list);
  box.append(section);
  let skip = 0;
  const more = button("Carregar mais entregas", learningAction(load));
  section.append(more);
  async function load() {
    const rows = await api(
      `/learning/activities/${row.id}/submissions?offset=${skip}&limit=25` +
        (pendingOnly ? "&pending=true" : ""),
    );
    if (!box.isConnected) return;
    for (const [index, submission] of rows.entries()) {
      const card = el("div", undefined, "guide");
      card.append(
        el("h4", submission.student_name),
        el(
          "p",
          submission.draft
            ? "Rascunho privado — ainda não enviado"
            : "Enviada em " +
                academicTime(submission.submitted_at) +
                (submission.late ? " · após o prazo" : " · no prazo"),
        ),
        el("p", submission.body, "academic-body"),
        el(
          "p",
          "Nota: " +
            (submission.grade === null
              ? "Aguardando avaliação"
              : String(submission.grade).replace(".", ",")),
        ),
      );
      if (submission.feedback)
        card.append(el("p", "Devolutiva: " + submission.feedback, "feedback"));
      list.append(card);
      if (user.role === "student" && submission.grade === null && !closed) {
        card.append(
          button("Editar entrega", () => submissionEditor(row, submission)),
        );
        if (!submission.draft)
          card.append(
            button(
              "Desfazer entrega",
              learningAction(async () => {
                if (
                  !confirm(
                    "Desfazer a entrega? Ela volta a ser um rascunho privado e precisa ser enviada de novo antes do prazo.",
                  )
                )
                  return;
                await api("/learning/activities/" + row.id + "/submission", {
                  method: "PUT",
                  body: JSON.stringify({
                    body: submission.body,
                    draft: true,
                    version: submission.version,
                  }),
                });
                await openPublication(row);
              }),
              "secondary danger",
            ),
          );
      }
      if (staff)
        card.append(
          button(
            submission.grade === null ? "Avaliar" : "Revisar avaliação",
            () =>
              gradeEditor(
                submission,
                rows.slice(index + 1).filter((item) => item.grade === null),
                row,
              ),
          ),
        );
      await attachmentPanel(
        "submission",
        submission.id,
        card,
        user.role === "student" &&
          submission.draft &&
          submission.grade === null,
      );
    }
    if (skip === 0 && rows.length === 0) {
      list.append(
        el(
          "p",
          staff
            ? pendingOnly
              ? "Nenhuma entrega aguardando avaliação."
              : "Nenhuma entrega recebida."
            : closed
              ? "Prazo encerrado sem entrega."
              : "Você ainda não entregou.",
        ),
      );
      if (user.role === "student" && !closed)
        list.append(
          button("Preparar entrega", () => submissionEditor(row), "primary"),
        );
    }
    skip += rows.length;
    more.hidden = rows.length < 25;
  }
  await load();
}
function submissionEditor(activity, row = null) {
  const ui = learningDialog("Entrega da atividade");
  ui.field("body", "Resposta", "textarea", row?.body);
  ui.field(
    "draft",
    "Salvar rascunho privado (desmarque para enviar)",
    "checkbox",
    row ? row.draft : true,
  );
  ui.fields.append(
    el(
      "p",
      "Salve como rascunho para adicionar anexos. Após enviar, o professor poderá avaliar.",
    ),
  );
  ui.form.save = async () =>
    api("/learning/activities/" + activity.id + "/submission", {
      method: "PUT",
      body: JSON.stringify({
        body: ui.controls.body.value,
        draft: ui.controls.draft.checked,
        version: row?.version || 0,
      }),
    });
}
function gradeEditor(row, queue = [], activity = null) {
  const ui = learningDialog("Avaliação · " + row.student_name),
    grade = ui.field(
      "grade",
      "Nota de 0 a 10 (vazio = reabrir)",
      "number",
      row.grade,
    );
  grade.required = false;
  grade.min = 0;
  grade.max = 10;
  grade.step = "0.01";
  ui.field(
    "feedback",
    "Feedback / justificativa",
    "textarea",
    row.feedback,
  ).maxLength = 10000;
  ui.fields.prepend(el("p", row.body, "academic-body submission-preview"));
  ui.fields.append(
    el(
      "p",
      "Deixe a nota vazia para reabrir a entrega ao aluno. A nota vale apenas como média das atividades do hub.",
      "help",
    ),
  );
  let advance = false;
  if (queue.length) {
    const next = el(
      "button",
      `Salvar e ir para o próximo (${queue.length})`,
      "secondary",
    );
    next.type = "submit";
    next.addEventListener("click", () => {
      advance = true;
    });
    ui.save.addEventListener("click", () => {
      advance = false;
    });
    ui.save.before(next);
  }
  ui.form.save = async () => {
    await api("/learning/submissions/" + row.id + "/grade", {
      method: "PUT",
      body: JSON.stringify({
        grade: grade.value === "" ? null : Number(grade.value),
        feedback: ui.controls.feedback.value,
        version: row.version,
      }),
    });
    const message = "Avaliação salva e registrada na auditoria.";
    if (advance)
      ui.dialog.addEventListener("close", () =>
        gradeEditor(queue[0], queue.slice(1), activity),
      );
    else if (activity)
      ui.dialog.addEventListener("close", () =>
        openPublication(activity).catch((error) => status(error.message, true)),
      );
    advance = false;
    return message;
  };
}
async function renderLearning(kind, ticket) {
  const isSchedule = kind === "schedule",
    path = isSchedule ? "/learning/schedule" : "/learning/publications";
  const rows = await api(
    path +
      "?" +
      new URLSearchParams({
        ...(isSchedule ? {} : { kind, q: academicSearch[kind] || "" }),
        ...(academicGroup ? { group_id: academicGroup } : {}),
        offset: String(offset),
        limit: "25",
        archived: String(archived),
      }),
  );
  if (ticket !== generation) return;
  const query = new URLSearchParams({ limit: "100" });
  [...new Set(rows.map((row) => row.group_id).filter(Boolean))].forEach((id) =>
    query.append("ids", id),
  );
  for (const group of await api("/learning/groups?" + query))
    labels.set("groups:" + group.id, group.label);
  if (ticket !== generation) return;
  const toolbar = el("div", undefined, "toolbar"),
    box = el("div", undefined, "publication-grid");
  $("view").append(toolbar, box);
  if (academicGroup)
    toolbar.append(
      el("span", reference("groups", academicGroup), "badge"),
      button("Ver todas as turmas", () => {
        academicGroup = "";
        offset = 0;
        render();
      }),
    );
  if (!isSchedule) {
    const search = el("input");
    search.type = "search";
    search.maxLength = 120;
    search.value = academicSearch[kind] || "";
    search.setAttribute(
      "aria-label",
      "Buscar em " + academicPages[kind].toLowerCase(),
    );
    const find = () => {
      academicSearch[kind] = search.value;
      offset = 0;
      render();
    };
    search.addEventListener("keydown", (event) => {
      if (event.key === "Enter") find();
    });
    toolbar.append(search, button("Buscar", find));
  }
  const manage = isSchedule
    ? user.role === "coordinator"
    : user.role !== "student";
  if (manage) {
    toolbar.append(
      button(
        isSchedule ? "Novo horário" : "Nova publicação",
        learningAction(() =>
          isSchedule ? scheduleEditor() : publicationEditor(kind),
        ),
        "primary",
      ),
    );
    const caption = el("label", "Mostrar arquivados"),
      check = el("input");
    check.type = "checkbox";
    check.checked = archived;
    check.addEventListener("change", () => {
      archived = check.checked;
      offset = 0;
      render();
    });
    caption.prepend(check);
    toolbar.append(caption);
  }
  if (kind === "activity" && user.role === "student") {
    const averages = await api("/learning/averages");
    if (ticket !== generation) return;
    for (const item of averages)
      box.append(
        el(
          "p",
          `Média das atividades avaliadas no hub · ${reference("groups", item.group_id).split(" · ")[0]}: ${item.average.toFixed(1).replace(".", ",")} (${plural(item.count, "avaliação", "avaliações")}). Não é a nota oficial.`,
          "help",
        ),
      );
  }
  for (const row of rows) {
    const card = el("article", undefined, "publication-card " + kind);
    box.append(card);
    const metadata = el("div", undefined, "card-meta");
    metadata.append(icon(kind), el("span", academicPages[kind]));
    if (!isSchedule)
      metadata.append(stateBadge(row) || el("span", "Publicado", "badge"));
    if (kind === "activity" && user.role === "student" && !row.archived)
      metadata.append(submissionBadge(row));
    card.append(metadata);
    card.append(
      el(
        "h2",
        isSchedule
          ? weekdays[row.weekday] +
              " · " +
              minuteTime(row.starts_minute) +
              "–" +
              minuteTime(row.ends_minute)
          : row.title,
      ),
    );
    card.append(
      el(
        "p",
        row.group_id ? reference("groups", row.group_id) : "Toda a instituição",
        "muted",
      ),
    );
    if (isSchedule)
      card.append(
        el(
          "p",
          row.room +
            " · " +
            formatDate(row.starts_on) +
            " a " +
            formatDate(row.ends_on),
        ),
      );
    else {
      card.append(el("p", row.body, "academic-body publication-body-preview"));
      if (row.due_at)
        card.append(
          el("p", "Prazo (Brasília): " + academicTime(row.due_at), "card-meta"),
        );
      if (kind === "activity" && row.students_count !== undefined)
        card.append(
          el(
            "p",
            `${row.submitted_count} de ${row.students_count} entregaram · ${row.submitted_count - row.graded_count} a avaliar`,
            "card-meta delivery-meta",
          ),
        );
      if (row.expires_at)
        card.append(
          el("p", "Sai do ar em " + academicTime(row.expires_at), "card-meta"),
        );
      if (row.starts_at)
        card.append(
          el(
            "p",
            "Evento (Brasília): " +
              academicTime(row.starts_at) +
              " a " +
              academicTime(row.ends_at),
            "card-meta",
          ),
        );
    }
    const actions = el("div", undefined, "card-actions");
    card.append(actions);
    if (isSchedule ? manage : canManage(row)) {
      if (!row.archived)
        actions.append(
          button(
            "Editar",
            learningAction(() =>
              isSchedule ? scheduleEditor(row) : publicationEditor(kind, row),
            ),
          ),
        );
      actions.append(
        button(
          row.archived ? "Restaurar" : "Arquivar",
          learningAction(async () => {
            if (
              !confirm(
                (row.archived ? "Restaurar" : "Arquivar") + " este registro?",
              )
            )
              return;
            await api(
              (isSchedule ? "/learning/schedule/" : "/learning/publications/") +
                row.id +
                "/archive",
              {
                method: "PATCH",
                body: JSON.stringify({ archived: !row.archived }),
              },
            );
            await render();
          }),
        ),
      );
    }
    if (!isSchedule && !row.archived)
      actions.prepend(
        button(
          kind === "activity"
            ? "Abrir atividade"
            : kind === "event"
              ? "Detalhes e inscrição"
              : "Abrir conteúdo",
          learningAction(() => openPublication(row)),
          "primary",
        ),
      );
  }
  if (!rows.length)
    box.append(
      emptyState(
        "Nada por aqui ainda",
        academicSearch[kind]
          ? "Tente outro termo de busca."
          : "Os conteúdos cadastrados para suas turmas aparecerão aqui.",
        kind,
      ),
    );
  $("view").append(pager(rows));
  status("");
}

async function membershipBatch() {
  const ui = learningDialog("Matrículas em lote · prévia obrigatória");
  ui.save.disabled = true;
  try {
    await learningGroups(ui);
    ui.field("starts_on", "Início do vínculo", "date");
    ui.field("ends_on", "Fim do vínculo", "date");
    ui.fields.append(
      el(
        "p",
        "Cole até 100 e-mails institucionais, um por linha. Vínculos existentes terão a vigência substituída.",
      ),
    );
    const input = ui.field("rows", "E-mails institucionais", "textarea");
    input.maxLength = 20000;
    let preview = null;
    ui.save.textContent = "Validar prévia";
    ui.save.disabled = false;
    ui.fields.addEventListener("input", () => {
      preview = null;
      ui.save.textContent = "Validar prévia";
    });
    ui.form.save = async () => {
      const rows = input.value
        .trim()
        .split(/\r?\n/)
        .map((email) => ({
          email: email.trim(),
          group_id: ui.controls.group_id.value,
          starts_on: ui.controls.starts_on.value,
          ends_on: ui.controls.ends_on.value,
        }));
      const result = await api("/memberships/batch", {
        method: "POST",
        body: JSON.stringify({ rows, confirm: Boolean(preview) }),
      });
      if (result.errors.length)
        throw new Error(
          result.errors
            .map((item) => "Linha " + item.line + ": " + item.message)
            .join(" · "),
        );
      if (!preview) {
        preview = result;
        ui.save.textContent = "Confirmar " + rows.length + " vínculos";
        throw new Error(
          "Prévia validada: " +
            result.rows.filter((item) => item.action === "create").length +
            " novos vínculos e " +
            result.rows.filter((item) => item.action === "update").length +
            " atualizações. Revise a turma e os e-mails antes de confirmar.",
        );
      }
    };
  } catch (error) {
    ui.dialog.close();
    status(error.message, true);
  }
}
