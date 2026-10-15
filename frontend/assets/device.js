"use strict";
// Installable app, offline notice and push notifications on this device.
let installPrompt = null,
  pushConfig = null;
const pushLabels = {
  notices: "Avisos",
  activities: "Novas atividades",
  materials: "Materiais",
  events: "Eventos",
  grades: "Notas e devolutivas",
  deadlines: "Prazos se aproximando",
};
function serviceWorkerReady() {
  return "serviceWorker" in navigator
    ? navigator.serviceWorker.getRegistration()
    : Promise.resolve(null);
}
function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker
    .register(new URL("sw.js", document.baseURI))
    .catch(() => {
      /* The app keeps working online without the worker. */
    });
}
function standalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    navigator.standalone === true
  );
}
function appleDevice() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}
function pushAvailability() {
  if (!window.isSecureContext || !("serviceWorker" in navigator))
    return "unsupported";
  if (!("PushManager" in window) || !("Notification" in window))
    return appleDevice() && !standalone() ? "install-first" : "unsupported";
  return "available";
}
function applicationKey(value) {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
function deviceLabel() {
  const agent = navigator.userAgent;
  const system = /Android/.test(agent)
    ? "Android"
    : appleDevice()
      ? "iPhone/iPad"
      : /Windows/.test(agent)
        ? "Windows"
        : /Mac/.test(agent)
          ? "Mac"
          : "Navegador";
  return system + (standalone() ? " · aplicativo" : " · navegador");
}
async function currentSubscription() {
  const registration = await serviceWorkerReady();
  return registration?.pushManager
    ? registration.pushManager.getSubscription()
    : null;
}
async function sendSubscription(subscription) {
  const data = subscription.toJSON();
  await api("/notifications/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      channel: "web",
      endpoint: data.endpoint,
      keys: data.keys,
      label: deviceLabel(),
    }),
  });
}
// After sign-in, a device that already allowed notifications follows this account.
async function syncPush() {
  try {
    if (
      pushAvailability() !== "available" ||
      Notification.permission !== "granted"
    )
      return;
    const subscription = await currentSubscription();
    if (subscription && user) await sendSubscription(subscription);
  } catch {
    /* Best effort: the profile shows the current state. */
  }
}
// Before sign-out, stop this device from receiving the account's notifications.
async function releasePush() {
  try {
    const subscription = await currentSubscription();
    if (subscription)
      await api("/notifications/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
  } catch {
    /* The server also drops devices rejected by the push service. */
  }
}
async function enablePush() {
  pushConfig ??= await api("/notifications/config");
  if (!pushConfig.web_push)
    throw new Error(
      "As notificações ainda não foram configuradas pela instituição.",
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Permissão negada. Libere as notificações nas configurações do navegador.",
    );
  let registration = await serviceWorkerReady();
  if (!registration) {
    registerServiceWorker();
    registration = await navigator.serviceWorker.ready;
  }
  let subscription;
  try {
    subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationKey(pushConfig.public_key),
      }));
  } catch (error) {
    throw new Error(
      error.name === "NotAllowedError"
        ? "O navegador recusou a inscrição. Confira se as notificações estão permitidas para este site."
        : "O serviço de notificações do navegador está indisponível. Tente novamente mais tarde.",
    );
  }
  await sendSubscription(subscription);
}
async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await releasePush();
  await subscription.unsubscribe();
}
async function notificationPanel(target) {
  const card = el("section", undefined, "section-card device-card");
  card.append(el("h2", "Notificações e aplicativo"));
  target.append(card);
  const state = el("p", "", "muted"),
    actions = el("div", undefined, "row-actions"),
    problem = el("p", "", "error");
  problem.setAttribute("role", "alert");
  card.append(state, actions, problem);
  const run = (handler) => async () => {
    problem.textContent = "";
    try {
      await handler();
    } catch (error) {
      problem.textContent = error.message;
    }
    await refresh();
  };
  async function refresh() {
    if (!card.isConnected) return;
    actions.replaceChildren();
    const availability = pushAvailability();
    if (availability === "install-first") {
      state.textContent =
        "No iPhone, toque em Compartilhar e em “Adicionar à Tela de Início”. Abra o aplicativo pelo ícone para ativar as notificações.";
    } else if (availability === "unsupported") {
      state.textContent =
        "Este navegador não recebe notificações push. Os lembretes continuam disponíveis no aplicativo.";
    } else {
      const subscription = await currentSubscription().catch(() => null);
      const active = Boolean(
        subscription && Notification.permission === "granted",
      );
      state.textContent = active
        ? "Notificações ativas neste dispositivo."
        : Notification.permission === "denied"
          ? "Notificações bloqueadas neste navegador. Libere-as nas configurações do site."
          : "Receba avisos, prazos e notas neste dispositivo.";
      if (active)
        actions.append(
          button(
            "Enviar notificação de teste",
            run(async () => {
              const result = await api("/notifications/test", {
                method: "POST",
              });
              if (result.status !== "sent")
                throw new Error(
                  "O teste não foi entregue. Tente desativar e ativar novamente.",
                );
            }),
          ),
          button(
            "Desativar neste dispositivo",
            run(disablePush),
            "secondary danger",
          ),
        );
      else if (Notification.permission !== "denied")
        actions.append(
          button("Ativar notificações", run(enablePush), "primary"),
        );
    }
    if (installPrompt && !standalone())
      actions.append(
        button(
          "Instalar aplicativo",
          run(async () => {
            installPrompt.prompt();
            await installPrompt.userChoice;
            installPrompt = null;
          }),
        ),
      );
  }
  await refresh();
  const preferences = await api("/notifications/preferences");
  if (!card.isConnected) return;
  const group = el("fieldset", undefined, "preference-list");
  group.append(el("legend", "Quero ser avisado sobre"));
  for (const [key, label] of Object.entries(pushLabels)) {
    const caption = el("label", label),
      check = el("input");
    check.type = "checkbox";
    check.checked = preferences[key];
    check.addEventListener(
      "change",
      run(async () => {
        preferences[key] = check.checked;
        await api("/notifications/preferences", {
          method: "PUT",
          body: JSON.stringify(preferences),
        });
      }),
    );
    caption.prepend(check);
    group.append(caption);
  }
  card.append(group);
}
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
});
function connectivity() {
  document.body.classList.toggle("offline", !navigator.onLine);
  if (!navigator.onLine)
    status("Sem conexão. Os dados exibidos podem estar desatualizados.", true);
  else if ($("status").textContent.startsWith("Sem conexão")) status("");
}
window.addEventListener("online", connectivity);
window.addEventListener("offline", connectivity);
registerServiceWorker();
