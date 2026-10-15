# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

Expo (React Native) para o app de aluno e professor — Android e iOS do mesmo código. Painel web separado para a coordenação, consumindo a mesma API. Escolhido pelo usuário. A branch de implementação inicia o back-end em Python/FastAPI e SQLAlchemy, com SQLite local e suporte a PostgreSQL. Alvo de publicação ainda não decidido.

## Users

Três papéis dentro da Fatec Adamantina (Centro Paula Souza, autarquia do Estado de São Paulo), todos com conta institucional `@fatec.sp.gov.br`:

- **Aluno** — consome grade, prazos, materiais, eventos e avisos; entrega trabalho. Usa no celular, no campus, em aula noturna (a grade do protótipo vai das 19:00 às 22:30), frequentemente em rede móvel.
- **Professor** — publica atividade e material nas próprias turmas, recebe entregas e avalia. Também móvel, entre aulas.
- **Coordenação** — semeia e mantém toda a estrutura acadêmica (cursos, termos, disciplinas, turmas, grade, matrículas), atribui papéis e publica eventos e avisos institucionais. Trabalho de cadastro em massa, em tela grande.

## Product Purpose

Substituir o Teams na rotina do estudante por algo mais intuitivo, e cobrir o que o Teams não cobre: central de avisos, horário e frequência.

O hub é a **origem** do dado, não um espelho: nada vem de sistema acadêmico externo. Um fato passa a existir quando alguém o cadastra aqui. Consequência direta: a coordenação precisa semear a base antes de qualquer aluno entrar, e perda de dado é definitiva.

Sucesso é o aluno abrir **um** app — e não o Teams mais três canais improvisados — e conseguir responder de relance: o que tenho hoje, o que vence amanhã, quanto posso faltar ainda.

## Positioning

O Teams / Office 365 do Centro Paula Souza é usado hoje, mas guarda **apenas atividades e material de aula**. Não existe central de avisos, não existe horário, não existe frequência — e mesmo o que existe está espalhado, porque cada professor organiza do seu jeito.

A diferença do hub tem duas frentes, e ele será julgado pelas duas:

- **Cobre o que não existe.** Avisos com público-alvo, grade da semana, calendário, eventos com inscrição, e frequência com origem real.
- **É mais intuitivo que o Teams.** O Teams é ferramenta corporativa adaptada ao ensino; o hub é desenhado para a rotina do estudante. Essa é a aposta central do produto — se o aluno não achar mais fácil, não há motivo para ele existir.

## Operating Context

- Aulas noturnas, uso no campus, entre aulas, no celular.
- Teams / Office 365 institucional em uso corrente hoje, restrito a atividades e material de aula.
- Sem canal combinado para o resto: varia por professor e por disciplina.
- A migração exige mudança de hábito do professor, que hoje publica no Teams. É risco de adoção, não detalhe técnico.
- Notificação push é o mecanismo pelo qual aviso e evento chegam ao aluno — não é refinamento, é o canal.

## Capabilities and Constraints

**Confirmado**

- Três papéis com escopos de escrita distintos. Aluno escreve só a própria entrega; professor escreve nas próprias turmas; coordenação escreve na instituição inteira.
- **O hub assume atividades e materiais desde o MVP.** Para o aluno, o Teams sai de cena. Isso mantém em escopo todo o fluxo de publicar atividade, receber entrega e avaliar.
- Professor lança **nota da atividade e devolutiva** dentro do hub.
- **Professor faz chamada no app.** É a origem da frequência: sem ela, o percentual exibido ao aluno não teria de onde vir. Consequências assumidas: uma tela de chamada por aula, mudança na rotina de toda aula, e o hub passando a guardar registro de presença — com o peso de contestação, retificação e retenção que isso traz.
- Média exibida ao aluno é **média das atividades avaliadas no hub**, e precisa ser rotulada assim. O hub não tem autoridade sobre boletim oficial e não deve apresentar nenhum número como tal.
- Aviso exige público-alvo obrigatório; sem recorte, todo aviso vira ruído e o aluno desliga a notificação.
- Sendo origem do dado: backup com restauração testada, exclusão reversível e trilha de auditoria imutável são requisitos, não boas práticas.
- Prazo de entrega e janela de "desfazer" verificados com o relógio do servidor.
- O app tem uma identidade visual única, **idêntica no Android e no iOS** — decisão do usuário. Futuro trabalho não deve ramificar o sistema visual por sistema operacional. As convenções nativas não-visuais (área segura, gesto de voltar, permissões, exigências de loja) continuam valendo nos dois.
- Sistema real para a Fatec Adamantina, não exercício acadêmico: LGPD e alinhamento com o Centro Paula Souza são restrições concretas. O hub coleta e guarda dado pessoal de aluno (nome, e-mail institucional, prontuário, entregas, avaliações, token de notificação), o que coloca responsabilidade de controlador sobre a instituição por meio deste sistema.

**Explicitamente em aberto**

- **Autenticação.** Microsoft Entra ID (OIDC com PKCE) solicitado pelo usuário e implementado no servidor. Registro do aplicativo, política MFA e ativação no tenant continuam pendentes.
- **Chamada em dois lugares.** Se o Centro Paula Souza mantém diário de classe próprio, o professor passaria a lançar presença duas vezes. Ninguém sustenta trabalho dobrado por muito tempo — e o lado abandonado costuma ser o novo. Precisa ser verificado com a coordenação antes de a chamada ser construída; é o maior risco de adoção do projeto.
- **Vínculo de professor com data de fim** (o desenho assume vigência com prazo). Se na prática o vínculo for aberto, o modelo muda.
- Alvo de publicação e operação do PostgreSQL. A base de desenvolvimento do back-end já foi iniciada; ver `backend/README.md`.
- Se existe integração possível com algum sistema do CPS no futuro.

## Brand Commitments

- Nome: **Fatec Adamantina**. Domínio institucional `@fatec.sp.gov.br`.
- Brasões oficiais já no bundle e de uso obrigatório: Centro Paula Souza e Governo do Estado de São Paulo (`fatec-adamantina-app/project/assets/logo-cps*.png`, `logo-sp*.png`, `logo-fatec.png`). São ativos institucionais — não podem ser redesenhados nem recolorizados.
- Idioma: português do Brasil.

## Evidence on Hand

**Existe**

- Bundle de design do Claude Design em `fatec-adamantina-app/project/` — 13 telas do aluno em `Fatec Adamantina App.dc.html` (914 linhas), com identidade visual já madura.
- Auditoria de completude, segurança e acessibilidade do bundle, com contrastes medidos e roteiro em 6 fases: https://claude.ai/code/artifact/491d2f30-6a60-49b1-a6a6-2ebb7063ea52
- 6 telas do professor: https://claude.ai/code/artifact/889f0178-25f4-4807-b8cf-c8d475a6e94c
- 8 telas do painel da coordenação: https://claude.ai/code/artifact/a86de22f-e4f0-456d-a0be-8f2d71b65d0b

**Não existe — não inventar**

- Há repositório Git e uma API de desenvolvimento em `backend/`. Há painel web conectado. Ainda não há aplicativo Expo nem serviço de produção publicado nesta execução.
- Nenhum dado institucional real: os nomes, turmas, notas e números nas telas são exemplo coerente, não dados da Fatec.
- Nenhuma entrevista com aluno, professor ou coordenação foi feita. O que se sabe do uso atual veio do próprio usuário.
- Nenhum acordo, aprovação ou compromisso formal do Centro Paula Souza foi registrado.
- Nenhuma API, exportação ou acesso a sistema acadêmico do CPS foi confirmado.

## Product Principles

1. **O dado nasce aqui, então nada pode se perder.** Toda escrita é reversível, atribuída e auditável. Exclusão é arquivamento.
2. **A coordenação vem primeiro.** Sem estrutura semeada, o app de aluno e o de professor abrem vazios. Nada que dependa de dado real pode ser construído antes do painel.
3. **Permissão é o modelo, não um detalhe.** Toda leitura e escrita valida vínculo no servidor. Tela escondida não é controle de acesso.
4. **Alcance amplo exige fricção deliberada.** Aviso institucional atinge todo mundo em segundos por push; ação de grande alcance mostra o alcance antes de confirmar.
5. **Mais fácil que o Teams, ou não vale nada.** O hub pede que aluno e professor troquem de ferramenta. Toda tela é julgada contra o que a pessoa já faz hoje no Teams: se dá o mesmo trabalho, ela volta. Consistência entre disciplinas e menos passos por tarefa são a vantagem inteira — não há segundo caminho para a mesma coisa.

## Accessibility & Inclusion

- Compromisso assumido: WCAG 2.1 nível AA. Os cinco contrastes reprovados do protótipo original já foram corrigidos nas telas novas (`#9aa2ab`, `#aab1b9` e `#c3c9cf` substituídos por `#5A6873` e `#6B7580`).
- Alvo de toque mínimo de 44px no app; no painel web, mínimo de 24px (WCAG 2.5.8).
- Todo elemento clicável é controle real, todo campo tem rótulo programático, foco de teclado sempre visível.
- Conteúdo em pt-BR com `lang` declarado — o protótipo original não declarava idioma e o leitor de tela lia português com fonética de inglês.
- Por ser sistema de autarquia estadual, o padrão de acessibilidade exigível precisa ser confirmado com o Centro Paula Souza; até lá, WCAG 2.1 AA é o piso adotado.

## Estado da implementação — 08/09/2026

Primeira entrega funcional: API de desenvolvimento com cadastros acadêmicos, contas locais, permissões por papel/vínculo, migrações, arquivamento reversível, auditoria e backup/restauração SQLite. Login local é provisório para testes e não substitui a decisão de autenticação institucional. Ver `docs/IMPLEMENTACAO.md` para o escopo concluído e o roteiro.

## Desenvolvedor/admin — decisão de 08/09/2026

Adicionar um console para o responsável técnico Bruno Roberto Corral, com papel
`platform_admin` separado da coordenação. Deve administrar contas, permissões,
configurações, sessões e operação do Hub por ações explícitas e auditadas.
Provisionamento controlado, identidade institucional verificada, MFA obrigatório
e reautenticação nas operações críticas; sem senha padrão ou bypass.
Atualização 09/09/2026: console e concessão administrativa implementados, com
provisionamento inicial explícito e login Microsoft. A conta real ainda depende
da identificação verificada e da configuração do tenant. Escopo e critérios de aceite
em `docs/IMPLEMENTACAO.md`.

## Revisão de 09/09/2026

Branch `melhoria/revisao-e-fluxos-academicos`: painel web acadêmico para os três
perfis, atividades/entregas/avaliações, materiais, avisos, eventos com inscrições,
grade e matrícula em lote. Anexos desta homologação são somente texto UTF-8
pequeno; PDF/Office, aplicativo Expo, push e chamada continuam pendentes.
Estado detalhado e condições externas em `docs/RELATORIO-REVISAO.md`.
Pentest remoto somente após confirmação explícita de que a homologação está na nuvem.
