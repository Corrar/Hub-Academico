import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { Script } from "node:vm";

const staticRoot = new URL("../backend/app/static/", import.meta.url);
const html = await readFile(new URL("index.html", staticRoot), "utf8");
const scripts = await Promise.all(
  [
    "panel.js",
    "admin.js",
    "academic.js",
    "attendance.js",
    "device.js",
    "experience.js",
  ].map((name) => readFile(new URL(name, staticRoot), "utf8")),
);
const settle = async () => {
  for (let i = 0; i < 12; i++)
    await new Promise((resolve) => setImmediate(resolve));
};
const activity = {
  id: "activity-1",
  kind: "activity",
  title: "Trabalho de dados",
  body: "Enunciado de teste",
  group_id: "group-1",
  audience: "group",
  draft: false,
  archived: false,
  due_at: "2026-09-12T23:00:00Z",
  created_at: "2026-09-01T12:00:00Z",
};
const group = { id: "group-1", label: "Ciência de Dados · Turma A · 2026/2" };
test("login preserves the original controls during failure and enables only authorized methods after retry", async () => {
  const app = await boot("student", { anonymous: true, authFailure: 502 });
  try {
    const doc = app.w.document;
    assert.equal(doc.querySelector("#login-form").hidden, false);
    assert.equal(doc.querySelector("#microsoft-login").hidden, false);
    assert.equal(doc.querySelector("#login-fields").disabled, false);
    doc.querySelector("#email").value = "pessoa@example.test";
    doc.querySelector("#password").value = "synthetic-test-password";
    await app.click("#toggle-password");
    assert.equal(doc.querySelector("#password").type, "text");
    doc
      .querySelector("#login-form")
      .dispatchEvent(new app.w.Event("submit", { cancelable: true }));
    await settle();
    assert.equal(
      app.requests.filter((item) => item.url.pathname.endsWith("/web/login"))
        .length,
      0,
    );
    assert.equal(doc.querySelector("#microsoft-login").disabled, true);
    assert.equal(doc.querySelector("#login-submit").disabled, true);
    await app.click("#login-help");
    assert.equal(doc.querySelector("#help-dialog").open, true);
    doc.querySelector("#help-dialog").close();
    assert.match(doc.querySelector("#login-error").textContent, /HTTP 502/);
    assert.equal(doc.querySelector("#retry-login").hidden, false);
    app.recover();
    await app.click("#retry-login");
    assert.equal(doc.querySelector("#login-fields").disabled, false);
    assert.equal(doc.querySelector("#login-submit").disabled, false);
    assert.equal(doc.querySelector("#microsoft-login").disabled, true);
    assert.equal(doc.querySelector("#login-error").textContent, "");
    assert.equal(doc.querySelector("#login-view").hidden, false);
    assert.equal(
      app.requests.filter((item) => item.url.pathname.endsWith("/web/login"))
        .length,
      0,
    );
    assert.deepEqual(app.errors, []);
  } finally {
    app.dom.window.close();
  }
});
test("Microsoft-only mode preserves the login layout without enabling password authentication", async () => {
  const app = await boot("student", {
    anonymous: true,
    authPayload: { local: false, microsoft: true },
  });
  try {
    assert.equal(app.w.document.querySelector("#login-fields").disabled, false);
    assert.equal(app.w.document.querySelector("#login-form").hidden, false);
    assert.equal(
      app.w.document.querySelector("#microsoft-login").disabled,
      false,
    );
    app.w.document
      .querySelector("#login-form")
      .dispatchEvent(new app.w.Event("submit", { cancelable: true }));
    await settle();
    assert.equal(
      app.requests.filter((item) => item.url.pathname.endsWith("/web/login"))
        .length,
      0,
    );
  } finally {
    app.dom.window.close();
  }
});
test("onboarding completes all three steps and preserves calendar access from profile", async () => {
  const app = await boot();
  try {
    await app.navigate("profile");
    assert.ok(
      app.w.document.querySelector('.profile-menu [data-page="calendar"]'),
    );
    await app.navigate("onboarding");
    for (let step = 1; step <= 3; step++) {
      assert.equal(
        app.w.document.querySelector(".onboarding").dataset.step,
        String(step),
      );
      assert.match(
        app.w.document.querySelector(".onboarding img").src,
        new RegExp("onb" + step + "\\.png$"),
      );
      await app.click(".onboarding-next");
    }
    assert.equal(app.w.document.body.dataset.page, "home");
    assert.deepEqual(app.errors, []);
  } finally {
    app.dom.window.close();
  }
});
test("first visit shows splash, three introduction screens, then the unchanged login", async () => {
  const app = await boot("student", {
    anonymous: true,
    firstVisit: true,
    holdSplash: true,
  });
  try {
    const doc = app.w.document;
    assert.ok(doc.querySelector("#startup-view .splash"));
    assert.equal(doc.querySelector("#login-view").inert, true);
    assert.equal(
      app.w.localStorage.getItem("fatec:onboarding-completed:v1"),
      null,
    );
    await app.finishSplash();
    for (let step = 1; step <= 3; step++) {
      assert.equal(
        doc.querySelector("#startup-view .onboarding").dataset.step,
        String(step),
      );
      assert.equal(doc.activeElement.tagName, "H2");
      await app.click("#startup-view .onboarding-next");
    }
    assert.equal(doc.querySelector("#startup-view").hidden, true);
    assert.equal(doc.body.classList.contains("starting-app"), false);
    assert.equal(doc.querySelector("#login-view").inert, false);
    assert.equal(doc.querySelector("#login-view").hidden, false);
    assert.equal(
      app.w.localStorage.getItem("fatec:onboarding-completed:v1"),
      "true",
    );
    assert.equal(doc.activeElement, doc.querySelector("#login-view h1"));
    assert.deepEqual(app.errors, []);
  } finally {
    app.dom.window.close();
  }
});
test("skip works without storage or an available authentication service", async () => {
  const app = await boot("student", {
    anonymous: true,
    firstVisit: true,
    storageBlocked: true,
    authPending: true,
  });
  try {
    await app.click("#startup-view .onboarding-skip");
    assert.equal(app.w.document.querySelector("#startup-view").hidden, true);
    assert.equal(app.w.document.querySelector("#login-view").hidden, false);
    assert.equal(app.w.document.querySelector("#login-fields").disabled, false);
    assert.equal(
      app.w.document.querySelector("#microsoft-login").disabled,
      true,
    );
    assert.deepEqual(app.errors, []);
  } finally {
    app.dom.window.close();
  }
});
test("return visits keep the opening splash but skip the completed introduction", async () => {
  const app = await boot("student", { anonymous: true, holdSplash: true });
  try {
    assert.ok(app.w.document.querySelector("#startup-view .splash"));
    await app.finishSplash();
    assert.equal(app.w.document.querySelector("#startup-view").hidden, true);
    assert.equal(app.w.document.querySelector("#login-view").hidden, false);
    assert.equal(
      app.w.document.querySelector("#startup-view .onboarding"),
      null,
    );
  } finally {
    app.dom.window.close();
  }
});
async function boot(role = "student", options = {}) {
  const requests = [],
    errors = [];
  const dom = new JSDOM(html, {
      url: "https://hub.example/panel/",
      runScripts: "outside-only",
    }),
    w = dom.window;
  if (!options.firstVisit)
    w.localStorage.setItem("fatec:onboarding-completed:v1", "true");
  if (options.storageBlocked) {
    w.Storage.prototype.getItem = w.Storage.prototype.setItem = () => {
      throw new Error("Storage unavailable");
    };
  }
  let splashTimer;
  const originalTimeout = w.setTimeout.bind(w);
  w.setTimeout = (callback, delay, ...args) => {
    if (delay === 700) {
      splashTimer = callback;
      return 1;
    }
    return originalTimeout(callback, delay, ...args);
  };
  w.addEventListener("error", (event) => errors.push(event.error));
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  let expire = false;
  let authFailure = options.authFailure;
  w.fetch = async (input, init = {}) => {
    const url = new URL(input, w.location.href),
      path = url.pathname.replace("/api/v1", "");
    requests.push({ url, init });
    let data = [];
    let code = 200;
    if (path === "/auth/options" && options.authPending)
      return new Promise(() => {});
    if (path === "/auth/options" && authFailure) {
      data = {};
      code = authFailure;
    } else if (path === "/web/session" && options.anonymous) {
      data = { detail: "Autenticação necessária" };
      code = 401;
    } else if (expire && path !== "/auth/options") {
      data = { detail: "Autenticação necessária" };
      code = 401;
    } else if (path === "/auth/options")
      data = options.authPayload || { local: true, microsoft: false };
    else if (path === "/web/session")
      data = {
        user: {
          id: "person-1",
          name: "Pessoa de Teste",
          email: "pessoa@example.test",
          role,
          administrator: options.admin || false,
        },
        csrf_token: "synthetic-csrf",
      };
    else if (path === "/learning/overview")
      data = {
        date: "2026-09-09",
        groups_count: options.empty ? 0 : 1,
        pending_count: options.empty ? 0 : 2,
        material_count: options.empty ? 0 : 3,
        lessons_today: options.lessons || [],
        recorded_today: [],
        upcoming: options.empty ? [] : [activity],
        recent: [],
      };
    else if (path === "/learning/groups") data = options.empty ? [] : [group];
    else if (path === "/learning/publications")
      data = options.empty ? [] : [{ ...activity, ...options.publication }];
    else if (path === "/learning/calendar")
      data = { publications: [activity], lessons: [], truncated: false };
    else if (path === "/dashboard")
      data = { courses: 1, subjects: 2, groups: 1, users: 3, memberships: 3 };
    else if (path === "/admin/status")
      data = {
        database: "postgresql",
        revision: "test",
        microsoft_configured: true,
        session_minutes: 60,
        privileged_write_minutes: 10,
      };
    else if (path.endsWith("/enrollment"))
      data = { count: 2, capacity: 10, enrolled: false };
    else if (path.endsWith("/enrollments")) data = [];
    else if (path === "/learning/attendance/summary")
      data = options.frequency || {
        student: { id: "person-1", name: "Pessoa de Teste" },
        limit_percent: 25,
        recorded_lessons: 0,
        absences: 0,
        attendance_percent: null,
        groups: [],
        notice: "Não substitui o diário oficial.",
      };
    else if (path === "/learning/attendance/sheet") data = options.sheet;
    else if (path === "/learning/attendance/lessons") data = [];
    else if (path === "/learning/notifications")
      data = options.notifications || { read_at: null, unread: 0, items: [] };
    else if (path === "/learning/attachment-types")
      data = {
        extensions: ["pdf", "txt"],
        max_bytes: 4194304,
        text_max_bytes: 524288,
      };
    else if (path === "/notifications/preferences")
      data = {
        notices: true,
        activities: true,
        materials: true,
        events: true,
        grades: true,
        deadlines: true,
      };
    else if (path === "/notifications/config")
      data = { web_push: true, public_key: "BA", expo: true };
    else if (
      path === "/me/password" ||
      path === "/learning/notifications/read"
    ) {
      code = 204;
      data = null;
    } else if (path === "/auth/logout") {
      code = 204;
      data = null;
    }
    return { status: code, ok: code < 400, json: async () => data };
  };
  scripts.forEach((code) =>
    new Script(code).runInContext(dom.getInternalVMContext()),
  );
  await settle();
  const finishSplash = async () => {
    assert.ok(splashTimer);
    splashTimer();
    await settle();
  };
  if (!options.holdSplash) await finishSplash();
  return {
    finishSplash,
    w,
    dom,
    requests,
    errors,
    recover: () => {
      authFailure = 0;
    },
    expire: () => {
      expire = true;
    },
    click: async (selector) => {
      const node = w.document.querySelector(selector);
      assert.ok(node, selector);
      node.click();
      await settle();
    },
    navigate: async (key) => {
      w.navigate(key);
      await settle();
    },
  };
}
test("student navigation, scoped group and safe publication content", async () => {
  const app = await boot("student", {
    publication: {
      title: "<img src=x onerror=alert(1)>",
      body: "<script>bad()</script>",
    },
  });
  try {
    assert.equal(app.w.document.body.dataset.role, "student");
    assert.equal(app.w.document.body.dataset.page, "home");
    assert.equal(
      app.w.document.querySelectorAll("#bottom-navigation button").length,
      5,
    );
    await app.navigate("adminUsers");
    assert.equal(app.w.document.body.dataset.page, "home");
    await app.navigate("myGroups");
    await app.click(".group-card");
    const action = [...app.w.document.querySelectorAll("dialog button")].find(
      (node) => node.textContent === "Atividades",
    );
    action.click();
    await settle();
    const request = app.requests.findLast((item) =>
      item.url.pathname.endsWith("/publications"),
    );
    assert.equal(request.url.searchParams.get("group_id"), "group-1");
    assert.equal(
      app.w.document.querySelector(".publication-card h2").textContent,
      "<img src=x onerror=alert(1)>",
    );
    assert.equal(
      app.w.document.querySelectorAll(
        ".publication-card img,.publication-card script",
      ).length,
      0,
    );
    await app.click(".card-actions .primary");
    assert.equal(app.w.document.querySelectorAll(".academic-dialog").length, 1);
    assert.match(
      app.w.document.querySelector(".academic-dialog").textContent,
      /Minha entrega/,
    );
    assert.deepEqual(app.errors, []);
  } finally {
    app.dom.window.close();
  }
});
test("teacher controls keep mobile navigation and coordinator controls require admin", async () => {
  const teacher = await boot("teacher"),
    coordinator = await boot("coordinator"),
    admin = await boot("coordinator", { admin: true });
  try {
    assert.ok(teacher.w.document.querySelector(".hero-card.teacher"));
    await teacher.navigate("activity");
    assert.match(
      teacher.w.document.querySelector("#view").textContent,
      /Nova publicação/,
    );
    assert.equal(coordinator.w.document.body.dataset.page, "dashboard");
    assert.equal(
      coordinator.w.document.querySelector(
        "#navigation [data-page=adminUsers]",
      ),
      null,
    );
    assert.ok(
      admin.w.document.querySelector("#navigation [data-page=adminUsers]"),
    );
    await admin.navigate("adminStatus");
    assert.match(
      admin.w.document.querySelector("#view").textContent,
      /PostgreSQL|postgresql/,
    );
    assert.deepEqual(
      [...teacher.errors, ...coordinator.errors, ...admin.errors],
      [],
    );
  } finally {
    teacher.dom.window.close();
    coordinator.dom.window.close();
    admin.dom.window.close();
  }
});
test("calendar navigation, empty states, search and expired sessions", async () => {
  const app = await boot("student", { empty: true });
  try {
    assert.match(
      app.w.document.querySelector("#view").textContent,
      /Hoje sem aulas cadastradas/,
    );
    await app.navigate("calendar");
    assert.ok(app.w.document.querySelector(".calendar-day"));
    const previous = app.requests.findLast((item) =>
      item.url.pathname.endsWith("/calendar"),
    ).url.search;
    await app.click('[aria-label="Próximo mês"]');
    assert.notEqual(
      app.requests.findLast((item) => item.url.pathname.endsWith("/calendar"))
        .url.search,
      previous,
    );
    await app.navigate("search");
    const search = app.w.document.querySelector(".search-bar input");
    search.value = "segurança";
    search.form.dispatchEvent(new app.w.Event("submit", { cancelable: true }));
    await settle();
    assert.ok(
      app.requests.some(
        (item) => item.url.searchParams.get("q") === "segurança",
      ),
    );
    app.expire();
    await app.navigate("material");
    assert.equal(app.w.document.querySelector("#app-view").hidden, true);
    assert.equal(app.w.document.querySelector("#login-view").hidden, false);
    assert.equal(app.w.document.querySelector("#view").children.length, 0);
    assert.deepEqual(app.errors, []);
  } finally {
    app.dom.window.close();
  }
});
test("event enrollment submits CSRF and only one details dialog remains", async () => {
  const app = await boot("student", {
    publication: {
      kind: "event",
      starts_at: "2026-09-15T22:00:00Z",
      ends_at: "2026-09-15T23:00:00Z",
    },
  });
  try {
    await app.navigate("event");
    await app.click(".card-actions .primary");
    const enroll = [
      ...app.w.document.querySelectorAll(".academic-dialog button"),
    ].find((node) => node.textContent === "Inscrever-me");
    assert.ok(enroll);
    enroll.click();
    await settle();
    const request = app.requests.findLast((item) => item.init.method === "PUT");
    assert.equal(request.init.headers["X-CSRF-Token"], "synthetic-csrf");
    assert.deepEqual(JSON.parse(request.init.body), { archived: false });
    assert.equal(app.w.document.querySelectorAll(".academic-dialog").length, 1);
    assert.deepEqual(app.errors, []);
  } finally {
    app.dom.window.close();
  }
});

const lesson = {
  id: "schedule-1",
  group_id: "group-1",
  weekday: 2,
  starts_minute: 1140,
  ends_minute: 1240,
  starts_on: "2026-08-01",
  ends_on: "2026-12-20",
  room: "Lab 03",
};
test("teacher records a roll call marking only the absent student", async () => {
  const app = await boot("teacher", {
    lessons: [lesson],
    sheet: {
      schedule: lesson,
      group_label: group.label,
      lesson_date: "2026-09-09",
      lesson: null,
      students: [
        { id: "s1", name: "Ana <b>Ribeiro</b>", present: null },
        { id: "s2", name: "Bruno Lima", present: null },
      ],
    },
  });
  try {
    const call = [...app.w.document.querySelectorAll(".lesson button")].find(
      (node) => node.textContent === "Fazer chamada",
    );
    assert.ok(call);
    call.click();
    await settle();
    const dialog = app.w.document.querySelector(".academic-dialog");
    assert.match(dialog.textContent, /Todos entram como presentes/);
    assert.equal(dialog.querySelectorAll(".roll-student b").length, 0);
    const toggles = dialog.querySelectorAll(".roll-student");
    assert.equal(toggles.length, 2);
    toggles[1].click();
    await settle();
    assert.equal(toggles[1].getAttribute("aria-pressed"), "true");
    assert.equal(
      dialog.querySelector(".roll-counters strong").textContent,
      "1",
    );
    dialog.querySelector("#learning-topic").value = "Normalização";
    dialog
      .querySelector("form")
      .dispatchEvent(new app.w.Event("submit", { cancelable: true }));
    await settle();
    const request = app.requests.findLast((item) => item.init.method === "PUT");
    assert.ok(request.url.pathname.endsWith("/learning/attendance/sheet"));
    assert.equal(request.init.headers["X-CSRF-Token"], "synthetic-csrf");
    assert.deepEqual(JSON.parse(request.init.body), {
      schedule_id: "schedule-1",
      lesson_date: "2026-09-09",
      topic: "Normalização",
      absent_ids: ["s2"],
      version: 0,
    });
    assert.deepEqual(app.errors, []);
  } finally {
    app.dom.window.close();
  }
});
test("student sees attendance warnings, home stat and missed lessons", async () => {
  const frequency = {
    student: { id: "person-1", name: "Pessoa de Teste" },
    limit_percent: 25,
    recorded_lessons: 10,
    absences: 5,
    attendance_percent: 50,
    notice: "Não substitui o diário oficial.",
    groups: [
      {
        group_id: "group-1",
        group_label: "Marketing Digital · Noturno A · 2026/2",
        planned_lessons: 20,
        recorded_lessons: 10,
        absences: 5,
        attendance_percent: 50,
        allowed_absences: 5,
        remaining_absences: 0,
        remaining_lessons: 10,
        state: "critical",
        missed: [{ lesson_date: "2026-09-02", topic: "Persona" }],
      },
    ],
  };
  const app = await boot("student", { frequency });
  try {
    const doc = app.w.document;
    assert.match(doc.querySelector(".stats-grid").textContent, /50%Frequência/);
    assert.match(
      doc.querySelector(".alert-banner").textContent,
      /Marketing Digital/,
    );
    await app.navigate("attendance");
    const view = doc.querySelector("#view").textContent;
    assert.match(view, /não pode faltar mais nenhuma aula/);
    assert.match(view, /Limite de faltas atingido/);
    assert.match(view, /Persona/);
    assert.match(view, /diário oficial/);
    assert.deepEqual(app.errors, []);
  } finally {
    app.dom.window.close();
  }
});
test("reminders show unread items and mark them as read", async () => {
  const app = await boot("student", {
    notifications: {
      read_at: null,
      unread: 1,
      items: [
        {
          type: "grade",
          id: "sub-1",
          kind: "activity",
          title: "Lista 1",
          group_id: "group-1",
          at: "2026-09-09T22:00:00Z",
          grade: 8.5,
          unread: true,
          publication: activity,
        },
      ],
    },
  });
  try {
    const bell = app.w.document.querySelector("#open-reminders");
    assert.equal(bell.querySelector(".count-badge").textContent, "1");
    assert.match(bell.getAttribute("aria-label"), /1 não lido/);
    await app.navigate("reminders");
    const item = app.w.document.querySelector(".recent-item.unread");
    assert.match(item.textContent, /Nota 8,5 recebida/);
    const mark = [...app.w.document.querySelectorAll("#view button")].find(
      (node) => node.textContent === "Marcar todas como lidas",
    );
    mark.click();
    await settle();
    assert.ok(
      app.requests.some(
        (item) =>
          item.url.pathname.endsWith("/notifications/read") &&
          item.init.method === "POST",
      ),
    );
    assert.deepEqual(app.errors, []);
  } finally {
    app.dom.window.close();
  }
});
test("profile changes the local password and clears the fields", async () => {
  const app = await boot("student");
  try {
    await app.navigate("profile");
    const open = [
      ...app.w.document.querySelectorAll(".profile-menu button"),
    ].find((node) => node.textContent === "Alterar senha");
    open.click();
    await settle();
    const doc = app.w.document;
    doc.querySelector("#learning-current_password").value = "senha-antiga-123";
    doc.querySelector("#learning-new_password").value = "senha-nova-4567";
    doc.querySelector("#learning-confirm_password").value = "senha-diferente";
    const form = doc.querySelector(".academic-dialog form");
    form.dispatchEvent(new app.w.Event("submit", { cancelable: true }));
    await settle();
    assert.match(form.textContent, /confirmação não corresponde/);
    doc.querySelector("#learning-confirm_password").value = "senha-nova-4567";
    form.dispatchEvent(new app.w.Event("submit", { cancelable: true }));
    await settle();
    const request = app.requests.findLast((item) =>
      item.url.pathname.endsWith("/me/password"),
    );
    assert.deepEqual(JSON.parse(request.init.body), {
      current_password: "senha-antiga-123",
      new_password: "senha-nova-4567",
    });
    assert.equal(doc.querySelectorAll(".academic-dialog").length, 0);
    assert.deepEqual(app.errors, []);
  } finally {
    app.dom.window.close();
  }
});

test("profile explains push support and saves notification preferences", async () => {
  const app = await boot("student");
  try {
    await app.navigate("profile");
    const card = app.w.document.querySelector(".device-card");
    assert.ok(card);
    assert.match(
      card.textContent,
      /não recebe notificações push|Adicionar à Tela de Início/,
    );
    const boxes = card.querySelectorAll(".preference-list input");
    assert.equal(boxes.length, 6);
    boxes[0].click();
    await settle();
    const request = app.requests.findLast(
      (item) =>
        item.url.pathname.endsWith("/notifications/preferences") &&
        item.init.method === "PUT",
    );
    assert.equal(JSON.parse(request.init.body).notices, false);
    assert.equal(request.init.headers["X-CSRF-Token"], "synthetic-csrf");
    assert.deepEqual(app.errors, []);
  } finally {
    app.dom.window.close();
  }
});
