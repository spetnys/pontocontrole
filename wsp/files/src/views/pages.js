import { getRoleLabel } from "../db/database.js";
import {
  daysOpen,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatPhone,
  joinNonEmpty,
  priorityTone,
  queryString,
  statusTone,
  toInputDate,
} from "../lib/helpers.js";
import { renderGuestPage } from "./layout.js";

export function loginPage({ error = "", values = {} } = {}) {
  return renderGuestPage({
    title: "Entrar",
    eyebrow: "Gabinete360",
    heading: "Controle de atendimentos para operacoes parlamentares.",
    subtitle:
      "Organize os atendimentos do seu gabinete com clareza, velocidade e controle.",
    content: `
      <form class="card-form" method="post" action="/login">
        ${error ? `<div class="inline-alert error">${escapeHtml(error)}</div>` : ""}
        <label class="field">
          <span>E-mail ou usuario</span>
          <input type="text" name="login" value="${escapeHtml(
            values.login ?? "",
          )}" placeholder="admin@gabinete360.com ou admin" required />
        </label>
        <label class="field">
          <span>Senha</span>
          <input type="password" name="password" placeholder="Sua senha" required />
        </label>
        <button class="primary-button full-width" type="submit">Entrar</button>
        <div class="text-actions">
          <a href="/register">Cadastrar novo gabinete</a>
          <a href="/forgot-password">Esqueci minha senha</a>
        </div>
        <div class="login-note">
          <strong>Master inicial:</strong> usuario <code>admin</code> ou e-mail
          <code>admin@gabinete360.com</code>. A senha operacional nao e exibida nesta tela.
        </div>
        <div class="login-note">
          <strong>Suporte:</strong> WhatsApp <a href="https://wa.me/5519993696718?text=Ol%C3%A1%2C%20gostaria%20de%20conversar%20sobre%20o%20Gabinete360" target="_blank" rel="noreferrer">(19) 99369-6718</a>.
        </div>
      </form>
    `,
  });
}

export function registerGabinetePage({ error = "", values = {} } = {}) {
  return renderGuestPage({
    title: "Cadastrar Gabinete",
    eyebrow: "Novo gabinete",
    heading: "Crie o acesso do seu gabinete em poucos passos.",
    subtitle:
      "O primeiro usuario sera criado como Administrador do Gabinete e seguira para um onboarding rapido.",
    content: `
      <form class="card-form two-columns" method="post" action="/register">
        ${error ? `<div class="inline-alert error span-2">${escapeHtml(error)}</div>` : ""}
        ${inputField("Nome do gabinete", "name", values.name)}
        ${selectField("Tipo", "type", values.type, [
          "Vereador",
          "Deputado Estadual",
          "Deputado Federal",
          "Senador",
          "Prefeitura/Secretaria",
          "Ouvidoria",
          "Outro",
        ])}
        ${inputField("Nome do parlamentar", "parliamentarian_name", values.parliamentarian_name)}
        ${inputField("Partido", "party", values.party)}
        ${inputField("Cidade", "city", values.city)}
        ${inputField("UF", "uf", values.uf, "SP")}
        ${inputField("Responsavel", "responsible_name", values.responsible_name)}
        ${inputField("E-mail do responsavel", "email", values.email, "gestao@gabinete.com", "email")}
        ${inputField("Telefone / WhatsApp", "phone", values.phone, "(19) 99999-9999")}
        ${inputField("Senha", "password", "", "", "password")}
        ${inputField("Confirmacao de senha", "password_confirmation", "", "", "password")}
        <div class="form-actions span-2">
          <button class="primary-button" type="submit">Criar gabinete</button>
          <a class="ghost-button" href="/login">Voltar ao login</a>
        </div>
      </form>
    `,
  });
}

export function onboardingPage({ gabinete }) {
  return `
    <section class="content-grid single">
      <div class="hero-card onboarding">
        <span class="eyebrow">Onboarding</span>
        <h2>${escapeHtml(gabinete.name)}</h2>
        <p>
          O gabinete foi criado com sucesso. A base inicial de status, categorias,
          canais e mensagens padrao ja foi configurada automaticamente.
        </p>
      </div>
      <div class="steps-grid">
        ${stepCard(
          "Passo 1",
          "Dados do gabinete",
          joinNonEmpty([gabinete.type, gabinete.city, gabinete.uf]),
          "Concluido",
        )}
        ${stepCard(
          "Passo 2",
          "Equipe",
          "Convide administradores, assessores e visualizadores.",
          "Proximo",
        )}
        ${stepCard(
          "Passo 3",
          "Status e categorias",
          "Edite a configuracao padrao sempre que precisar.",
          "Configurado",
        )}
      </div>
      <div class="card-shell split-actions">
        <div>
          <h3>Proximo melhor passo</h3>
          <p>Cadastre a equipe do gabinete e crie o primeiro atendimento.</p>
        </div>
        <div class="button-row">
          <a class="ghost-button" href="/usuarios">Configurar equipe</a>
          <a class="primary-button" href="/atendimentos/novo">Criar primeiro atendimento</a>
        </div>
      </div>
    </section>
  `;
}

export function dashboardPage({
  stats,
  statusChart,
  channelChart,
  categoryChart,
  assigneeChart,
  recentTickets,
  stalledTickets,
  nextActions,
  recurringDemands,
}) {
  return `
    <section class="stats-grid">
      ${statCard("Atendimentos abertos", stats.open_count, "Hoje", stats.open_delta)}
      ${statCard("Finalizados", stats.closed_count, "No periodo", stats.closed_delta)}
      ${statCard("Aguardando retorno", stats.waiting_return_count, "Monitorar", stats.waiting_return_count)}
      ${statCard("Aguardando servico", stats.waiting_service_count, "Fila atual", stats.waiting_service_count)}
      ${statCard("Ofícios encaminhados", stats.documents_sent_count, "Andamento", stats.documents_sent_count)}
      ${statCard("Sem atualizacao", stats.stalled_count, "Risco operacional", stats.stalled_count)}
      ${statCard("Novos no mes", stats.month_new_count, "Entrada", stats.month_new_count)}
      ${statCard("Resolucao media", `${stats.avg_resolution_days} dias`, "Tempo medio", stats.avg_resolution_days)}
    </section>

    <section class="content-grid">
      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Distribuicao</span>
            <h2>Atendimentos por status</h2>
          </div>
        </div>
        ${barChart(statusChart)}
      </div>
      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Canais</span>
            <h2>Origem dos atendimentos</h2>
          </div>
        </div>
        ${barChart(channelChart)}
      </div>
      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Categorias</span>
            <h2>Demandas recorrentes</h2>
          </div>
        </div>
        ${barChart(categoryChart)}
      </div>
      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Produtividade</span>
            <h2>Atendimentos por atendente</h2>
          </div>
        </div>
        ${barChart(assigneeChart)}
      </div>
    </section>

    <section class="content-grid">
      ${listCard(
        "Ultimos atendimentos cadastrados",
        recentTickets.map(
          (ticket) => `
            <a class="list-row" href="/atendimentos/${ticket.id}">
              <div>
                <strong>${escapeHtml(ticket.demand_title)}</strong>
                <span>${escapeHtml(ticket.contact_name)} • ${escapeHtml(ticket.number)}</span>
              </div>
              <div class="row-meta">
                ${statusBadge(ticket.status)}
                <span>${formatDate(ticket.opened_at)}</span>
              </div>
            </a>
          `,
        ),
      )}
      ${listCard(
        "Atendimentos sem atualizacao ha mais tempo",
        stalledTickets.length
          ? stalledTickets.map(
              (ticket) => `
                <a class="list-row" href="/atendimentos/${ticket.id}">
                  <div>
                    <strong>${escapeHtml(ticket.contact_name)}</strong>
                    <span>${escapeHtml(ticket.demand_title)}</span>
                  </div>
                  <div class="row-meta">
                    <span class="tiny-badge tone-rose">${daysOpen(
                      ticket.opened_at,
                      ticket.closed_at,
                    )} dias</span>
                    ${statusBadge(ticket.status)}
                  </div>
                </a>
              `,
            )
          : [emptyState("Tudo em dia", "Nao ha atendimentos parados no momento.")],
      )}
      ${listCard(
        "Proximas acoes",
        nextActions.length
          ? nextActions.map(
              (ticket) => `
                <a class="list-row" href="/atendimentos/${ticket.id}">
                  <div>
                    <strong>${escapeHtml(ticket.next_action)}</strong>
                    <span>${escapeHtml(ticket.contact_name)}</span>
                  </div>
                  <div class="row-meta">
                    <span>${formatDate(ticket.next_action_date)}</span>
                    ${priorityBadge(ticket.priority)}
                  </div>
                </a>
              `,
            )
          : [emptyState("Sem proximas acoes", "Cadastre proximas etapas para ter esta visao.")],
      )}
      ${listCard(
        "Demandas mais recorrentes",
        recurringDemands.length
          ? recurringDemands.map(
              (item) => `
                <div class="list-row static">
                  <div>
                    <strong>${escapeHtml(item.label)}</strong>
                    <span>Mais frequente no periodo</span>
                  </div>
                  <div class="row-meta">
                    <span class="tiny-badge tone-blue">${item.total}</span>
                  </div>
                </div>
              `,
            )
          : [emptyState("Sem historico suficiente", "Cadastre mais atendimentos para alimentar esta analise.")],
      )}
    </section>
  `;
}

export function ticketsPage({
  tickets,
  statuses,
  categories,
  channels,
  users,
  filters,
  viewMode,
  canEdit,
}) {
  return `
    <section class="card-shell">
      <div class="section-head wrap">
        <div>
          <span class="eyebrow">Central de atendimentos</span>
          <h2>Filtros e busca rapida</h2>
        </div>
        <div class="button-row">
          <a class="chip ${viewMode === "list" ? "active" : ""}" href="/atendimentos${queryString({
            ...filters,
            view: "list",
          })}">Lista</a>
          <a class="chip ${viewMode === "kanban" ? "active" : ""}" href="/atendimentos${queryString({
            ...filters,
            view: "kanban",
          })}">Kanban</a>
          <a class="chip disabled" href="/atendimentos${queryString({
            ...filters,
            view: "map",
          })}">Mapa em breve</a>
        </div>
      </div>
      <form class="filter-grid" method="get" action="/atendimentos">
        <input type="hidden" name="view" value="${escapeHtml(viewMode)}" />
        ${filterField("Busca", "q", filters.q, "Nome, telefone, protocolo ou pedido")}
        ${selectField("Status", "status", filters.status, statuses.map((status) => status.name), true)}
        ${selectField("Canal", "channel", filters.channel, channels.map((channel) => channel.name), true)}
        ${selectField(
          "Categoria",
          "category",
          filters.category,
          categories.map((category) => category.name),
          true,
        )}
        ${selectField(
          "Atendente",
          "assigned_user_id",
          filters.assigned_user_id,
          users.map((user) => ({ value: user.id, label: user.name })),
          true,
        )}
        ${filterField("Bairro", "neighborhood", filters.neighborhood)}
        ${filterField("Cidade", "city", filters.city)}
        ${selectField("Tipo", "scope", filters.scope, [
          { value: "all", label: "Todos" },
          { value: "open", label: "Apenas abertos" },
          { value: "closed", label: "Apenas finalizados" },
          { value: "stalled", label: "Sem atualizacao" },
        ])}
        <div class="form-actions span-2">
          <button class="primary-button" type="submit">Aplicar filtros</button>
          <a class="ghost-button" href="/atendimentos">Limpar</a>
        </div>
      </form>
    </section>

    ${
      viewMode === "kanban"
        ? renderTicketsKanban(tickets, statuses)
        : renderTicketsTable(tickets, canEdit)
    }
  `;
}

export function ticketFormPage({
  ticket = {},
  contactOptions = [],
  statuses = [],
  categories = [],
  channels = [],
  users = [],
  error = "",
  isEdit = false,
}) {
  const formAction = isEdit ? `/atendimentos/${ticket.id}/editar` : "/atendimentos/novo";
  const title = isEdit ? "Editar atendimento" : "Novo atendimento";

  return `
    <form class="content-grid single" method="post" action="${formAction}">
      ${error ? `<div class="inline-alert error">${escapeHtml(error)}</div>` : ""}
      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Atendimento</span>
            <h2>${title}</h2>
          </div>
        </div>
        <div class="form-grid">
          ${selectField("Contato existente", "contact_id", ticket.contact_id, [
            { value: "", label: "Selecionar contato" },
            ...contactOptions.map((contact) => ({
              value: contact.id,
              label: `${contact.name} • ${formatPhone(contact.phone)}`,
            })),
          ])}
          ${inputField("Abertura", "opened_at", toInputDate(ticket.opened_at), "", "date")}
          ${selectField("Canal", "channel", ticket.channel, channels.map((channel) => channel.name))}
          ${selectField("Status inicial", "status", ticket.status, statuses.map((status) => status.name))}
          ${selectField(
            "Atendente responsavel",
            "assigned_user_id",
            ticket.assigned_user_id,
            users.map((user) => ({ value: user.id, label: user.name })),
          )}
          ${selectField("Prioridade", "priority", ticket.priority, [
            "Baixa",
            "Normal",
            "Alta",
            "Urgente",
          ])}
          ${inputField("Etiquetas", "tags", ticket.tags, "saude, urgencia")}
        </div>
      </div>

      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Dados do municipe</span>
            <h2>Cadastro rapido</h2>
          </div>
          <span class="tiny-note">Se nenhum contato for selecionado, um novo sera criado.</span>
        </div>
        <div class="form-grid">
          ${inputField("Nome", "contact_name", ticket.contact_name)}
          ${inputField("Telefone", "contact_phone", ticket.contact_phone, "(19) 99999-9999")}
          ${inputField("WhatsApp", "contact_whatsapp", ticket.contact_whatsapp)}
          ${inputField("CPF/CNPJ", "contact_cpf", ticket.contact_cpf)}
          ${inputField("Data de nascimento", "contact_birth_date", toInputDate(ticket.contact_birth_date), "", "date")}
          ${inputField("E-mail", "contact_email", ticket.contact_email, "contato@email.com", "email")}
          ${inputField("Profissao", "contact_profession", ticket.contact_profession)}
          <div class="inline-hint span-2" data-contact-suggestion></div>
        </div>
      </div>

      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Endereco</span>
            <h2>Local do pedido</h2>
          </div>
        </div>
        <div class="form-grid">
          ${inputField("Endereco", "contact_address", ticket.contact_address)}
          ${inputField("Numero", "contact_number", ticket.contact_number)}
          ${inputField("Complemento", "contact_complement", ticket.contact_complement)}
          ${inputField("Bairro", "contact_neighborhood", ticket.contact_neighborhood)}
          ${inputField("CEP", "contact_zip_code", ticket.contact_zip_code)}
          ${inputField("Cidade", "contact_city", ticket.contact_city)}
          ${inputField("UF", "contact_uf", ticket.contact_uf, "SP")}
        </div>
      </div>

      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Pedido</span>
            <h2>Resumo e contexto</h2>
          </div>
        </div>
        <div class="form-grid">
          ${selectField(
            "Categoria do pedido",
            "demand_category",
            ticket.demand_category,
            categories.map((category) => category.name),
          )}
          ${inputField("Assunto do pedido", "demand_title", ticket.demand_title)}
          ${textareaField("Descricao completa", "description", ticket.description, true)}
          ${inputField("Secretaria / orgao", "department", ticket.department)}
          ${inputField("Protocolo externo", "external_protocol", ticket.external_protocol)}
          ${inputField("Prazo interno", "internal_due_date", toInputDate(ticket.internal_due_date), "", "date")}
        </div>
      </div>

      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Andamento</span>
            <h2>Proxima acao</h2>
          </div>
        </div>
        <div class="form-grid">
          ${textareaField("Orientacao / andamento inicial", "current_guidance", ticket.current_guidance, true)}
          ${inputField("Proxima acao", "next_action", ticket.next_action)}
          ${inputField("Data da proxima acao", "next_action_date", toInputDate(ticket.next_action_date), "", "date")}
        </div>
      </div>

      <div class="form-actions">
        <button class="primary-button" type="submit">Salvar atendimento</button>
        <a class="ghost-button" href="/atendimentos">Cancelar</a>
      </div>
    </form>
  `;
}

export function ticketDetailPage({ ticket, history = [], canEdit = false }) {
  const whatsappUrl = ticket.contact_whatsapp || ticket.contact_phone
    ? buildWhatsAppLink(
        ticket.contact_whatsapp || ticket.contact_phone,
        "Ola, aqui e a assessoria do gabinete. Estamos entrando em contato sobre sua solicitacao.",
      )
    : "";

  return `
    <section class="detail-hero">
      <div>
        <span class="eyebrow">${escapeHtml(ticket.number)}</span>
        <h2>${escapeHtml(ticket.contact_name)}</h2>
        <p>${escapeHtml(ticket.demand_title)}</p>
      </div>
      <div class="button-row">
        ${statusBadge(ticket.status)}
        ${priorityBadge(ticket.priority)}
        ${canEdit ? `<a class="ghost-button" href="/atendimentos/${ticket.id}/editar">Editar</a>` : ""}
        ${canEdit ? `<a class="ghost-button" href="/modelos?ticket_id=${ticket.id}">Gerar documento</a>` : ""}
        ${
          whatsappUrl
            ? `<a class="ghost-button" href="${whatsappUrl}" target="_blank" rel="noreferrer">WhatsApp</a>`
            : ""
        }
      </div>
    </section>

    <section class="content-grid">
      <div class="card-shell details-grid">
        ${detailCard("Contato", [
          ["Nome", ticket.contact_name],
          ["Telefone", formatPhone(ticket.contact_phone)],
          ["WhatsApp", formatPhone(ticket.contact_whatsapp)],
          ["CPF/CNPJ", ticket.contact_cpf],
          ["E-mail", ticket.contact_email],
          ["Profissao", ticket.contact_profession],
        ])}
        ${detailCard("Endereco", [
          ["Endereco", joinNonEmpty([ticket.contact_address, ticket.contact_number], ", ")],
          ["Complemento", ticket.contact_complement],
          ["Bairro", ticket.contact_neighborhood],
          ["Cidade / UF", joinNonEmpty([ticket.contact_city, ticket.contact_uf], " / ")],
          ["CEP", ticket.contact_zip_code],
        ])}
        ${detailCard("Pedido", [
          ["Categoria", ticket.demand_category],
          ["Descricao", ticket.description],
          ["Secretaria / orgao", ticket.department],
          ["Protocolo externo", ticket.external_protocol],
        ])}
        ${detailCard("Controle", [
          ["Status", ticket.status],
          ["Prioridade", ticket.priority],
          ["Atendente", ticket.assigned_user_name],
          ["Abertura", formatDate(ticket.opened_at)],
          ["Fechamento", formatDate(ticket.closed_at)],
          ["Dias em aberto", String(daysOpen(ticket.opened_at, ticket.closed_at))],
        ])}
        ${detailCard("Proximos passos", [
          ["Andamento atual", ticket.current_guidance],
          ["Proxima acao", ticket.next_action],
          ["Data da proxima acao", formatDate(ticket.next_action_date)],
          ["Resultado", ticket.result],
        ])}
      </div>

      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Timeline</span>
            <h2>Historico do atendimento</h2>
          </div>
        </div>
        ${
          history.length
            ? `<div class="timeline">
                ${history
                  .map(
                    (item) => `
                      <article class="timeline-item">
                        <div class="timeline-dot"></div>
                        <div>
                          <div class="timeline-head">
                            <strong>${escapeHtml(item.action_type)}</strong>
                            <span>${formatDateTime(item.created_at)}</span>
                          </div>
                          <p>${escapeHtml(item.text || "Sem observacao.")}</p>
                          <div class="timeline-meta">
                            <span>${escapeHtml(item.user_name || "Sistema")}</span>
                            ${
                              item.new_status
                                ? `<span>${escapeHtml(item.previous_status || "Inicio")} → ${escapeHtml(
                                    item.new_status,
                                  )}</span>`
                                : ""
                            }
                            ${
                              item.next_action
                                ? `<span>Proxima acao: ${escapeHtml(item.next_action)}</span>`
                                : ""
                            }
                          </div>
                        </div>
                      </article>
                    `,
                  )
                  .join("")}
              </div>`
            : emptyState("Sem historico", "Nenhuma movimentacao registrada ainda.")
        }
      </div>
    </section>
  `;
}

export function contactsPage({ contacts, filters, canEdit }) {
  return `
    <section class="card-shell">
      <div class="section-head wrap">
        <div>
          <span class="eyebrow">Contatos do gabinete</span>
          <h2>Munícipes e contatos</h2>
        </div>
        ${canEdit ? `<a class="primary-button" href="/contatos/novo">Novo contato</a>` : ""}
      </div>
      <form class="filter-grid compact" method="get" action="/contatos">
        ${filterField("Busca", "q", filters.q, "Nome, telefone, bairro ou etiquetas")}
        ${filterField("Cidade", "city", filters.city)}
        ${filterField("Bairro", "neighborhood", filters.neighborhood)}
        <div class="form-actions">
          <button class="primary-button" type="submit">Filtrar</button>
          <a class="ghost-button" href="/contatos">Limpar</a>
        </div>
      </form>
    </section>

    <section class="card-shell no-padding">
      ${
        contacts.length
          ? `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>Bairro</th>
                    <th>Cidade</th>
                    <th>Ultimo atendimento</th>
                    <th>Etiquetas</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  ${contacts
                    .map(
                      (contact) => `
                        <tr>
                          <td>
                            <strong>${escapeHtml(contact.name)}</strong>
                            <span class="muted-line">${escapeHtml(contact.email || "Sem e-mail")}</span>
                          </td>
                          <td>${escapeHtml(formatPhone(contact.phone))}</td>
                          <td>${escapeHtml(contact.neighborhood || "Sem bairro")}</td>
                          <td>${escapeHtml(joinNonEmpty([contact.city, contact.uf], " / ") || "Sem cidade")}</td>
                          <td>${formatDate(contact.last_ticket_at)}</td>
                          <td>${renderTags(contact.tags)}</td>
                          <td>
                            <div class="table-actions">
                              <a href="/contatos/${contact.id}">Ver</a>
                              ${canEdit ? `<a href="/contatos/${contact.id}/editar">Editar</a>` : ""}
                              ${contact.whatsapp ? `<a href="${buildWhatsAppLink(contact.whatsapp)}" target="_blank" rel="noreferrer">WhatsApp</a>` : ""}
                            </div>
                          </td>
                        </tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
          : emptyState("Nenhum contato encontrado", "Cadastre os primeiros municipes para centralizar o atendimento.")
      }
    </section>
  `;
}

export function contactFormPage({ contact = {}, error = "", isEdit = false }) {
  const action = isEdit ? `/contatos/${contact.id}/editar` : "/contatos/novo";
  const title = isEdit ? "Editar contato" : "Novo contato";

  return `
    <form class="content-grid single" method="post" action="${action}">
      ${error ? `<div class="inline-alert error">${escapeHtml(error)}</div>` : ""}
      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Contato</span>
            <h2>${title}</h2>
          </div>
        </div>
        <div class="form-grid">
          ${inputField("Nome", "name", contact.name)}
          ${inputField("Telefone", "phone", contact.phone)}
          ${inputField("WhatsApp", "whatsapp", contact.whatsapp)}
          ${inputField("CPF/CNPJ", "cpf_rg_cns", contact.cpf_rg_cns)}
          ${inputField("Data de nascimento", "birth_date", toInputDate(contact.birth_date), "", "date")}
          ${inputField("E-mail", "email", contact.email, "contato@email.com", "email")}
          ${inputField("Profissao", "profession", contact.profession)}
          ${inputField("Endereco", "address", contact.address)}
          ${inputField("Numero", "number", contact.number)}
          ${inputField("Complemento", "complement", contact.complement)}
          ${inputField("Bairro", "neighborhood", contact.neighborhood)}
          ${inputField("CEP", "zip_code", contact.zip_code)}
          ${inputField("Cidade", "city", contact.city)}
          ${inputField("UF", "uf", contact.uf, "SP")}
          ${inputField("Etiquetas", "tags", contact.tags, "lideranca, bairro")}
          ${textareaField("Observacoes", "notes", contact.notes, true)}
        </div>
      </div>
      <div class="form-actions">
        <button class="primary-button" type="submit">Salvar contato</button>
        <a class="ghost-button" href="/contatos">Cancelar</a>
      </div>
    </form>
  `;
}

export function contactDetailPage({ contact, tickets = [] }) {
  return `
    <section class="detail-hero">
      <div>
        <span class="eyebrow">Contato</span>
        <h2>${escapeHtml(contact.name)}</h2>
        <p>${escapeHtml(joinNonEmpty([contact.city, contact.uf], " / ") || "Sem cidade cadastrada")}</p>
      </div>
      <div class="button-row">
        ${contact.whatsapp ? `<a class="ghost-button" href="${buildWhatsAppLink(contact.whatsapp)}" target="_blank" rel="noreferrer">WhatsApp</a>` : ""}
        <a class="primary-button" href="/atendimentos/novo?contact_id=${contact.id}">Novo atendimento</a>
      </div>
    </section>

    <section class="content-grid">
      <div class="card-shell details-grid">
        ${detailCard("Dados pessoais", [
          ["Telefone", formatPhone(contact.phone)],
          ["WhatsApp", formatPhone(contact.whatsapp)],
          ["CPF/CNPJ", contact.cpf_rg_cns],
          ["Nascimento", formatDate(contact.birth_date)],
          ["E-mail", contact.email],
          ["Profissao", contact.profession],
        ])}
        ${detailCard("Endereco", [
          ["Endereco", joinNonEmpty([contact.address, contact.number], ", ")],
          ["Complemento", contact.complement],
          ["Bairro", contact.neighborhood],
          ["Cidade / UF", joinNonEmpty([contact.city, contact.uf], " / ")],
          ["CEP", contact.zip_code],
        ])}
        ${detailCard("Contexto", [
          ["Etiquetas", contact.tags],
          ["Primeiro atendimento", formatDate(contact.first_ticket_at)],
          ["Ultimo atendimento", formatDate(contact.last_ticket_at)],
          ["Observacoes", contact.notes],
        ])}
      </div>

      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Historico</span>
            <h2>Atendimentos vinculados</h2>
          </div>
        </div>
        ${
          tickets.length
            ? `<div class="stack-list">
                ${tickets
                  .map(
                    (ticket) => `
                      <a class="list-row" href="/atendimentos/${ticket.id}">
                        <div>
                          <strong>${escapeHtml(ticket.demand_title)}</strong>
                          <span>${escapeHtml(ticket.number)}</span>
                        </div>
                        <div class="row-meta">
                          ${statusBadge(ticket.status)}
                          <span>${formatDate(ticket.opened_at)}</span>
                        </div>
                      </a>
                    `,
                  )
                  .join("")}
              </div>`
            : emptyState("Sem atendimentos", "Este contato ainda nao possui historico vinculado.")
        }
      </div>
    </section>
  `;
}

export function usersPage({ users, canManage, isSuperAdmin = false }) {
  return `
    <section class="card-shell">
      <div class="section-head wrap">
        <div>
          <span class="eyebrow">Equipe</span>
          <h2>Usuarios e perfis</h2>
        </div>
      </div>

      ${
        canManage
          ? `
            <form class="filter-grid compact" method="post" action="/usuarios">
              ${inputField("Nome", "name", "", "Nome completo")}
              ${inputField("Usuario", "username", "", "usuario")}
              ${inputField("E-mail", "email", "", "usuario@gabinete.com", "email")}
              ${inputField("Telefone", "phone", "", "(19) 99999-9999")}
              ${selectField("Perfil", "role", "advisor", [
                { value: "gabinete_admin", label: "Administrador do Gabinete" },
                { value: "advisor", label: "Assessor / Atendente" },
                { value: "viewer", label: "Visualizador" },
              ])}
              ${
                isSuperAdmin
                  ? inputField("Gabinete ID", "gabinete_id", "", "Obrigatorio para novos usuarios")
                  : ""
              }
              ${inputField("Senha inicial", "password", "123321", "", "text")}
              <div class="form-actions">
                <button class="primary-button" type="submit">Criar usuario</button>
              </div>
            </form>
          `
          : ""
      }
    </section>

    <section class="card-shell no-padding">
      ${
        users.length
          ? `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Usuario</th>
                    <th>E-mail</th>
                    <th>Telefone</th>
                    <th>Perfil</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${users
                    .map(
                      (user) => `
                        <tr>
                          <td>${escapeHtml(user.name)}</td>
                          <td>${escapeHtml(user.username || "-")}</td>
                          <td>${escapeHtml(user.email)}</td>
                          <td>${escapeHtml(formatPhone(user.phone))}</td>
                          <td><span class="tiny-badge tone-blue">${escapeHtml(getRoleLabel(user.role))}</span></td>
                          <td><span class="tiny-badge tone-${user.status === "active" ? "green" : "slate"}">${escapeHtml(user.status)}</span></td>
                        </tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
          : emptyState("Equipe vazia", "Crie usuarios para distribuir a operacao do gabinete.")
      }
    </section>
  `;
}

export function adminGabinetesPage({ gabinetes, stats }) {
  return `
    <section class="stats-grid">
      ${statCard("Total de gabinetes", stats.total_gabinetes, "Plataforma", stats.total_gabinetes)}
      ${statCard("Gabinetes ativos", stats.active_gabinetes, "Operacao", stats.active_gabinetes)}
      ${statCard("Usuarios ativos", stats.active_users, "Base", stats.active_users)}
      ${statCard("Atendimentos totais", stats.total_tickets, "Historico", stats.total_tickets)}
    </section>

    <section class="card-shell">
      <div class="section-head wrap">
        <div>
          <span class="eyebrow">Administracao geral</span>
          <h2>Novo gabinete</h2>
        </div>
      </div>
      <form class="filter-grid" method="post" action="/admin/gabinetes">
        ${inputField("Nome do gabinete", "name")}
        ${selectField("Tipo", "type", "Vereador", [
          "Vereador",
          "Deputado Estadual",
          "Deputado Federal",
          "Senador",
          "Prefeitura/Secretaria",
          "Ouvidoria",
          "Outro",
        ])}
        ${inputField("Parlamentar", "parliamentarian_name")}
        ${inputField("Partido", "party")}
        ${inputField("Cidade", "city")}
        ${inputField("UF", "uf", "SP")}
        ${inputField("Responsavel", "responsible_name")}
        ${inputField("Usuario admin", "username", "", "gabineteadmin")}
        ${inputField("E-mail admin", "email", "", "admin@gabinete.com", "email")}
        ${inputField("Telefone", "phone")}
        ${inputField("Senha inicial", "password", "123321")}
        <div class="form-actions span-2">
          <button class="primary-button" type="submit">Criar gabinete</button>
        </div>
      </form>
    </section>

    <section class="card-shell no-padding">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Gabinete</th>
              <th>Tipo</th>
              <th>Cidade</th>
              <th>Status</th>
              <th>Usuarios</th>
              <th>Atendimentos</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            ${gabinetes
              .map(
                (gabinete) => `
                  <tr>
                    <td>
                      <strong>${escapeHtml(gabinete.name)}</strong>
                      <span class="muted-line">${escapeHtml(gabinete.parliamentarian_name || "Sem parlamentar")}</span>
                    </td>
                    <td>${escapeHtml(gabinete.type)}</td>
                    <td>${escapeHtml(joinNonEmpty([gabinete.city, gabinete.uf], " / "))}</td>
                    <td><span class="tiny-badge tone-${gabinete.status === "active" ? "green" : "slate"}">${escapeHtml(gabinete.status)}</span></td>
                    <td>${gabinete.users_count}</td>
                    <td>${gabinete.tickets_count}</td>
                    <td>
                      <div class="table-actions">
                        <form method="post" action="/switch-gabinete">
                          <input type="hidden" name="gabinete_id" value="${gabinete.id}" />
                          <input type="hidden" name="return_to" value="/app/dashboard" />
                          <button type="submit">Abrir painel</button>
                        </form>
                        <form method="post" action="/admin/gabinetes/${gabinete.id}/toggle">
                          <button type="submit">${gabinete.status === "active" ? "Desativar" : "Ativar"}</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export function settingsPage({
  gabinete,
  statuses,
  categories,
  channels,
  templates,
  signatures = [],
  aiLinks = [],
  routingRules = [],
  documentTemplates = [],
  supportWhatsappUrl = "",
  canManageSettings = false,
}) {
  return `
    <section class="stats-grid compact-stats">
      ${statCard("Modelos prontos", documentTemplates.length, "Biblioteca", documentTemplates.length)}
      ${statCard("Assinaturas", signatures.length, "Perfis", signatures.length)}
      ${statCard("Links de IA", aiLinks.length, "Atalhos", aiLinks.length)}
      ${statCard("Rotas sugeridas", routingRules.length, "Secretarias", routingRules.length)}
    </section>

    <section class="content-grid">
      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Dados do gabinete</span>
            <h2>${escapeHtml(gabinete.name)}</h2>
          </div>
        </div>
        <div class="info-grid">
          ${simpleInfo("Tipo", gabinete.type)}
          ${simpleInfo("Parlamentar", gabinete.parliamentarian_name)}
          ${simpleInfo("Partido", gabinete.party)}
          ${simpleInfo("Cidade / UF", joinNonEmpty([gabinete.city, gabinete.uf], " / "))}
          ${simpleInfo("Responsavel", gabinete.responsible_name)}
          ${simpleInfo("E-mail", gabinete.email)}
        </div>
        <div class="button-row top-gap">
          <a class="ghost-button" href="/modelos">Abrir biblioteca de modelos</a>
          ${
            supportWhatsappUrl
              ? `<a class="primary-button" href="${escapeHtml(supportWhatsappUrl)}" target="_blank" rel="noreferrer">Suporte via WhatsApp</a>`
              : ""
          }
        </div>
      </div>
      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Padroes do gabinete</span>
            <h2>Status, categorias, canais e mensagens</h2>
          </div>
        </div>
        <div class="stack-list">
          <div class="token-wrap">${statuses.map((item) => statusBadge(item.name)).join("")}</div>
          <div class="token-wrap">${categories.map((item) => `<span class="tiny-badge tone-blue">${escapeHtml(item.name)}</span>`).join("")}</div>
          <div class="token-wrap">${channels.map((item) => `<span class="tiny-badge tone-slate">${escapeHtml(item.name)}</span>`).join("")}</div>
          <div class="stack-list">
            ${templates
              .map(
                (item) => `
                  <div class="list-row static">
                    <div>
                      <strong>${escapeHtml(item.title)}</strong>
                      <span>${escapeHtml(item.body)}</span>
                    </div>
                  </div>
                `,
              )
              .join("")}
          </div>
        </div>
      </div>
    </section>

    <section class="content-grid">
      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Assinaturas prontas</span>
            <h2>Perfis para documentos e ofícios</h2>
          </div>
        </div>
        <div class="stack-list">
          ${
            signatures.length
              ? signatures
                  .map(
                    (item) => `
                      <div class="list-row static">
                        <div>
                          <strong>${escapeHtml(item.label)}</strong>
                          <span>${escapeHtml(item.signatory_name)} • ${escapeHtml(item.signatory_role)}</span>
                        </div>
                        <div class="row-meta">
                          <span class="tiny-badge tone-slate">${escapeHtml(item.footer_text || "Perfil pronto")}</span>
                        </div>
                      </div>
                    `,
                  )
                  .join("")
              : emptyState("Sem assinaturas", "Cadastre ao menos um perfil de assinatura para acelerar a emissao de documentos.")
          }
        </div>
      </div>

      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Atalhos externos</span>
            <h2>Links uteis e inteligencias artificiais</h2>
          </div>
        </div>
        <div class="stack-list">
          ${
            aiLinks.length
              ? aiLinks
                  .map(
                    (item) => `
                      <a class="list-row" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
                        <div>
                          <strong>${escapeHtml(item.title)}</strong>
                          <span>${escapeHtml(item.description || item.url)}</span>
                        </div>
                        <div class="row-meta">
                          <span class="tiny-badge tone-blue">Abrir</span>
                        </div>
                      </a>
                    `,
                  )
                  .join("")
              : emptyState("Sem links", "Cadastre atalhos para IA, legislacao, pesquisa e sistemas parceiros.")
          }
        </div>
      </div>
    </section>

    <section class="content-grid">
      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Encaminhamento sugerido</span>
            <h2>Secretarias e orgaos mais usados</h2>
          </div>
        </div>
        <div class="stack-list">
          ${
            routingRules.length
              ? routingRules
                  .slice(0, 8)
                  .map(
                    (rule) => `
                      <div class="list-row static">
                        <div>
                          <strong>${escapeHtml(rule.topic)}</strong>
                          <span>${escapeHtml(rule.recommended_department)}</span>
                        </div>
                        <div class="row-meta">
                          <span class="tiny-badge tone-amber">${escapeHtml(rule.target_authority || "Encaminhamento")}</span>
                        </div>
                      </div>
                    `,
                  )
                  .join("")
              : emptyState("Sem regras", "Cadastre rotas de encaminhamento por tema para orientar a equipe.")
          }
        </div>
      </div>

      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Biblioteca</span>
            <h2>Modelos operacionais salvos</h2>
          </div>
        </div>
        <div class="stack-list">
          ${
            documentTemplates.length
              ? documentTemplates
                  .slice(0, 8)
                  .map(
                    (item) => `
                      <a class="list-row" href="/modelos?topic=${encodeURIComponent(item.topic)}">
                        <div>
                          <strong>${escapeHtml(item.title)} • ${escapeHtml(item.variant_name)}</strong>
                          <span>${escapeHtml(item.type)} • ${escapeHtml(item.topic)}</span>
                        </div>
                        <div class="row-meta">
                          <span class="tiny-badge tone-slate">${escapeHtml(item.recommended_department || "Modelo")}</span>
                        </div>
                      </a>
                    `,
                  )
                  .join("")
              : emptyState("Sem modelos", "A biblioteca de modelos ainda nao possui itens para este gabinete.")
          }
        </div>
      </div>
    </section>

    ${
      canManageSettings
        ? `
          <section class="content-grid">
            <form class="card-shell" method="post" action="/configuracoes/assinaturas">
              <div class="section-head">
                <div>
                  <span class="eyebrow">Nova assinatura</span>
                  <h2>Criar perfil pronto</h2>
                </div>
              </div>
              <div class="form-grid">
                ${inputField("Nome interno", "label")}
                ${inputField("Nome do signatario", "signatory_name")}
                ${inputField("Cargo / funcao", "signatory_role")}
                ${textareaField("Fecho padrao", "closing_text", "", true)}
                ${textareaField("Rodape / observacao", "footer_text", "", true)}
                ${inputField("Link do arquivo de assinatura", "file_url", "", "https://...")}
              </div>
              <div class="form-actions">
                <button class="primary-button" type="submit">Salvar assinatura</button>
              </div>
            </form>

            <form class="card-shell" method="post" action="/configuracoes/ia-links">
              <div class="section-head">
                <div>
                  <span class="eyebrow">Novo link util</span>
                  <h2>Salvar atalho de IA ou apoio</h2>
                </div>
              </div>
              <div class="form-grid">
                ${inputField("Titulo", "title")}
                ${inputField("URL", "url", "", "https://...")}
                ${textareaField("Descricao", "description", "", true)}
              </div>
              <div class="form-actions">
                <button class="primary-button" type="submit">Salvar link</button>
              </div>
            </form>
          </section>
        `
        : ""
    }
  `;
}

export function searchPage({ query, ticketResults, contactResults }) {
  return `
    <section class="card-shell">
      <div class="section-head">
        <div>
          <span class="eyebrow">Busca global</span>
          <h2>Resultados para "${escapeHtml(query)}"</h2>
        </div>
      </div>
      <div class="content-grid">
        ${listCard(
          "Atendimentos",
          ticketResults.length
            ? ticketResults.map(
                (ticket) => `
                  <a class="list-row" href="/atendimentos/${ticket.id}">
                    <div>
                      <strong>${escapeHtml(ticket.demand_title)}</strong>
                      <span>${escapeHtml(ticket.contact_name)} • ${escapeHtml(ticket.number)}</span>
                    </div>
                    <div class="row-meta">${statusBadge(ticket.status)}</div>
                  </a>
                `,
              )
            : [emptyState("Sem atendimentos", "Nenhum atendimento encontrado para essa busca.")],
        )}
        ${listCard(
          "Contatos",
          contactResults.length
            ? contactResults.map(
                (contact) => `
                  <a class="list-row" href="/contatos/${contact.id}">
                    <div>
                      <strong>${escapeHtml(contact.name)}</strong>
                      <span>${escapeHtml(formatPhone(contact.phone))}</span>
                    </div>
                    <div class="row-meta"><span>${escapeHtml(contact.city || "")}</span></div>
                  </a>
                `,
              )
            : [emptyState("Sem contatos", "Nenhum contato encontrado para essa busca.")],
        )}
      </div>
    </section>
  `;
}

export function modelTemplatesPage({ templates, filters, linkedTicket = null, topics = [], canEdit = false }) {
  return `
    <section class="card-shell">
      <div class="section-head wrap">
        <div>
          <span class="eyebrow">Biblioteca de modelos</span>
          <h2>Documentos prontos para o dia a dia do gabinete</h2>
        </div>
        ${
          linkedTicket
            ? `<div class="linked-context">
                <span class="tiny-badge tone-blue">${escapeHtml(linkedTicket.number)}</span>
                <strong>${escapeHtml(linkedTicket.demand_title)}</strong>
                <span>${escapeHtml(linkedTicket.contact_name)}</span>
              </div>`
            : ""
        }
      </div>
      <form class="filter-grid compact" method="get" action="/modelos">
        ${linkedTicket ? `<input type="hidden" name="ticket_id" value="${linkedTicket.id}" />` : ""}
        ${filterField("Busca", "q", filters.q, "Tema, secretaria, uso ou modelo")}
        ${selectField("Tipo", "type", filters.type, [
          "Oficio",
          "Indicacao",
          "Requerimento",
          "Mocao",
          "Projeto de Lei",
          "Emenda",
          "Representacao",
          "Relatorio de Viagem",
          "Requisicao Administrativa",
          "Outro",
        ], true)}
        ${selectField("Tema", "topic", filters.topic, topics, true)}
        ${filterField("Secretaria", "department", filters.department, "Mobilidade, Obras, Saude...")}
        <div class="form-actions">
          <button class="primary-button" type="submit">Filtrar</button>
          <a class="ghost-button" href="${linkedTicket ? `/modelos?ticket_id=${linkedTicket.id}` : "/modelos"}">Limpar</a>
        </div>
      </form>
    </section>

    <section class="template-grid">
      ${
        templates.length
          ? templates
              .map(
                (template) => `
                  <article class="card-shell template-card">
                    <div class="section-head">
                      <div>
                        <span class="eyebrow">${escapeHtml(template.topic)}</span>
                        <h2>${escapeHtml(template.title)}</h2>
                      </div>
                      <span class="tiny-badge tone-blue">${escapeHtml(template.type)}</span>
                    </div>
                    <p class="template-variant">
                      <strong>Variacao:</strong> ${escapeHtml(template.variant_name)}
                    </p>
                    <p>${escapeHtml(template.use_case || "Modelo pronto para reaproveitamento rapido.")}</p>
                    <div class="info-stack compact">
                      <div><strong>Secretaria sugerida:</strong> ${escapeHtml(template.recommended_department || "Nao definida")}</div>
                      <div><strong>Destinatario:</strong> ${escapeHtml(template.target_authority || "A definir")}</div>
                      <div><strong>Fluxo:</strong> ${escapeHtml(template.via_strategy || "Sem observacao")}</div>
                      <div><strong>Assunto base:</strong> ${escapeHtml(template.subject_template || "Sem assunto padrao")}</div>
                    </div>
                    <div class="token-wrap">
                      ${String(template.tags || "")
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean)
                        .slice(0, 6)
                        .map((tag) => `<span class="tiny-badge tone-slate">${escapeHtml(tag)}</span>`)
                        .join("")}
                    </div>
                    <div class="button-row">
                      ${
                        canEdit
                          ? `<a class="primary-button" href="/documentos/novo?template_id=${template.id}${
                              linkedTicket ? `&ticket_id=${linkedTicket.id}` : ""
                            }">Usar modelo</a>`
                          : ""
                      }
                      <a class="ghost-button" href="/documentos?type=${encodeURIComponent(template.type)}">Ver documentos do tipo</a>
                    </div>
                  </article>
                `,
              )
              .join("")
          : emptyState("Nenhum modelo encontrado", "Ajuste os filtros ou cadastre mais modelos para o gabinete.")
      }
    </section>
  `;
}

export function placeholderPage({ title, description }) {
  return `
    <section class="card-shell placeholder">
      <span class="eyebrow">Roadmap</span>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(description)}</p>
      <div class="token-wrap">
        <span class="tiny-badge tone-blue">Planejado na proxima fase</span>
      </div>
    </section>
  `;
}

export function documentsPage({ documents, filters, canEdit }) {
  return `
    <section class="card-shell">
      <div class="section-head wrap">
        <div>
          <span class="eyebrow">Documentos oficiais</span>
          <h2>Ofícios, protocolos e requerimentos</h2>
        </div>
        <div class="button-row">
          <a class="ghost-button" href="/modelos">Biblioteca de modelos</a>
          ${canEdit ? `<a class="primary-button" href="/documentos/novo">Novo documento</a>` : ""}
        </div>
      </div>
      <form class="filter-grid compact" method="get" action="/documentos">
        ${filterField("Busca", "q", filters.q, "Numero, pedido ou secretaria")}
        ${filterField("Secretaria", "department", filters.department)}
        ${selectField("Tipo", "type", filters.type, [
          "Oficio",
          "Indicacao",
          "Requerimento",
          "Mocao",
          "Projeto de Lei",
          "Emenda",
          "Representacao",
          "Relatorio de Viagem",
          "Requisicao Administrativa",
          "Outro",
        ], true)}
        ${selectField("Status", "status", filters.status, [
          "Rascunho",
          "Protocolado",
          "Aguardando resposta",
          "Respondido",
          "Encaminhado ao municipe",
          "Concluido",
          "Arquivado",
        ], true)}
        <div class="form-actions">
          <button class="primary-button" type="submit">Filtrar</button>
          <a class="ghost-button" href="/documentos">Limpar</a>
        </div>
      </form>
    </section>

    <section class="card-shell no-padding">
      ${
        documents.length
          ? `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Nº interno</th>
                    <th>Modelo</th>
                    <th>Nº Camara</th>
                    <th>Status</th>
                    <th>Secretaria</th>
                    <th>Prazo</th>
                    <th>Pedido</th>
                    <th>Vinculo</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  ${documents
                    .map(
                      (document) => `
                        <tr>
                          <td>${escapeHtml(document.type)}</td>
                          <td><strong>${escapeHtml(document.internal_number)}</strong></td>
                          <td>${escapeHtml(joinNonEmpty([document.template_title, document.template_variant_name], " • ") || "-")}</td>
                          <td>${escapeHtml(document.chamber_number || "-")}</td>
                          <td>${statusBadge(document.status)}</td>
                          <td>${escapeHtml(document.department || "-")}</td>
                          <td>${formatDate(document.legal_due_date)}</td>
                          <td>${escapeHtml(document.demand || "-")}</td>
                          <td>${document.ticket_number ? `<a href="/atendimentos/${document.ticket_id}">${escapeHtml(document.ticket_number)}</a>` : "-"}</td>
                          <td>
                            <div class="table-actions">
                              <a href="/documentos/${document.id}">Ver</a>
                              ${canEdit ? `<a href="/documentos/${document.id}/duplicar">Duplicar</a>` : ""}
                              ${canEdit ? `<a href="/documentos/${document.id}/editar">Editar</a>` : ""}
                            </div>
                          </td>
                        </tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
          : emptyState("Nenhum documento encontrado", "Crie ofícios, protocolos e requerimentos vinculados aos atendimentos.")
      }
    </section>
  `;
}

export function documentFormPage({
  document = {},
  tickets = [],
  signatures = [],
  template = null,
  routingSuggestion = "",
  error = "",
  isEdit = false,
}) {
  const action = isEdit ? `/documentos/${document.id}/editar` : "/documentos/novo";
  const title = isEdit ? "Editar documento" : "Novo documento";
  const placeholders = Array.isArray(document.template_placeholders)
    ? document.template_placeholders
    : [];
  return `
    <form class="content-grid single" method="post" action="${action}">
      ${error ? `<div class="inline-alert error">${escapeHtml(error)}</div>` : ""}
      ${
        template
          ? `
            <div class="card-shell highlight-card">
              <div class="section-head wrap">
                <div>
                  <span class="eyebrow">Modelo aplicado</span>
                  <h2>${escapeHtml(template.title)} • ${escapeHtml(template.variant_name)}</h2>
                </div>
                <div class="button-row">
                  <span class="tiny-badge tone-blue">${escapeHtml(template.type)}</span>
                  <a class="ghost-button" href="/modelos${document.ticket_id ? `?ticket_id=${document.ticket_id}` : ""}">Trocar modelo</a>
                </div>
              </div>
              <div class="info-stack compact">
                <div><strong>Tema:</strong> ${escapeHtml(template.topic)}</div>
                <div><strong>Secretaria sugerida:</strong> ${escapeHtml(template.recommended_department || "Nao definida")}</div>
                <div><strong>Fluxo recomendado:</strong> ${escapeHtml(template.via_strategy || "Sem observacao")}</div>
              </div>
              ${
                placeholders.length
                  ? `<div class="token-wrap top-gap">
                      ${placeholders
                        .map((item) => `<span class="tiny-badge tone-slate">${escapeHtml(item.replaceAll("_", " "))}</span>`)
                        .join("")}
                    </div>`
                  : ""
              }
            </div>
          `
          : ""
      }
      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Documento</span>
            <h2>${title}</h2>
          </div>
        </div>
        <div class="form-grid">
          <input type="hidden" name="template_id" value="${escapeHtml(document.template_id || "")}" />
          ${selectField("Tipo", "type", document.type, [
            "Oficio",
            "Indicacao",
            "Requerimento",
            "Mocao",
            "Projeto de Lei",
            "Emenda",
            "Representacao",
            "Relatorio de Viagem",
            "Requisicao Administrativa",
            "Outro",
          ])}
          ${inputField("Numero interno", "internal_number", document.internal_number)}
          ${inputField("Numero da Camara", "chamber_number", document.chamber_number)}
          ${inputField("Data do protocolo", "protocol_date", toInputDate(document.protocol_date), "", "date")}
          ${inputField("Secretaria / orgao", "department", document.department)}
          ${inputField("Destinatario", "addressed_to", document.addressed_to, "Secretario(a), orgao ou autoridade")}
          ${inputField("Assunto", "subject_line", document.subject_line, "Assunto principal do documento")}
          ${inputField("Prazo legal", "legal_due_date", toInputDate(document.legal_due_date), "", "date")}
          ${selectField("Status", "status", document.status, [
            "Rascunho",
            "Protocolado",
            "Aguardando resposta",
            "Respondido",
            "Encaminhado ao municipe",
            "Concluido",
            "Arquivado",
          ])}
          ${selectField("Atendimento vinculado", "ticket_id", document.ticket_id, [
            { value: "", label: "Sem vinculo" },
            ...tickets.map((ticket) => ({
              value: ticket.id,
              label: `${ticket.number} • ${ticket.demand_title}`,
            })),
          ])}
          ${selectField("Assinatura pronta", "signature_profile_id", document.signature_profile_id, [
            { value: "", label: "Sem assinatura definida" },
            ...signatures.map((signature) => ({
              value: signature.id,
              label: `${signature.label} • ${signature.signatory_name}`,
            })),
          ])}
          ${inputField("Pedido vinculado", "demand", document.demand)}
          ${inputField("Link de anexo", "attachment_url", document.attachment_url, "https://...")}
          ${textareaField("Encaminhamento sugerido", "routing_hint", document.routing_hint || routingSuggestion, true)}
          ${textareaField("Resumo da solicitacao", "summary_request", document.summary_request, true)}
          ${textareaField("Resumo da resposta", "summary_response", document.summary_response, true)}
          ${textareaField("Corpo do documento", "generated_text", document.generated_text, true)}
          ${textareaField("Orientacao / andamento", "progress_note", document.progress_note, true)}
          ${inputField("Resultado", "result", document.result)}
          ${inputField("Proxima acao", "next_action", document.next_action)}
          ${inputField("Data da proxima acao", "next_action_date", toInputDate(document.next_action_date), "", "date")}
          ${textareaField("Observacoes", "notes", document.notes, true)}
        </div>
      </div>
      <div class="form-actions">
        <button class="primary-button" type="submit">Salvar documento</button>
        <a class="ghost-button" href="/documentos">Cancelar</a>
      </div>
    </form>
  `;
}

export function documentDetailPage({ document }) {
  const signatureBlock = [document.closing_text, document.signatory_name, document.signatory_role, document.footer_text]
    .filter(Boolean)
    .join("\n\n");

  return `
    <section class="detail-hero">
      <div>
        <span class="eyebrow">${escapeHtml(document.type)}</span>
        <h2>${escapeHtml(document.internal_number)}</h2>
        <p>${escapeHtml(document.subject_line || document.demand || "Documento oficial do gabinete")}</p>
      </div>
      <div class="button-row">
        ${statusBadge(document.status)}
        <a class="ghost-button" href="/documentos/${document.id}/editar">Editar</a>
        <a class="ghost-button" href="/documentos/${document.id}/duplicar">Duplicar</a>
        <a class="ghost-button" href="/modelos${document.ticket_id ? `?ticket_id=${document.ticket_id}` : ""}">Modelos</a>
        ${document.ticket_id ? `<a class="primary-button" href="/atendimentos/${document.ticket_id}">Abrir atendimento</a>` : ""}
      </div>
    </section>
    <section class="content-grid">
      <div class="card-shell details-grid">
        ${detailCard("Controle", [
          ["Tipo", document.type],
          ["Numero interno", document.internal_number],
          ["Modelo base", joinNonEmpty([document.template_title, document.template_variant_name], " • ")],
          ["Numero da Camara", document.chamber_number],
          ["Status", document.status],
          ["Data do protocolo", formatDate(document.protocol_date)],
          ["Prazo legal", formatDate(document.legal_due_date)],
        ])}
        ${detailCard("Orgao e pedido", [
          ["Secretaria / orgao", document.department],
          ["Destinatario", document.addressed_to],
          ["Assunto", document.subject_line],
          ["Pedido", document.demand],
          ["Atendimento vinculado", document.ticket_number],
          ["Proxima acao", document.next_action],
          ["Data da proxima acao", formatDate(document.next_action_date)],
          ["Resultado", document.result],
        ])}
        ${detailCard("Conteudo", [
          ["Encaminhamento sugerido", document.routing_hint],
          ["Resumo da solicitacao", document.summary_request],
          ["Resumo da resposta", document.summary_response],
          ["Andamento", document.progress_note],
          ["Observacoes", document.notes],
          ["Anexo", document.attachment_url],
        ])}
      </div>
      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Texto final</span>
            <h2>Corpo do documento</h2>
          </div>
        </div>
        <pre class="document-preview">${escapeHtml(
          [document.generated_text, signatureBlock].filter(Boolean).join("\n\n"),
        )}</pre>
      </div>
    </section>
  `;
}

export function projectsPage({ projects, filters, canEdit }) {
  return `
    <section class="card-shell">
      <div class="section-head wrap">
        <div>
          <span class="eyebrow">Ideias legislativas</span>
          <h2>Projetos, pesquisas e links uteis</h2>
        </div>
        ${canEdit ? `<a class="primary-button" href="/projetos/novo">Novo projeto</a>` : ""}
      </div>
      <form class="filter-grid compact" method="get" action="/projetos">
        ${filterField("Busca", "q", filters.q, "Titulo, categoria ou descricao")}
        ${filterField("Categoria", "category", filters.category)}
        ${selectField("Status", "status", filters.status, [
          "Ideia",
          "Pesquisa",
          "Em redacao",
          "Revisao",
          "Protocolado",
          "Arquivado",
        ], true)}
        <div class="form-actions">
          <button class="primary-button" type="submit">Filtrar</button>
          <a class="ghost-button" href="/projetos">Limpar</a>
        </div>
      </form>
    </section>

    <section class="content-grid">
      ${
        projects.length
          ? projects
              .map(
                (project) => `
                  <article class="card-shell project-card">
                    <div class="section-head">
                      <div>
                        <span class="eyebrow">${escapeHtml(project.category || "Projeto")}</span>
                        <h2>${escapeHtml(project.title)}</h2>
                      </div>
                      ${statusBadge(project.status)}
                    </div>
                    <p>${escapeHtml(project.description || "Sem descricao")}</p>
                    <div class="token-wrap">
                      <span class="tiny-badge tone-blue">${escapeHtml(project.responsible_name || "Sem responsavel")}</span>
                      <span class="tiny-badge tone-slate">${formatDateTime(project.updated_at)}</span>
                    </div>
                    <div class="button-row">
                      ${canEdit ? `<a class="ghost-button" href="/projetos/${project.id}/editar">Editar</a>` : ""}
                      ${project.external_link ? `<a class="primary-button" href="${escapeHtml(project.external_link)}" target="_blank" rel="noreferrer">Abrir link</a>` : ""}
                    </div>
                  </article>
                `,
              )
              .join("")
          : emptyState("Nenhum projeto cadastrado", "Registre ideias, pesquisas e pautas legislativas para organizar a producao do gabinete.")
      }
    </section>
  `;
}

export function projectFormPage({ project = {}, users = [], error = "", isEdit = false }) {
  const action = isEdit ? `/projetos/${project.id}/editar` : "/projetos/novo";
  return `
    <form class="content-grid single" method="post" action="${action}">
      ${error ? `<div class="inline-alert error">${escapeHtml(error)}</div>` : ""}
      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Projeto</span>
            <h2>${isEdit ? "Editar projeto" : "Novo projeto"}</h2>
          </div>
        </div>
        <div class="form-grid">
          ${inputField("Titulo", "title", project.title)}
          ${inputField("Categoria", "category", project.category)}
          ${selectField("Responsavel", "responsible_id", project.responsible_id, users.map((user) => ({
            value: user.id,
            label: user.name,
          })))}
          ${selectField("Status", "status", project.status, [
            "Ideia",
            "Pesquisa",
            "Em redacao",
            "Revisao",
            "Protocolado",
            "Arquivado",
          ])}
          ${inputField("Link externo", "external_link", project.external_link, "https://...")}
          ${textareaField("Descricao", "description", project.description, true)}
          ${textareaField("Observacoes", "notes", project.notes, true)}
        </div>
      </div>
      <div class="form-actions">
        <button class="primary-button" type="submit">Salvar projeto</button>
        <a class="ghost-button" href="/projetos">Cancelar</a>
      </div>
    </form>
  `;
}

export function tasksPage({ tasks, filters, users, counts, canEdit }) {
  return `
    <section class="stats-grid compact-stats">
      ${statCard("Hoje", counts.today, "Eventos", counts.today)}
      ${statCard("Proximos 7 dias", counts.next7, "Agenda", counts.next7)}
      ${statCard("Atrasadas", counts.overdue, "Atencao", counts.overdue)}
      ${statCard("Concluidas", counts.done, "Historico", counts.done)}
    </section>

    <section class="card-shell">
      <div class="section-head wrap">
        <div>
          <span class="eyebrow">Agenda interna</span>
          <h2>Tarefas e proximas acoes</h2>
        </div>
        ${canEdit ? `<a class="primary-button" href="/agenda/novo">Nova tarefa</a>` : ""}
      </div>
      <form class="filter-grid compact" method="get" action="/agenda">
        ${filterField("Busca", "q", filters.q, "Titulo ou descricao")}
        ${selectField("Responsavel", "responsible_id", filters.responsible_id, users.map((user) => ({
          value: user.id,
          label: user.name,
        })), true)}
        ${selectField("Status", "status", filters.status, [
          "Pendente",
          "Em andamento",
          "Concluida",
          "Cancelada",
        ], true)}
        ${selectField("Visao", "scope", filters.scope, [
          { value: "all", label: "Lista" },
          { value: "today", label: "Hoje" },
          { value: "next7", label: "Proximos 7 dias" },
          { value: "overdue", label: "Atrasadas" },
        ])}
        <div class="form-actions">
          <button class="primary-button" type="submit">Filtrar</button>
          <a class="ghost-button" href="/agenda">Limpar</a>
        </div>
      </form>
    </section>

    <section class="card-shell no-padding">
      ${
        tasks.length
          ? `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Titulo</th>
                    <th>Responsavel</th>
                    <th>Vinculos</th>
                    <th>Data e hora</th>
                    <th>Prioridade</th>
                    <th>Status</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  ${tasks
                    .map(
                      (task) => `
                        <tr>
                          <td>
                            <strong>${escapeHtml(task.title)}</strong>
                            <span class="muted-line">${escapeHtml(task.description || "Sem descricao")}</span>
                          </td>
                          <td>${escapeHtml(task.responsible_name || "Sem responsavel")}</td>
                          <td>${escapeHtml(renderTaskLinks(task))}</td>
                          <td>${formatDateTime(task.due_at)}</td>
                          <td>${priorityBadge(task.priority)}</td>
                          <td>${statusBadge(task.status)}</td>
                          <td>
                            <div class="table-actions">
                              ${canEdit ? `<a href="/agenda/${task.id}/editar">Editar</a>` : ""}
                            </div>
                          </td>
                        </tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
          : emptyState("Agenda vazia", "Cadastre tarefas ligadas a atendimentos, contatos, documentos e projetos.")
      }
    </section>
  `;
}

export function taskFormPage({
  task = {},
  users = [],
  tickets = [],
  contacts = [],
  documents = [],
  projects = [],
  error = "",
  isEdit = false,
}) {
  const action = isEdit ? `/agenda/${task.id}/editar` : "/agenda/novo";
  return `
    <form class="content-grid single" method="post" action="${action}">
      ${error ? `<div class="inline-alert error">${escapeHtml(error)}</div>` : ""}
      <div class="card-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">Agenda</span>
            <h2>${isEdit ? "Editar tarefa" : "Nova tarefa"}</h2>
          </div>
        </div>
        <div class="form-grid">
          ${inputField("Titulo", "title", task.title)}
          ${selectField("Responsavel", "responsible_id", task.responsible_id, users.map((user) => ({
            value: user.id,
            label: user.name,
          })))}
          ${inputField("Data e hora", "due_at", task.due_at ? String(task.due_at).slice(0, 16) : "", "", "datetime-local")}
          ${selectField("Prioridade", "priority", task.priority, ["Baixa", "Normal", "Alta", "Urgente"])}
          ${selectField("Status", "status", task.status, ["Pendente", "Em andamento", "Concluida", "Cancelada"])}
          ${selectField("Atendimento", "ticket_id", task.ticket_id, [{ value: "", label: "Nenhum" }, ...tickets.map((ticket) => ({
            value: ticket.id,
            label: `${ticket.number} • ${ticket.demand_title}`,
          }))])}
          ${selectField("Contato", "contact_id", task.contact_id, [{ value: "", label: "Nenhum" }, ...contacts.map((contact) => ({
            value: contact.id,
            label: contact.name,
          }))])}
          ${selectField("Documento", "document_id", task.document_id, [{ value: "", label: "Nenhum" }, ...documents.map((document) => ({
            value: document.id,
            label: `${document.internal_number} • ${document.type}`,
          }))])}
          ${selectField("Projeto", "project_id", task.project_id, [{ value: "", label: "Nenhum" }, ...projects.map((project) => ({
            value: project.id,
            label: project.title,
          }))])}
          ${textareaField("Descricao", "description", task.description, true)}
        </div>
      </div>
      <div class="form-actions">
        <button class="primary-button" type="submit">Salvar tarefa</button>
        <a class="ghost-button" href="/agenda">Cancelar</a>
      </div>
    </form>
  `;
}

export function reportsPage({ stats, statusChart, categoryChart, neighborhoodChart, assigneeChart, documentsChart, exportBase }) {
  return `
    <section class="stats-grid">
      ${statCard("Atendimentos no periodo", stats.total_tickets, "Base", stats.total_tickets)}
      ${statCard("Pendentes", stats.pending_tickets, "Fila", stats.pending_tickets)}
      ${statCard("Finalizados", stats.closed_tickets, "Resolvidos", stats.closed_tickets)}
      ${statCard("Tempo medio", `${stats.avg_resolution_days} dias`, "Resolucao", stats.avg_resolution_days)}
    </section>
    <section class="card-shell">
      <div class="section-head wrap">
        <div>
          <span class="eyebrow">Exportacao</span>
          <h2>Relatorios executivos</h2>
        </div>
        <div class="button-row">
          <a class="ghost-button" href="${exportBase}/tickets.csv">Exportar atendimentos CSV</a>
          <a class="ghost-button" href="${exportBase}/documents.csv">Exportar documentos CSV</a>
          <a class="ghost-button" href="${exportBase}/tasks.csv">Exportar agenda CSV</a>
        </div>
      </div>
    </section>
    <section class="content-grid">
      <div class="card-shell"><div class="section-head"><div><span class="eyebrow">Status</span><h2>Atendimentos por status</h2></div></div>${barChart(statusChart)}</div>
      <div class="card-shell"><div class="section-head"><div><span class="eyebrow">Categorias</span><h2>Atendimentos por categoria</h2></div></div>${barChart(categoryChart)}</div>
      <div class="card-shell"><div class="section-head"><div><span class="eyebrow">Bairros</span><h2>Demandas por bairro</h2></div></div>${barChart(neighborhoodChart)}</div>
      <div class="card-shell"><div class="section-head"><div><span class="eyebrow">Equipe</span><h2>Produtividade por atendente</h2></div></div>${barChart(assigneeChart)}</div>
      <div class="card-shell"><div class="section-head"><div><span class="eyebrow">Documentos</span><h2>Ofícios, protocolos e requerimentos por status</h2></div></div>${barChart(documentsChart)}</div>
    </section>
  `;
}

export function notificationsPage({ notifications }) {
  return `
    <section class="card-shell">
      <div class="section-head">
        <div>
          <span class="eyebrow">Central de notificacoes</span>
          <h2>Alertas operacionais do gabinete</h2>
        </div>
      </div>
      ${
        notifications.length
          ? `<div class="stack-list">
              ${notifications
                .map(
                  (notification) => `
                    <div class="list-row static notification-row ${notification.is_read ? "read" : "unread"}">
                      <div>
                        <strong>${escapeHtml(notification.title)}</strong>
                        <span>${escapeHtml(notification.message)}</span>
                      </div>
                      <div class="row-meta">
                        <span class="tiny-badge tone-${notification.is_read ? "slate" : "amber"}">${notification.kind}</span>
                        <span>${formatDateTime(notification.created_at)}</span>
                        ${
                          notification.is_read
                            ? ""
                            : `<form method="post" action="/notificacoes/${notification.id}/read"><button class="ghost-button" type="submit">Marcar lida</button></form>`
                        }
                      </div>
                    </div>
                  `,
                )
                .join("")}
            </div>`
          : emptyState("Sem notificacoes", "Nenhum alerta pendente no momento.")
      }
    </section>
  `;
}

export function auditPage({ entries }) {
  return `
    <section class="card-shell no-padding">
      ${
        entries.length
          ? `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Usuario</th>
                    <th>Acao</th>
                    <th>Entidade</th>
                    <th>ID</th>
                    <th>Resumo</th>
                  </tr>
                </thead>
                <tbody>
                  ${entries
                    .map(
                      (entry) => `
                        <tr>
                          <td>${formatDateTime(entry.created_at)}</td>
                          <td>${escapeHtml(entry.user_name || "Sistema")}</td>
                          <td>${escapeHtml(entry.action)}</td>
                          <td>${escapeHtml(entry.entity_type)}</td>
                          <td>${escapeHtml(String(entry.entity_id || "-"))}</td>
                          <td><span class="muted-line">${escapeHtml(entry.new_data || entry.previous_data || "")}</span></td>
                        </tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
          : emptyState("Sem auditoria", "Nenhuma acao registrada ainda.")
      }
    </section>
  `;
}

export function importsPage({ imports, preview = null }) {
  return `
    <section class="card-shell">
      <div class="section-head wrap">
        <div>
          <span class="eyebrow">Importacao de planilha</span>
          <h2>Migrar CSV ou XLSX</h2>
        </div>
      </div>
      <form class="upload-form" method="post" action="/importacoes/preview" enctype="multipart/form-data">
        <label class="field">
          <span>Arquivo CSV ou XLSX</span>
          <input type="file" name="spreadsheet" accept=".csv,.xlsx" required />
        </label>
        <button class="primary-button" type="submit">Gerar pre-visualizacao</button>
      </form>
    </section>

    ${
      preview
        ? `
          <section class="card-shell">
            <div class="section-head">
              <div>
                <span class="eyebrow">Preview</span>
                <h2>${escapeHtml(preview.import.source_name)}</h2>
              </div>
            </div>
            <form class="content-grid single" method="post" action="/importacoes/confirm">
              <input type="hidden" name="import_id" value="${preview.import.id}" />
              <div class="mapping-grid">
                ${preview.fields
                  .map(
                    (field) => `
                      <label class="field">
                        <span>${escapeHtml(field.label)}</span>
                        <select name="map_${field.name}">
                          <option value="">Ignorar</option>
                          ${preview.columns
                            .map(
                              (column) => `
                                <option value="${escapeHtml(column)}" ${
                                  preview.mapping[field.name] === column ? "selected" : ""
                                }>${escapeHtml(column)}</option>
                              `,
                            )
                            .join("")}
                        </select>
                      </label>
                    `,
                  )
                  .join("")}
              </div>
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      ${preview.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}
                    </tr>
                  </thead>
                  <tbody>
                    ${preview.rows
                      .map(
                        (row) => `
                          <tr>
                            ${preview.columns.map((column) => `<td>${escapeHtml(row[column] || "")}</td>`).join("")}
                          </tr>
                        `,
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
              <div class="form-actions">
                <button class="primary-button" type="submit">Confirmar importacao</button>
                <a class="ghost-button" href="/importacoes">Cancelar</a>
              </div>
            </form>
          </section>
        `
        : ""
    }

    <section class="card-shell no-padding">
      ${
        imports.length
          ? `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Arquivo</th>
                    <th>Status</th>
                    <th>Linhas</th>
                    <th>Contatos</th>
                    <th>Atendimentos</th>
                    <th>Duplicados</th>
                    <th>Erros</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  ${imports
                    .map(
                      (item) => `
                        <tr>
                          <td>${escapeHtml(item.source_name)}</td>
                          <td>${statusBadge(item.status)}</td>
                          <td>${item.total_rows}</td>
                          <td>${item.imported_contacts}</td>
                          <td>${item.imported_tickets}</td>
                          <td>${item.duplicates_count}</td>
                          <td>${item.errors_count}</td>
                          <td>${formatDateTime(item.created_at)}</td>
                        </tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
          : emptyState("Nenhuma importacao executada", "Use o envio de arquivo acima para migrar sua planilha antiga.")
      }
    </section>
  `;
}

function renderTicketsTable(tickets, canEdit) {
  return `
    <section class="card-shell no-padding">
      ${
        tickets.length
          ? `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Nº</th>
                    <th>Abertura</th>
                    <th>Canal</th>
                    <th>Status</th>
                    <th>Municipe</th>
                    <th>Telefone</th>
                    <th>Pedido</th>
                    <th>Bairro</th>
                    <th>Cidade</th>
                    <th>Atendente</th>
                    <th>Ultima atualizacao</th>
                    <th>Fechamento</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  ${tickets
                    .map(
                      (ticket) => `
                        <tr>
                          <td><strong>${escapeHtml(ticket.number)}</strong></td>
                          <td>${formatDate(ticket.opened_at)}</td>
                          <td>${escapeHtml(ticket.channel)}</td>
                          <td>${statusBadge(ticket.status)}</td>
                          <td>${escapeHtml(ticket.contact_name)}</td>
                          <td>${escapeHtml(formatPhone(ticket.contact_phone))}</td>
                          <td>${escapeHtml(ticket.demand_title)}</td>
                          <td>${escapeHtml(ticket.contact_neighborhood || "—")}</td>
                          <td>${escapeHtml(ticket.contact_city || "—")}</td>
                          <td>${escapeHtml(ticket.assigned_user_name || "Sem responsavel")}</td>
                          <td>${formatDateTime(ticket.updated_at)}</td>
                          <td>${formatDate(ticket.closed_at)}</td>
                          <td>
                            <div class="table-actions">
                              <a href="/atendimentos/${ticket.id}">Ver</a>
                              ${canEdit ? `<a href="/atendimentos/${ticket.id}/editar">Editar</a>` : ""}
                              ${
                                ticket.contact_whatsapp || ticket.contact_phone
                                  ? `<a href="${buildWhatsAppLink(
                                      ticket.contact_whatsapp || ticket.contact_phone,
                                    )}" target="_blank" rel="noreferrer">WhatsApp</a>`
                                  : ""
                              }
                            </div>
                          </td>
                        </tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
          : emptyState("Nenhum atendimento encontrado", "Ajuste os filtros ou crie um novo atendimento.")
      }
    </section>
  `;
}

function renderTicketsKanban(tickets, statuses) {
  const groups = statuses.map((status) => ({
    status: status.name,
    tickets: tickets.filter((ticket) => ticket.status === status.name),
  }));

  return `
    <section class="kanban-board">
      ${groups
        .map(
          (group) => `
            <div class="kanban-column">
              <div class="kanban-head">
                <strong>${escapeHtml(group.status)}</strong>
                <span>${group.tickets.length}</span>
              </div>
              <div class="kanban-cards">
                ${
                  group.tickets.length
                    ? group.tickets
                        .map(
                          (ticket) => `
                            <a class="kanban-card" href="/atendimentos/${ticket.id}">
                              <div class="kanban-meta">
                                ${priorityBadge(ticket.priority)}
                                <span>${escapeHtml(ticket.number)}</span>
                              </div>
                              <strong>${escapeHtml(ticket.demand_title)}</strong>
                              <p>${escapeHtml(ticket.contact_name)}</p>
                              <div class="kanban-foot">
                                <span>${escapeHtml(ticket.assigned_user_name || "Sem responsavel")}</span>
                                <span>${formatDate(ticket.next_action_date)}</span>
                              </div>
                            </a>
                          `,
                        )
                        .join("")
                    : emptyState("Coluna vazia", "Sem atendimentos neste status.")
                }
              </div>
            </div>
          `,
        )
        .join("")}
    </section>
  `;
}

function statCard(title, value, label, meta) {
  return `
    <article class="stat-card">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <div class="stat-foot">
        <small>${escapeHtml(label)}</small>
        <span>${escapeHtml(String(meta))}</span>
      </div>
    </article>
  `;
}

function barChart(items) {
  if (!items.length) {
    return emptyState("Sem dados", "Cadastre mais registros para visualizar indicadores.");
  }

  const max = Math.max(...items.map((item) => item.total), 1);
  return `
    <div class="bar-chart">
      ${items
        .map(
          (item) => `
            <div class="bar-row">
              <div class="bar-label">
                <strong>${escapeHtml(item.label)}</strong>
                <span>${item.total}</span>
              </div>
              <div class="bar-track">
                <span class="bar-fill" style="width:${Math.max(
                  8,
                  Math.round((item.total / max) * 100),
                )}%"></span>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function listCard(title, items) {
  return `
    <div class="card-shell">
      <div class="section-head">
        <div>
          <span class="eyebrow">Visao rapida</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
      </div>
      <div class="stack-list">${items.join("")}</div>
    </div>
  `;
}

function detailCard(title, rows) {
  return `
    <article class="detail-card">
      <h3>${escapeHtml(title)}</h3>
      <dl>
        ${rows
          .map(
            ([label, value]) => `
              <div>
                <dt>${escapeHtml(label)}</dt>
                <dd>${escapeHtml(value || "Nao informado")}</dd>
              </div>
            `,
          )
          .join("")}
      </dl>
    </article>
  `;
}

function simpleInfo(label, value) {
  return `
    <div class="info-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "Nao informado")}</strong>
    </div>
  `;
}

function stepCard(step, title, description, status) {
  return `
    <article class="step-card">
      <span class="eyebrow">${escapeHtml(step)}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      <span class="tiny-badge tone-green">${escapeHtml(status)}</span>
    </article>
  `;
}

function inputField(label, name, value = "", placeholder = "", type = "text") {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input
        type="${escapeHtml(type)}"
        name="${escapeHtml(name)}"
        value="${escapeHtml(value ?? "")}"
        placeholder="${escapeHtml(placeholder)}"
      />
    </label>
  `;
}

function textareaField(label, name, value = "", span2 = false) {
  return `
    <label class="field ${span2 ? "span-2" : ""}">
      <span>${escapeHtml(label)}</span>
      <textarea name="${escapeHtml(name)}" rows="5">${escapeHtml(value ?? "")}</textarea>
    </label>
  `;
}

function selectField(label, name, selectedValue, options = [], allowBlank = false) {
  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );

  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(name)}">
        ${allowBlank ? `<option value="">Todos</option>` : ""}
        ${normalizedOptions
          .map(
            (option) => `
              <option value="${escapeHtml(option.value)}" ${
                String(option.value ?? "") === String(selectedValue ?? "") ? "selected" : ""
              }>
                ${escapeHtml(option.label)}
              </option>
            `,
          )
          .join("")}
      </select>
    </label>
  `;
}

function filterField(label, name, value = "", placeholder = "") {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input
        type="text"
        name="${escapeHtml(name)}"
        value="${escapeHtml(value ?? "")}"
        placeholder="${escapeHtml(placeholder)}"
      />
    </label>
  `;
}

function renderTags(tags) {
  const list = String(tags ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!list.length) return `<span class="muted-line">Sem etiquetas</span>`;
  return list
    .slice(0, 3)
    .map((tag) => `<span class="tiny-badge tone-slate">${escapeHtml(tag)}</span>`)
    .join("");
}

function emptyState(title, description) {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
}

function statusBadge(status) {
  return `<span class="tiny-badge tone-${statusTone(status)}">${escapeHtml(status)}</span>`;
}

function priorityBadge(priority) {
  return `<span class="tiny-badge tone-${priorityTone(priority)}">${escapeHtml(priority)}</span>`;
}

function buildWhatsAppLink(phone, message = "") {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}

function renderTaskLinks(task) {
  return [
    task.ticket_number ? `Atendimento ${task.ticket_number}` : "",
    task.contact_name ? `Contato ${task.contact_name}` : "",
    task.document_number ? `Documento ${task.document_number}` : "",
    task.project_title ? `Projeto ${task.project_title}` : "",
  ]
    .filter(Boolean)
    .join(" • ") || "Sem vinculo";
}
