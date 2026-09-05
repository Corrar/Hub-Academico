import { writeFileSync } from 'node:fs';

const HEAD = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"><\/script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; }
    a { color: #C8102E; text-decoration: none; }
    a:hover { color: #E11D2A; }
    .fx-scroll::-webkit-scrollbar { width: 0; height: 0; }
    button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2.5px solid #E11D2A; outline-offset: 2px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #f1f3f5; font-size: 13.5px; }
    thead th { font-size: 11px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: #5A6873; background: #fafbfc; border-bottom: 1.5px solid #e7eaee; }
    tbody tr:last-child td { border-bottom: none; }
  </style>
</helmet>

<div style="width:1280px;height:800px;background:#F4F5F7;font-family:'Plus Jakarta Sans',system-ui,sans-serif;display:flex;overflow:hidden;">

  <div style="width:248px;flex-shrink:0;background:#2E4756;display:flex;flex-direction:column;padding:24px 14px 18px;">
    <div style="padding:0 10px 22px;">
      <div style="font-size:20px;font-weight:800;letter-spacing:-.9px;color:#fff;line-height:.95;">Fatec</div>
      <div style="font-size:10px;font-weight:800;color:#ff8a94;">Adamantina</div>
      <span style="display:inline-block;margin-top:10px;font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#2E4756;background:#fff;padding:3px 9px;border-radius:6px;">Coordenação</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:2px;flex:1;">
      <sc-for list="{{ nav }}" as="n" hint-placeholder-count="8">
        <button style="width:100%;text-align:left;display:flex;align-items:center;gap:11px;min-height:42px;padding:0 10px;border:none;border-radius:11px;background:{{ n.bg }};color:{{ n.fg }};cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:{{ n.peso }};">
          <span style="display:flex;flex-shrink:0;">{{ n.icone }}</span>
          <span style="flex:1;min-width:0;">{{ n.label }}</span>
          <sc-if value="{{ n.temBadge }}" hint-placeholder-val="{{ false }}">
            <span style="font-size:11px;font-weight:800;background:#E11D2A;color:#fff;padding:2px 7px;border-radius:7px;flex-shrink:0;">{{ n.badge }}</span>
          </sc-if>
        </button>
      </sc-for>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:12px 10px 0;border-top:1px solid rgba(255,255,255,.14);">
      <div style="width:34px;height:34px;border-radius:50%;background:#E11D2A;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;flex-shrink:0;">CS</div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;">
        <span style="font-size:13px;font-weight:700;color:#fff;">Carla Souza</span>
        <span style="font-size:11px;color:rgba(255,255,255,.6);font-weight:600;">Coordenação</span>
      </div>
    </div>
  </div>
`;

const NAV_JS = (ativo) => `
    const ico = (paths, size) => React.createElement('svg',
      { width: size || 18, height: size || 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' },
      paths.map((d, i) => React.createElement('path', { key: i, d })));
    const navDefs = [
      { label: 'Visão geral', paths: ['M3 12h7V3H3zM14 21h7v-9h-7zM14 8h7V3h-7zM3 21h7v-5H3z'] },
      { label: 'Eventos', paths: ['M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M3 10h18M8 3v4M16 3v4'] },
      { label: 'Avisos', paths: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'] },
      { label: 'Estrutura acadêmica', paths: ['M12 3 3 8l9 5 9-5-9-5z', 'M3 8v6l9 5 9-5V8'] },
      { label: 'Turmas e grade', paths: ['M3 5h18v16H3z', 'M3 10h18M9 10v11M15 10v11'] },
      { label: 'Matrículas', paths: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M19 8v6M22 11h-6'] },
      { label: 'Usuários e papéis', badge: '3', temBadge: true, paths: ['M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M16 3.1a4 4 0 0 1 0 7.8'] },
      { label: 'Auditoria', paths: ['M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4', 'M8 13h5M8 17h8', 'M14 3h7v7'] },
    ];
    const nav = navDefs.map(n => {
      const on = n.label === ${JSON.stringify(ativo)};
      return { label: n.label, icone: ico(n.paths),
        bg: on ? 'rgba(255,255,255,.14)' : 'transparent',
        fg: on ? '#fff' : 'rgba(255,255,255,.66)',
        peso: on ? '800' : '600',
        badge: n.badge || '', temBadge: !!n.temBadge };
    });`;

const cabecalho = (titulo, sub, acoes) => `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <h1 style="font-size:25px;font-weight:800;color:#14181B;margin:0;letter-spacing:-.7px;">${titulo}</h1>
          <p style="font-size:14px;color:#5A6873;margin:0;font-weight:500;">${sub}</p>
        </div>
        <div style="display:flex;gap:10px;flex-shrink:0;">${acoes}</div>
      </div>`;

const btnPrim = (label, pathD) => `<button style="min-height:42px;padding:0 16px;border:none;border-radius:12px;background:#E11D2A;color:#fff;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:8px;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3"><path d="${pathD}"/></svg>${label}</button>`;
const btnSec = (label, pathD) => `<button style="min-height:42px;padding:0 16px;border:1.5px solid #dfe4e8;border-radius:12px;background:#fff;color:#2E4756;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2E4756" stroke-width="2"><path d="${pathD}"/></svg>${label}</button>`;

const telas = [];

/* ---------------- EVENTOS ---------------- */
telas.push({
  file: 'Eventos.dc.html', ativo: 'Eventos',
  body: `
  <div class="fx-scroll" style="width:340px;flex-shrink:0;border-right:1.5px solid #e4e8eb;background:#fff;overflow-y:auto;">
    <div style="padding:26px 20px 20px;display:flex;flex-direction:column;gap:15px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <h1 style="font-size:21px;font-weight:800;color:#14181B;margin:0;letter-spacing:-.6px;">Eventos</h1>
        <button style="min-height:38px;padding:0 13px;border:none;border-radius:11px;background:#E11D2A;color:#fff;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:7px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>Novo</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:9px;">
        <sc-for list="{{ eventos }}" as="e" hint-placeholder-count="4">
          <button onClick="{{ e.abrir }}" style="width:100%;text-align:left;border:1.5px solid {{ e.borda }};background:{{ e.fundo }};border-radius:14px;padding:13px;cursor:pointer;font-family:inherit;display:flex;gap:12px;align-items:flex-start;">
            <span style="width:44px;flex-shrink:0;text-align:center;background:{{ e.dataBg }};border-radius:11px;padding:7px 0;">
              <span style="display:block;font-size:16px;font-weight:800;color:{{ e.dataFg }};line-height:1;">{{ e.dia }}</span>
              <span style="display:block;font-size:10px;font-weight:800;color:{{ e.dataFg }};opacity:.75;margin-top:2px;">{{ e.mes }}</span>
            </span>
            <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;">
              <span style="font-size:14px;font-weight:800;color:#14181B;line-height:1.3;">{{ e.titulo }}</span>
              <span style="font-size:12px;color:#5A6873;font-weight:600;">{{ e.local }} · {{ e.hora }}</span>
              <span style="font-size:11px;font-weight:800;color:{{ e.tagFg }};background:{{ e.tagBg }};padding:3px 8px;border-radius:6px;width:fit-content;">{{ e.tag }}</span>
            </span>
          </button>
        </sc-for>
      </div>
    </div>
  </div>

  <div class="fx-scroll" style="flex:1;min-width:0;overflow-y:auto;">
    <div style="padding:26px 28px 32px;display:flex;flex-direction:column;gap:20px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px;">
        <div style="display:flex;flex-direction:column;gap:6px;min-width:0;">
          <span style="font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#0a7a3f;background:#e3f6ec;padding:4px 9px;border-radius:6px;width:fit-content;">No ar · inscrições encerradas</span>
          <h2 style="font-size:23px;font-weight:800;color:#14181B;margin:0;letter-spacing:-.6px;">Semana de Tecnologia 2026</h2>
          <span style="font-size:13.5px;color:#5A6873;font-weight:600;">02 out, 19h · Auditório · publicado por Carla Souza</span>
        </div>
        <div style="display:flex;gap:9px;flex-shrink:0;">
          <button style="min-height:40px;padding:0 14px;border:1.5px solid #dfe4e8;border-radius:11px;background:#fff;color:#2E4756;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;">Editar</button>
          <button style="min-height:40px;padding:0 14px;border:1.5px solid #f3d2d5;border-radius:11px;background:#fff5f5;color:#C8102E;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;">Despublicar</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:12px;">
        <div style="background:#fff;border:1.5px solid #eceef1;border-radius:14px;padding:15px;display:flex;flex-direction:column;gap:3px;">
          <span style="font-size:24px;font-weight:800;color:#14181B;letter-spacing:-1px;">120</span>
          <span style="font-size:12px;color:#5A6873;font-weight:700;">Inscritos de 120 vagas</span>
        </div>
        <div style="background:#fff;border:1.5px solid #f0e2b8;border-radius:14px;padding:15px;display:flex;flex-direction:column;gap:3px;">
          <span style="font-size:24px;font-weight:800;color:#8a6d00;letter-spacing:-1px;">14</span>
          <span style="font-size:12px;color:#5A6873;font-weight:700;">Na lista de espera</span>
        </div>
        <div style="background:#fff;border:1.5px solid #eceef1;border-radius:14px;padding:15px;display:flex;flex-direction:column;gap:3px;">
          <span style="font-size:24px;font-weight:800;color:#14181B;letter-spacing:-1px;">3</span>
          <span style="font-size:12px;color:#5A6873;font-weight:700;">Cursos representados</span>
        </div>
      </div>

      <div style="background:#fff;border:1.5px solid #eceef1;border-radius:16px;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 16px;border-bottom:1.5px solid #e7eaee;">
          <span style="font-size:14.5px;font-weight:800;color:#14181B;">Inscritos</span>
          <button style="min-height:36px;padding:0 13px;border:1.5px solid #dfe4e8;border-radius:10px;background:#fff;color:#2E4756;font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:7px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2E4756" stroke-width="2"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>Baixar lista</button>
        </div>
        <table>
          <thead><tr><th scope="col">Aluno</th><th scope="col">Curso</th><th scope="col">Inscrição</th><th scope="col">Situação</th></tr></thead>
          <tbody>
            <sc-for list="{{ inscritos }}" as="i" hint-placeholder-count="5">
              <tr>
                <td style="font-weight:700;color:#14181B;">{{ i.nome }}</td>
                <td style="color:#5A6873;font-weight:600;">{{ i.curso }}</td>
                <td style="color:#5A6873;font-weight:600;">{{ i.quando }}</td>
                <td><span style="font-size:11.5px;font-weight:800;color:{{ i.sitFg }};background:{{ i.sitBg }};padding:4px 9px;border-radius:6px;">{{ i.situacao }}</span></td>
              </tr>
            </sc-for>
          </tbody>
        </table>
      </div>
    </div>
  </div>`,
  logic: `
    const eventos = [
      { dia: '02', mes: 'OUT', titulo: 'Semana de Tecnologia 2026', local: 'Auditório', hora: '19h', tag: 'Lotado', tagFg: '#C8102E', tagBg: '#fdeaec', dataBg: '#E11D2A', dataFg: '#fff', borda: '#2E4756', fundo: '#f7fafc' },
      { dia: '10', mes: 'OUT', titulo: 'Mercado de Ciência de Dados', local: 'Sala 08', hora: '20h', tag: '38 de 60', tagFg: '#0a7a3f', tagBg: '#e3f6ec', dataBg: '#eef2f5', dataFg: '#2E4756', borda: '#eceef1', fundo: '#fff' },
      { dia: '18', mes: 'OUT', titulo: 'Visita Técnica — Cooperativa', local: 'Saída 8h', hora: '8h', tag: '22 de 40', tagFg: '#0a7a3f', tagBg: '#e3f6ec', dataBg: '#eef2f5', dataFg: '#2E4756', borda: '#eceef1', fundo: '#fff' },
      { dia: '05', mes: 'NOV', titulo: 'Feira de Estágios', local: 'Pátio', hora: '18h', tag: 'Rascunho', tagFg: '#8a6d00', tagBg: '#fff3cf', dataBg: '#eef0f2', dataFg: '#5A6873', borda: '#eceef1', fundo: '#fff' },
    ].map(e => ({ ...e, abrir: () => {} }));
    const inscritos = [
      { nome: 'Lucas Silveira', curso: 'Gestão Comercial', quando: '12 set, 19:40', situacao: 'Confirmado', sitFg: '#0a7a3f', sitBg: '#e3f6ec' },
      { nome: 'Ana Ribeiro', curso: 'Ciência de Dados', quando: '12 set, 19:52', situacao: 'Confirmado', sitFg: '#0a7a3f', sitBg: '#e3f6ec' },
      { nome: 'Beatriz Fontes', curso: 'Ciência de Dados', quando: '13 set, 08:11', situacao: 'Confirmado', sitFg: '#0a7a3f', sitBg: '#e3f6ec' },
      { nome: 'Caio Moraes', curso: 'Ciência de Dados', quando: '20 set, 21:03', situacao: 'Espera · 3º', sitFg: '#8a6d00', sitBg: '#fff3cf' },
      { nome: 'Diego Ramos', curso: 'Ciência de Dados', quando: '21 set, 10:27', situacao: 'Espera · 4º', sitFg: '#8a6d00', sitBg: '#fff3cf' },
    ];
    `,
  vals: 'eventos, inscritos',
});

/* ---------------- ESTRUTURA ---------------- */
telas.push({
  file: 'Estrutura.dc.html', ativo: 'Estrutura acadêmica',
  body: `
  <div class="fx-scroll" style="flex:1;min-width:0;overflow-y:auto;">
    <div style="padding:30px 32px 36px;display:flex;flex-direction:column;gap:22px;">
      ${cabecalho('Estrutura acadêmica', 'A espinha de tudo: cursos, termos e disciplinas. Materiais e turmas penduram aqui.', btnPrim('Novo curso', 'M12 5v14M5 12h14'))}

      <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:14px;align-items:start;">
        <sc-for list="{{ colunas }}" as="c" hint-placeholder-count="3">
          <div style="background:#fff;border:1.5px solid #eceef1;border-radius:16px;overflow:hidden;">
            <div style="padding:13px 15px;border-bottom:1.5px solid #e7eaee;background:#fafbfc;display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <span style="font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#5A6873;">{{ c.titulo }}</span>
              <span style="font-size:11px;font-weight:800;color:#5A6873;">{{ c.contagem }}</span>
            </div>
            <div style="display:flex;flex-direction:column;padding:6px;">
              <sc-for list="{{ c.itens }}" as="i" hint-placeholder-count="4">
                <button style="width:100%;text-align:left;display:flex;align-items:center;gap:10px;min-height:48px;padding:0 11px;border:none;border-radius:11px;background:{{ i.bg }};cursor:pointer;font-family:inherit;">
                  <span style="width:5px;height:26px;border-radius:3px;background:{{ i.cor }};flex-shrink:0;"></span>
                  <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;">
                    <span style="font-size:13.5px;font-weight:{{ i.peso }};color:#14181B;">{{ i.nome }}</span>
                    <span style="font-size:11.5px;color:#5A6873;font-weight:600;">{{ i.sub }}</span>
                  </span>
                  <sc-if value="{{ i.aberto }}" hint-placeholder-val="{{ false }}">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2E4756" stroke-width="2.4" style="flex-shrink:0;"><path d="M9 6l6 6-6 6"/></svg>
                  </sc-if>
                </button>
              </sc-for>
              <button style="width:100%;min-height:44px;margin-top:4px;border:1.5px dashed #cdd3da;border-radius:11px;background:none;color:#2E4756;font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer;">{{ c.adicionar }}</button>
            </div>
          </div>
        </sc-for>
      </div>

      <div style="display:flex;align-items:flex-start;gap:11px;background:#eef2f5;border-radius:14px;padding:15px 17px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E4756" stroke-width="2" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
        <span style="font-size:13.5px;color:#2E4756;font-weight:600;line-height:1.5;">Apagar uma disciplina não remove os materiais nem as entregas dos alunos — ela sai do ar e o conteúdo fica arquivado. Nada aqui é exclusão definitiva.</span>
      </div>
    </div>
  </div>`,
  logic: `
    const RED = '#E11D2A', SLATE = '#2E4756', GOLD = '#f0a500';
    const it = (nome, sub, cor, aberto) => ({ nome, sub, cor, aberto: !!aberto, bg: aberto ? '#eef2f5' : 'transparent', peso: aberto ? '800' : '600' });
    const colunas = [
      { titulo: 'Cursos', contagem: '4', adicionar: '+ Curso', itens: [
        it('Ciência de Dados', '3 termos ativos', RED, true),
        it('Gestão Comercial', '4 termos ativos', SLATE),
        it('Desenvolvimento de Software', '2 termos ativos', SLATE),
        it('Gestão de RH', '3 termos ativos', GOLD),
      ]},
      { titulo: 'Termos · Ciência de Dados', contagem: '3', adicionar: '+ Termo', itens: [
        it('1º semestre', '6 disciplinas · 41 alunos', RED),
        it('3º semestre', '5 disciplinas · 32 alunos', RED, true),
        it('5º semestre', '4 disciplinas · 16 alunos', RED),
      ]},
      { titulo: 'Disciplinas · 3º semestre', contagem: '5', adicionar: '+ Disciplina', itens: [
        it('Ciência de Dados', 'Prof. Marcelo Dias', RED),
        it('Aprendizado de Máquina', 'Prof. Marcelo Dias', RED),
        it('Visualização de Dados', 'Prof. Marcelo Dias', RED),
        it('Banco de Dados', 'Prof. Aline Costa', RED),
        it('Estatística Aplicada', 'Sem professor', '#dfe3e7'),
      ]},
    ];
    `,
  vals: 'colunas',
});

/* ---------------- TURMAS E GRADE ---------------- */
telas.push({
  file: 'Turmas.dc.html', ativo: 'Turmas e grade',
  body: `
  <div class="fx-scroll" style="flex:1;min-width:0;overflow-y:auto;">
    <div style="padding:30px 32px 36px;display:flex;flex-direction:column;gap:20px;">
      ${cabecalho('Turmas e grade', 'Sem grade definida, a agenda do aluno abre vazia.', btnSec('Duplicar do semestre anterior', 'M8 8h12v12H8zM4 16V4h12') + btnPrim('Nova turma', 'M12 5v14M5 12h14'))}

      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <sc-for list="{{ turmas }}" as="t" hint-placeholder-count="4">
          <button onClick="{{ t.abrir }}" style="min-height:44px;padding:0 15px;border:1.5px solid {{ t.bd }};border-radius:12px;background:{{ t.bg }};color:{{ t.fg }};font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:9px;">
            {{ t.nome }}
            <sc-if value="{{ t.semGrade }}" hint-placeholder-val="{{ false }}">
              <span style="width:7px;height:7px;border-radius:50%;background:#f0a500;"></span>
            </sc-if>
          </button>
        </sc-for>
      </div>

      <sc-if value="{{ semGradeAtual }}" hint-placeholder-val="{{ false }}">
        <div style="display:flex;align-items:center;gap:11px;background:#fff3cf;border:1.5px solid #f0e2b8;border-radius:14px;padding:14px 17px;">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#8a6d00" stroke-width="2" style="flex-shrink:0;"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
          <span style="flex:1;font-size:13.5px;color:#5c4a00;font-weight:700;">Esta turma ainda não tem grade. Os 24 alunos veem a agenda vazia no app.</span>
        </div>
      </sc-if>

      <div style="background:#fff;border:1.5px solid #eceef1;border-radius:16px;overflow:hidden;">
        <div style="display:grid;grid-template-columns:78px repeat(6, minmax(0, 1fr));border-bottom:1.5px solid #e7eaee;background:#fafbfc;">
          <div style="padding:11px 10px;"></div>
          <sc-for list="{{ dias }}" as="d" hint-placeholder-count="6">
            <div style="padding:11px 10px;text-align:center;font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#5A6873;border-left:1px solid #f1f3f5;">{{ d }}</div>
          </sc-for>
        </div>
        <sc-for list="{{ linhas }}" as="l" hint-placeholder-count="2">
          <div style="display:grid;grid-template-columns:78px repeat(6, minmax(0, 1fr));border-bottom:1px solid #f1f3f5;min-height:92px;">
            <div style="padding:13px 10px;display:flex;flex-direction:column;gap:2px;align-items:flex-end;justify-content:flex-start;">
              <span style="font-size:13px;font-weight:800;color:#14181B;">{{ l.inicio }}</span>
              <span style="font-size:11px;color:#5A6873;font-weight:600;">{{ l.fim }}</span>
            </div>
            <sc-for list="{{ l.celulas }}" as="c" hint-placeholder-count="6">
              <div style="border-left:1px solid #f1f3f5;padding:7px;">
                <sc-if value="{{ c.temAula }}" hint-placeholder-val="{{ true }}">
                  <div style="height:100%;border-radius:11px;background:{{ c.bg }};border-left:4px solid {{ c.cor }};padding:9px 10px;display:flex;flex-direction:column;gap:3px;">
                    <span style="font-size:12.5px;font-weight:800;color:#14181B;line-height:1.25;">{{ c.disciplina }}</span>
                    <span style="font-size:11px;color:#5A6873;font-weight:600;">{{ c.prof }}</span>
                    <span style="font-size:11px;color:#5A6873;font-weight:700;margin-top:auto;">{{ c.sala }}</span>
                  </div>
                </sc-if>
                <sc-if value="{{ c.vazio }}" hint-placeholder-val="{{ false }}">
                  <button style="width:100%;height:100%;min-height:70px;border:1.5px dashed #e4e8eb;border-radius:11px;background:none;color:#b9c3cb;font-family:inherit;font-size:19px;font-weight:700;cursor:pointer;">+</button>
                </sc-if>
              </div>
            </sc-for>
          </div>
        </sc-for>
      </div>
    </div>
  </div>`,
  logic: `
    const RED = '#E11D2A', SLATE = '#2E4756';
    const turmaAtual = this.state.turma || 'CD · 3º semestre';
    const turmaDefs = [
      { nome: 'CD · 3º semestre' }, { nome: 'CD · 1º semestre' },
      { nome: 'GC · 3º semestre' }, { nome: 'GC · 4º semestre', semGrade: true },
    ];
    const turmas = turmaDefs.map(t => {
      const on = t.nome === turmaAtual;
      return { nome: t.nome, semGrade: !!t.semGrade,
        bg: on ? '#2E4756' : '#fff', fg: on ? '#fff' : '#2E4756', bd: on ? '#2E4756' : '#dfe4e8',
        abrir: () => this.setState({ turma: t.nome }) };
    });
    const dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const aula = (disciplina, prof, sala, cor) => ({ temAula: true, vazio: false, disciplina, prof, sala, cor, bg: cor === RED ? '#fdeaec' : '#eef2f5' });
    const vazia = { temAula: false, vazio: true, disciplina: '', prof: '', sala: '', cor: '', bg: '' };
    const linhas = turmaAtual === 'GC · 4º semestre' ? [
      { inicio: '19:00', fim: '20:40', celulas: [vazia, vazia, vazia, vazia, vazia, vazia] },
      { inicio: '20:50', fim: '22:30', celulas: [vazia, vazia, vazia, vazia, vazia, vazia] },
    ] : [
      { inicio: '19:00', fim: '20:40', celulas: [
        aula('Banco de Dados', 'Aline Costa', 'Lab 02', SLATE),
        aula('Gestão de Projetos', 'Renata Alves', 'Sala 12', SLATE),
        aula('Ciência de Dados', 'Marcelo Dias', 'Lab 03', RED),
        aula('Marketing Digital', 'Renata Alves', 'Sala 12', SLATE),
        vazia, vazia ] },
      { inicio: '20:50', fim: '22:30', celulas: [
        aula('Estatística', 'Sem professor', 'Sala 09', RED),
        aula('Machine Learning', 'Marcelo Dias', 'Lab 03', RED),
        aula('Gestão Comercial', 'Renata Alves', 'Sala 12', SLATE),
        aula('Visualização de Dados', 'Marcelo Dias', 'Lab 03', RED),
        vazia, vazia ] },
    ];
    `,
  vals: 'turmas, dias, linhas, semGradeAtual: turmaAtual === "GC · 4º semestre"',
  state: "{ turma: 'CD · 3º semestre' }",
});

/* ---------------- MATRÍCULAS ---------------- */
telas.push({
  file: 'Matriculas.dc.html', ativo: 'Matrículas',
  body: `
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;">
    <div style="padding:30px 32px 18px;display:flex;flex-direction:column;gap:18px;flex-shrink:0;">
      ${cabecalho('Matrículas', '412 alunos ativos em 18 turmas · semestre 2026/2', btnSec('Importar planilha', 'M12 16V4M7 9l5-5 5 5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2') + btnPrim('Matricular aluno', 'M12 5v14M5 12h14'))}

      <div style="display:flex;gap:10px;align-items:center;">
        <div style="flex:1;display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid #dfe4e8;border-radius:12px;padding:0 14px;min-height:44px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7580" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>
          <label for="busca-matricula" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);">Buscar aluno por nome ou prontuário</label>
          <input id="busca-matricula" type="text" placeholder="Buscar por nome ou prontuário..." style="flex:1;min-width:0;border:none;outline:none;background:transparent;font-family:inherit;font-size:13.5px;color:#14181B;">
        </div>
        <sc-for list="{{ filtros }}" as="f" hint-placeholder-count="3">
          <button onClick="{{ f.abrir }}" style="min-height:44px;padding:0 15px;border:1.5px solid {{ f.bd }};border-radius:12px;background:{{ f.bg }};color:{{ f.fg }};font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;">{{ f.label }}</button>
        </sc-for>
      </div>
    </div>

    <div class="fx-scroll" style="flex:1;min-height:0;overflow-y:auto;padding:0 32px;">
      <div style="background:#fff;border:1.5px solid #eceef1;border-radius:16px;overflow:hidden;">
        <table>
          <thead>
            <tr>
              <th scope="col" style="width:52px;">
                <button onClick="{{ alternarTodos }}" aria-label="Selecionar todos os alunos" style="width:26px;height:26px;border-radius:6px;border:2px solid {{ todosBd }};background:{{ todosBg }};cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">
                  <sc-if value="{{ algumMarcado }}" hint-placeholder-val="{{ true }}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4"><path d="M5 12h14"/></svg>
                  </sc-if>
                </button>
              </th>
              <th scope="col">Aluno</th>
              <th scope="col">Prontuário</th>
              <th scope="col">Turma</th>
              <th scope="col">Ingresso</th>
              <th scope="col">Situação</th>
            </tr>
          </thead>
          <tbody>
            <sc-for list="{{ alunos }}" as="a" hint-placeholder-count="8">
              <tr style="background:{{ a.linhaBg }};">
                <td>
                  <button onClick="{{ a.alternar }}" aria-label="Selecionar {{ a.nome }}" style="width:26px;height:26px;border-radius:6px;border:2px solid {{ a.caixaBd }};background:{{ a.caixaBg }};cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">
                    <sc-if value="{{ a.marcado }}" hint-placeholder-val="{{ false }}">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4"><path d="M20 6 9 17l-5-5"/></svg>
                    </sc-if>
                  </button>
                </td>
                <td>
                  <span style="display:flex;align-items:center;gap:10px;">
                    <span style="width:30px;height:30px;border-radius:50%;background:{{ a.cor }};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0;">{{ a.iniciais }}</span>
                    <span style="display:flex;flex-direction:column;gap:1px;">
                      <span style="font-weight:800;color:#14181B;">{{ a.nome }}</span>
                      <span style="font-size:12px;color:#5A6873;font-weight:600;">{{ a.email }}</span>
                    </span>
                  </span>
                </td>
                <td style="color:#5A6873;font-weight:700;">{{ a.prontuario }}</td>
                <td style="color:#5A6873;font-weight:600;">{{ a.turma }}</td>
                <td style="color:#5A6873;font-weight:600;">{{ a.ingresso }}</td>
                <td><span style="font-size:11.5px;font-weight:800;color:{{ a.sitFg }};background:{{ a.sitBg }};padding:4px 9px;border-radius:6px;">{{ a.situacao }}</span></td>
              </tr>
            </sc-for>
          </tbody>
        </table>
      </div>
      <div style="height:24px;"></div>
    </div>

    <sc-if value="{{ algumMarcado }}" hint-placeholder-val="{{ true }}">
      <div style="flex-shrink:0;padding:14px 32px 22px;background:#fff;border-top:1.5px solid #e4e8eb;display:flex;align-items:center;gap:12px;">
        <span style="font-size:13.5px;font-weight:800;color:#14181B;">{{ totalMarcados }} selecionados</span>
        <span style="flex:1;"></span>
        <button style="min-height:40px;padding:0 14px;border:1.5px solid #dfe4e8;border-radius:11px;background:#fff;color:#2E4756;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;">Mover de turma</button>
        <button style="min-height:40px;padding:0 14px;border:1.5px solid #dfe4e8;border-radius:11px;background:#fff;color:#2E4756;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;">Trancar matrícula</button>
        <button style="min-height:40px;padding:0 14px;border:1.5px solid #f3d2d5;border-radius:11px;background:#fff5f5;color:#C8102E;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;">Encerrar vínculo</button>
      </div>
    </sc-if>
  </div>`,
  logic: `
    const RED = '#E11D2A', SLATE = '#2E4756', GOLD = '#f0a500';
    const marcados = this.state.marcados || {};
    const fAtual = this.state.filtro || 'Todas as turmas';
    const filtros = ['Todas as turmas', 'Ativos', 'Pendentes'].map(label => {
      const on = label === fAtual;
      return { label, bg: on ? '#14181B' : '#fff', fg: on ? '#fff' : '#2E4756', bd: on ? '#14181B' : '#dfe4e8', abrir: () => this.setState({ filtro: label }) };
    });
    const base = [
      { id: 'a1', iniciais: 'LS', nome: 'Lucas Silveira', email: 'lucas.silveira@fatec.sp.gov.br', prontuario: '2412034', turma: 'GC · 3º', ingresso: '2025/1', situacao: 'Ativo', sitFg: '#0a7a3f', sitBg: '#e3f6ec', cor: RED },
      { id: 'a2', iniciais: 'AR', nome: 'Ana Ribeiro', email: 'ana.ribeiro@fatec.sp.gov.br', prontuario: '2412088', turma: 'CD · 3º', ingresso: '2025/1', situacao: 'Ativo', sitFg: '#0a7a3f', sitBg: '#e3f6ec', cor: SLATE },
      { id: 'a3', iniciais: 'BF', nome: 'Beatriz Fontes', email: 'beatriz.fontes@fatec.sp.gov.br', prontuario: '2412101', turma: 'CD · 3º', ingresso: '2025/1', situacao: 'Ativo', sitFg: '#0a7a3f', sitBg: '#e3f6ec', cor: SLATE },
      { id: 'a4', iniciais: 'CM', nome: 'Caio Moraes', email: 'caio.moraes@fatec.sp.gov.br', prontuario: '2612007', turma: 'CD · 1º', ingresso: '2026/2', situacao: 'Pendente', sitFg: '#8a6d00', sitBg: '#fff3cf', cor: GOLD },
      { id: 'a5', iniciais: 'DR', nome: 'Diego Ramos', email: 'diego.ramos@fatec.sp.gov.br', prontuario: '2412055', turma: 'CD · 3º', ingresso: '2025/1', situacao: 'Ativo', sitFg: '#0a7a3f', sitBg: '#e3f6ec', cor: RED },
      { id: 'a6', iniciais: 'MF', nome: 'Mariana Farias', email: 'mariana.farias@fatec.sp.gov.br', prontuario: '2312019', turma: 'GC · 4º', ingresso: '2024/2', situacao: 'Trancada', sitFg: '#5A6873', sitBg: '#eef0f2', cor: '#8fa3b0' },
      { id: 'a7', iniciais: 'PN', nome: 'Pedro Nakamura', email: 'pedro.nakamura@fatec.sp.gov.br', prontuario: '2612044', turma: 'CD · 1º', ingresso: '2026/2', situacao: 'Pendente', sitFg: '#8a6d00', sitBg: '#fff3cf', cor: GOLD },
      { id: 'a8', iniciais: 'JV', nome: 'Julia Vasques', email: 'julia.vasques@fatec.sp.gov.br', prontuario: '2412072', turma: 'GC · 3º', ingresso: '2025/1', situacao: 'Ativo', sitFg: '#0a7a3f', sitBg: '#e3f6ec', cor: SLATE },
    ];
    const alunos = base.map(a => {
      const on = !!marcados[a.id];
      return { ...a, marcado: on,
        linhaBg: on ? '#f7fafc' : '#fff',
        caixaBd: on ? '#2E4756' : '#cdd3da',
        caixaBg: on ? '#2E4756' : '#fff',
        alternar: () => this.setState({ marcados: { ...marcados, [a.id]: !on } }) };
    });
    const total = alunos.filter(a => a.marcado).length;
    const todosOn = total === base.length;
    `,
  vals: `alunos, filtros, totalMarcados: total, algumMarcado: total > 0,
      todosBd: total > 0 ? '#2E4756' : '#cdd3da', todosBg: total > 0 ? '#2E4756' : '#fff',
      alternarTodos: () => { const m = {}; if (!todosOn) base.forEach(a => { m[a.id] = true; }); this.setState({ marcados: m }); }`,
  state: "{ marcados: { a2: true, a3: true, a5: true }, filtro: 'Todas as turmas' }",
});

/* ---------------- USUÁRIOS E PAPÉIS ---------------- */
telas.push({
  file: 'Usuarios.dc.html', ativo: 'Usuários e papéis',
  body: `
  <div class="fx-scroll" style="flex:1;min-width:0;overflow-y:auto;">
    <div style="padding:30px 32px 36px;display:flex;flex-direction:column;gap:20px;">
      ${cabecalho('Usuários e papéis', 'Entrar com a conta institucional não dá acesso. O papel é atribuído aqui.', btnSec('Convidar', 'M12 5v14M5 12h14'))}

      <div style="background:#fff;border:1.5px solid #f3d2d5;border-radius:16px;overflow:hidden;">
        <div style="padding:14px 17px;background:#fffafa;border-bottom:1.5px solid #f3d2d5;display:flex;align-items:center;gap:10px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C8102E" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
          <span style="font-size:14.5px;font-weight:800;color:#14181B;">Aguardando papel</span>
          <span style="font-size:11.5px;font-weight:800;color:#C8102E;background:#fdeaec;padding:3px 8px;border-radius:6px;">3</span>
          <span style="flex:1;"></span>
          <span style="font-size:12.5px;color:#5A6873;font-weight:600;">Entraram com a conta institucional e ainda não têm acesso a nada.</span>
        </div>
        <div style="display:flex;flex-direction:column;">
          <sc-for list="{{ fila }}" as="f" hint-placeholder-count="3">
            <div style="display:flex;align-items:center;gap:14px;padding:14px 17px;border-bottom:1px solid #f1f3f5;">
              <span style="width:36px;height:36px;border-radius:50%;background:#8fa3b0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;flex-shrink:0;">{{ f.iniciais }}</span>
              <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;">
                <span style="font-size:14px;font-weight:800;color:#14181B;">{{ f.nome }}</span>
                <span style="font-size:12.5px;color:#5A6873;font-weight:600;">{{ f.email }} · entrou {{ f.quando }}</span>
              </span>
              <sc-for list="{{ f.papeis }}" as="p" hint-placeholder-count="3">
                <button onClick="{{ p.escolher }}" style="min-height:36px;padding:0 13px;border:1.5px solid {{ p.bd }};border-radius:10px;background:{{ p.bg }};color:{{ p.fg }};font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer;flex-shrink:0;">{{ p.label }}</button>
              </sc-for>
              <button style="min-height:36px;padding:0 12px;border:1.5px solid #f3d2d5;border-radius:10px;background:#fff5f5;color:#C8102E;font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer;flex-shrink:0;">Recusar</button>
            </div>
          </sc-for>
        </div>
      </div>

      <div style="background:#fff;border:1.5px solid #eceef1;border-radius:16px;overflow:hidden;">
        <div style="padding:14px 17px;border-bottom:1.5px solid #e7eaee;background:#fafbfc;">
          <span style="font-size:14.5px;font-weight:800;color:#14181B;">Com acesso</span>
        </div>
        <table>
          <thead><tr><th scope="col">Pessoa</th><th scope="col">Papel</th><th scope="col">Vínculo</th><th scope="col">Vigência</th><th scope="col">Último acesso</th></tr></thead>
          <tbody>
            <sc-for list="{{ usuarios }}" as="u" hint-placeholder-count="5">
              <tr>
                <td>
                  <span style="display:flex;align-items:center;gap:10px;">
                    <span style="width:30px;height:30px;border-radius:50%;background:{{ u.cor }};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0;">{{ u.iniciais }}</span>
                    <span style="display:flex;flex-direction:column;gap:1px;">
                      <span style="font-weight:800;color:#14181B;">{{ u.nome }}</span>
                      <span style="font-size:12px;color:#5A6873;font-weight:600;">{{ u.email }}</span>
                    </span>
                  </span>
                </td>
                <td><span style="font-size:11.5px;font-weight:800;color:{{ u.papelFg }};background:{{ u.papelBg }};padding:4px 9px;border-radius:6px;">{{ u.papel }}</span></td>
                <td style="color:#5A6873;font-weight:600;">{{ u.vinculo }}</td>
                <td style="color:{{ u.vigenciaFg }};font-weight:700;">{{ u.vigencia }}</td>
                <td style="color:#5A6873;font-weight:600;">{{ u.acesso }}</td>
              </tr>
            </sc-for>
          </tbody>
        </table>
      </div>
    </div>
  </div>`,
  logic: `
    const RED = '#E11D2A', SLATE = '#2E4756';
    const escolhido = this.state.escolhido || {};
    const mkPapeis = (id) => ['Aluno', 'Professor', 'Coordenação'].map(label => {
      const on = escolhido[id] === label;
      return { label, bg: on ? '#2E4756' : '#fff', fg: on ? '#fff' : '#2E4756', bd: on ? '#2E4756' : '#dfe4e8',
        escolher: () => this.setState({ escolhido: { ...escolhido, [id]: label } }) };
    });
    const fila = [
      { id: 'f1', iniciais: 'AP', nome: 'Ana Paula Reis', email: 'ana.reis@fatec.sp.gov.br', quando: 'há 2 dias' },
      { id: 'f2', iniciais: 'RL', nome: 'Rogério Lima', email: 'rogerio.lima@fatec.sp.gov.br', quando: 'há 3 dias' },
      { id: 'f3', iniciais: 'TS', nome: 'Thiago Santana', email: 'thiago.santana@fatec.sp.gov.br', quando: 'há 6 dias' },
    ].map(f => ({ ...f, papeis: mkPapeis(f.id) }));
    const usuarios = [
      { iniciais: 'CS', nome: 'Carla Souza', email: 'carla.souza@fatec.sp.gov.br', papel: 'Coordenação', papelFg: '#C8102E', papelBg: '#fdeaec', vinculo: 'Toda a unidade', vigencia: 'Sem prazo', vigenciaFg: '#5A6873', acesso: 'agora', cor: RED },
      { iniciais: 'MD', nome: 'Marcelo Dias', email: 'marcelo.dias@fatec.sp.gov.br', papel: 'Professor', papelFg: '#2E4756', papelBg: '#eef2f5', vinculo: '4 turmas · CD', vigencia: 'até 20/12/2026', vigenciaFg: '#2E4756', acesso: 'há 1 hora', cor: SLATE },
      { iniciais: 'RA', nome: 'Renata Alves', email: 'renata.alves@fatec.sp.gov.br', papel: 'Professor', papelFg: '#2E4756', papelBg: '#eef2f5', vinculo: '3 turmas · GC', vigencia: 'até 20/12/2026', vigenciaFg: '#2E4756', acesso: 'ontem', cor: SLATE },
      { iniciais: 'AC', nome: 'Aline Costa', email: 'aline.costa@fatec.sp.gov.br', papel: 'Professor', papelFg: '#2E4756', papelBg: '#eef2f5', vinculo: '2 turmas · CD', vigencia: 'vence em 12 dias', vigenciaFg: '#8a6d00', acesso: 'há 4 dias', cor: SLATE },
      { iniciais: 'LS', nome: 'Lucas Silveira', email: 'lucas.silveira@fatec.sp.gov.br', papel: 'Aluno', papelFg: '#5A6873', papelBg: '#eef0f2', vinculo: 'GC · 3º semestre', vigencia: 'até conclusão', vigenciaFg: '#5A6873', acesso: 'há 20 min', cor: RED },
    ];
    `,
  vals: 'fila, usuarios',
  state: "{ escolhido: {} }",
});

/* ---------------- AUDITORIA ---------------- */
telas.push({
  file: 'Auditoria.dc.html', ativo: 'Auditoria',
  body: `
  <div class="fx-scroll" style="flex:1;min-width:0;overflow-y:auto;">
    <div style="padding:30px 32px 36px;display:flex;flex-direction:column;gap:20px;">
      ${cabecalho('Auditoria', 'Registro do que foi criado, alterado e removido. Não pode ser editado nem apagado.', btnSec('Exportar período', 'M12 3v12M7 10l5 5 5-5M5 21h14'))}

      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <sc-for list="{{ filtros }}" as="f" hint-placeholder-count="5">
          <button onClick="{{ f.abrir }}" style="min-height:40px;padding:0 14px;border:1.5px solid {{ f.bd }};border-radius:11px;background:{{ f.bg }};color:{{ f.fg }};font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;">{{ f.label }}</button>
        </sc-for>
      </div>

      <div style="background:#fff;border:1.5px solid #eceef1;border-radius:16px;overflow:hidden;">
        <table>
          <thead><tr><th scope="col" style="width:150px;">Quando</th><th scope="col" style="width:180px;">Quem</th><th scope="col" style="width:110px;">Ação</th><th scope="col">O quê</th></tr></thead>
          <tbody>
            <sc-for list="{{ registros }}" as="r" hint-placeholder-count="9">
              <tr>
                <td style="color:#5A6873;font-weight:700;white-space:nowrap;">{{ r.quando }}</td>
                <td>
                  <span style="display:flex;flex-direction:column;gap:1px;">
                    <span style="font-weight:700;color:#14181B;">{{ r.quem }}</span>
                    <span style="font-size:11.5px;color:#5A6873;font-weight:600;">{{ r.papel }}</span>
                  </span>
                </td>
                <td><span style="font-size:11.5px;font-weight:800;color:{{ r.acaoFg }};background:{{ r.acaoBg }};padding:4px 9px;border-radius:6px;">{{ r.acao }}</span></td>
                <td style="color:#2E4756;font-weight:600;">{{ r.alvo }}</td>
              </tr>
            </sc-for>
          </tbody>
        </table>
      </div>
    </div>
  </div>`,
  logic: `
    const fAtual = this.state.filtro || 'Tudo';
    const filtros = ['Tudo', 'Avisos e eventos', 'Estrutura', 'Papéis', 'Entregas'].map(label => {
      const on = label === fAtual;
      return { label, bg: on ? '#14181B' : '#fff', fg: on ? '#fff' : '#2E4756', bd: on ? '#14181B' : '#dfe4e8', abrir: () => this.setState({ filtro: label }) };
    });
    const cria = { acao: 'Criou', acaoFg: '#0a7a3f', acaoBg: '#e3f6ec' };
    const edita = { acao: 'Alterou', acaoFg: '#2E4756', acaoBg: '#eef2f5' };
    const remove = { acao: 'Removeu', acaoFg: '#C8102E', acaoBg: '#fdeaec' };
    const papel = { acao: 'Papel', acaoFg: '#8a6d00', acaoBg: '#fff3cf' };
    const registros = [
      { quando: 'hoje, 14:12', quem: 'Carla Souza', papel: 'Coordenação', ...cria, alvo: 'Aviso "Alteração no calendário de provas" · 412 destinatários' },
      { quando: 'hoje, 11:40', quem: 'Marcelo Dias', papel: 'Professor', ...edita, alvo: 'Nota da entrega de Beatriz Fontes · 8,0 para 9,0' },
      { quando: 'hoje, 09:22', quem: 'Marcelo Dias', papel: 'Professor', ...cria, alvo: 'Material "Aula 06 — Árvores de Decisão.pdf" · Aprendizado de Máquina' },
      { quando: 'ontem, 20:05', quem: 'Renata Alves', papel: 'Professor', ...edita, alvo: 'Prazo da atividade "Plano de Marketing Digital" · 25 set para 27 set' },
      { quando: 'ontem, 16:48', quem: 'Carla Souza', papel: 'Coordenação', ...papel, alvo: 'Aline Costa recebeu papel Professor · vigência até 20/12/2026' },
      { quando: 'ontem, 16:30', quem: 'Carla Souza', papel: 'Coordenação', ...cria, alvo: 'Turma "Empreendedorismo · GC 4º semestre"' },
      { quando: '24 set, 21:14', quem: 'Lucas Silveira', papel: 'Aluno', ...cria, alvo: 'Entrega "plano_marketing_lucas.pdf" · hash a3f1…9c22' },
      { quando: '24 set, 10:03', quem: 'Carla Souza', papel: 'Coordenação', ...remove, alvo: 'Evento "Palestra cancelada — Logística" · arquivado' },
      { quando: '23 set, 19:55', quem: 'Marcelo Dias', papel: 'Professor', ...cria, alvo: 'Atividade "Exercícios Pandas & NumPy" · 32 alunos' },
    ];
    `,
  vals: 'filtros, registros',
});

for (const t of telas) {
  const stateLine = t.state ? `  state = ${t.state};\n\n` : '';
  const out = HEAD + t.body + `

</div>
</x-dc>

<script data-dc-script data-props='{"$preview":{"width":1280,"height":800}}'>
class Component extends DCLogic {
${stateLine}  renderVals() {${NAV_JS(t.ativo)}
${t.logic}
    return { nav, ${t.vals} };
  }
}
<\/script>
</body>
</html>
`;
  writeFileSync(t.file, out, 'utf8');
  console.log('escrito ' + t.file);
}
