# Roteiro de implementação — 08/09/2026

## Entrega 1: base acadêmica (esta branch)

API Python/FastAPI, modelos SQLAlchemy, primeira migração Alembic, contas locais
provisionadas, sessões revogáveis, permissões, cursos, disciplinas e ofertas,
vínculos temporais, arquivamento/restauração, auditoria, backup/restauração SQLite
e testes. O OpenAPI é a superfície executável para validar a API antes do painel.

Escolhas de implementação desta entrega: Python, SQLAlchemy e PostgreSQL como
alvo; SQLite para desenvolvimento. Expo e o painel web continuam conforme o
produto. Login local é uma ferramenta provisória de teste, não uma decisão
sobre autenticação institucional. Nenhum serviço foi contratado ou publicado.

## Próximas entregas

1. **Painel da coordenação conectado:** reconstruir as telas existentes, consumir
   estes cadastros; adicionar períodos/coortes, grade horária e matrícula em lote
   com prévia, erros por linha e prevenção de duplicidade.
2. **Identidade institucional:** registrar aplicação Microsoft/Entra com a
   instituição, validar emissor/audiência/tenant e identidade verificada, vincular
   conta a usuário aprovado e definir atribuição/revogação de papéis. Só verificar
   o domínio do e-mail não equivale a autenticar pela Microsoft.
3. **Professor → aluno:** atividade por ID, prazo do servidor, rascunho/publicação,
   upload privado, envio/reenvio de entrega, avaliação e devolutiva. Testar acesso
   cruzado a arquivo e entrega antes de incluir documentos reais.
4. **App Expo:** reproduzir o design, conectar os perfis, implementar calendário
   real, busca, materiais, estados vazios/erro/offline e média das atividades do hub.
5. **Avisos e eventos:** público-alvo, rascunho, publicação/agendamento, inscrição
   e limites de vagas; push com preferências, tentativas e deduplicação.
6. **Chamada e frequência:** confirmar a origem institucional e a regra por
   aula/hora-aula; implementar retificação auditada e visualização por disciplina.
7. **Piloto institucional:** configurar operação PostgreSQL, login institucional,
   observabilidade, limites de upload, armazenamento, retenção, rotina de backup
   com restauração testada e revisão de acessibilidade nas telas implementadas.

## Critério para concluir a próxima entrega

A coordenação consegue criar a estrutura e matricular um aluno pelo painel; o
professor associado e o aluno matriculado veem a mesma oferta; outra conta não
consegue consultá-la. A operação sobrevive ao reinício e aparece na auditoria.

## Observações verificadas no protótipo

O aluno ainda tem login simulado, upload fictício, detalhe de atividade único,
estado compartilhado entre entregas e datas fixas. Os arquivos de design não
foram convertidos nem corrigidos nesta etapa; são referência para reconstrução.
As telas novas referenciam runtime do editor, sem ser um projeto de app executável.
`docs/auditoria.html` é histórico; não deve ser usado como indicador atual de progresso.
