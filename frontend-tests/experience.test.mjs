import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { Script } from "node:vm";

const staticRoot = new URL("../backend/app/static/", import.meta.url);
const html = await readFile(new URL("index.html", staticRoot), "utf8");
const scripts = await Promise.all(
  ["panel.js", "admin.js", "academic.js", "experience.js"].map((name) =>
    readFile(new URL(name, staticRoot), "utf8"),
  ),
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
async function boot(role = "student", options = {}) {
  const requests = [],
    errors = [];
  const dom = new JSDOM(html, {
      url: "https://hub.example/panel/",
      runScripts: "outside-only",
    }),
    w = dom.window;
  w.addEventListener("error", (event) => errors.push(event.error));
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  let expire = false;
  w.fetch = async (input, init = {}) => {
    const url = new URL(input, w.location.href),
      path = url.pathname.replace("/api/v1", "");
    requests.push({ url, init });
    let data = [];
    let code = 200;
    if (expire && path !== "/auth/options") {
      data = { detail: "Autenticação necessária" };
      code = 401;
    } else if (path === "/auth/options")
      data = { local: true, microsoft: false };
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
        lessons_today: [],
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
    else if (path === "/auth/logout") {
      code = 204;
      data = null;
    }
    return { status: code, ok: code < 400, json: async () => data };
  };
  scripts.forEach((code) =>
    new Script(code).runInContext(dom.getInternalVMContext()),
  );
  await settle();
  return {
    w,
    dom,
    requests,
    errors,
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
    await app.click("#bottom-navigation [data-page=myGroups]");
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
