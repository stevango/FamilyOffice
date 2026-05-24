# Family Office

Central privada de gestão **patrimonial, financeira, documental e jurídica** para
famílias e seus assessores. Cada usuário gerencia seus próprios dados de forma
isolada e segura.

Módulos:

- **Dashboard** — visão executiva consolidada (saldo, patrimônio, fluxo, processos).
- **Financeiro** — contas bancárias, cartões, receitas/despesas e fluxo de caixa.
- **Cofre Digital** — upload, categorização e busca de documentos.
- **Patrimônio** — imóveis, veículos, empresas e investimentos com valor estimado.
- **Jurídico** — processos, prazos, custos e andamento.

## Stack

- **Front-end:** React 19, Vite 7, Tailwind 4, shadcn/ui, TanStack Query, wouter.
- **Back-end:** Express 4 + tRPC 11 (contratos tipados ponta a ponta), superjson.
- **Banco:** SQLite via Drizzle ORM — um único arquivo, sem servidor de banco.
- **Auth:** e-mail + senha, hash `scrypt`, sessão em cookie JWT `httpOnly`.
- **Arquivos:** armazenamento em disco local, servido por rota autenticada.

Não há dependência de serviços externos: o app roda em qualquer máquina com
Node.js e um disco persistente (VPS, Railway, Fly, um container, etc.).

## Começando

```bash
pnpm install
cp .env.example .env          # gere um JWT_SECRET (veja o arquivo)
pnpm dev                      # http://localhost:3000
```

A primeira conta criada na tela de login vira **administrador** (o "dono").
O esquema do banco é aplicado automaticamente na primeira execução.

## Produção

```bash
pnpm build      # gera dist/ (cliente + servidor)
pnpm start      # NODE_ENV=production node dist/index.js
```

Defina `JWT_SECRET` (obrigatório), e opcionalmente `DATA_DIR` para apontar o
banco e os uploads para um volume persistente. Coloque a aplicação atrás de um
proxy HTTPS — os cookies de sessão são marcados como `secure` automaticamente
quando a requisição chega via HTTPS.

## Variáveis de ambiente

| Variável            | Padrão            | Descrição                                            |
| ------------------- | ----------------- | ---------------------------------------------------- |
| `JWT_SECRET`        | —                 | **Obrigatório em produção.** Assina o cookie de sessão. |
| `PORT`              | `3000`            | Porta HTTP.                                          |
| `DATA_DIR`          | `./.data`         | Pasta com o banco SQLite e os uploads.               |
| `DATABASE_FILE`     | `$DATA_DIR/app.db`| Caminho do arquivo SQLite.                           |
| `STORAGE_DIR`       | `$DATA_DIR/uploads`| Pasta dos arquivos enviados.                        |
| `OWNER_EMAIL`       | —                 | E-mail que recebe papel de admin ao se cadastrar.    |
| `ALLOW_REGISTRATION`| `true`            | `false` desativa novos cadastros após o onboarding.  |
| `MAX_UPLOAD_BYTES`  | `16777216` (16MB) | Tamanho máximo de upload.                            |

## Estrutura

```
client/src/
  pages/        Páginas (Dashboard, Financeiro, Documentos, Patrimônio, Jurídico, Login)
  components/   UI reutilizável (shadcn/ui) e layout
  lib/trpc.ts   Cliente tRPC
drizzle/
  schema.ts     Tabelas e tipos
  migrations/   Migrações SQLite (geradas por `pnpm db:generate`)
server/
  routers.ts    Procedures tRPC + rotas de upload/download
  db.ts         Helpers de consulta
  storage.ts    Armazenamento em disco
  _core/         Infraestrutura (auth, sessão, contexto, vite)
```

## Comandos

| Comando            | Ação                                            |
| ------------------ | ----------------------------------------------- |
| `pnpm dev`         | Servidor de desenvolvimento (Vite + API).       |
| `pnpm build`       | Build de produção.                              |
| `pnpm start`       | Roda o build de produção.                       |
| `pnpm check`       | Type-check (sem emitir).                         |
| `pnpm test`        | Testes (Vitest).                                |
| `pnpm db:generate` | Gera migração a partir de `drizzle/schema.ts`.  |
