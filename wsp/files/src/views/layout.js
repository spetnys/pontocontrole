import { escapeHtml, initials } from "../lib/helpers.js";

export function renderGuestPage({ title, eyebrow, heading, subtitle, content }) {
  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(title)} • Gabinete360</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link rel="stylesheet" href="/styles.css" />
      <script defer src="/js/app.js"></script>
    </head>
    <body class="guest-body">
      <main class="guest-shell">
        <section class="guest-panel">
          <div class="brand-block">
            <span class="eyebrow">${escapeHtml(eyebrow ?? "Gabinete360")}</span>
            <h1>${escapeHtml(heading)}</h1>
            <p>${escapeHtml(subtitle)}</p>
          </div>
          ${content}
        </section>
        <aside class="guest-aside">
          <div class="gradient-orb orb-one"></div>
          <div class="gradient-orb orb-two"></div>
          <div class="guest-card">
            <span class="eyebrow">SaaS parlamentar</span>
            <h2>Organize atendimentos com clareza, velocidade e controle.</h2>
            <p>
              Dashboard executivo, contatos centralizados, historico completo
              e operacao multiusuario com isolamento por gabinete.
            </p>
            <div class="mini-metrics">
              <div>
                <strong>360°</strong>
                <span>Visao completa do atendimento</span>
              </div>
              <div>
                <strong>Multi</strong>
                <span>Gabinetes e equipes isoladas</span>
              </div>
              <div>
                <strong>Tempo real</strong>
                <span>Fluxo rapido para assessorias</span>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </body>
  </html>`;
}

export function renderAppPage({
  title,
  pageTitle,
  pageSubtitle,
  user,
  gabinete,
  activePath,
  content,
  flash,
  canCreateTicket = false,
  gabineteOptions = [],
  unreadNotifications = 0,
}) {
  const mustChangePassword = user?.must_change_password;
  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(title)} • Gabinete360</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link rel="stylesheet" href="/styles.css" />
      <script defer src="/js/app.js"></script>
    </head>
    <body>
      <div class="app-shell">
        ${renderSidebar(user, activePath)}
        <div class="app-main">
          ${renderTopbar({
            user,
            gabinete,
            gabineteOptions,
            canCreateTicket,
            pageTitle,
            pageSubtitle,
            unreadNotifications,
          })}
          <main class="page-content">
            ${
              mustChangePassword
                ? `<div class="banner warning">Voce entrou com a senha inicial. Troque a senha no cadastro de usuarios assim que possivel.</div>`
                : ""
            }
            ${
              flash
                ? `<div class="toast-surface" data-toast-type="${escapeHtml(
                    flash.type,
                  )}" data-toast-message="${escapeHtml(flash.message)}"></div>`
                : ""
            }
            ${content}
          </main>
        </div>
      </div>
    </body>
  </html>`;
}

function renderSidebar(user, activePath) {
  const items = [
    ["Painel inicial", "/app/dashboard"],
    ["Atendimentos", "/app/atendimentos"],
    ["Contatos", "/app/contatos"],
    ["Equipe", "/app/equipe"],
    ["Documentos", "/app/documentos"],
    ["Modelos", "/modelos"],
    ["Tarefas", "/app/tarefas"],
    ["Importar contatos", "/app/importacao"],
    ["Configuracoes", "/app/configuracoes"],
  ];

  if (user?.role === "super_admin" || user?.role === "gabinete_admin") {
    items.push(["Auditoria", "/auditoria"]);
  }

  if (user?.role === "super_admin") {
    items.push(["Administracao Geral", "/admin/gabinetes"]);
  }

  return `<aside class="sidebar" data-sidebar>
    <div class="sidebar-brand">
      <div class="brand-mark">G360</div>
      <div>
        <strong>Gabinete360</strong>
        <span>Operacao parlamentar</span>
      </div>
    </div>
    <nav class="sidebar-nav">
      ${items
        .map(
          ([label, href]) => `
            <a href="${href}" class="nav-item ${
              activePath === href || activePath.startsWith(`${href}/`) ? "active" : ""
            }">
              <span>${escapeHtml(label)}</span>
            </a>
          `,
        )
        .join("")}
    </nav>
    <div class="sidebar-foot">
      <div class="profile-chip">
        <span class="avatar">${escapeHtml(initials(user?.name))}</span>
        <div>
          <strong>${escapeHtml(user?.name ?? "")}</strong>
          <span>${escapeHtml(user?.role_label ?? "")}</span>
        </div>
      </div>
      <form method="post" action="/logout">
        <button class="ghost-button full-width" type="submit">Sair</button>
      </form>
      <a class="support-link" href="https://wa.me/5519993696718?text=Ol%C3%A1%2C%20gostaria%20de%20conversar%20sobre%20o%20Gabinete360" target="_blank" rel="noreferrer">
        Suporte WhatsApp
        <span>(19) 99369-6718</span>
      </a>
    </div>
  </aside>`;
}

function renderTopbar({
  user,
  gabinete,
  gabineteOptions,
  canCreateTicket,
  pageTitle,
  pageSubtitle,
  unreadNotifications,
}) {
  return `<header class="topbar">
    <div class="topbar-mobile">
      <button class="icon-button" type="button" data-sidebar-toggle aria-label="Abrir menu">
        <span></span><span></span><span></span>
      </button>
    </div>
    <div class="page-heading">
      <span class="eyebrow">${escapeHtml(gabinete?.name ?? "Plataforma")}</span>
      <h1>${escapeHtml(pageTitle)}</h1>
      <p>${escapeHtml(pageSubtitle ?? "")}</p>
    </div>
    <div class="topbar-actions">
      <form class="searchbar" action="/search" method="get">
        <input
          type="search"
          name="q"
          placeholder="Buscar por nome, telefone, protocolo ou pedido"
          aria-label="Busca global"
        />
      </form>
      ${
        canCreateTicket
          ? `<a class="primary-button" href="/app/atendimentos">Novo atendimento</a>`
          : ""
      }
      <a class="ghost-button notification-link" href="/app/dashboard">
        Notificacoes
        ${unreadNotifications ? `<span class="tiny-badge tone-amber">${unreadNotifications}</span>` : ""}
      </a>
      ${
        user?.role === "super_admin"
          ? `
            <form method="post" action="/switch-gabinete">
              <select name="gabinete_id" class="select-inline" aria-label="Selecionar gabinete">
                ${gabineteOptions
                  .map(
                    (option) => `
                      <option value="${option.id}" ${
                        Number(option.id) === Number(gabinete?.id) ? "selected" : ""
                      }>
                        ${escapeHtml(option.name)}
                      </option>
                    `,
                  )
                  .join("")}
              </select>
            </form>
          `
          : ""
      }
      <div class="profile-chip large">
        <span class="avatar">${escapeHtml(initials(user?.name))}</span>
        <div>
          <strong>${escapeHtml(user?.name ?? "")}</strong>
          <span>${escapeHtml(user?.role_label ?? "")}</span>
        </div>
      </div>
    </div>
  </header>`;
}
