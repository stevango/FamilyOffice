CREATE TABLE `assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(500) NOT NULL,
	`assetType` enum('property','vehicle','company','investment','other') NOT NULL,
	`description` text,
	`estimatedValue` decimal(15,2) NOT NULL,
	`acquisitionValue` decimal(15,2),
	`acquisitionDate` date,
	`location` varchar(500),
	`status` enum('active','sold','inactive') NOT NULL DEFAULT 'active',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bank_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`bank` varchar(255),
	`accountType` enum('checking','savings','investment','digital') NOT NULL DEFAULT 'checking',
	`balance` decimal(15,2) NOT NULL DEFAULT '0',
	`currency` varchar(10) NOT NULL DEFAULT 'BRL',
	`color` varchar(20),
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bank_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`lastDigits` varchar(4),
	`brand` varchar(50),
	`cardType` enum('credit','debit','both') NOT NULL DEFAULT 'credit',
	`creditLimit` decimal(15,2),
	`closingDay` int,
	`dueDay` int,
	`bankAccountId` int,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`category` enum('personal','property','vehicle','company','legal','tax','insurance','contract','certificate','other') NOT NULL DEFAULT 'other',
	`fileKey` varchar(500) NOT NULL,
	`fileUrl` varchar(1000) NOT NULL,
	`fileName` varchar(500) NOT NULL,
	`fileSize` int,
	`mimeType` varchar(100),
	`tags` text,
	`expiresAt` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `legal_cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(500) NOT NULL,
	`caseNumber` varchar(100),
	`caseType` enum('favorable','unfavorable','neutral') NOT NULL DEFAULT 'neutral',
	`status` enum('active','closed','suspended','archived') NOT NULL DEFAULT 'active',
	`court` varchar(255),
	`lawyer` varchar(255),
	`estimatedCost` decimal(15,2),
	`actualCost` decimal(15,2),
	`nextDeadline` date,
	`description` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `legal_cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('income','expense') NOT NULL,
	`description` varchar(500) NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`category` varchar(100),
	`subcategory` varchar(100),
	`transactionDate` date NOT NULL,
	`bankAccountId` int,
	`cardId` int,
	`isPaid` int NOT NULL DEFAULT 1,
	`isRecurring` int NOT NULL DEFAULT 0,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
