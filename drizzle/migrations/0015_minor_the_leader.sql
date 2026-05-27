CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`razaoSocial` varchar(500) NOT NULL,
	`nomeFantasia` varchar(500),
	`cnpj` varchar(20),
	`inscricaoEstadual` varchar(50),
	`inscricaoMunicipal` varchar(50),
	`dataAbertura` date,
	`situacaoCadastral` varchar(100),
	`regimeTributario` varchar(100),
	`cnaePrincipal` varchar(255),
	`cnaeSecundarios` text,
	`ramo` varchar(255),
	`endereco` varchar(500),
	`contador` varchar(255),
	`advogado` varchar(255),
	`bancoPrincipal` varchar(255),
	`temCertificado` int NOT NULL DEFAULT 0,
	`certificadoVencimento` date,
	`ultimaAlteracao` date,
	`finalidade` enum('operacional','patrimonial','holding','investimento','tecnologia','seguros','servicos','consultoria','imobiliaria','veiculos','familiar','projeto_futuro','risco','encerramento','reestruturacao','sucessao','outro') NOT NULL DEFAULT 'operacional',
	`status` enum('ativa','inativa','baixada','em_analise','risco','pendente') NOT NULL DEFAULT 'ativa',
	`valorEstimado` decimal(15,2),
	`riscos` text,
	`riscoNivel` enum('baixo','medio','alto','critico') NOT NULL DEFAULT 'baixo',
	`planejamento` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_partners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`householdId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`cpfCnpj` varchar(20),
	`tipoParticipacao` enum('socio','socio_administrador','socio_investidor','administrador','procurador','representante','terceiro') NOT NULL DEFAULT 'socio',
	`percentual` decimal(6,3),
	`capitalSocial` decimal(15,2),
	`dataEntrada` date,
	`dataSaida` date,
	`funcao` varchar(255),
	`isAdministrador` int NOT NULL DEFAULT 0,
	`poderesBancarios` int NOT NULL DEFAULT 0,
	`assinaContratos` int NOT NULL DEFAULT 0,
	`possuiProcuracao` int NOT NULL DEFAULT 0,
	`observacoesRisco` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_partners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `companies_householdId_idx` ON `companies` (`householdId`);--> statement-breakpoint
CREATE INDEX `company_partners_companyId_idx` ON `company_partners` (`companyId`);--> statement-breakpoint
CREATE INDEX `company_partners_householdId_idx` ON `company_partners` (`householdId`);