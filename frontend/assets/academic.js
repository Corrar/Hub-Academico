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
    // Checkboxes sit beside their text; other fields stack under it.
    if (type === "checkbox") {
      caption.classList.add("check-field");
      caption.prepend(input);
      fields.append(caption);
    } else fields.append(caption, input);
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
    row ? "Editar " + kindLabel[kind].toLowerCase() : newLabels[kind],
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
    // Scheduling is optional: keep it folded unless it is already in use.
    const schedule = el("details", undefined, "field-group"),
      summary = el("summary", "Agendar publicação");
    schedule.open = Boolean(row?.publish_at || row?.expires_at);
    schedule.append(summary);
    const publishAt = ui.field(
      "publish_at",
      "Publicar em",
      "datetime-local",
      dateInput(row?.publish_at),
    );
    publishAt.required = false;
    publishAt.disabled = Boolean(visible);
    schedule.append(publishAt.labels[0], publishAt);
    if (kind === "notice") {
      const expiresAt = ui.field(
        "expires_at",
        "Tirar do ar em",
        "datetime-local",
        dateInput(row?.expires_at),
      );
      expiresAt.required = false;
      schedule.append(expiresAt.labels[0], expiresAt);
    }
    schedule.append(
      el(
        "p",
        "Horário de Brasília. Sem data de publicação, o conteúdo aparece assim que deixar de ser rascunho.",
        "help",
      ),
    );
    ui.fields.append(schedule);
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
  const ui = learningDialog(row ? "Editar horário" : "Novo horário");
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
async function attachmentPanel(kind, key, box, writable, title = "Anexos") {
  const section = el("section", undefined, "attachments"),
    heading = el("h3", title);
  section.append(heading);
  box.append(section);
  async function load() {
    const rows = await api(`/learning/${kind}/${key}/attachments`);
    if (!box.isConnected) return;
    // Read-only sections without files stay out of the way.
    section.hidden = !rows.length && !writable;
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
      const card = el("div", undefined, "submission-card"),
        head = el("div", undefined, "submission-head");
      if (staff)
        head.append(
          el("span", initials(submission.student_name), "avatar"),
          el("h4", submission.student_name),
        );
      head.append(
        submission.grade !== null
          ? el("span", "Avaliada", "badge green")
          : submission.draft
            ? el("span", "Rascunho privado", "badge gold")
            : submission.late
              ? el("span", "Enviada após o prazo", "badge red")
              : el("span", "Enviada no prazo", "badge green"),
      );
      card.append(
        head,
        el(
          "p",
          submission.draft
            ? "Ainda não enviada ao professor."
            : "Enviada " + when(submission.submitted_at),
          "card-meta",
        ),
        el("p", submission.body, "academic-body"),
      );
      const result = el("div", undefined, "grade-block");
      if (submission.grade === null)
        result.append(
          el(
            "span",
            submission.draft
              ? "Envie para ser avaliado."
              : "Aguardando avaliação",
            "muted",
          ),
        );
      else {
        const score = el("strong", String(submission.grade).replace(".", ","));
        score.append(el("small", "/10"));
        result.append(score, el("span", "nota no hub", "muted"));
      }
      card.append(result);
      if (submission.feedback) {
        const quote = el("blockquote", undefined, "feedback");
        quote.append(
          el("span", "Devolutiva", "eyebrow"),
          el("p", submission.feedback),
        );
        card.append(quote);
      }
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
        "Arquivos da entrega",
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
const kindLabel = {
  activity: "Atividade",
  material: "Material",
  notice: "Aviso",
  event: "Evento",
};
const newLabels = {
  activity: "Nova atividade",
  material: "Novo material",
  notice: "Novo aviso",
  event: "Novo evento",
};
let activityFilter = "",
  agendaDay = null;
// One primary action per page, in the heading, never duplicated on re-render.
function pageAction(label, handler) {
  $("heading-actions")
    .querySelectorAll("[data-page-action]")
    .forEach((node) => node.remove());
  const node = button(label, learningAction(handler), "primary");
  node.dataset.pageAction = "";
  $("heading-actions").append(node);
}
function groupFilterChip(toolbar) {
  if (!academicGroup) return;
  const chip = el("span", undefined, "filter-chip");
  chip.append(
    el("span", groupParts(reference("groups", academicGroup)).subject),
  );
  const clear = button(
    "×",
    () => {
      academicGroup = "";
      offset = 0;
      render();
    },
    "chip-clear",
  );
  clear.setAttribute("aria-label", "Ver todas as turmas");
  chip.append(clear);
  toolbar.append(chip);
}
function dateBlock(value) {
  const date = instant(value),
    block = el("div", undefined, "date-block");
  block.setAttribute("aria-hidden", "true");
  block.append(
    el(
      "strong",
      new Intl.DateTimeFormat("pt-BR", {
        timeZone: zone,
        day: "2-digit",
      }).format(date),
    ),
    el(
      "span",
      new Intl.DateTimeFormat("pt-BR", { timeZone: zone, month: "short" })
        .format(date)
        .replace(".", ""),
    ),
  );
  return block;
}
function eventWhen(row) {
  return dayKey(instant(row.starts_at)) === dayKey(instant(row.ends_at))
    ? when(row.starts_at) + "–" + clock(instant(row.ends_at))
    : when(row.starts_at) + " até " + when(row.ends_at);
}
function infoLine(text, name) {
  const line = el("p", undefined, "info-line");
  line.append(icon(name), el("span", text));
  return line;
}
function primaryLabel(row, kind) {
  if (kind === "event")
    return row.enrolled ? "Ver inscrição" : "Detalhes e inscrição";
  if (kind === "material") return "Abrir material";
  if (kind === "notice") return "Ler aviso";
  if (user.role !== "student") return "Ver entregas";
  const mine = row.my_submission,
    closed = instant(row.due_at) < new Date();
  if (!mine) return closed ? "Ver atividade" : "Entregar";
  if (mine.state === "draft")
    return closed ? "Ver atividade" : "Continuar entrega";
  return mine.state === "graded" ? "Ver avaliação" : "Ver entrega";
}
function publicationCard(row, kind) {
  const card = el(
    "article",
    undefined,
    "publication-card " + kind + (row.archived ? " is-archived" : ""),
  );
  const top = el("div", undefined, "card-top");
  top.append(
    icon(kind),
    el(
      "span",
      row.group_id
        ? groupParts(reference("groups", row.group_id)).subject
        : "Toda a instituição",
      "card-eyebrow",
    ),
  );
  const badge = stateBadge(row);
  if (badge) top.append(badge);
  if (kind === "activity" && user.role === "student" && !row.archived)
    top.append(submissionBadge(row));
  card.append(top);
  const title = el("h2", row.title);
  if (kind === "event") {
    const head = el("div", undefined, "event-head"),
      text = el("div");
    text.append(title, infoLine(eventWhen(row), "calendar"));
    head.append(dateBlock(row.starts_at), text);
    card.append(head);
  } else card.append(title);
  card.append(el("p", row.body, "academic-body publication-body-preview"));
  const footer = el("div", undefined, "card-info");
  if (kind === "activity") {
    footer.append(deadlineChip(row.due_at));
    if (row.students_count !== undefined) {
      const share = row.students_count
        ? Math.round((row.submitted_count / row.students_count) * 100)
        : 0;
      const progress = el("div", undefined, "progress"),
        fill = el("span");
      fill.style.width = share + "%";
      progress.append(fill);
      progress.setAttribute("aria-hidden", "true");
      const delivery = el("div", undefined, "delivery");
      delivery.append(
        el(
          "p",
          `${row.submitted_count} de ${row.students_count} entregaram · ${plural(row.submitted_count - row.graded_count, "a avaliar", "a avaliar")}`,
          "card-meta delivery-meta",
        ),
        progress,
      );
      card.append(delivery);
    }
  }
  if (kind === "event") {
    const full = row.capacity && row.enrolled_count >= row.capacity;
    footer.append(
      el(
        "span",
        row.capacity
          ? `${row.enrolled_count} de ${row.capacity} vagas`
          : plural(row.enrolled_count, "inscrito", "inscritos"),
        "badge" + (full ? " red" : ""),
      ),
    );
    if (row.enrolled)
      footer.append(el("span", "Você está inscrito", "badge green"));
    else if (full) footer.append(el("span", "Esgotado", "badge red"));
  }
  if (kind === "notice" || kind === "material")
    footer.append(
      el(
        "span",
        "Publicado " + when(row.publish_at || row.created_at),
        "card-meta",
      ),
    );
  if (row.expires_at)
    footer.append(el("span", "Sai do ar " + when(row.expires_at), "card-meta"));
  if (footer.childNodes.length) card.append(footer);
  const actions = el("div", undefined, "card-actions");
  if (!row.archived)
    actions.append(
      button(
        primaryLabel(row, kind),
        learningAction(() => openPublication(row)),
        "primary",
      ),
    );
  if (canManage(row)) {
    if (!row.archived)
      actions.append(
        button(
          "Editar",
          learningAction(() => publicationEditor(kind, row)),
        ),
      );
    actions.append(
      button(
        row.archived ? "Restaurar" : "Arquivar",
        learningAction(async () => {
          if (
            !confirm(
              row.archived
                ? "Restaurar esta publicação? Ela volta a ficar visível para o público."
                : "Arquivar esta publicação? Ela deixa de aparecer, mas o histórico é preservado.",
            )
          )
            return;
          await api("/learning/publications/" + row.id + "/archive", {
            method: "PATCH",
            body: JSON.stringify({ archived: !row.archived }),
          });
          await render();
        }),
        row.archived ? "secondary" : "secondary danger",
      ),
    );
  }
  card.append(actions);
  return card;
}
async function renderPublications(kind, ticket) {
  const student = user.role === "student";
  const rows = await api(
    "/learning/publications?" +
      new URLSearchParams({
        kind,
        q: academicSearch[kind] || "",
        offset: String(offset),
        limit: "25",
        archived: String(archived),
        ...(academicGroup ? { group_id: academicGroup } : {}),
        ...(kind === "activity" && student && activityFilter
          ? { status: activityFilter }
          : {}),
      }),
  );
  await groupLabels(rows);
  if (ticket !== generation) return;
  if (!student && !archived)
    pageAction(newLabels[kind], () => publicationEditor(kind));
  const toolbar = el("div", undefined, "toolbar");
  groupFilterChip(toolbar);
  toolbar.append(
    searchField(
      academicSearch[kind] || "",
      "Buscar em " + academicPages[kind].toLowerCase(),
      (value) => {
        academicSearch[kind] = value;
        offset = 0;
        render();
      },
    ),
  );
  if (kind === "activity" && student)
    toolbar.append(
      segmented(
        "Filtrar atividades",
        [
          ["", "Todas"],
          ["todo", "A fazer"],
          ["done", "Entregues"],
        ],
        activityFilter,
        (key) => {
          activityFilter = key;
          offset = 0;
          render();
        },
      ),
    );
  if (!student) toolbar.append(archivedToggle());
  $("view").append(toolbar);
  if (kind === "activity" && student) {
    const averages = await api("/learning/averages");
    if (ticket !== generation) return;
    if (averages.length) {
      const strip = el("section", undefined, "average-strip");
      strip.append(
        el("h2", "Média das atividades avaliadas no hub"),
        el("p", "Não é a nota oficial da disciplina.", "muted"),
      );
      const list = el("div", undefined, "average-list");
      for (const item of averages) {
        const chip = el("div", undefined, "average-chip");
        chip.append(
          el("strong", item.average.toFixed(1).replace(".", ",")),
          el(
            "span",
            `${groupParts(reference("groups", item.group_id)).subject} · ${plural(item.count, "avaliação", "avaliações")}`,
          ),
        );
        list.append(chip);
      }
      strip.append(list);
      $("view").append(strip);
    }
  }
  const box = el("div", undefined, "publication-grid");
  rows.forEach((row) => box.append(publicationCard(row, kind)));
  if (!rows.length)
    box.append(
      emptyState(
        academicSearch[kind]
          ? "Nenhum resultado"
          : activityFilter === "todo"
            ? "Tudo em dia"
            : "Nada por aqui ainda",
        academicSearch[kind]
          ? "Tente outro termo de busca."
          : activityFilter === "todo"
            ? "Você não tem atividades pendentes."
            : archived
              ? "Os itens arquivados aparecerão aqui."
              : "Os conteúdos das suas turmas aparecerão aqui.",
        kind,
      ),
    );
  $("view").append(box, pager(rows));
  status("");
}
function longDay(key) {
  const text = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(key + "T12:00:00Z"));
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function lessonsOn(rows, key) {
  const weekday = (new Date(key + "T12:00:00Z").getUTCDay() + 6) % 7;
  return rows
    .filter(
      (row) =>
        row.weekday === weekday && row.starts_on <= key && row.ends_on >= key,
    )
    .sort((a, b) => a.starts_minute - b.starts_minute);
}
async function renderAgenda(ticket) {
  const rows = await api(
    "/learning/schedule?" +
      new URLSearchParams({
        limit: "100",
        ...(academicGroup ? { group_id: academicGroup } : {}),
      }),
  );
  await groupLabels(rows);
  if (ticket !== generation) return;
  const today = brDate(Date.now());
  agendaDay ??= today;
  const base = new Date(agendaDay + "T12:00:00Z"),
    monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7));
  const shift = (days) => {
    const next = new Date(base);
    next.setUTCDate(base.getUTCDate() + days);
    agendaDay = next.toISOString().slice(0, 10);
    render();
  };
  const toolbar = el("div", undefined, "toolbar");
  groupFilterChip(toolbar);
  if (agendaDay !== today)
    toolbar.append(
      button("Hoje", () => {
        agendaDay = today;
        render();
      }),
    );
  if (toolbar.childNodes.length) $("view").append(toolbar);
  const week = el("div", undefined, "week"),
    previous = button("‹", () => shift(-7), "icon-button"),
    next = button("›", () => shift(7), "icon-button"),
    strip = el("div", undefined, "week-strip");
  previous.setAttribute("aria-label", "Semana anterior");
  next.setAttribute("aria-label", "Próxima semana");
  ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].forEach((name, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10),
      count = lessonsOn(rows, key).length;
    const pill = button(
      "",
      () => {
        agendaDay = key;
        render();
      },
      "day-pill" +
        (key === today ? " today" : "") +
        (count ? " has-lessons" : ""),
    );
    pill.append(el("span", name), el("strong", String(date.getUTCDate())));
    pill.setAttribute("aria-pressed", String(key === agendaDay));
    pill.setAttribute(
      "aria-label",
      longDay(key) +
        (count ? " · " + plural(count, "aula", "aulas") : " · sem aulas"),
    );
    strip.append(pill);
  });
  week.append(previous, strip, next);
  $("view").append(week, sectionHeading(longDay(agendaDay)));
  const lessons = lessonsOn(rows, agendaDay);
  const staff = user.role !== "student";
  lessons.forEach((row) =>
    $("view").append(
      lessonCard(
        row,
        null,
        staff && agendaDay <= today ? agendaDay : "",
        agendaDay,
      ),
    ),
  );
  if (!lessons.length)
    $("view").append(
      emptyState(
        "Sem aulas neste dia",
        "Aproveite para revisar os materiais e adiantar as atividades.",
        "schedule",
      ),
    );
  $("view").append(
    button(
      "Ver calendário do mês",
      () => navigate("calendar"),
      "text-button agenda-link",
    ),
  );
  status("");
}
function scheduleDetails(row) {
  const parts = groupParts(reference("groups", row.group_id));
  const { dialog, body } = readDialog(parts.subject);
  body.append(
    el("p", parts.rest, "muted"),
    infoLine(
      `${weekdays[row.weekday]} · ${minuteTime(row.starts_minute)}–${minuteTime(row.ends_minute)}`,
      "schedule",
    ),
    infoLine(row.room, "home"),
    infoLine(
      `Vigência: ${formatDate(row.starts_on)} a ${formatDate(row.ends_on)}`,
      "calendar",
    ),
  );
  const actions = el("div", undefined, "row-actions");
  actions.append(
    button(
      "Editar horário",
      learningAction(async () => {
        dialog.close();
        await scheduleEditor(row);
      }),
      "primary",
    ),
    button(
      row.archived ? "Restaurar" : "Arquivar",
      learningAction(async () => {
        if (
          !row.archived &&
          !confirm(
            "Arquivar este horário? A grade deixa de exibi-lo; o histórico é preservado.",
          )
        )
          return;
        await api("/learning/schedule/" + row.id + "/archive", {
          method: "PATCH",
          body: JSON.stringify({ archived: !row.archived }),
        });
        dialog.close();
        await render();
      }),
      row.archived ? "secondary" : "secondary danger",
    ),
  );
  body.append(actions);
}
function slotButton(row) {
  const parts = groupParts(reference("groups", row.group_id));
  const slot = button("", () => scheduleDetails(row), "slot");
  slot.append(
    el("strong", parts.subject),
    el("span", parts.name),
    el(
      "small",
      `${minuteTime(row.starts_minute)}–${minuteTime(row.ends_minute)} · ${row.room}`,
    ),
  );
  slot.setAttribute(
    "aria-label",
    `${parts.subject}, ${weekdays[row.weekday]} ${minuteTime(row.starts_minute)}, ${row.room}`,
  );
  return slot;
}
async function renderTimetable(ticket) {
  const rows = await api(
    "/learning/schedule?" +
      new URLSearchParams({
        limit: "100",
        archived: String(archived),
        ...(academicGroup ? { group_id: academicGroup } : {}),
      }),
  );
  await groupLabels(rows);
  if (ticket !== generation) return;
  if (!archived) pageAction("Novo horário", () => scheduleEditor());
  const toolbar = el("div", undefined, "toolbar");
  groupFilterChip(toolbar);
  toolbar.append(
    el(
      "span",
      "Clique em um horário para ver detalhes, editar ou arquivar.",
      "muted",
    ),
    archivedToggle(),
  );
  $("view").append(toolbar);
  if (!rows.length) {
    $("view").append(
      emptyState(
        archived ? "Nenhum horário arquivado" : "Grade vazia",
        archived
          ? "Os horários arquivados aparecerão aqui."
          : "Cadastre o primeiro horário com o botão Novo horário.",
        "schedule",
      ),
    );
    return;
  }
  const days = rows.some((row) => row.weekday === 6) ? 7 : 6,
    starts = [...new Set(rows.map((row) => row.starts_minute))].sort(
      (a, b) => a - b,
    );
  const scroll = el("div", undefined, "table-scroll timetable-scroll"),
    grid = el("div", undefined, "timetable days-" + days);
  grid.setAttribute("role", "table");
  grid.setAttribute("aria-label", "Grade semanal de horários");
  const header = el("div", undefined, "timetable-row");
  header.setAttribute("role", "row");
  header.append(el("span", "Início", "timetable-corner"));
  for (let day = 0; day < days; day++) {
    const cell = el(
      "span",
      weekdays[day].replace("-feira", ""),
      "timetable-day",
    );
    cell.setAttribute("role", "columnheader");
    header.append(cell);
  }
  grid.append(header);
  for (const start of starts) {
    const line = el("div", undefined, "timetable-row");
    line.setAttribute("role", "row");
    const time = el("span", minuteTime(start), "timetable-time");
    time.setAttribute("role", "rowheader");
    line.append(time);
    for (let day = 0; day < days; day++) {
      const cell = el("div", undefined, "timetable-cell");
      cell.setAttribute("role", "cell");
      rows
        .filter((row) => row.weekday === day && row.starts_minute === start)
        .forEach((row) => cell.append(slotButton(row)));
      line.append(cell);
    }
    grid.append(line);
  }
  scroll.append(grid);
  $("view").append(scroll);
  status("");
}
async function renderLearning(kind, ticket) {
  if (kind !== "schedule") return renderPublications(kind, ticket);
  return user.role === "coordinator"
    ? renderTimetable(ticket)
    : renderAgenda(ticket);
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
