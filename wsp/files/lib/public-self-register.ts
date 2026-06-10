export const PUBLIC_SELF_REGISTER_FIELD_KEYS = [
  "name",
  "whatsapp",
  "phone",
  "cpf_rg_cns",
  "birth_date",
  "email",
  "profession",
  "referred_by",
  "zip_code",
  "neighborhood",
  "address",
  "number",
  "complement",
  "city",
  "uf",
  "demand_title",
  "demand_category",
  "description",
  "attachment",
  "notes",
] as const;

export type PublicSelfRegisterFieldKey = (typeof PUBLIC_SELF_REGISTER_FIELD_KEYS)[number];
export type PublicSelfRegisterFieldMode = "hidden" | "optional" | "required";
export type PublicSelfRegisterConfirmationChannel = "none" | "email" | "whatsapp";
export type PublicSelfRegisterEmailValidation = "none" | "format";

export const PUBLIC_SELF_REGISTER_FIELD_OPTIONS: Array<{ value: PublicSelfRegisterFieldMode; label: string }> = [
  { value: "hidden", label: "Não pedir" },
  { value: "optional", label: "Opcional" },
  { value: "required", label: "Obrigatório" },
];

export const PUBLIC_SELF_REGISTER_CONFIRMATION_OPTIONS: Array<{
  value: PublicSelfRegisterConfirmationChannel;
  label: string;
  description: string;
}> = [
  { value: "none", label: "Nao enviar confirmacao", description: "Mostra protocolo na tela e pronto." },
  { value: "email", label: "Confirmar por e-mail", description: "Envia protocolo para o e-mail informado." },
  { value: "whatsapp", label: "Confirmar por WhatsApp", description: "Envia protocolo para o WhatsApp informado." },
];

const PUBLIC_SELF_REGISTER_FORCE_HIDDEN_FIELDS = new Set<PublicSelfRegisterFieldKey>([
  "cpf_rg_cns",
  "birth_date",
  "email",
  "profession",
  "referred_by",
  "demand_category",
  "attachment",
  "notes",
]);

export const PUBLIC_SELF_REGISTER_EMAIL_VALIDATION_OPTIONS: Array<{
  value: PublicSelfRegisterEmailValidation;
  label: string;
}> = [
  { value: "none", label: "Nao validar" },
  { value: "format", label: "Validar formato" },
];

export const PUBLIC_SELF_REGISTER_FIELD_LABELS: Record<PublicSelfRegisterFieldKey, string> = {
  name: "Nome",
  whatsapp: "WhatsApp",
  phone: "Telefone",
  cpf_rg_cns: "Documento",
  birth_date: "Data de nascimento",
  email: "E-mail",
  profession: "Profissao ou atividade",
  referred_by: "Quem indicou voce",
  zip_code: "CEP",
  neighborhood: "Bairro",
  address: "Rua",
  number: "Número",
  complement: "Complemento",
  city: "Cidade",
  uf: "UF",
  demand_title: "Assunto do pedido",
  demand_category: "Area principal",
  description: "Detalhes do pedido",
  attachment: "Anexo",
  notes: "Observacoes finais",
};

export const PUBLIC_SELF_REGISTER_FIELD_GROUPS: Array<{
  key: string;
  title: string;
  description: string;
  fields: PublicSelfRegisterFieldKey[];
}> = [
  {
    key: "contact",
    title: "Quem pede",
    description: "Nome e contato para retorno.",
    fields: ["name", "phone", "whatsapp"],
  },
  {
    key: "address",
    title: "Endereço do pedido",
    description: "Peça CEP e número quando o local ajudar.",
    fields: ["zip_code", "neighborhood", "address", "number", "complement", "city", "uf"],
  },
  {
    key: "demand",
    title: "Pedido",
    description: "O que a pessoa quer registrar.",
    fields: ["demand_title", "description"],
  },
];

export const PUBLIC_SELF_REGISTER_IDENTITY_FIELDS = new Set<PublicSelfRegisterFieldKey>([
  "name",
  "whatsapp",
  "phone",
  "cpf_rg_cns",
  "birth_date",
  "email",
  "profession",
  "referred_by",
]);

export const PUBLIC_SELF_REGISTER_ADDRESS_FIELDS = new Set<PublicSelfRegisterFieldKey>([
  "zip_code",
  "neighborhood",
  "address",
  "number",
  "complement",
  "city",
  "uf",
]);

export const PUBLIC_SELF_REGISTER_DEMAND_FIELDS = new Set<PublicSelfRegisterFieldKey>([
  "demand_title",
  "demand_category",
  "description",
  "attachment",
  "notes",
]);

export const DEFAULT_PUBLIC_SELF_REGISTER_CONFIG = {
  allow_anonymous: false,
  require_contact_channel: true,
  email_validation: "format" as PublicSelfRegisterEmailValidation,
  confirmation_channel: "none" as PublicSelfRegisterConfirmationChannel,
  fields: {
    name: "required",
    phone: "optional",
    whatsapp: "optional",
    cpf_rg_cns: "hidden",
    birth_date: "hidden",
    email: "hidden",
    profession: "hidden",
    referred_by: "hidden",
    zip_code: "optional",
    neighborhood: "optional",
    address: "optional",
    number: "optional",
    complement: "optional",
    city: "optional",
    uf: "optional",
    demand_title: "required",
    demand_category: "hidden",
    description: "optional",
    attachment: "hidden",
    notes: "hidden",
  } satisfies Record<PublicSelfRegisterFieldKey, PublicSelfRegisterFieldMode>,
};

export function normalizePublicSelfRegisterConfig(value: any) {
  const source = value && typeof value === "object" ? value : {};
  const fields = source.fields && typeof source.fields === "object" ? source.fields : {};

  return {
    allow_anonymous: false,
    require_contact_channel: source.require_contact_channel === undefined ? true : Boolean(source.require_contact_channel),
    email_validation: "format",
    confirmation_channel: "none",
    fields: Object.fromEntries(
      PUBLIC_SELF_REGISTER_FIELD_KEYS.map((key) => {
        const mode = fields[key];
        if (PUBLIC_SELF_REGISTER_FORCE_HIDDEN_FIELDS.has(key)) {
          return [key, "hidden"];
        }
        return [
          key,
          mode === "hidden" || mode === "required" || mode === "optional"
            ? mode
            : DEFAULT_PUBLIC_SELF_REGISTER_CONFIG.fields[key],
        ];
      }),
    ) as Record<PublicSelfRegisterFieldKey, PublicSelfRegisterFieldMode>,
  };
}

export function getPublicSelfRegisterFieldMode(config: any, field: PublicSelfRegisterFieldKey): PublicSelfRegisterFieldMode {
  return normalizePublicSelfRegisterConfig(config).fields[field];
}

export function isPublicSelfRegisterFieldVisible(config: any, field: PublicSelfRegisterFieldKey) {
  return getPublicSelfRegisterFieldMode(config, field) !== "hidden";
}

export function isPublicSelfRegisterFieldRequired(config: any, field: PublicSelfRegisterFieldKey) {
  return getPublicSelfRegisterFieldMode(config, field) === "required";
}
