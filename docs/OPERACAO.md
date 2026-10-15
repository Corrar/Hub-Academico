# Operação — notificações, antivírus, backups e privacidade

Guia para quem mantém a homologação (Render + Vercel) e, depois, a produção.
Comandos executados na pasta `backend`, com a venv ativa e `DATABASE_URL` do
ambiente. Segredos ficam nas variáveis protegidas da hospedagem, nunca no Git.

## Variáveis desta versão

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Para push | Chaves Web Push da instituição; `VAPID_SUBJECT` é `mailto:` ou `https://` de contato |
| `PUSH_DISPATCH_INTERVAL_SECONDS` | Não (0) | Laço interno de envio, de 15 a 3600 s; `render.yaml` usa 60 |
| `NOTIFICATION_DISPATCH_TOKEN` | Não | Token (≥ 32 caracteres) para disparo externo do envio |
| `EXPO_ACCESS_TOKEN` | Não | Somente se o futuro app Expo usar o modo seguro do serviço de push da Expo |
| `CLAMAV_HOST` / `CLAMAV_PORT` ou `CLAMAV_SOCKET` | Para dados reais | Antivírus `clamd`; com valor definido todo anexo é verificado |
| `CLAMAV_REQUIRED` | Recomendado em produção | `true` impede iniciar sem antivírus configurado |
| `PRIVACY_CONTACT` | Recomendado | Canal do encarregado de dados exibido no aviso de privacidade |
| `NOTIFICATION_RETENTION_DAYS` | Não (90) | Guarda do histórico de notificações enviadas (7 a 3650) |
| `ATTACHMENT_MAX_MB` | Não (4) | Tamanho máximo dos anexos (1 a 25; até 4 com o proxy da Vercel) |
| `ATTENDANCE_ABSENCE_LIMIT_PERCENT` | Não (25) | Limite de faltas por disciplina |

## Notificações push

O Hub envia Web Push diretamente aos serviços dos navegadores (Chrome/Android,
Firefox, Safari/iOS 16.4+ e Edge), sem conta em Google, Apple ou Mozilla.

1. Gere as chaves uma única vez: `python -m app.cli vapid-keys`.
2. Cadastre `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` como
   segredos do serviço do backend e reinicie. Trocar as chaves invalida as
   inscrições existentes: cada pessoa precisa ativar de novo.
3. No app, cada pessoa ativa em **Meu perfil → Notificações e aplicativo**.
   No iPhone é preciso antes instalar o app pela opção “Adicionar à Tela de Início”.

O que gera notificação: aviso, atividade, material ou evento quando fica
visível (inclusive agendados), nota ou reabertura de entrega, e lembrete 24 h
antes do prazo para quem ainda não entregou. Cada pessoa escolhe as categorias.
A tela bloqueada mostra só o título, sem nota, devolutiva ou conteúdo.

### Quando o envio acontece

- **Laço interno** (`PUSH_DISPATCH_INTERVAL_SECONDS`): suficiente quando o serviço
  fica ligado. No plano gratuito do Render a instância dorme sem tráfego; os envios
  pendentes saem quando ela acorda.
- **Disparo externo:** defina `NOTIFICATION_DISPATCH_TOKEN` no backend. No GitHub,
  crie a variável de repositório `NOTIFICATION_DISPATCH_URL` (origem do backend) e
  os segredos `NOTIFICATION_DISPATCH_TOKEN` e `STAGING_ACCESS_PASSWORD`; o workflow
  `.github/workflows/notifications.yml` passa a chamar o envio a cada 15 minutos.
  Sem a variável, o workflow não faz nada.
- **Comando:** `python -m app.cli dispatch-notifications [--loop 60]`, útil em um
  cron job da hospedagem.

Itens com falha temporária têm até cinco tentativas, com intervalo crescente.
Dispositivos recusados pelo serviço de push são removidos automaticamente.

## Aplicativo instalável (PWA)

O painel é instalável no Android, iOS e computadores. O service worker guarda
apenas os arquivos da interface para abrir sem conexão; respostas da API, que têm
dados pessoais, nunca entram no cache. Na Vercel, `sw.js` e o manifesto ficam na
raiz do projeto `frontend`; no Render, em `/panel/`. Publique o frontend e o
backend da mesma versão.

O app Expo continua possível: o backend já aceita tokens Expo
(`POST /api/v1/notifications/subscriptions` com `channel: "expo"`). A publicação nas
lojas depende de conta Expo e contas de desenvolvedor Google/Apple.

## Antivírus

Execute um `clamd` acessível somente pela rede privada do backend, por exemplo:

```bash
docker run -d --name clamav -p 127.0.0.1:3310:3310 clamav/clamav:stable
```

Defina `CLAMAV_HOST`/`CLAMAV_PORT` (ou `CLAMAV_SOCKET`) e `CLAMAV_REQUIRED=true`.
O ClamAV precisa de cerca de 2 GB de memória para as assinaturas; o plano gratuito
do Render não comporta. Arquivo infectado é recusado e registrado como
`attachment_blocked` na auditoria; antivírus fora do ar recusa o envio (503).

## Backups do PostgreSQL

```bash
python -m app.cli pg-backup hub-AAAA-MM-DD.dump
export RESTORE_URL=postgresql+psycopg://...banco_vazio_de_ensaio...
python -m app.cli pg-restore-check hub-AAAA-MM-DD.dump --target-env RESTORE_URL
```

O backup usa `pg_dump` (versão igual ou mais nova que a do servidor), cria o
arquivo com permissão 600 e confere sua listagem. O ensaio de restauração só
aceita um banco **vazio e diferente** do ativo, e verifica revisão do esquema,
contagens e a proteção da auditoria. Guarde os arquivos cifrados e fora do
provedor do banco; eles contêm dados pessoais. Ensaios periódicos de restauração
são parte do aceite de operação.

Para SQLite local continuam valendo `backup` e `restore-check`.

## Privacidade e retenção

- Cada pessoa baixa seus dados em **Meu perfil → Privacidade e meus dados**
  (`GET /api/v1/me/export`); a exportação é auditada.
- O aviso de privacidade aparece no login e no perfil; defina `PRIVACY_CONTACT`.
  O texto descreve o funcionamento do sistema e deve ser revisado pela instituição.
- O laço de notificações remove de hora em hora sessões vencidas, tentativas de
  login antigas, fluxos OIDC expirados, notificações antigas e dispositivos
  inválidos. Sem o laço, agende `python -m app.cli purge-expired`.
- Entregas, avaliações, frequência e auditoria **não** são apagadas
  automaticamente: seguem a tabela de temporalidade da instituição.

## Exportação para o diário oficial

Professores e coordenação baixam, na lista **Alunos e desempenho** da turma, a
frequência (P/F por aula) e as notas em CSV para planilhas. Os arquivos indicam
que não substituem o diário oficial, e cada exportação fica registrada na auditoria.
