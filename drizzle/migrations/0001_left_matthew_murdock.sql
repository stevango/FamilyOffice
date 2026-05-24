CREATE INDEX `assets_userId_idx` ON `assets` (`userId`);--> statement-breakpoint
CREATE INDEX `bank_accounts_userId_idx` ON `bank_accounts` (`userId`);--> statement-breakpoint
CREATE INDEX `cards_userId_idx` ON `cards` (`userId`);--> statement-breakpoint
CREATE INDEX `documents_userId_idx` ON `documents` (`userId`);--> statement-breakpoint
CREATE INDEX `documents_userId_fileKey_idx` ON `documents` (`userId`,`fileKey`);--> statement-breakpoint
CREATE INDEX `legal_cases_userId_idx` ON `legal_cases` (`userId`);--> statement-breakpoint
CREATE INDEX `transactions_userId_date_idx` ON `transactions` (`userId`,`transactionDate`);