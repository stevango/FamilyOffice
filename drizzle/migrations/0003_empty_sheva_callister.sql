CREATE TABLE `integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`provider` enum('jusbrasil') NOT NULL,
	`enabled` int NOT NULL DEFAULT 0,
	`credentials` text,
	`credentialHint` varchar(32),
	`config` text,
	`status` enum('disconnected','connected','error') NOT NULL DEFAULT 'disconnected',
	`lastSyncAt` timestamp,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `integrations_household_provider_idx` ON `integrations` (`householdId`,`provider`);