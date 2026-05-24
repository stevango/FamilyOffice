CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`assetType` text NOT NULL,
	`description` text,
	`estimatedValue` text NOT NULL,
	`acquisitionValue` text,
	`acquisitionDate` text,
	`location` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bank_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`bank` text,
	`accountType` text DEFAULT 'checking' NOT NULL,
	`balance` text DEFAULT '0' NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`color` text,
	`isActive` integer DEFAULT 1 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`lastDigits` text,
	`brand` text,
	`cardType` text DEFAULT 'credit' NOT NULL,
	`creditLimit` text,
	`closingDay` integer,
	`dueDay` integer,
	`bankAccountId` integer,
	`isActive` integer DEFAULT 1 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`category` text DEFAULT 'other' NOT NULL,
	`fileKey` text NOT NULL,
	`fileUrl` text NOT NULL,
	`fileName` text NOT NULL,
	`fileSize` integer,
	`mimeType` text,
	`tags` text,
	`expiresAt` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `legal_cases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`title` text NOT NULL,
	`caseNumber` text,
	`caseType` text DEFAULT 'neutral' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`court` text,
	`lawyer` text,
	`estimatedCost` text,
	`actualCost` text,
	`nextDeadline` text,
	`description` text,
	`notes` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`amount` text NOT NULL,
	`category` text,
	`subcategory` text,
	`transactionDate` text NOT NULL,
	`bankAccountId` integer,
	`cardId` integer,
	`isPaid` integer DEFAULT 1 NOT NULL,
	`isRecurring` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`passwordHash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`lastSignedIn` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);