ALTER TABLE `legal_cases` ADD `area` enum('civel','trabalhista','tributario','criminal','familia','empresarial','consumidor','administrativo','outro');--> statement-breakpoint
ALTER TABLE `legal_cases` ADD `polo` enum('autor','reu','interessado','terceiro','exequente','executado','reclamante','reclamado','outro');--> statement-breakpoint
ALTER TABLE `legal_cases` ADD `risco` enum('baixo','medio','alto','critico');--> statement-breakpoint
ALTER TABLE `legal_cases` ADD `vinculo` varchar(255);--> statement-breakpoint
ALTER TABLE `legal_cases` ADD `valorCausa` decimal(15,2);--> statement-breakpoint
ALTER TABLE `legal_cases` ADD `classe` varchar(255);--> statement-breakpoint
ALTER TABLE `legal_cases` ADD `assunto` varchar(500);--> statement-breakpoint
ALTER TABLE `legal_cases` ADD `grau` varchar(50);--> statement-breakpoint
ALTER TABLE `legal_cases` ADD `comarca` varchar(255);--> statement-breakpoint
ALTER TABLE `legal_cases` ADD `vara` varchar(255);--> statement-breakpoint
ALTER TABLE `legal_cases` ADD `dataDistribuicao` date;--> statement-breakpoint
ALTER TABLE `legal_cases` ADD `audiencia` date;--> statement-breakpoint
ALTER TABLE `legal_cases` ADD `ultimoAndamento` text;--> statement-breakpoint
ALTER TABLE `legal_cases` ADD `fonte` varchar(50);--> statement-breakpoint
ALTER TABLE `legal_cases` ADD `lastSyncAt` timestamp;